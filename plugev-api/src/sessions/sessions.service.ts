import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AccessContext } from '../access/access-context';
import { P } from '../access/permissions';
import { Errors } from '../common/errors';
import { Page, toPage } from '../common/pagination';
import { latestReadings, SessionLiveView } from './session-live';
import { SessionListQueryDto, SessionStatus } from './sessions.dto';

/** A charging session (spec 8.1, FR SES 001-003, 007), with the names an admin needs to read it. */
export interface SessionView {
    id: string;
    networkId: string;
    networkName: string;
    stationId: string;
    stationName: string;
    evseId: string;
    /** The charger's name, if it has one, and the Charger ID it connects with. */
    evseName: string | null;
    protocolIdentity: string;
    connectorNumber: number;
    /** Null when the connector is not registered (or 0: a stop the platform could not match). */
    connectorType: string | null;
    /** The transaction id the charger uses (OCPP transactionId). */
    ocppTransactionId: number | null;
    /** The authorization token (RFID card or app) that started it. */
    idTag: string | null;
    stopIdTag: string | null;
    startedAt: Date | null;
    stoppedAt: Date | null;
    /** Until now while charging. */
    durationSec: number | null;
    meterStartWh: number | null;
    meterStopWh: number | null;
    /** Final energy, from the charger's meter start and stop. */
    energyWh: number | null;
    status: SessionStatus;
    /** As the charger gave it (OCPP StopTransaction reason), e.g. EVDisconnected, Local, Remote, PowerLoss. */
    stopReason: string | null;
    /** What the platform noticed, e.g. a missed stop. */
    notes: string[];
    createdAt: Date;
    /** Latest readings while charging (null once the session has ended). */
    live: SessionLiveView | null;
}

export interface MeterReadingView {
    measuredAt: Date;
    measurand: string;
    phase: string | null;
    unit: string | null;
    value: string;
    numericValue: number | null;
    context: string | null;
    location: string | null;
    source: 'MeterValues' | 'StopTransaction';
}

export type SessionDetailView = SessionView & {
    readings: MeterReadingView[];
    /** More readings exist than are returned. */
    readingsTruncated: boolean;
};

/** Enough for a session of many hours at a 10 s interval with a few measurands. */
const MAX_READINGS = 5000;

interface SessionRow {
    id: string; network_id: string; network_name: string; station_id: string; station_name: string; evse_id: string;
    evse_name: string | null; protocol_identity: string; connector_number: number; connector_type: string | null;
    ocpp_transaction_id: number | null; id_tag: string | null; stop_id_tag: string | null; started_at: Date | null;
    stopped_at: Date | null; meter_start_wh: string | null; meter_stop_wh: string | null; energy_wh: string | null;
    status: SessionStatus; stop_reason: string | null; notes: string[]; created_at: Date;
}

const SELECT = `
    SELECT s.id, s.network_id, n.name AS network_name, s.station_id, st.name AS station_name, s.evse_id,
           e.name AS evse_name, e.protocol_identity, s.connector_number, c.connector_type, s.ocpp_transaction_id,
           s.id_tag, s.stop_id_tag, s.started_at, s.stopped_at, s.meter_start_wh, s.meter_stop_wh, s.energy_wh,
           s.status, s.stop_reason, s.notes, s.created_at
    FROM charging_sessions s
    JOIN networks n ON n.id = s.network_id
    JOIN stations st ON st.id = s.station_id
    JOIN evses e ON e.id = s.evse_id
    LEFT JOIN connectors c ON c.evse_id = s.evse_id AND c.connector_number = s.connector_number`;

/** Newest first; a session without a start (an unmatched stop) sorts by its stop. */
const SORT_TIME = 'COALESCE(s.started_at, s.stopped_at, s.created_at)';

const num = (v: string | null): number | null => (v === null ? null : Number(v));

/** Charging sessions for administrators (spec 9.2 GET /sessions), within the caller's scope (spec 3.1). */
@Injectable()
export class SessionsService {
    constructor(private readonly db: DataSource) {}

    async list(ctx: AccessContext, q: SessionListQueryDto): Promise<Page<SessionView>> {
        const where: string[] = [];
        const params: unknown[] = [];
        const add = (sql: string, value: unknown) => {
            params.push(value);
            where.push(sql.replace('?', `$${params.length}`));
        };

        const scope = ctx.scopeFor(P.SESSION_READ);
        if (!scope.all) {
            if (!scope.networkIds.length && !scope.stationIds.length) return toPage([], 0, q);
            params.push(scope.networkIds, scope.stationIds);
            where.push(`(s.network_id = ANY($${params.length - 1}::uuid[]) OR s.station_id = ANY($${params.length}::uuid[]))`);
        }
        if (q.networkId) add('s.network_id = ?', q.networkId);
        if (q.stationId) add('s.station_id = ?', q.stationId);
        if (q.evseId) add('s.evse_id = ?', q.evseId);
        if (q.status) add('s.status = ?', q.status);
        if (q.from) add(`${SORT_TIME} >= ?`, new Date(q.from));
        if (q.to) add(`${SORT_TIME} < ?`, new Date(q.to));
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [{ total }] = await this.db.query(`SELECT count(*)::int AS total FROM charging_sessions s ${whereSql}`, params);
        const rows: SessionRow[] = await this.db.query(
            `${SELECT} ${whereSql} ORDER BY ${SORT_TIME} DESC, s.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, q.pageSize, (q.page - 1) * q.pageSize],
        );
        return toPage(await this.views(rows), total, q);
    }

    async get(ctx: AccessContext, id: string): Promise<SessionDetailView> {
        const [row]: SessionRow[] = await this.db.query(`${SELECT} WHERE s.id = $1`, [id]);
        // out-of-scope sessions look like they do not exist (spec 11.4)
        if (!row || !ctx.canOnStation(P.SESSION_READ, row.station_id, row.network_id)) throw Errors.notFound('Session');
        const [view] = await this.views([row]);

        const readings: {
            measured_at: Date; measurand: string; phase: string | null; unit: string | null; value: string;
            numeric_value: number | null; context: string | null; location: string | null; source: 'MeterValues' | 'StopTransaction';
        }[] = await this.db.query(
            `SELECT measured_at, measurand, phase, unit, value, numeric_value, context, location, source
             FROM meter_values WHERE session_id = $1 ORDER BY measured_at, id LIMIT $2`,
            [id, MAX_READINGS + 1],
        );
        return {
            ...view!,
            readings: readings.slice(0, MAX_READINGS).map(r => ({
                measuredAt: r.measured_at, measurand: r.measurand, phase: r.phase, unit: r.unit, value: r.value,
                numericValue: r.numeric_value, context: r.context, location: r.location, source: r.source,
            })),
            readingsTruncated: readings.length > MAX_READINGS,
        };
    }

    private async views(rows: SessionRow[]): Promise<SessionView[]> {
        const active = rows.filter(r => r.status === 'active');
        const live = await latestReadings(this.db, active.map(r => ({ id: r.id, meterStartWh: num(r.meter_start_wh) })));
        const now = Date.now();
        return rows.map(r => {
            const end = r.stopped_at?.getTime() ?? (r.status === 'active' ? now : null);
            return {
                id: r.id,
                networkId: r.network_id,
                networkName: r.network_name,
                stationId: r.station_id,
                stationName: r.station_name,
                evseId: r.evse_id,
                evseName: r.evse_name,
                protocolIdentity: r.protocol_identity,
                connectorNumber: r.connector_number,
                connectorType: r.connector_type,
                ocppTransactionId: r.ocpp_transaction_id,
                idTag: r.id_tag,
                stopIdTag: r.stop_id_tag,
                startedAt: r.started_at,
                stoppedAt: r.stopped_at,
                durationSec: r.started_at && end !== null ? Math.max(0, Math.round((end - r.started_at.getTime()) / 1000)) : null,
                meterStartWh: num(r.meter_start_wh),
                meterStopWh: num(r.meter_stop_wh),
                energyWh: num(r.energy_wh),
                status: r.status,
                stopReason: r.stop_reason,
                notes: r.notes ?? [],
                createdAt: r.created_at,
                live: live.get(r.id) ?? null,
            };
        });
    }
}
