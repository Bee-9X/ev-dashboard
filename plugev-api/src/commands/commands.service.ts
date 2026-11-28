import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccessContext } from '../access/access-context';
import { P, Permission } from '../access/permissions';
import { AuditService } from '../audit/audit.service';
import { ChargerCommander, CONFIRM_WITHIN_SEC } from '../charging/charging.commands';
import { CommandError } from '../charging/ocpp/common';
import type { Payload } from '../charging/ocpp/xml';
import { Errors } from '../common/errors';
import { Page, PageQueryDto, toPage } from '../common/pagination';
import { currentRequest, runOutsideRequest } from '../common/request-context';
import { APP_CONFIG, AppConfig } from '../config/config';
import { ConnectorEntity, EvseEntity, NetworkEntity } from '../database/entities';
import {
    AvailabilityDto, ChangeConfigurationDto, ConnectorCommandDto, GetConfigurationDto, RemoteStartDto, ResetDto, TriggerMessageDto,
} from './commands.dto';

export type CommandStatus = 'queued' | 'sent' | 'accepted' | 'rejected' | 'failed' | 'timed_out';

/**
 * Whether the charger's later messages showed the action happened (spec 5.3 step 22).
 * confirmed: they did. waiting: accepted, still within the time the charger may take. not_confirmed: that time passed.
 * Null for commands with nothing to confirm (e.g. reading the configuration) and for commands that were not accepted.
 */
export type ConfirmationState = 'confirmed' | 'waiting' | 'not_confirmed';

export interface CommandView {
    id: string;
    evseId: string;
    /** The OCPP operation, e.g. RemoteStartTransaction. */
    action: string;
    connectorNumber: number | null;
    /** What was sent to the charger. */
    payload: Payload;
    status: CommandStatus;
    /** What the charger answered, e.g. Accepted, Rejected, Unlocked, Scheduled, NotSupported. */
    responseStatus: string | null;
    error: string | null;
    requestedBy: { id: string; name: string } | null;
    createdAt: Date;
    sentAt: Date | null;
    answeredAt: Date | null;
    confirmation: { state: ConfirmationState; at: Date | null; detail: string | null; sessionId: string | null } | null;
}

export interface ConfigurationView {
    /** Null until the configuration has been read from the charger. */
    readAt: Date | null;
    keys: { key: string; value: string | null; readonly: boolean }[];
    /** Keys the charger said it does not know. */
    unknownKeys: string[];
}

/** Answers that mean the charger took the command on (Scheduled: it applies once a session ends). */
const ACCEPTED = new Set(['Accepted', 'Unlocked', 'Scheduled', 'RebootRequired']);

interface CommandRow {
    id: string; evse_id: string; action: string; connector_number: number | null; payload: Payload; status: CommandStatus;
    response_status: string | null; error: string | null; requested_by: string | null; requested_by_name: string | null;
    created_at: Date; sent_at: Date | null; answered_at: Date | null; confirmed_at: Date | null; confirmation: string | null;
    session_id: string | null;
}

/**
 * Remote commands from the admin portal (spec 5.3, 9.4, AC 11): checked against role, scope and the charger's state,
 * audited, sent in the background, and confirmed from the charger's later messages where OCPP allows.
 */
@Injectable()
export class CommandsService {
    private readonly logger = new Logger('Commands');

    constructor(
        private readonly db: DataSource,
        private readonly audit: AuditService,
        private readonly commander: ChargerCommander,
        @Inject(APP_CONFIG) private readonly config: AppConfig,
    ) {}

    // ---------- the commands ----------

    async remoteStart(ctx: AccessContext, evseId: string, dto: RemoteStartDto): Promise<CommandView> {
        const { evse, connectors } = await this.target(ctx, evseId, P.EVSE_REMOTE_START);
        const network = await this.db.getRepository(NetworkEntity).findOneByOrFail({ id: evse.networkId });
        // a suspended network takes no new sessions (FR NET 005)
        if (network.status !== 'active') throw Errors.conflict('The network is not active, so no new sessions can start', 'NETWORK_NOT_ACTIVE');
        if (evse.status === 'disabled') throw Errors.conflict('The charger is disabled in the portal; enable it first', 'CHARGER_DISABLED');
        if (dto.connectorNumber !== undefined) {
            const connector = this.connector(connectors, dto.connectorNumber);
            if (connector.status === 'disabled') throw Errors.conflict(`Connector ${dto.connectorNumber} is disabled in the portal`, 'CONNECTOR_DISABLED');
            if (await this.activeSession(evse.id, dto.connectorNumber)) {
                throw Errors.conflict(`Connector ${dto.connectorNumber} is already charging`, 'CONNECTOR_BUSY');
            }
        }
        const payload: Payload = { idTag: dto.idTag ?? this.config.ocpp.remoteIdTag };
        if (dto.connectorNumber !== undefined) payload.connectorId = dto.connectorNumber;
        return this.issue(ctx, evse, 'RemoteStartTransaction', payload, dto.connectorNumber ?? null);
    }

    async remoteStop(ctx: AccessContext, evseId: string, dto: ConnectorCommandDto): Promise<CommandView> {
        const { evse, connectors } = await this.target(ctx, evseId, P.EVSE_REMOTE_STOP);
        this.connector(connectors, dto.connectorNumber);
        const session = await this.activeSession(evse.id, dto.connectorNumber);
        if (!session || session.ocpp_transaction_id === null) {
            throw Errors.conflict(`Nothing is charging on connector ${dto.connectorNumber}`, 'NO_ACTIVE_SESSION');
        }
        return this.issue(ctx, evse, 'RemoteStopTransaction', { transactionId: session.ocpp_transaction_id }, dto.connectorNumber);
    }

    async reset(ctx: AccessContext, evseId: string, dto: ResetDto): Promise<CommandView> {
        const { evse } = await this.target(ctx, evseId, P.EVSE_RESET);
        return this.issue(ctx, evse, 'Reset', { type: dto.type }, null);
    }

    async unlock(ctx: AccessContext, evseId: string, dto: ConnectorCommandDto): Promise<CommandView> {
        const { evse, connectors } = await this.target(ctx, evseId, P.EVSE_UNLOCK);
        this.connector(connectors, dto.connectorNumber);
        return this.issue(ctx, evse, 'UnlockConnector', { connectorId: dto.connectorNumber }, dto.connectorNumber);
    }

    async availability(ctx: AccessContext, evseId: string, dto: AvailabilityDto): Promise<CommandView> {
        const { evse, connectors } = await this.target(ctx, evseId, P.EVSE_UPDATE);
        if (dto.connectorNumber > 0) this.connector(connectors, dto.connectorNumber);
        return this.issue(ctx, evse, 'ChangeAvailability',
            { connectorId: dto.connectorNumber, type: dto.available ? 'Operative' : 'Inoperative' }, dto.connectorNumber);
    }

    async getConfiguration(ctx: AccessContext, evseId: string, dto: GetConfigurationDto): Promise<CommandView> {
        const { evse } = await this.target(ctx, evseId, P.EVSE_UPDATE);
        const keys = (dto.keys ?? []).map(k => k.trim()).filter(Boolean);
        return this.issue(ctx, evse, 'GetConfiguration', keys.length ? { key: keys } : {}, null);
    }

    async changeConfiguration(ctx: AccessContext, evseId: string, dto: ChangeConfigurationDto): Promise<CommandView> {
        const { evse } = await this.target(ctx, evseId, P.EVSE_UPDATE);
        return this.issue(ctx, evse, 'ChangeConfiguration', { key: dto.key, value: dto.value }, null);
    }

    async triggerMessage(ctx: AccessContext, evseId: string, dto: TriggerMessageDto): Promise<CommandView> {
        const { evse } = await this.target(ctx, evseId, P.EVSE_UPDATE);
        if (evse.protocol === 'OCPP_1_5_S') {
            throw Errors.badRequest('NOT_SUPPORTED', 'Asking for a message (TriggerMessage) needs OCPP 1.6; this charger uses OCPP 1.5');
        }
        const payload: Payload = { requestedMessage: dto.message };
        if (dto.connectorNumber !== undefined) payload.connectorId = dto.connectorNumber;
        return this.issue(ctx, evse, 'TriggerMessage', payload, dto.connectorNumber ?? null);
    }

    // ---------- reading ----------

    async list(ctx: AccessContext, evseId: string, q: PageQueryDto): Promise<Page<CommandView>> {
        await this.findEvse(ctx, evseId);
        const [{ total }] = await this.db.query('SELECT count(*)::int AS total FROM charger_commands WHERE evse_id = $1', [evseId]);
        const rows: CommandRow[] = await this.db.query(
            `${SELECT} WHERE c.evse_id = $1 ORDER BY c.created_at DESC, c.id DESC LIMIT $2 OFFSET $3`,
            [evseId, q.pageSize, (q.page - 1) * q.pageSize],
        );
        return toPage(rows.map(r => this.view(r)), total, q);
    }

    async get(ctx: AccessContext, evseId: string, commandId: string): Promise<CommandView> {
        await this.findEvse(ctx, evseId);
        const [row]: CommandRow[] = await this.db.query(`${SELECT} WHERE c.id = $1 AND c.evse_id = $2`, [commandId, evseId]);
        if (!row) throw Errors.notFound('Command');
        return this.view(row);
    }

    /** The charger's settings as last read with GetConfiguration. */
    async configuration(ctx: AccessContext, evseId: string): Promise<ConfigurationView> {
        const evse = await this.findEvse(ctx, evseId);
        if (!ctx.canOnStation(P.EVSE_UPDATE, evse.stationId, evse.networkId)) throw Errors.forbidden();
        const [row] = await this.db.query('SELECT configuration, configuration_at FROM evse_live_states WHERE evse_id = $1', [evseId]);
        const stored = row?.configuration as { keys: ConfigurationView['keys']; unknownKeys: string[] } | null | undefined;
        return { readAt: row?.configuration_at ?? null, keys: stored?.keys ?? [], unknownKeys: stored?.unknownKeys ?? [] };
    }

    // ---------- internals ----------

    /** The charger, if the caller may send it this command (spec 5.3 step 18). Out of scope looks like not found. */
    private async target(ctx: AccessContext, evseId: string, permission: Permission) {
        const evse = await this.findEvse(ctx, evseId);
        if (!ctx.canOnStation(permission, evse.stationId, evse.networkId)) throw Errors.forbidden();
        const network = await this.db.getRepository(NetworkEntity).findOneByOrFail({ id: evse.networkId });
        if (network.status === 'archived') throw Errors.conflict('The network is archived', 'NETWORK_ARCHIVED');
        const connectors = await this.db.getRepository(ConnectorEntity).findBy({ evseId: evse.id });
        return { evse, connectors };
    }

    private async findEvse(ctx: AccessContext, evseId: string): Promise<EvseEntity> {
        const evse = await this.db.getRepository(EvseEntity).findOneBy({ id: evseId });
        if (!evse || !ctx.canOnStation(P.EVSE_READ, evse.stationId, evse.networkId)) throw Errors.notFound('Charger');
        return evse;
    }

    private connector(connectors: ConnectorEntity[], n: number): ConnectorEntity {
        const c = connectors.find(x => x.connectorNumber === n);
        if (!c) throw Errors.badRequest('VALIDATION_FAILED', `This charger has no connector ${n}`);
        return c;
    }

    private async activeSession(evseId: string, connectorNumber: number): Promise<{ id: string; ocpp_transaction_id: number | null } | undefined> {
        const [row] = await this.db.query(
            `SELECT id, ocpp_transaction_id FROM charging_sessions WHERE evse_id = $1 AND connector_number = $2 AND status = 'active'
             ORDER BY started_at DESC LIMIT 1`,
            [evseId, connectorNumber],
        );
        return row;
    }

    /** Records the command and its audit entry together, then sends it without making the caller wait (spec 9.4). */
    private async issue(ctx: AccessContext, evse: EvseEntity, action: string, payload: Payload, connectorNumber: number | null): Promise<CommandView> {
        const timeoutMs = evse.protocol === 'OCPP_1_6_J' ? this.config.ocpp.commandTimeoutMs : this.config.ocpp.soapCommandTimeoutMs;
        const correlationId = currentRequest()?.correlationId ?? null;
        const id = await this.db.transaction(async m => {
            const [row] = await m.query(
                `INSERT INTO charger_commands (network_id, station_id, evse_id, action, connector_number, payload, status, requested_by,
                                               correlation_id, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, $8, now() + make_interval(secs => $9))
                 RETURNING id`,
                [evse.networkId, evse.stationId, evse.id, action, connectorNumber, JSON.stringify(payload), ctx.userId, correlationId,
                    Math.ceil(timeoutMs / 1000) + 15],
            );
            await this.audit.record({
                actor: ctx, action: 'evse.command', resourceType: 'evse', resourceId: evse.id,
                networkId: evse.networkId, stationId: evse.stationId,
                details: { commandId: row.id, command: action, connectorNumber, payload },
            }, m);
            return row.id as string;
        });
        // answer with the command as recorded (queued) before sending starts, so the first answer is always the same
        const view = await this.getById(id);
        // the request is answered by then, so its context (and its log fields) must not follow the command
        runOutsideRequest(() => void this.execute(id, evse, action, payload));
        return view;
    }

    private async execute(id: string, evse: EvseEntity, action: string, payload: Payload): Promise<void> {
        try {
            await this.db.query(`UPDATE charger_commands SET status = 'sent', sent_at = now() WHERE id = $1 AND status = 'queued'`, [id]);
            let response: Payload;
            try {
                response = await this.commander.send(evse, action, payload);
            } catch (err) {
                const timedOut = err instanceof CommandError && err.state === 'Timeout';
                await this.db.query(
                    `UPDATE charger_commands SET status = $2, error = $3, answered_at = now() WHERE id = $1 AND status IN ('queued', 'sent')`,
                    [id, timedOut ? 'timed_out' : 'failed', String((err as Error).message).slice(0, 1000)],
                );
                return;
            }
            const responseStatus = typeof response?.status === 'string' ? response.status : null;
            const accepted = responseStatus === null || ACCEPTED.has(responseStatus);
            await this.db.query(
                `UPDATE charger_commands SET status = $2, response_status = $3, response = $4, answered_at = now(),
                     confirmed_at = CASE WHEN $5 THEN now() ELSE confirmed_at END,
                     confirmation = CASE WHEN $5 THEN 'The charger unlocked the connector' ELSE confirmation END
                 WHERE id = $1 AND status IN ('queued', 'sent')`,
                [id, accepted ? 'accepted' : 'rejected', responseStatus?.slice(0, 40) ?? null, JSON.stringify(response ?? {}),
                    action === 'UnlockConnector' && responseStatus === 'Unlocked'],
            );
            if (action === 'GetConfiguration') await this.storeConfiguration(evse.id, payload, response);
        } catch (err) {
            this.logger.error(`Command ${id} (${action}) could not be completed: ${(err as Error).message}`);
        }
    }

    /** Keeps what GetConfiguration returned; reading a few keys updates only those. */
    private async storeConfiguration(evseId: string, request: Payload, response: Payload): Promise<void> {
        const list = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
        const keys = list(response.configurationKey).map(raw => {
            const k = raw as Record<string, unknown>;
            return {
                key: String(k.key),
                value: k.value === undefined || k.value === null ? null : String(k.value),
                readonly: String(k.readonly) === 'true',
            };
        });
        const unknownKeys = list(response.unknownKey).map(String);
        let merged = keys;
        if (list(request.key).length > 0) {
            const [row] = await this.db.query('SELECT configuration FROM evse_live_states WHERE evse_id = $1', [evseId]);
            const before = (row?.configuration?.keys ?? []) as typeof keys;
            merged = [...before.filter(b => !keys.some(k => k.key === b.key)), ...keys];
        }
        merged.sort((a, b) => a.key.localeCompare(b.key));
        await this.db.query(
            'UPDATE evse_live_states SET configuration = $2, configuration_at = now() WHERE evse_id = $1',
            [evseId, JSON.stringify({ keys: merged, unknownKeys })],
        );
    }

    private async getById(id: string): Promise<CommandView> {
        const [row]: CommandRow[] = await this.db.query(`${SELECT} WHERE c.id = $1`, [id]);
        return this.view(row!);
    }

    private view(r: CommandRow): CommandView {
        let confirmation: CommandView['confirmation'] = null;
        if (r.confirmed_at) {
            confirmation = { state: 'confirmed', at: r.confirmed_at, detail: r.confirmation, sessionId: r.session_id };
        } else if (r.status === 'accepted' && CONFIRM_WITHIN_SEC[r.action]) {
            const until = r.created_at.getTime() + CONFIRM_WITHIN_SEC[r.action]! * 1000;
            confirmation = { state: Date.now() < until ? 'waiting' : 'not_confirmed', at: null, detail: null, sessionId: null };
        }
        return {
            id: r.id,
            evseId: r.evse_id,
            action: r.action,
            connectorNumber: r.connector_number,
            payload: r.payload,
            status: r.status,
            responseStatus: r.response_status,
            error: r.error,
            requestedBy: r.requested_by ? { id: r.requested_by, name: r.requested_by_name ?? '' } : null,
            createdAt: r.created_at,
            sentAt: r.sent_at,
            answeredAt: r.answered_at,
            confirmation,
        };
    }
}

const SELECT = `
    SELECT c.id, c.evse_id, c.action, c.connector_number, c.payload, c.status, c.response_status, c.error, c.requested_by,
           u.full_name AS requested_by_name, c.created_at, c.sent_at, c.answered_at, c.confirmed_at, c.confirmation, c.session_id
    FROM charger_commands c LEFT JOIN users u ON u.id = c.requested_by`;
