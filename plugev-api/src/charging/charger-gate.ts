import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../config/config';
import { addressAllowed, chargerPasswordMatches, parseBasicAuth } from './charger-credentials';
import { Charger, ChargerDirectory } from './charging.state';

export type RefusalReason = 'address_not_allowed' | 'password_missing' | 'password_wrong' | 'not_secured';

export type Admission =
    | { ok: true; charger: Charger }
    /** `charger` is null when no charger is registered with this identity (the adapters answer that as before). */
    | { ok: false; charger: null }
    | { ok: false; charger: Charger; reason: RefusalReason; status: 401 | 403 };

export const REFUSAL_TEXT: Record<RefusalReason, string> = {
    address_not_allowed: 'it connected from an address that is not on its list of allowed addresses',
    password_missing: 'it sent no password (HTTP Basic authentication)',
    password_wrong: 'it sent a wrong password, or a user name other than its Charger ID',
    not_secured: 'it has neither a password nor allowed addresses, and unsecured chargers are not accepted (OCPP_ALLOW_UNSECURED_CHARGERS=false)',
};

// a refused charger usually retries every few seconds: note each kind of refusal at most this often
const NOTE_EVERY_MS = 60000;

/**
 * Checks a charger's identity and connection before any of its messages is handled (spec 7.5, 11.4): it must be
 * registered, connect from an allowed address when it has a list, and send its password when it has one.
 * OCPP-J chargers are checked when the WebSocket opens, SOAP chargers on every request.
 */
@Injectable()
export class ChargerGate {
    private readonly logger = new Logger('Charging');
    private readonly lastNoted = new Map<string, number>();

    constructor(
        private readonly db: DataSource,
        private readonly directory: ChargerDirectory,
        @Inject(APP_CONFIG) private readonly config: AppConfig,
    ) {}

    async admit(identity: string, conn: { ip: string; authorization?: string | string[]; viaProxy?: boolean }): Promise<Admission> {
        const charger = await this.directory.find(identity);
        if (!charger) return { ok: false, charger: null };
        const [row]: { password_hash: string | null; password_salt: string | null; allowed_addresses: string[] }[] = await this.db.query(
            'SELECT password_hash, password_salt, allowed_addresses FROM charger_security WHERE evse_id = $1',
            [charger.id],
        );
        const allowed = row?.allowed_addresses ?? [];
        const reason = this.check(charger, conn, allowed, row?.password_hash ?? null, row?.password_salt ?? null);
        if (!reason) return { ok: true, charger };
        this.note(charger, conn, reason);
        return { ok: false, charger, reason, status: reason === 'password_missing' || reason === 'password_wrong' ? 401 : 403 };
    }

    private check(
        charger: Charger, conn: { ip: string; authorization?: string | string[] }, allowed: string[], hash: string | null, salt: string | null,
    ): RefusalReason | null {
        if (allowed.length && !addressAllowed(conn.ip, allowed)) return 'address_not_allowed';
        if (hash && salt) {
            const credentials = parseBasicAuth(conn.authorization);
            if (!credentials) return 'password_missing';
            const sameCharger = credentials.user.toLowerCase() === charger.protocolIdentity.toLowerCase();
            // compare the password even when the user name is wrong, so both take the same time
            const matches = chargerPasswordMatches(credentials.password, salt, hash);
            return sameCharger && matches ? null : 'password_wrong';
        }
        if (!allowed.length && !this.config.ocpp.allowUnsecuredChargers) return 'not_secured';
        return null;
    }

    /** Logs the refusal and keeps it on the charger, for the portal; at most once a minute per kind and address. */
    private note(charger: Charger, conn: { ip: string; viaProxy?: boolean }, reason: RefusalReason): void {
        const key = `${charger.id}|${reason}|${conn.ip}`;
        const now = Date.now();
        if (now - (this.lastNoted.get(key) ?? 0) < NOTE_EVERY_MS) return;
        this.lastNoted.set(key, now);
        if (this.lastNoted.size > 10000) this.lastNoted.clear();

        const hint = reason === 'address_not_allowed' && conn.viaProxy && this.config.ocpp.trustedProxies === 0
            ? ' It came through a proxy (X-Forwarded-For), so the address seen is the proxy\'s: set OCPP_TRUSTED_PROXIES (1 for ngrok).'
            : '';
        this.logger.warn(`[${charger.protocolIdentity}] Refused a connection from ${conn.ip || 'an unknown address'}: ${REFUSAL_TEXT[reason]}.${hint}`);
        this.db.query(
            `INSERT INTO charger_security (evse_id, last_refused_at, last_refused_ip, last_refused_reason) VALUES ($1, now(), $2, $3)
             ON CONFLICT (evse_id) DO UPDATE SET last_refused_at = now(), last_refused_ip = $2, last_refused_reason = $3`,
            [charger.id, conn.ip.slice(0, 60) || null, reason],
        ).catch((err: Error) => this.logger.warn(`[${charger.protocolIdentity}] Could not record the refusal: ${err.message}`));
    }
}
