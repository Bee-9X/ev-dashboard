import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BatteryCharging } from 'lucide-react';
import { api, describeError } from '../../../api/client';
import type { ChargingSession, Page, SessionQuery } from '../../../api/types';
import { Pagination } from '../../../components/dialogs';
import { Alert, Button } from '../../../components/ui';
import { formatDateTime } from '../../format';
import {
    formatDuration, formatEnergy, formatPower, SESSION_STATUS_HELP, SESSION_STATUS_LABELS, sessionBadge, sessionCharger,
    sessionConnector, stopReasonLabel,
} from './sessionFormat';

/** How often lists with a session in progress refresh themselves. */
export const SESSIONS_REFRESH_MS = 15000;

/** Sessions, newest first: when, where, how long, how much energy, and how it ended. */
export function SessionsTable({ sessions, showCharger = true, showStation = false, empty }: {
    sessions: ChargingSession[];
    /** Off on a charger's own page. */
    showCharger?: boolean;
    showStation?: boolean;
    empty: string;
}) {
    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Started</th>
                        {showCharger && <th>Charger</th>}
                        {!showCharger && <th>Connector</th>}
                        {showStation && <th>Station</th>}
                        <th className="num">Duration</th>
                        <th className="num">Energy</th>
                        <th>Status</th>
                        <th>Ended</th>
                        <th className="num">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions.map((s) => (
                        <tr key={s.id}>
                            <td className="nowrap">
                                {s.startedAt ? formatDateTime(s.startedAt) : <span className="muted">Not recorded</span>}
                            </td>
                            {showCharger ? (
                                <td>
                                    <Link to={`/stations/chargers/${s.evseId}`} className="cell-link">
                                        {sessionCharger(s)}
                                    </Link>
                                    <div className="muted small">{sessionConnector(s)}</div>
                                </td>
                            ) : (
                                <td className="nowrap">{sessionConnector(s)}</td>
                            )}
                            {showStation && <td>{s.stationName}</td>}
                            <td className="num nowrap">{formatDuration(s.durationSec)}</td>
                            <td className="num nowrap">
                                {s.status === 'active' ? (
                                    <>
                                        {formatEnergy(s.live?.energyWh)}
                                        {s.live?.powerW !== null && s.live?.powerW !== undefined && (
                                            <div className="muted small">{formatPower(s.live.powerW)} now</div>
                                        )}
                                    </>
                                ) : (
                                    formatEnergy(s.energyWh)
                                )}
                            </td>
                            <td className="nowrap">
                                <span className={sessionBadge(s.status)} title={SESSION_STATUS_HELP[s.status]}>
                                    {SESSION_STATUS_LABELS[s.status]}
                                </span>
                            </td>
                            <td>
                                {s.stoppedAt ? (
                                    <>
                                        <span className="nowrap">{formatDateTime(s.stoppedAt)}</span>
                                        <div className="muted small">{stopReasonLabel(s.stopReason)}</div>
                                    </>
                                ) : (
                                    <span className="muted">—</span>
                                )}
                            </td>
                            <td className="num">
                                <Link className="btn btn-secondary btn-sm" to={`/stations/sessions/${s.id}`} aria-label={`View session ${s.ocppTransactionId ?? ''}`.trim()}>
                                    View
                                </Link>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {sessions.length === 0 && <div className="empty">{empty}</div>}
        </div>
    );
}

/** The latest sessions of one charger, station or network, as a widget on its page. */
export function SessionsSection({ filter, showCharger = true, showStation = false, empty, allLink, refreshKey = 0 }: {
    filter: Pick<SessionQuery, 'networkId' | 'stationId' | 'evseId'>;
    /** Changing it reloads the list quietly (e.g. after a remote start or stop). */
    refreshKey?: number;
    showCharger?: boolean;
    showStation?: boolean;
    empty: string;
    /** Link to the full list on the Charging Sessions tab. */
    allLink?: string;
}) {
    const [page, setPage] = useState(1);
    const [data, setData] = useState<Page<ChargingSession> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const { networkId, stationId, evseId } = filter;

    const load = useCallback(
        async (quiet = false) => {
            if (!quiet) setLoading(true);
            setError(null);
            try {
                setData(await api.sessionsPage({ networkId, stationId, evseId, page, pageSize: 10 }));
            } catch (err) {
                if (!quiet) setError(describeError(err));
            } finally {
                if (!quiet) setLoading(false);
            }
        },
        [networkId, stationId, evseId, page],
    );

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (refreshKey) void load(true);
    }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // keep sessions in progress current while the page is open
    const charging = data?.items.some((s) => s.status === 'active') ?? false;
    useEffect(() => {
        if (!charging) return;
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') void load(true);
        }, SESSIONS_REFRESH_MS);
        return () => clearInterval(timer);
    }, [charging, load]);

    return (
        <section className="widget" aria-labelledby="sessions-title">
            <div className="widget-head">
                <h2 className="widget-title" id="sessions-title" style={{ marginBottom: 0 }}>
                    <BatteryCharging size={20} aria-hidden /> Charging Sessions
                </h2>
                {allLink && data && data.total > 0 && (
                    <Link className="btn btn-secondary btn-sm" to={allLink}>
                        All sessions
                    </Link>
                )}
            </div>
            {error && (
                <Alert kind="error">
                    {error}{' '}
                    <Button variant="link" onClick={() => void load()}>
                        Try again
                    </Button>
                </Alert>
            )}
            {data ? (
                <SessionsTable sessions={data.items} showCharger={showCharger} showStation={showStation} empty={empty} />
            ) : (
                loading && (
                    <div className="empty">
                        <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
                    </div>
                )
            )}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />}
        </section>
    );
}
