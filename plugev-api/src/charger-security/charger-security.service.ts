import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccessContext } from '../access/access-context';
import { P } from '../access/permissions';
import { AuditService } from '../audit/audit.service';
import { generateChargerPassword, hashChargerPassword, normaliseAddressRule } from '../charging/charger-credentials';
import type { RefusalReason } from '../charging/charger-gate';
import { ConnectionRegistry } from '../charging/charging.state';
import { Errors } from '../common/errors';
import { APP_CONFIG, AppConfig } from '../config/config';
import { EvseEntity, NetworkEntity } from '../database/entities';
import { SetAllowedAddressesDto, SetChargerPasswordDto } from './charger-security.dto';

/** How a charger has to prove itself when it connects. The password itself is never shown again after it is set. */
export interface ChargerSecurityView {
    passwordSet: boolean;
    passwordSetAt: Date | null;
    /** Addresses or CIDR ranges it may connect from; empty = from anywhere. */
    allowedAddresses: string[];
    /** Has a password or allowed addresses. */
    secured: boolean;
    /** Whether the platform accepts chargers that are not secured (OCPP_ALLOW_UNSECURED_CHARGERS). */
    unsecuredAccepted: boolean;
    /** Where the charger last connected from, to help fill in the allowed addresses. */
    lastAddress: string | null;
    lastRefusal: { at: Date; address: string | null; reason: RefusalReason } | null;
}

interface Row {
    password_set_at: Date | null; has_password: boolean; allowed_addresses: string[] | null;
    last_refused_at: Date | null; last_refused_ip: string | null; last_refused_reason: RefusalReason | null; last_ip: string | null;
}

/** Charger passwords and allowed addresses (spec 7.5: per device credentials, rotation and revocation). */
@Injectable()
export class ChargerSecurityService {
    constructor(
        private readonly db: DataSource,
        private readonly audit: AuditService,
        private readonly registry: ConnectionRegistry,
        @Inject(APP_CONFIG) private readonly config: AppConfig,
    ) {}

    async get(ctx: AccessContext, evseId: string): Promise<ChargerSecurityView> {
        await this.findInScope(ctx, evseId);
        return this.view(evseId);
    }

    /** Sets a new password (made here unless given) and returns it once. The old one stops working at once. */
    async setPassword(ctx: AccessContext, evseId: string, dto: SetChargerPasswordDto): Promise<{ password: string; security: ChargerSecurityView }> {
        const evse = await this.findForChange(ctx, evseId);
        const password = dto.password ?? generateChargerPassword();
        const { salt, hash } = hashChargerPassword(password);
        const replaced = await this.db.transaction(async m => {
            const [before] = await m.query('SELECT password_hash IS NOT NULL AS had FROM charger_security WHERE evse_id = $1 FOR UPDATE', [evseId]);
            await m.query(
                `INSERT INTO charger_security (evse_id, password_hash, password_salt, password_set_at, updated_at) VALUES ($1, $2, $3, now(), now())
                 ON CONFLICT (evse_id) DO UPDATE SET password_hash = $2, password_salt = $3, password_set_at = now(), updated_at = now()`,
                [evseId, hash, salt],
            );
            const had = !!before?.had;
            await this.audit.record({
                actor: ctx, action: had ? 'evse.password_replace' : 'evse.password_set', resourceType: 'evse', resourceId: evseId,
                networkId: evse.networkId, stationId: evse.stationId,
                // never the password itself
                details: { protocolIdentity: evse.protocolIdentity, generated: dto.password === undefined },
            }, m);
            return had;
        });
        this.registry.disconnect(evse.protocolIdentity, replaced ? 'its password was replaced' : 'a password was set for it');
        return { password, security: await this.view(evseId) };
    }

    async removePassword(ctx: AccessContext, evseId: string): Promise<ChargerSecurityView> {
        const evse = await this.findForChange(ctx, evseId);
        await this.db.transaction(async m => {
            const res: [unknown, number] = await m.query(
                `UPDATE charger_security SET password_hash = NULL, password_salt = NULL, password_set_at = NULL, updated_at = now()
                 WHERE evse_id = $1 AND password_hash IS NOT NULL`,
                [evseId],
            );
            if (!res[1]) return;
            await this.audit.record({
                actor: ctx, action: 'evse.password_remove', resourceType: 'evse', resourceId: evseId,
                networkId: evse.networkId, stationId: evse.stationId, details: { protocolIdentity: evse.protocolIdentity },
            }, m);
        });
        return this.view(evseId);
    }

    async setAllowedAddresses(ctx: AccessContext, evseId: string, dto: SetAllowedAddressesDto): Promise<ChargerSecurityView> {
        const evse = await this.findForChange(ctx, evseId);
        const invalid: string[] = [];
        const rules: string[] = [];
        for (const raw of dto.addresses) {
            if (!raw.trim()) continue;
            const rule = normaliseAddressRule(raw);
            if (!rule) invalid.push(raw);
            else if (!rules.includes(rule)) rules.push(rule);
        }
        if (invalid.length) {
            throw Errors.badRequest('VALIDATION_FAILED', `Not an IP address or CIDR range: ${invalid.join(', ')}`,
                [{ field: 'addresses', issues: invalid.map(a => `${a} is not an IP address or CIDR range (e.g. 203.0.113.7 or 203.0.113.0/24)`) }]);
        }
        const changed = await this.db.transaction(async m => {
            const [before] = await m.query('SELECT allowed_addresses FROM charger_security WHERE evse_id = $1 FOR UPDATE', [evseId]);
            const from: string[] = before?.allowed_addresses ?? [];
            if (from.length === rules.length && from.every((r, i) => r === rules[i])) return false;
            await m.query(
                `INSERT INTO charger_security (evse_id, allowed_addresses, updated_at) VALUES ($1, $2, now())
                 ON CONFLICT (evse_id) DO UPDATE SET allowed_addresses = $2, updated_at = now()`,
                [evseId, rules],
            );
            await this.audit.record({
                actor: ctx, action: 'evse.allowed_addresses_change', resourceType: 'evse', resourceId: evseId,
                networkId: evse.networkId, stationId: evse.stationId,
                details: { protocolIdentity: evse.protocolIdentity, changes: { allowedAddresses: { from, to: rules } } },
            }, m);
            return true;
        });
        if (changed && rules.length) this.registry.disconnect(evse.protocolIdentity, 'its allowed addresses changed');
        return this.view(evseId);
    }

    private async view(evseId: string): Promise<ChargerSecurityView> {
        const [r]: Row[] = await this.db.query(
            `SELECT s.password_set_at, s.password_hash IS NOT NULL AS has_password, s.allowed_addresses,
                    s.last_refused_at, s.last_refused_ip, s.last_refused_reason, l.ip AS last_ip
             FROM evses e
             LEFT JOIN charger_security s ON s.evse_id = e.id
             LEFT JOIN evse_live_states l ON l.evse_id = e.id
             WHERE e.id = $1`,
            [evseId],
        );
        const allowedAddresses = r?.allowed_addresses ?? [];
        const passwordSet = !!r?.has_password;
        return {
            passwordSet,
            passwordSetAt: r?.password_set_at ?? null,
            allowedAddresses,
            secured: passwordSet || allowedAddresses.length > 0,
            unsecuredAccepted: this.config.ocpp.allowUnsecuredChargers,
            lastAddress: r?.last_ip ?? null,
            lastRefusal: r?.last_refused_at && r.last_refused_reason
                ? { at: r.last_refused_at, address: r.last_refused_ip, reason: r.last_refused_reason }
                : null,
        };
    }

    /** Out-of-scope chargers look like they do not exist (spec 11.4). */
    private async findInScope(ctx: AccessContext, id: string): Promise<EvseEntity> {
        const evse = await this.db.getRepository(EvseEntity).findOneBy({ id });
        if (!evse || !ctx.canOnStation(P.EVSE_READ, evse.stationId, evse.networkId)) throw Errors.notFound('Charger');
        return evse;
    }

    private async findForChange(ctx: AccessContext, id: string): Promise<EvseEntity> {
        const evse = await this.findInScope(ctx, id);
        if (!ctx.canOnStation(P.EVSE_UPDATE, evse.stationId, evse.networkId)) throw Errors.forbidden();
        const network = await this.db.getRepository(NetworkEntity).findOneByOrFail({ id: evse.networkId });
        if (network.status === 'archived') throw Errors.conflict('Archived networks cannot be changed', 'NETWORK_ARCHIVED');
        return evse;
    }
}
