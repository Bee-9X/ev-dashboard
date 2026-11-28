import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../config/config';
import { LiveEvent, LiveStateEvents } from './live-events';
import type { OcppVersion, Payload } from './ocpp/xml';
import type { Protocol } from './ocpp/common';

/** A registered charger as the charging module needs it. */
export interface Charger {
    id: string;
    networkId: string;
    stationId: string;
    /** As registered; chargers may send it in another case. */
    protocolIdentity: string;
    status: 'active' | 'disabled';
    /** Registered connectors: number -> status. */
    connectors: Record<number, 'active' | 'disabled'>;
}

/** Finds registered chargers by the identity they connect with (FR EVSE 004). */
@Injectable()
export class ChargerDirectory {
    constructor(private readonly db: DataSource) {}

    async find(identity: string): Promise<Charger | null> {
        const rows: {
            id: string; network_id: string; station_id: string; protocol_identity: string; status: 'active' | 'disabled';
            connectors: { n: number; s: 'active' | 'disabled' }[] | null;
        }[] = await this.db.query(
            `SELECT e.id, e.network_id, e.station_id, e.protocol_identity, e.status,
                    (SELECT json_agg(json_build_object('n', c.connector_number, 's', c.status)) FROM connectors c WHERE c.evse_id = e.id) AS connectors
             FROM evses e WHERE lower(e.protocol_identity) = lower($1)`,
            [identity],
        );
        const r = rows[0];
        if (!r) return null;
        return {
            id: r.id,
            networkId: r.network_id,
            stationId: r.station_id,
            protocolIdentity: r.protocol_identity,
            status: r.status,
            connectors: Object.fromEntries((r.connectors ?? []).map(c => [c.n, c.s])),
        };
    }
}

/**
 * A charger talking to this process right now. SOAP is connectionless (one HTTP request per message),
 * so a SOAP "session" is only the last known address and version; OCPP-J has an open WebSocket.
 */
export interface ChargerSession {
    identity: string;
    protocol: Protocol;
    version: OcppVersion;
    lastSeen: Date;
    /** SOAP: where the charger takes commands (wsa:From). */
    endpoint?: string;
    isConnected(): boolean;
    sendCommand(action: string, payload: Payload, timeoutMs: number): Promise<Payload>;
}

/** Live sessions, keyed by lower-case identity. */
@Injectable()
export class ConnectionRegistry {
    private readonly sessions = new Map<string, ChargerSession>();

    get(identity: string): ChargerSession | undefined {
        return this.sessions.get(identity.toLowerCase());
    }

    set(session: ChargerSession): ChargerSession {
        this.sessions.set(session.identity.toLowerCase(), session);
        return session;
    }

    /** Removes the session only if it is still the current one (a newer connection may have replaced it). */
    remove(identity: string, session: ChargerSession): void {
        if (this.sessions.get(identity.toLowerCase()) === session) this.sessions.delete(identity.toLowerCase());
    }

    /** An OCPP-J charger with an open WebSocket is online, however quiet it is. */
    hasOpenConnection(identity: string): boolean {
        const s = this.get(identity);
        return !!s && s.protocol === 'ocpp1.6-json' && s.isConnected();
    }

    all(): ChargerSession[] {
        return [...this.sessions.values()];
    }
}

// "seen" is written at most this often per charger; every other event is written at once
const SEEN_EVERY_MS = 15000;

/** Writes what chargers do to the live state tables, as order-safe events (see LiveStateEvents). */
@Injectable()
export class LiveState {
    private readonly logger = new Logger('Charging');
    private readonly lastSeenWritten = new Map<string, number>();

    constructor(private readonly events: LiveStateEvents, private readonly db: DataSource) {}

    async seen(charger: Charger, protocol: Protocol, extra: { ip?: string; endpoint?: string } = {}): Promise<void> {
        const now = Date.now();
        if (now - (this.lastSeenWritten.get(charger.id) ?? 0) >= SEEN_EVERY_MS) {
            this.lastSeenWritten.set(charger.id, now);
            await this.apply(charger, { type: 'seen', protocol });
        }
        if (extra.ip || extra.endpoint) {
            await this.db.query(
                `UPDATE evse_live_states SET ip = COALESCE($2, ip), endpoint = COALESCE($3, endpoint)
                 WHERE evse_id = $1 AND (ip IS DISTINCT FROM COALESCE($2, ip) OR endpoint IS DISTINCT FROM COALESCE($3, endpoint))`,
                [charger.id, extra.ip ?? null, extra.endpoint ?? null],
            );
        }
    }

    async connected(charger: Charger, protocol: Protocol): Promise<void> {
        this.lastSeenWritten.set(charger.id, Date.now());
        await this.apply(charger, { type: 'connected', protocol });
    }

    async disconnected(charger: Pick<Charger, 'id' | 'protocolIdentity'>, reason: string): Promise<void> {
        // the next message must be written at once, so the charger shows online again without delay
        this.lastSeenWritten.delete(charger.id);
        await this.apply(charger, { type: 'disconnected', reason });
    }

    async event(charger: Charger, e: Omit<LiveEvent, 'identity' | 'at'>): Promise<void> {
        await this.apply(charger, e);
    }

    private async apply(charger: Pick<Charger, 'protocolIdentity'>, e: Omit<LiveEvent, 'identity' | 'at'>): Promise<void> {
        try {
            await this.events.apply([{ ...e, identity: charger.protocolIdentity, at: new Date().toISOString() }]);
        } catch (err) {
            // live state must never break charger traffic
            this.logger.error(`Could not record ${e.type} for ${charger.protocolIdentity}: ${(err as Error).message}`);
        }
    }
}

const MAX_RAW = 20000;

export interface OcppLogEntry {
    identity: string;
    evseId?: string | null;
    protocol?: string;
    direction: 'in' | 'out';
    kind: 'CALL' | 'CALLRESULT' | 'CALLERROR';
    action?: string;
    messageId?: string;
    payload?: unknown;
    error?: unknown;
    raw?: string;
}

/** Every OCPP message in both directions, kept for OCPP_MESSAGE_RETENTION_DAYS (spec 8.2, 8.4). */
@Injectable()
export class OcppMessageLog {
    private readonly logger = new Logger('OCPP');

    constructor(private readonly db: DataSource, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

    /** Never throws and is not awaited by callers: logging must not slow down or break charger traffic. */
    record(e: OcppLogEntry): void {
        this.logger.log(
            `[${e.identity}] ${e.direction === 'in' ? '<-' : '->'} ${e.kind} ${e.action ?? ''}` +
            (e.error ? ` ERROR ${JSON.stringify(e.error)}` : ''),
        );
        const raw = e.raw && e.raw.length > MAX_RAW ? `${e.raw.slice(0, MAX_RAW)}…[truncated]` : e.raw;
        this.db.query(
            `INSERT INTO ocpp_messages (identity, evse_id, protocol, direction, kind, action, message_id, payload, error, raw)
             VALUES ($1, COALESCE($2, (SELECT id FROM evses WHERE lower(protocol_identity) = lower($1))), $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                e.identity.slice(0, 100), e.evseId ?? null, e.protocol ?? null, e.direction, e.kind, e.action?.slice(0, 100) ?? null,
                e.messageId?.slice(0, 200) ?? null,
                e.payload === undefined ? null : JSON.stringify(e.payload),
                e.error === undefined ? null : JSON.stringify(e.error),
                raw ?? null,
            ],
        ).catch((err: Error) => this.logger.warn(`Could not store OCPP message for ${e.identity}: ${err.message}`));
    }

    async purgeOld(): Promise<number> {
        const res: [unknown, number] = await this.db.query(
            `DELETE FROM ocpp_messages WHERE created_at < now() - make_interval(days => $1)`,
            [this.config.ocpp.messageRetentionDays],
        );
        return res[1] ?? 0;
    }
}
