import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { AccessTokenPayload } from '../access/access.guard';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/errors';
import { currentRequest } from '../common/request-context';
import { APP_CONFIG, AppConfig } from '../config/config';
import { AuthTokenEntity, AuthTokenPurpose, RefreshTokenEntity, UserEntity } from '../database/entities';
import { LoginEventsService } from './login-events.service';
import { newSecretToken, parseSecretToken, secretMatches } from './secret-token';

export interface IssuedRefreshToken {
    id: string;
    token: string;
    expiresAt: Date;
}

/**
 * Access tokens: short lived JWTs (FR AUTH 006).
 * Refresh tokens: opaque, single use, rotated on every refresh. Each login starts a "family"; if a
 * token that was already rotated is presented again, the whole family is revoked (theft detection).
 */
@Injectable()
export class TokensService {
    constructor(
        @Inject(APP_CONFIG) private readonly config: AppConfig,
        private readonly jwt: JwtService,
        private readonly db: DataSource,
        private readonly events: LoginEventsService,
        private readonly audit: AuditService,
    ) {}

    async issueAccessToken(userId: string): Promise<{ accessToken: string; expiresIn: number }> {
        const payload: AccessTokenPayload = { sub: userId, typ: 'access' };
        return { accessToken: await this.jwt.signAsync(payload), expiresIn: this.config.accessTokenTtlSec };
    }

    async issueRefreshToken(userId: string, familyId: string = randomUUID(), manager: EntityManager = this.db.manager): Promise<IssuedRefreshToken> {
        const t = newSecretToken();
        const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
        const req = currentRequest();
        await manager.insert(RefreshTokenEntity, {
            id: t.id, userId, familyId, tokenHash: t.hash, expiresAt,
            createdIp: req?.ip ?? null, userAgent: req?.userAgent ?? null,
        });
        return { id: t.id, token: t.token, expiresAt };
    }

    /** Exchanges a refresh token for a new pair. Throws TOKEN_INVALID for anything suspicious. */
    async rotate(token: string): Promise<{ userId: string; refresh: IssuedRefreshToken }> {
        const invalid = () => Errors.unauthenticated('Refresh token is invalid or expired', 'TOKEN_INVALID');
        const parsed = parseSecretToken(token);
        if (!parsed) throw invalid();

        const row = await this.db.getRepository(RefreshTokenEntity).findOneBy({ id: parsed.id });
        if (!row || !secretMatches(parsed.secret, row.tokenHash)) throw invalid();

        if (row.revokedAt) {
            if (row.revokedReason === 'rotated') await this.handleReuse(row);
            throw invalid();
        }
        if (row.expiresAt.getTime() <= Date.now()) throw invalid();

        const user = await this.db.getRepository(UserEntity).findOneBy({ id: row.userId });
        if (!user || user.status !== 'active') {
            await this.revokeFamily(row.familyId, 'account_inactive');
            throw Errors.unauthenticated('Account is not active', 'ACCOUNT_INACTIVE');
        }

        return this.db.transaction(async m => {
            const next = await this.issueRefreshToken(row.userId, row.familyId, m);
            // Conditional update: if two requests race with the same token, only one wins.
            const res = await m.update(RefreshTokenEntity, { id: row.id, revokedAt: IsNull() },
                { revokedAt: new Date(), revokedReason: 'rotated', replacedBy: next.id });
            if (!res.affected) throw invalid();
            await this.events.record('token_refreshed', { userId: row.userId }, m);
            return { userId: row.userId, refresh: next };
        });
    }

    /** Revokes the family of the given token (logout). Unknown tokens are ignored. Returns the user id if found. */
    async revokeByToken(token: string, reason: string): Promise<string | null> {
        const parsed = parseSecretToken(token);
        if (!parsed) return null;
        const row = await this.db.getRepository(RefreshTokenEntity).findOneBy({ id: parsed.id });
        if (!row || !secretMatches(parsed.secret, row.tokenHash)) return null;
        await this.revokeFamily(row.familyId, reason);
        return row.userId;
    }

    async revokeFamily(familyId: string, reason: string, manager: EntityManager = this.db.manager): Promise<void> {
        await manager.update(RefreshTokenEntity, { familyId, revokedAt: IsNull() }, { revokedAt: new Date(), revokedReason: reason });
    }

    async revokeAllForUser(userId: string, reason: string, manager: EntityManager = this.db.manager): Promise<void> {
        await manager.update(RefreshTokenEntity, { userId, revokedAt: IsNull() }, { revokedAt: new Date(), revokedReason: reason });
    }

    /** One-time token for password reset or invitation acceptance. Earlier unused ones of the same purpose are voided. */
    async issueAuthToken(userId: string, purpose: AuthTokenPurpose, manager: EntityManager = this.db.manager): Promise<string> {
        const ttlMs = purpose === 'invite'
            ? this.config.inviteTtlHours * 3_600_000
            : this.config.passwordResetTtlMin * 60_000;
        await manager.update(AuthTokenEntity, { userId, purpose, usedAt: IsNull() }, { usedAt: new Date() });
        const t = newSecretToken();
        await manager.insert(AuthTokenEntity, {
            id: t.id, userId, purpose, tokenHash: t.hash, expiresAt: new Date(Date.now() + ttlMs),
        });
        return t.token;
    }

    /** Validates and consumes a one-time token inside the caller's transaction. */
    async consumeAuthToken(token: string, manager: EntityManager): Promise<AuthTokenEntity> {
        const invalid = () => Errors.badRequest('TOKEN_INVALID', 'The link is invalid or has expired. Request a new one.');
        const parsed = parseSecretToken(token);
        if (!parsed) throw invalid();
        const row = await manager.getRepository(AuthTokenEntity).findOne({
            where: { id: parsed.id }, lock: { mode: 'pessimistic_write' },
        });
        if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now() || !secretMatches(parsed.secret, row.tokenHash)) {
            throw invalid();
        }
        await manager.update(AuthTokenEntity, { id: row.id }, { usedAt: new Date() });
        return row;
    }

    private async handleReuse(row: RefreshTokenEntity): Promise<void> {
        await this.db.transaction(async m => {
            await this.revokeFamily(row.familyId, 'reuse_detected', m);
            await this.events.record('refresh_token_reuse', { userId: row.userId, reason: 'rotated token presented again' }, m);
            await this.audit.record({
                actor: { userId: row.userId },
                action: 'auth.refresh_token_reuse',
                resourceType: 'user',
                resourceId: row.userId,
                outcome: 'denied',
                details: { familyId: row.familyId },
            }, m);
        });
    }
}
