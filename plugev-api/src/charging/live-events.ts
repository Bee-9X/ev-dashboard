import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/**
 * One thing observed about a charger (canonical events, ADR-004/007):
 * - seen: any message arrived;
 * - connected / disconnected: the charger came online or went offline;
 * - boot: BootNotification, with what the charger says about itself;
 * - connector_status: StatusNotification for a connector (0 = the charger itself).
 */
export interface LiveEvent {
    type: 'seen' | 'connected' | 'disconnected' | 'boot' | 'connector_status';
    /** The identity the charger connected with (any case). */
    identity: string;
    /** When it was observed (ISO time). */
    at: string;
    protocol?: string;
    reason?: string;
    vendor?: string;
    model?: string;
    serialNumber?: string;
    firmwareVersion?: string;
    connectorNumber?: number;
    status?: string;
    errorCode?: string;
    info?: string;
    vendorErrorCode?: string;
    /** The charger's own timestamp for the status. */
    statusAt?: string;
}

export interface LiveEventsResult {
    applied: number;
    /** Identities that are not registered as chargers in the platform. */
    unknownIdentities: string[];
}

const SAFE = (v: string | undefined, max: number) => (v === undefined || v === '' ? null : v.slice(0, max));

/**
 * Applies what the charging module observes to the live state tables (FR EVSE 003, FR MON 002/003).
 * Every update is order-safe: older news never overwrites newer state, so retries and out-of-order
 * events are harmless (spec 11.4: replay or duplicate processing of charger messages).
 */
@Injectable()
export class LiveStateEvents {
    private readonly logger = new Logger('Charging');

    constructor(private readonly db: DataSource) {}

    async apply(events: LiveEvent[]): Promise<LiveEventsResult> {
        const identities = [...new Set(events.map(e => e.identity.toLowerCase()))];
        const rows: { id: string; identity: string }[] = await this.db.query(
            'SELECT id, lower(protocol_identity) AS identity FROM evses WHERE lower(protocol_identity) = ANY($1)',
            [identities],
        );
        const byIdentity = new Map(rows.map(r => [r.identity, r.id]));
        const unknown = new Set<string>();
        const now = Date.now();
        let applied = 0;

        await this.db.transaction(async m => {
            for (const e of events) {
                const evseId = byIdentity.get(e.identity.toLowerCase());
                if (!evseId) {
                    unknown.add(e.identity);
                    continue;
                }
                // a clock running ahead must not pin a charger "online" into the future
                const at = new Date(Math.min(Date.parse(e.at), now));
                await this.applyOne(m, evseId, e, at);
                applied++;
            }
        });
        if (unknown.size) this.logger.debug(`Events for unregistered chargers: ${[...unknown].join(', ')}`);
        return { applied, unknownIdentities: [...unknown] };
    }

    private async applyOne(m: EntityManager, evseId: string, e: LiveEvent, at: Date) {
        const protocol = e.protocol ?? null;
        switch (e.type) {
            case 'seen':
                return this.seen(m, evseId, at, protocol, false);
            case 'connected':
                return this.seen(m, evseId, at, protocol, true);
            case 'disconnected':
                return m.query(
                    `INSERT INTO evse_live_states (evse_id, connection_state, disconnected_at, disconnect_reason)
                     VALUES ($1, 'offline', $2, $3)
                     ON CONFLICT (evse_id) DO UPDATE SET
                         connection_state  = CASE WHEN evse_live_states.last_seen_at IS NULL OR evse_live_states.last_seen_at <= $2
                                                  THEN 'offline' ELSE evse_live_states.connection_state END,
                         disconnected_at   = GREATEST(evse_live_states.disconnected_at, $2),
                         disconnect_reason = CASE WHEN evse_live_states.disconnected_at IS NULL OR evse_live_states.disconnected_at <= $2
                                                  THEN $3 ELSE evse_live_states.disconnect_reason END,
                         updated_at        = now()`,
                    [evseId, at, SAFE(e.reason, 200)],
                );
            case 'boot': {
                await this.seen(m, evseId, at, protocol, false);
                const firmware = SAFE(e.firmwareVersion, 100);
                await m.query(
                    `UPDATE evse_live_states SET
                         last_boot_at = $2, reported_vendor = $3, reported_model = $4, reported_serial = $5, reported_firmware = $6,
                         updated_at = now()
                     WHERE evse_id = $1 AND (last_boot_at IS NULL OR last_boot_at <= $2)`,
                    [evseId, at, SAFE(e.vendor, 100), SAFE(e.model, 100), SAFE(e.serialNumber, 100), firmware],
                );
                // firmware is device metadata the charger reports (FR EVSE 005)
                if (firmware) {
                    await m.query(
                        'UPDATE evses SET firmware_version = $2, updated_at = now() WHERE id = $1 AND firmware_version IS DISTINCT FROM $2',
                        [evseId, firmware],
                    );
                }
                return;
            }
            case 'connector_status': {
                await this.seen(m, evseId, at, protocol, false);
                if (e.connectorNumber === undefined || !e.status) return;
                // the charger's own timestamp orders statuses; fall back to when it arrived
                const statusAtMs = e.statusAt ? Date.parse(e.statusAt) : at.getTime();
                const statusAt = new Date(Math.min(statusAtMs, Date.now()));
                return m.query(
                    `INSERT INTO connector_live_states (evse_id, connector_number, status, error_code, info, vendor_error_code, status_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (evse_id, connector_number) DO UPDATE SET
                         status = EXCLUDED.status, error_code = EXCLUDED.error_code, info = EXCLUDED.info,
                         vendor_error_code = EXCLUDED.vendor_error_code, status_at = EXCLUDED.status_at, updated_at = now()
                     WHERE connector_live_states.status_at <= EXCLUDED.status_at`,
                    [evseId, e.connectorNumber, e.status.slice(0, 40), SAFE(e.errorCode, 60), SAFE(e.info, 200), SAFE(e.vendorErrorCode, 100), statusAt],
                );
            }
        }
    }

    /** Heard from the charger at `at`: online, unless it was reported offline after that. */
    private seen(m: EntityManager, evseId: string, at: Date, protocol: string | null, connected: boolean) {
        return m.query(
            `INSERT INTO evse_live_states (evse_id, connection_state, protocol, last_seen_at, connected_at)
             VALUES ($1, 'online', $2, $3, $3)
             ON CONFLICT (evse_id) DO UPDATE SET
                 connection_state = CASE WHEN evse_live_states.disconnected_at IS NULL OR evse_live_states.disconnected_at < $3
                                         THEN 'online' ELSE evse_live_states.connection_state END,
                 protocol         = COALESCE($2, evse_live_states.protocol),
                 last_seen_at     = GREATEST(evse_live_states.last_seen_at, $3),
                 connected_at     = CASE WHEN $4 OR evse_live_states.connected_at IS NULL
                                              OR (evse_live_states.connection_state = 'offline' AND evse_live_states.disconnected_at < $3)
                                         THEN GREATEST(evse_live_states.connected_at, $3) ELSE evse_live_states.connected_at END,
                 updated_at       = now()`,
            [evseId, protocol, at, connected],
        );
    }
}
