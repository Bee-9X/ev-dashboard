import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../config/config';
import { CommandConfirmations } from './charging.confirmations';
import { Charger, ChargerDirectory, LiveState } from './charging.state';
import { date, extractSamples, MeterSample, meterKey, num, OcppError, Protocol, str } from './ocpp/common';
import type { OcppVersion, Payload } from './ocpp/xml';

/** Who sent a message and how. */
export interface InboundContext {
    /** As the charger sent it. */
    identity: string;
    protocol: Protocol;
    version: OcppVersion;
    ip?: string;
    /** SOAP: the address the charger takes commands on. */
    endpoint?: string;
}

type Handler = (charger: Charger, ctx: InboundContext, p: Payload) => Promise<Payload>;

/** Messages a charger may send us (OCPP 1.5/1.6 central system operations). */
export const INBOUND_ACTIONS = [
    'BootNotification', 'Heartbeat', 'StatusNotification', 'Authorize', 'StartTransaction', 'StopTransaction',
    'MeterValues', 'DataTransfer', 'FirmwareStatusNotification', 'DiagnosticsStatusNotification',
] as const;

/** "bootNotificationRequest" / "BootNotification" / "bootnotification" -> "BootNotification". */
export function canonicalAction(name: string): string {
    const base = String(name).replace(/request$/i, '');
    return INBOUND_ACTIONS.find(a => a.toLowerCase() === base.toLowerCase()) ?? base.charAt(0).toUpperCase() + base.slice(1);
}

/** OCPP idTagInfo status. */
type IdTagStatus = 'Accepted' | 'Blocked' | 'Invalid';

/**
 * Protocol-neutral handling of what chargers send (ported from the Phase 0 gateway).
 * Payloads use OCPP-J field names; response keys are in OCPP schema order because SOAP keeps it.
 * Only chargers registered in the portal are served (spec 7.5, 11.4: charger impersonation).
 */
@Injectable()
export class ChargingHandlers {
    private readonly logger = new Logger('Charging');
    private readonly handlers: Record<string, Handler>;

    constructor(
        private readonly db: DataSource,
        private readonly directory: ChargerDirectory,
        private readonly live: LiveState,
        private readonly confirmations: CommandConfirmations,
        @Inject(APP_CONFIG) private readonly config: AppConfig,
    ) {
        this.handlers = {
            BootNotification: (c, ctx, p) => this.boot(c, ctx, p),
            Heartbeat: async () => ({ currentTime: new Date().toISOString() }),
            StatusNotification: (c, ctx, p) => this.status(c, ctx, p),
            Authorize: async (c, _ctx, p) => ({ idTagInfo: { status: this.idTagStatus(c, str(p.idTag)) } }),
            StartTransaction: (c, _ctx, p) => this.startTransaction(c, p),
            StopTransaction: (c, _ctx, p) => this.stopTransaction(c, p),
            MeterValues: (c, _ctx, p) => this.meterValues(c, p),
            DataTransfer: async (c, _ctx, p) => {
                this.logger.log(`[${c.protocolIdentity}] DataTransfer vendorId=${str(p.vendorId)} messageId=${str(p.messageId)}`);
                return { status: 'UnknownVendorId' };
            },
            // kept in the OCPP message log; nothing else needs them yet
            FirmwareStatusNotification: async () => ({}),
            DiagnosticsStatusNotification: async () => ({}),
        };
    }

    canonicalAction(name: string): string {
        return canonicalAction(name);
    }

    /** Looks up the charger (registered ones only), records that it was heard from, and answers the message. */
    async handle(ctx: InboundContext, action: string, payload: Payload): Promise<Payload> {
        const charger = await this.directory.find(ctx.identity);
        if (!charger) {
            if (action === 'BootNotification') {
                this.logger.warn(`[${ctx.identity}] Rejected BootNotification: no charger with this Charger ID is registered in the admin portal`);
                return this.bootResponse(ctx.version, 'Rejected');
            }
            throw new OcppError('SecurityError', `Charge point ${ctx.identity} is not registered`);
        }
        await this.live.seen(charger, ctx.protocol, { ip: ctx.ip, endpoint: ctx.endpoint });

        const handler = this.handlers[action];
        if (!handler) throw new OcppError('NotImplemented', `Action ${action} is not supported by this server`);
        return handler(charger, ctx, payload || {});
    }

    private bootResponse(version: OcppVersion, status: 'Accepted' | 'Rejected'): Payload {
        const now = new Date().toISOString();
        const interval = this.config.ocpp.heartbeatIntervalSec;
        return version === '1.5'
            ? { status, currentTime: now, heartbeatInterval: interval }
            : { status, currentTime: now, interval };
    }

    private async boot(c: Charger, ctx: InboundContext, p: Payload): Promise<Payload> {
        await this.live.event(c, {
            type: 'boot',
            protocol: ctx.protocol,
            vendor: str(p.chargePointVendor),
            model: str(p.chargePointModel),
            serialNumber: str(p.chargeBoxSerialNumber) ?? str(p.chargePointSerialNumber),
            firmwareVersion: str(p.firmwareVersion),
        });
        await this.confirmations.booted(c.id);
        return this.bootResponse(ctx.version, 'Accepted');
    }

    private async status(c: Charger, ctx: InboundContext, p: Payload): Promise<Payload> {
        const connectorNumber = num(p.connectorId) ?? 0;
        await this.live.event(c, {
            type: 'connector_status',
            protocol: ctx.protocol,
            connectorNumber,
            status: str(p.status),
            errorCode: str(p.errorCode),
            info: str(p.info),
            vendorErrorCode: str(p.vendorErrorCode),
            statusAt: date(p.timestamp)?.toISOString(),
        });
        await this.confirmations.statusReported(c.id, connectorNumber, str(p.status));
        return {};
    }

    /**
     * Until EV user accounts exist (Phase 4), every idTag may charge unless OCPP_ID_TAG_ALLOWLIST lists the allowed
     * ones. A disabled charger or connector blocks charging (FR EVSE 006).
     */
    private idTagStatus(c: Charger, idTag: string | undefined, connectorNumber?: number): IdTagStatus {
        if (!idTag) return 'Invalid';
        if (c.status === 'disabled') return 'Blocked';
        if (connectorNumber !== undefined && c.connectors[connectorNumber] === 'disabled') return 'Blocked';
        // the tag the portal starts sessions with
        if (idTag === this.config.ocpp.remoteIdTag) return 'Accepted';
        const allow = this.config.ocpp.idTagAllowList;
        return allow.length === 0 || allow.includes(idTag) ? 'Accepted' : 'Invalid';
    }

    private async startTransaction(c: Charger, p: Payload): Promise<Payload> {
        const connectorNumber = num(p.connectorId) ?? 1;
        const idTag = str(p.idTag)?.slice(0, 50);
        const startedAt = date(p.timestamp) ?? new Date();
        const meterStart = num(p.meterStart) ?? null;
        const status = this.idTagStatus(c, idTag, connectorNumber);

        const { transactionId, sessionId } = await this.db.transaction(async m => {
            // a charger resends StartTransaction when it missed our answer: give it the same id
            const [existing] = await m.query(
                `SELECT ocpp_transaction_id FROM charging_sessions
                 WHERE evse_id = $1 AND connector_number = $2 AND id_tag IS NOT DISTINCT FROM $3 AND started_at = $4
                   AND meter_start_wh IS NOT DISTINCT FROM $5 AND ocpp_transaction_id IS NOT NULL`,
                [c.id, connectorNumber, idTag ?? null, startedAt, meterStart],
            );
            if (existing) {
                this.logger.log(`[${c.protocolIdentity}] Duplicate StartTransaction, re-using transaction ${existing.ocpp_transaction_id}`);
                return { transactionId: existing.ocpp_transaction_id as number, sessionId: null };
            }
            // a new start on a connector with an open session means its stop was missed
            await m.query(
                `UPDATE charging_sessions SET status = 'interrupted', updated_at = now(),
                     notes = array_append(notes, $3)
                 WHERE evse_id = $1 AND connector_number = $2 AND status = 'active'`,
                [c.id, connectorNumber, `Superseded by a new StartTransaction at ${startedAt.toISOString()}`],
            );
            const [row] = await m.query(
                `INSERT INTO charging_sessions
                     (network_id, station_id, evse_id, connector_number, ocpp_transaction_id, id_tag, reservation_id,
                      started_at, meter_start_wh, status, notes)
                 VALUES ($1, $2, $3, $4, nextval('ocpp_transaction_id_seq'), $5, $6, $7, $8, 'active', $9)
                 RETURNING id, ocpp_transaction_id`,
                [c.networkId, c.stationId, c.id, connectorNumber, idTag ?? null, num(p.reservationId) ?? null, startedAt, meterStart,
                    status === 'Accepted' ? [] : [`idTag ${idTag ?? '(none)'} not accepted (${status})`]],
            );
            return { transactionId: row.ocpp_transaction_id as number, sessionId: row.id as string };
        });
        if (sessionId) await this.confirmations.sessionStarted(c.id, connectorNumber, idTag ?? null, sessionId);
        return { transactionId, idTagInfo: { status } };
    }

    private async stopTransaction(c: Charger, p: Payload): Promise<Payload> {
        const transactionId = num(p.transactionId);
        const stoppedAt = date(p.timestamp) ?? new Date();
        const meterStop = num(p.meterStop) ?? null;
        const stopIdTag = str(p.idTag)?.slice(0, 50);
        const reason = str(p.reason)?.slice(0, 50) ?? null;

        const stoppedSessionId = await this.db.transaction(async m => {
            const [session] = transactionId === undefined ? [] : await m.query(
                `SELECT id, status, connector_number FROM charging_sessions WHERE evse_id = $1 AND ocpp_transaction_id = $2 FOR UPDATE`,
                [c.id, transactionId],
            );
            let sessionId: string;
            let connectorNumber: number | null = null;
            if (!session) {
                this.logger.warn(`[${c.protocolIdentity}] StopTransaction for unknown transaction ${transactionId}; recorded as orphan`);
                const [row] = await m.query(
                    `INSERT INTO charging_sessions
                         (network_id, station_id, evse_id, connector_number, ocpp_transaction_id, stop_id_tag, stopped_at,
                          meter_stop_wh, stop_reason, status, notes)
                     VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, 'orphan', $9)
                     RETURNING id`,
                    [c.networkId, c.stationId, c.id, transactionId ?? null, stopIdTag ?? null, stoppedAt, meterStop, reason,
                        ['StopTransaction received for a transaction this platform did not start']],
                );
                sessionId = row.id;
            } else {
                sessionId = session.id;
                connectorNumber = session.connector_number;
                if (session.status === 'completed') {
                    this.logger.log(`[${c.protocolIdentity}] Duplicate StopTransaction for ${transactionId}, ignored`);
                } else {
                    await m.query(
                        `UPDATE charging_sessions SET
                             stopped_at = $2, meter_stop_wh = $3, stop_id_tag = $4, stop_reason = COALESCE($5, stop_reason),
                             energy_wh = CASE WHEN $3::numeric IS NOT NULL AND meter_start_wh IS NOT NULL THEN $3::numeric - meter_start_wh END,
                             notes = CASE WHEN status = 'interrupted'
                                          THEN array_append(notes, 'StopTransaction arrived after the session was marked interrupted')
                                          ELSE notes END,
                             status = 'completed', updated_at = now()
                         WHERE id = $1`,
                        [sessionId, stoppedAt, meterStop, stopIdTag ?? null, reason],
                    );
                }
            }
            const samples = extractSamples(p);
            if (samples.length) await this.storeSamples(m, c, samples, { connectorNumber, sessionId, source: 'StopTransaction' });
            return sessionId;
        });
        if (transactionId !== undefined) await this.confirmations.sessionStopped(c.id, transactionId, stoppedSessionId);

        return stopIdTag ? { idTagInfo: { status: this.idTagStatus(c, stopIdTag) } } : {};
    }

    private async meterValues(c: Charger, p: Payload): Promise<Payload> {
        const connectorNumber = num(p.connectorId) ?? 0;
        const transactionId = num(p.transactionId);
        const samples = extractSamples(p);
        if (!samples.length) return {};
        await this.db.transaction(async m => {
            // Some chargers (often OCPP 1.5) leave out the optional transactionId: the readings then belong to the
            // session running on that connector, if any (AC 07).
            const [session] = transactionId !== undefined
                ? await m.query('SELECT id FROM charging_sessions WHERE evse_id = $1 AND ocpp_transaction_id = $2', [c.id, transactionId])
                : connectorNumber > 0
                    ? await m.query(
                        `SELECT id FROM charging_sessions WHERE evse_id = $1 AND connector_number = $2 AND status = 'active'
                         ORDER BY started_at DESC LIMIT 1`,
                        [c.id, connectorNumber],
                    )
                    : [];
            await this.storeSamples(m, c, samples, { connectorNumber, sessionId: session?.id ?? null, source: 'MeterValues' });
        });
        return {};
    }

    private async storeSamples(
        m: EntityManager,
        c: Charger,
        samples: MeterSample[],
        o: { connectorNumber: number | null; sessionId: string | null; source: 'MeterValues' | 'StopTransaction' },
    ): Promise<void> {
        const values: unknown[] = [];
        const rows = samples.map((s, i) => {
            const b = i * 13;
            values.push(c.id, o.connectorNumber, o.sessionId, s.measuredAt, s.measurand.slice(0, 100), s.phase, s.unit, s.value.slice(0, 500),
                s.numericValue, s.context, s.location, s.format, o.source);
            return `(${Array.from({ length: 13 }, (_, k) => `$${b + k + 1}`).join(', ')})`;
        });
        await m.query(
            `INSERT INTO meter_values (evse_id, connector_number, session_id, measured_at, measurand, phase, unit, value,
                                       numeric_value, context, location, format, source)
             VALUES ${rows.join(', ')}`,
            values,
        );

        // newest value per measurand on the connector, for live display
        if (o.connectorNumber === null || o.connectorNumber === 0) return;
        const latest: Record<string, { value: number | string; unit: string | null; at: string }> = {};
        for (const s of samples) {
            const key = meterKey(s);
            if (!latest[key] || latest[key].at <= s.measuredAt.toISOString()) {
                latest[key] = { value: s.numericValue ?? s.value, unit: s.unit, at: s.measuredAt.toISOString() };
            }
        }
        await m.query(
            `UPDATE connector_live_states SET meter = meter || $3::jsonb, updated_at = now()
             WHERE evse_id = $1 AND connector_number = $2`,
            [c.id, o.connectorNumber, JSON.stringify(latest)],
        );
    }
}
