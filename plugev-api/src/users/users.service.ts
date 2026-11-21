import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { AccessContext } from '../access/access-context';
import { P, ROLES } from '../access/permissions';
import { AuditService } from '../audit/audit.service';
import { TokensService } from '../auth/tokens.service';
import { Errors } from '../common/errors';
import { Page, toPage } from '../common/pagination';
import { APP_CONFIG, AppConfig } from '../config/config';
import { NetworkEntity, RoleAssignmentEntity, StationEntity, UserEntity } from '../database/entities';
import { MailService } from '../mail/mail.service';
import {
    InviteUserDto, MeView, RoleAssignmentView, RoleTargetDto, UpdateUserStatusDto, UserListQueryDto, UserView,
} from './users.dto';

interface ResolvedTarget {
    role: string;
    networkId: string | null; // set for network-scoped roles
    stationId: string | null;
    scopeNetworkId: string | null; // network of the station, for station roles
}

const ACTIVE = { effectiveTo: IsNull() };

@Injectable()
export class UsersService {
    constructor(
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        private readonly db: DataSource,
        private readonly audit: AuditService,
        private readonly tokens: TokensService,
        private readonly mail: MailService,
    ) {}

    async me(ctx: AccessContext): Promise<MeView> {
        const user = await this.db.getRepository(UserEntity).findOneByOrFail({ id: ctx.userId });
        return { ...(await this.view(user)), permissions: ctx.permissions };
    }

    async list(ctx: AccessContext, q: UserListQueryDto): Promise<Page<UserView>> {
        const qb = this.db.getRepository(UserEntity).createQueryBuilder('u');
        const visible = this.visibilityClause(ctx, P.USER_READ);
        if (!visible) return toPage([], 0, q);
        if (visible !== true) qb.andWhere(visible.sql, visible.params);
        if (q.status) qb.andWhere('u.status = :status', { status: q.status });
        if (q.search) {
            qb.andWhere('(u.email ILIKE :s OR u.full_name ILIKE :s)', { s: `%${q.search.replace(/[%_\\]/g, '\\$&')}%` });
        }
        const [users, total] = await qb.orderBy('u.created_at', 'DESC')
            .skip((q.page - 1) * q.pageSize).take(q.pageSize).getManyAndCount();
        return toPage(await this.views(users), total, q);
    }

    async get(ctx: AccessContext, id: string): Promise<UserView> {
        return this.view(await this.findVisible(ctx, id, P.USER_READ));
    }

    /** Creates an invited account with one role and emails a set-password link. */
    async invite(ctx: AccessContext, dto: InviteUserDto): Promise<UserView> {
        const target = await this.resolveTarget(dto);
        this.assertCanAssign(ctx, target);

        const { user, token } = await this.db.transaction(async m => {
            const exists = await m.getRepository(UserEntity).existsBy({ email: dto.email });
            if (exists) throw Errors.conflict('A user with this email already exists', 'EMAIL_TAKEN');
            const created = await m.getRepository(UserEntity).save(m.create(UserEntity, {
                email: dto.email, fullName: dto.fullName, phone: dto.phone ?? null, status: 'invited',
            }));
            const assignment = await this.insertAssignment(m, created.id, target, ctx.userId);
            const inviteToken = await this.tokens.issueAuthToken(created.id, 'invite', m);
            await this.audit.record({
                actor: ctx, action: 'user.invite', resourceType: 'user', resourceId: created.id,
                networkId: target.networkId ?? target.scopeNetworkId, stationId: target.stationId,
                details: { email: dto.email, role: target.role, assignmentId: assignment.id },
            }, m);
            return { user: created, token: inviteToken };
        });

        await this.mail.sendInvite(user.email, user.fullName,
            `${this.config.portalUrl}/accept-invite?token=${encodeURIComponent(token)}`);
        return this.view(user);
    }

    async assignRole(ctx: AccessContext, userId: string, dto: RoleTargetDto): Promise<UserView> {
        const user = await this.findVisibleOrAssignable(ctx, userId);
        if (user.status === 'deactivated') throw Errors.conflict('Reactivate the account before assigning roles', 'USER_DEACTIVATED');
        const target = await this.resolveTarget(dto);
        this.assertCanAssign(ctx, target);

        await this.db.transaction(async m => {
            const assignment = await this.insertAssignment(m, user.id, target, ctx.userId);
            await this.audit.record({
                actor: ctx, action: 'role.assign', resourceType: 'user', resourceId: user.id,
                networkId: target.networkId ?? target.scopeNetworkId, stationId: target.stationId,
                details: { role: target.role, assignmentId: assignment.id },
            }, m);
        });
        return this.view(user);
    }

    async revokeRole(ctx: AccessContext, userId: string, assignmentId: string): Promise<UserView> {
        const user = await this.findVisible(ctx, userId, P.USER_READ);
        const a = await this.db.getRepository(RoleAssignmentEntity).findOneBy({ id: assignmentId, userId, ...ACTIVE });
        if (!a) throw Errors.notFound('Role assignment');
        const target = await this.resolveTarget({ role: a.roleCode, networkId: a.networkId ?? undefined, stationId: a.stationId ?? undefined });
        this.assertCanAssign(ctx, target);
        if (a.roleCode === ROLES.SUPER_ADMIN) {
            if (userId === ctx.userId) throw Errors.badRequest('CANNOT_CHANGE_OWN_ACCESS', 'You cannot remove your own Super Admin role');
            await this.assertAnotherSuperAdmin(userId);
        }

        await this.db.transaction(async m => {
            await m.update(RoleAssignmentEntity, { id: a.id, ...ACTIVE }, { effectiveTo: new Date() });
            await this.audit.record({
                actor: ctx, action: 'role.revoke', resourceType: 'user', resourceId: user.id,
                networkId: target.networkId ?? target.scopeNetworkId, stationId: target.stationId,
                details: { role: a.roleCode, assignmentId: a.id },
            }, m);
        });
        return this.view(user);
    }

    /** FR AUTH 004: suspend, deactivate, reactivate. Sessions end immediately when access is removed. */
    async updateStatus(ctx: AccessContext, userId: string, dto: UpdateUserStatusDto): Promise<UserView> {
        if (userId === ctx.userId) throw Errors.badRequest('CANNOT_CHANGE_OWN_ACCESS', 'You cannot change the status of your own account');
        const user = await this.findVisible(ctx, userId, P.USER_READ);
        await this.assertCanManage(ctx, user.id);

        if (user.status === dto.status) return this.view(user);
        if (user.status === 'invited' && dto.status !== 'deactivated') {
            throw Errors.conflict('An invited user becomes active by accepting the invitation', 'INVALID_STATUS_CHANGE');
        }
        if (dto.status !== 'active') {
            const isSuper = await this.db.getRepository(RoleAssignmentEntity)
                .existsBy({ userId: user.id, roleCode: ROLES.SUPER_ADMIN, ...ACTIVE });
            if (isSuper) await this.assertAnotherSuperAdmin(user.id);
        }

        const from = user.status;
        await this.db.transaction(async m => {
            await m.update(UserEntity, { id: user.id }, { status: dto.status, ...(dto.status === 'active' ? { failedLoginCount: 0, lockedUntil: null } : {}) });
            if (dto.status !== 'active') await this.tokens.revokeAllForUser(user.id, `status_${dto.status}`, m);
            await this.audit.record({
                actor: ctx, action: 'user.status_change', resourceType: 'user', resourceId: user.id,
                details: { from, to: dto.status, reason: dto.reason },
            }, m);
        });
        user.status = dto.status;
        return this.view(user);
    }

    // ---------------------------------------------------------------- helpers

    /**
     * SQL that limits users to those the caller can see: users holding an active role inside the caller's
     * networks or stations. true = everything; null = nothing.
     */
    private visibilityClause(ctx: AccessContext, permission: string): { sql: string; params: object } | true | null {
        const scope = ctx.scopeFor(permission);
        if (scope.all) return true;
        if (!scope.networkIds.length && !scope.stationIds.length) return null;
        return {
            sql: `EXISTS (
                SELECT 1 FROM user_role_assignments a
                LEFT JOIN stations s ON s.id = a.station_id
                WHERE a.user_id = u.id AND a.effective_to IS NULL
                  AND (coalesce(a.network_id, s.network_id) = ANY(:nets) OR a.station_id = ANY(:stations)))`,
            params: { nets: scope.networkIds, stations: scope.stationIds },
        };
    }

    private async findVisible(ctx: AccessContext, id: string, permission: string): Promise<UserEntity> {
        const qb = this.db.getRepository(UserEntity).createQueryBuilder('u').where('u.id = :id', { id });
        const visible = this.visibilityClause(ctx, permission);
        if (!visible) throw Errors.notFound('User');
        if (visible !== true) qb.andWhere(visible.sql, visible.params);
        const user = await qb.getOne();
        if (!user) throw Errors.notFound('User');
        return user;
    }

    /** Super Admins can give a role to anyone; others only to users already visible to them. */
    private async findVisibleOrAssignable(ctx: AccessContext, id: string): Promise<UserEntity> {
        if (ctx.isSuperAdmin) {
            const user = await this.db.getRepository(UserEntity).findOneBy({ id });
            if (!user) throw Errors.notFound('User');
            return user;
        }
        return this.findVisible(ctx, id, P.USER_READ);
    }

    private async resolveTarget(dto: RoleTargetDto | { role: string; networkId?: string; stationId?: string }): Promise<ResolvedTarget> {
        switch (dto.role) {
            case ROLES.SUPER_ADMIN:
                if (dto.networkId || dto.stationId) throw Errors.badRequest('INVALID_ROLE_SCOPE', 'SUPER_ADMIN is not scoped to a network or station');
                return { role: dto.role, networkId: null, stationId: null, scopeNetworkId: null };
            case ROLES.NETWORK_ADMIN: {
                if (!dto.networkId || dto.stationId) throw Errors.badRequest('INVALID_ROLE_SCOPE', 'NETWORK_ADMIN requires networkId only');
                const network = await this.db.getRepository(NetworkEntity).findOneBy({ id: dto.networkId });
                if (!network) throw Errors.notFound('Network');
                if (network.status === 'archived') throw Errors.conflict('Network is archived', 'NETWORK_ARCHIVED');
                return { role: dto.role, networkId: network.id, stationId: null, scopeNetworkId: network.id };
            }
            case ROLES.STATION_ADMIN: {
                if (!dto.stationId || dto.networkId) throw Errors.badRequest('INVALID_ROLE_SCOPE', 'STATION_ADMIN requires stationId only');
                const station = await this.db.getRepository(StationEntity).findOneBy({ id: dto.stationId });
                if (!station) throw Errors.notFound('Station');
                return { role: dto.role, networkId: null, stationId: station.id, scopeNetworkId: station.networkId };
            }
            default:
                throw Errors.badRequest('ROLE_NOT_ASSIGNABLE', `Role ${dto.role} cannot be assigned here`);
        }
    }

    /** Super Admin manages every role; Network Admin manages Station Admins of its own network (spec 3.3). */
    private assertCanAssign(ctx: AccessContext, t: ResolvedTarget): void {
        if (!ctx.has(P.ROLE_ASSIGN)) throw Errors.forbidden();
        if (t.role === ROLES.SUPER_ADMIN || t.role === ROLES.NETWORK_ADMIN) {
            if (!ctx.isSuperAdmin) throw Errors.forbidden(`Only a Super Admin can assign ${t.role}`);
            return;
        }
        if (t.role === ROLES.STATION_ADMIN && t.stationId && t.scopeNetworkId
            && ctx.canOnStation(P.ROLE_ASSIGN, t.stationId, t.scopeNetworkId)) {
            return;
        }
        // Station outside the caller's scope: do not reveal that it exists.
        throw Errors.notFound('Station');
    }

    /** Super Admin manages anyone; others only users whose every active role is a Station Admin role inside their scope. */
    private async assertCanManage(ctx: AccessContext, userId: string): Promise<void> {
        if (!ctx.has(P.USER_UPDATE_STATUS)) throw Errors.forbidden();
        if (ctx.isSuperAdmin) return;
        const rows = await this.db.query(`
            SELECT a.role_code, a.station_id, s.network_id
              FROM user_role_assignments a LEFT JOIN stations s ON s.id = a.station_id
             WHERE a.user_id = $1 AND a.effective_to IS NULL`, [userId]) as { role_code: string; station_id: string | null; network_id: string | null }[];
        const manageable = rows.length > 0 && rows.every(r =>
            r.role_code === ROLES.STATION_ADMIN && r.station_id && r.network_id
            && ctx.canOnStation(P.USER_UPDATE_STATUS, r.station_id, r.network_id));
        if (!manageable) throw Errors.forbidden('You can only manage Station Admins of your own network');
    }

    private async assertAnotherSuperAdmin(excludingUserId: string): Promise<void> {
        const [{ count }] = await this.db.query(`
            SELECT count(DISTINCT a.user_id)::int AS count
              FROM user_role_assignments a JOIN users u ON u.id = a.user_id
             WHERE a.role_code = 'SUPER_ADMIN' AND a.effective_to IS NULL AND u.status = 'active' AND u.id <> $1`,
        [excludingUserId]) as { count: number }[];
        if (count < 1) throw Errors.conflict('The platform must keep at least one active Super Admin', 'LAST_SUPER_ADMIN');
    }

    private async insertAssignment(m: EntityManager, userId: string, t: ResolvedTarget, createdBy: string): Promise<RoleAssignmentEntity> {
        const exists = await m.getRepository(RoleAssignmentEntity).existsBy({
            userId, roleCode: t.role, networkId: t.networkId ?? IsNull(), stationId: t.stationId ?? IsNull(), ...ACTIVE,
        });
        if (exists) throw Errors.conflict('The user already has this role', 'ROLE_ALREADY_ASSIGNED');
        return m.getRepository(RoleAssignmentEntity).save(m.create(RoleAssignmentEntity, {
            userId, roleCode: t.role, networkId: t.networkId, stationId: t.stationId, effectiveFrom: new Date(), createdBy,
        }));
    }

    private async view(user: UserEntity): Promise<UserView> {
        return (await this.views([user]))[0];
    }

    private async views(users: UserEntity[]): Promise<UserView[]> {
        if (!users.length) return [];
        const assignments = await this.db.getRepository(RoleAssignmentEntity).find({
            where: users.map(u => ({ userId: u.id, ...ACTIVE })),
            order: { createdAt: 'ASC' },
        });
        return users.map(u => ({
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            phone: u.phone,
            status: u.status,
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
            createdAt: u.createdAt.toISOString(),
            roles: assignments.filter(a => a.userId === u.id).map((a): RoleAssignmentView => ({
                assignmentId: a.id, role: a.roleCode, networkId: a.networkId, stationId: a.stationId,
                effectiveFrom: a.effectiveFrom.toISOString(),
            })),
        }));
    }
}
