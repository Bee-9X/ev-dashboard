import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Gauge, Info, ListOrdered } from 'lucide-react';
import { api, ApiError, describeError } from '../../../api/client';
import type { ChargingSessionDetail, MeterReading } from '../../../api/types';
import { useAuth } from '../../../auth/AuthProvider';
import { Alert } from '../../../components/ui';
import { formatDateTime } from '../../format';
import { timeAgo } from '../equipment';
import {
    formatDuration, formatEnergy, formatPower, measurandLabel, SESSION_STATUS_HELP, SESSION_STATUS_LABELS, sessionBadge,
    sessionCharger, sessionConnector, stopReasonLabel, unitLabel,
} from './sessionFormat';
import { SESSIONS_REFRESH_MS } from './SessionsTable';

export function SessionDetailPage() {
    const { sessionId = '' } = useParams();
    const { can } = useAuth();
    const [session, setSession] = useState<ChargingSessionDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        try {
            setSession(await api.getSession(sessionId));
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) setNotFound(true);
            else setError(describeError(err));
        }
    }, [sessionId]);

    useEffect(() => {
        void load();
    }, [load]);

    // while charging, keep the numbers current
    const charging = session?.status === 'active';
    useEffect(() => {
        if (!charging) return;
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') api.getSession(sessionId).then(setSession, () => undefined);
        }, SESSIONS_REFRESH_MS);
        return () => clearInterval(timer);
    }, [charging, sessionId]);

    if (notFound) {
        return (
            <div className="widget" style={{ maxWidth: 560 }}>
                <h1>Session not found</h1>
                <p className="muted">This session does not exist or is outside your access.</p>
                <Link to="/stations?tab=sessions">Back to Charging Sessions</Link>
            </div>
        );
    }

    return (
        <>
            <Link to={session && can('evse.read') ? `/stations/chargers/${session.evseId}` : '/stations?tab=sessions'} className="back-link">
                <ArrowLeft size={16} aria-hidden /> {session && can('evse.read') ? sessionCharger(session) : 'Charging Sessions'}
            </Link>
            {error && <Alert kind="error">{error}</Alert>}
            {!session ? (
                !error && <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
            ) : (
                <>
                    <div className="page-title">
                        <h1>Charging session{session.ocppTransactionId !== null ? ` ${session.ocppTransactionId}` : ''}</h1>
                        <p>
                            {sessionCharger(session)} · {sessionConnector(session)} · {session.stationName} ·{' '}
                            <span className={sessionBadge(session.status)}>{SESSION_STATUS_LABELS[session.status]}</span>
                        </p>
                    </div>

                    {session.status !== 'active' && session.status !== 'completed' && (
                        <Alert kind="warning">{SESSION_STATUS_HELP[session.status]}</Alert>
                    )}

                    <div className="grid">
                        <section className="widget" aria-labelledby="session-info">
                            <h2 className="widget-title" id="session-info">
                                <Info size={20} aria-hidden /> Session Information
                            </h2>
                            <dl className="details">
                                <dt>Status</dt>
                                <dd>
                                    <span className={sessionBadge(session.status)}>{SESSION_STATUS_LABELS[session.status]}</span>
                                    <div className="muted small">{SESSION_STATUS_HELP[session.status]}</div>
                                </dd>
                                <dt>Charger</dt>
                                <dd>
                                    {can('evse.read') ? (
                                        <Link to={`/stations/chargers/${session.evseId}`}>{sessionCharger(session)}</Link>
                                    ) : (
                                        sessionCharger(session)
                                    )}
                                    {session.evseName && <div className="muted small code-text">{session.protocolIdentity}</div>}
                                </dd>
                                <dt>Connector</dt>
                                <dd>{sessionConnector(session)}</dd>
                                <dt>Station</dt>
                                <dd>
                                    <Link to={`/stations/${session.stationId}`}>{session.stationName}</Link>
                                </dd>
                                <dt>Network</dt>
                                <dd>
                                    {can('network.read') ? (
                                        <Link to={`/stations/networks/${session.networkId}`}>{session.networkName}</Link>
                                    ) : (
                                        session.networkName
                                    )}
                                </dd>
                                <dt>Started</dt>
                                <dd>{session.startedAt ? formatDateTime(session.startedAt) : <span className="muted">Not recorded</span>}</dd>
                                <dt>Ended</dt>
                                <dd>{session.stoppedAt ? formatDateTime(session.stoppedAt) : <span className="muted">Not yet</span>}</dd>
                                <dt>Duration</dt>
                                <dd>
                                    {formatDuration(session.durationSec)}
                                    {charging && <span className="muted small"> so far</span>}
                                </dd>
                                <dt>How it ended</dt>
                                <dd>
                                    {stopReasonLabel(session.stopReason)}
                                    {session.stopReason && stopReasonLabel(session.stopReason) !== session.stopReason && (
                                        <div className="muted small">{session.stopReason}</div>
                                    )}
                                </dd>
                                <dt>Started with</dt>
                                <dd className="code-text">{session.idTag ?? '—'}</dd>
                                {session.stopIdTag && session.stopIdTag !== session.idTag && (
                                    <>
                                        <dt>Stopped with</dt>
                                        <dd className="code-text">{session.stopIdTag}</dd>
                                    </>
                                )}
                                <dt>Transaction ID</dt>
                                <dd className="code-text">{session.ocppTransactionId ?? '—'}</dd>
                            </dl>
                            {session.notes.length > 0 && (
                                <div className="note">
                                    {session.notes.map((n) => (
                                        <p key={n} className="muted small">
                                            {n}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </section>

                        <EnergyWidget session={session} />
                    </div>

                    <Readings session={session} />
                </>
            )}
        </>
    );
}

function EnergyWidget({ session }: { session: ChargingSessionDetail }) {
    const live = session.live;
    return (
        <section className="widget" aria-labelledby="session-energy">
            <h2 className="widget-title" id="session-energy">
                <Gauge size={20} aria-hidden /> Energy
            </h2>
            <div className="stats">
                <div className="stat">
                    <span className="stat-label">{session.status === 'active' ? 'Delivered so far' : 'Energy delivered'}</span>
                    <span className="stat-value">{formatEnergy(session.status === 'active' ? live?.energyWh : session.energyWh)}</span>
                </div>
                {session.status === 'active' && (
                    <div className="stat">
                        <span className="stat-label">Power now</span>
                        <span className="stat-value">{formatPower(live?.powerW)}</span>
                    </div>
                )}
                {live?.socPercent !== null && live?.socPercent !== undefined && (
                    <div className="stat">
                        <span className="stat-label">Battery</span>
                        <span className="stat-value">{Math.round(live.socPercent)}%</span>
                    </div>
                )}
            </div>
            <dl className="details">
                <dt>Meter at start</dt>
                <dd>{formatEnergy(session.meterStartWh)}</dd>
                <dt>Meter at stop</dt>
                <dd>{formatEnergy(session.meterStopWh)}</dd>
                {session.status === 'active' && (
                    <>
                        <dt>Latest reading</dt>
                        <dd title={formatDateTime(live?.readingAt)}>
                            {live?.readingAt ? timeAgo(live.readingAt) : <span className="muted">None yet</span>}
                        </dd>
                    </>
                )}
            </dl>
            {session.status === 'active' && !live?.readingAt && (
                <p className="muted small note">
                    The energy so far appears once the charger sends meter readings. Not every charger sends them while charging.
                </p>
            )}
        </section>
    );
}

/** Readings grouped by time, one column per measurand (FR MON 004: value, unit and time). */
function Readings({ session }: { session: ChargingSessionDetail }) {
    const { columns, rows } = useMemo(() => pivot(session.readings), [session.readings]);
    return (
        <section className="widget" aria-labelledby="session-readings">
            <h2 className="widget-title" id="session-readings">
                <ListOrdered size={20} aria-hidden /> Meter Readings
            </h2>
            {session.readingsTruncated && (
                <Alert kind="info">Only the first {session.readings.length} readings are shown.</Alert>
            )}
            <div className="table-wrap">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            {columns.map((c) => (
                                <th key={c.key} className="num">
                                    {measurandLabel(c.measurand, c.phase)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.key}>
                                <td className="nowrap">
                                    {formatTime(r.measuredAt)}
                                    {r.atStop && <span className="muted small"> · at stop</span>}
                                </td>
                                {columns.map((c) => {
                                    const v = r.values[c.key];
                                    return (
                                        <td key={c.key} className="num nowrap">
                                            {v ? `${v.value} ${unitLabel(v.unit)}`.trim() : <span className="muted">—</span>}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {rows.length === 0 && <div className="empty">The charger sent no meter readings for this session.</div>}
            </div>
        </section>
    );
}

function formatTime(iso: string): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(iso));
}

interface PivotRow {
    key: string;
    measuredAt: string;
    atStop: boolean;
    values: Record<string, MeterReading>;
}

function pivot(readings: MeterReading[]) {
    const columns = new Map<string, { key: string; measurand: string; phase: string | null }>();
    const rows = new Map<string, PivotRow>();
    for (const r of readings) {
        const key = `${r.measurand}|${r.phase ?? ''}|${r.location ?? ''}`;
        if (!columns.has(key)) columns.set(key, { key, measurand: r.measurand, phase: r.phase });
        const rowKey = `${r.measuredAt}|${r.source}`;
        let row = rows.get(rowKey);
        if (!row) {
            row = { key: rowKey, measuredAt: r.measuredAt, atStop: r.source === 'StopTransaction', values: {} };
            rows.set(rowKey, row);
        }
        row.values[key] = r;
    }
    return { columns: [...columns.values()], rows: [...rows.values()] };
}
