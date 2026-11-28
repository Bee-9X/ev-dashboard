import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BatteryCharging, Cable, EvCharger, Network as NetworkIcon, Plus } from 'lucide-react';
import { api, describeError } from '../../api/client';
import type { ChargingSession, Evse, Network, Page, SessionStatus, Station } from '../../api/types';
import { SESSION_STATUSES } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { Pagination } from '../../components/dialogs';
import { Alert, Button, SelectField } from '../../components/ui';
import { capitalize, formatDate, statusBadge } from '../format';
import { useScopes } from '../users/scopes';
import { ChargerDialog } from './chargers/ChargerDialogs';
import { ChargersTable } from './chargers/ChargersTable';
import { NetworkDialog, StationDialog } from './dialogs';
import { SESSION_STATUS_LABELS } from './sessions/sessionFormat';
import { SESSIONS_REFRESH_MS, SessionsTable } from './sessions/SessionsTable';

const PAGE_SIZE = 20;

type Tab = 'networks' | 'stations' | 'chargers' | 'sessions';

/** Same page as the Phase 0 portal: "Charging Station Details" with a tab per level. */
export function StationsPage() {
    const { can } = useAuth();
    const [params, setParams] = useSearchParams();
    const canNetworks = can('network.read');
    const canChargers = can('evse.read');
    const canSessions = can('session.read');
    const asked = params.get('tab');
    // Station Admins have no network view; they start on their stations
    const tab: Tab =
        asked === 'chargers' && canChargers
            ? 'chargers'
            : asked === 'sessions' && canSessions
              ? 'sessions'
              : asked === 'stations' || !canNetworks
                ? 'stations'
                : 'networks';

    const select = (next: Tab) => setParams(next === 'networks' ? {} : { tab: next }, { replace: true });

    return (
        <>
            <div className="page-title">
                <h1>Charging Station Details</h1>
                <p>{canNetworks ? 'Charging networks and their stations' : 'The stations you look after'}</p>
            </div>

            <div className="tabs" role="tablist">
                {canNetworks && (
                    <button type="button" role="tab" className="tab" aria-selected={tab === 'networks'} onClick={() => select('networks')}>
                        Charging Networks
                    </button>
                )}
                <button type="button" role="tab" className="tab" aria-selected={tab === 'stations'} onClick={() => select('stations')}>
                    Chargers Stations
                </button>
                {canChargers && (
                    <button type="button" role="tab" className="tab" aria-selected={tab === 'chargers'} onClick={() => select('chargers')}>
                        Charger Terminals
                    </button>
                )}
                {canSessions && (
                    <button type="button" role="tab" className="tab" aria-selected={tab === 'sessions'} onClick={() => select('sessions')}>
                        Charging Sessions
                    </button>
                )}
            </div>

            {tab === 'networks' ? (
                <NetworksTab />
            ) : tab === 'stations' ? (
                <StationsTab />
            ) : tab === 'chargers' ? (
                <ChargersTab />
            ) : (
                <SessionsTab />
            )}
        </>
    );
}

function usePaged<T>(fetch: (page: number) => Promise<Page<T>>, page: number) {
    const [data, setData] = useState<Page<T> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await fetch(page));
        } catch (err) {
            setError(describeError(err));
        } finally {
            setLoading(false);
        }
    }, [fetch, page]);
    useEffect(() => {
        void load();
    }, [load]);
    return { data, error, loading, load };
}

function usePageParam(): [number, (page: number) => void] {
    const [params, setParams] = useSearchParams();
    const page = Math.max(1, Number(params.get('page')) || 1);
    const set = (p: number) => {
        const next = new URLSearchParams(params);
        if (p > 1) next.set('page', String(p));
        else next.delete('page');
        setParams(next, { replace: true });
    };
    return [page, set];
}

function LoadError({ error, retry }: { error: string; retry: () => void }) {
    return (
        <Alert kind="error">
            {error}{' '}
            <Button variant="link" onClick={retry}>
                Try again
            </Button>
        </Alert>
    );
}

function NetworksTab() {
    const { can } = useAuth();
    const [page, setPage] = usePageParam();
    const fetch = useCallback((p: number) => api.networksPage({ page: p, pageSize: PAGE_SIZE }), []);
    const { data, error, loading, load } = usePaged(fetch, page);
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState<Network | null>(null);

    return (
        <section className="widget" aria-labelledby="networks-title">
            <div className="widget-head">
                <h2 className="widget-title" id="networks-title">
                    <NetworkIcon size={20} aria-hidden /> Charging Network Information
                </h2>
                {can('network.create') && (
                    <Button onClick={() => setAdding(true)}>
                        <Plus size={18} aria-hidden /> Add network
                    </Button>
                )}
            </div>
            {added && (
                <Alert kind="success">
                    <strong>{added.name}</strong> was added. <Link to={`/stations/networks/${added.id}`}>Open it</Link> to add stations.
                </Alert>
            )}
            {error && <LoadError error={error} retry={() => void load()} />}

            <div className="table-wrap">
                <table className="table" aria-busy={loading}>
                    <thead>
                        <tr>
                            <th>Network</th>
                            <th className="num">Stations</th>
                            <th>Currency</th>
                            <th>Time zone</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th className="num">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.items.map((n) => (
                            <tr key={n.id}>
                                <td>
                                    <Link to={`/stations/networks/${n.id}`} className="cell-link">
                                        {n.name}
                                    </Link>
                                </td>
                                <td className="num">{n.stationCount ?? '—'}</td>
                                <td>{n.defaultCurrency}</td>
                                <td className="nowrap">{n.timeZone.replace(/_/g, ' ')}</td>
                                <td>
                                    <span className={statusBadge(n.status)}>{capitalize(n.status)}</span>
                                </td>
                                <td className="nowrap">{formatDate(n.createdAt)}</td>
                                <td className="num">
                                    <Link className="btn btn-secondary btn-sm" to={`/stations/networks/${n.id}`} aria-label={`View ${n.name}`}>
                                        View
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {loading && !data && <TableLoading />}
                {data && data.items.length === 0 && <div className="empty">No charging networks yet.</div>}
            </div>
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />}

            {adding && (
                <NetworkDialog
                    onClose={() => setAdding(false)}
                    onSaved={(n) => {
                        setAdding(false);
                        setAdded(n);
                        void load();
                    }}
                />
            )}
        </section>
    );
}

function StationsTab() {
    const { can } = useAuth();
    const scopes = useScopes();
    const [params, setParams] = useSearchParams();
    const [page, setPage] = usePageParam();
    const networkId = params.get('network') ?? '';
    const fetch = useCallback(
        (p: number) => api.stationsPage({ page: p, pageSize: PAGE_SIZE, networkId: networkId || undefined }),
        [networkId],
    );
    const { data, error, loading, load } = usePaged(fetch, page);
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState<Station | null>(null);
    const showNetwork = can('network.read');

    const filter = (id: string) => {
        const next = new URLSearchParams(params);
        if (id) next.set('network', id);
        else next.delete('network');
        next.delete('page');
        setParams(next, { replace: true });
    };

    return (
        <section className="widget" aria-labelledby="stations-title">
            <h2 className="widget-title" id="stations-title">
                <EvCharger size={20} aria-hidden /> Chargers Stations Information
            </h2>

            <div className="toolbar">
                {showNetwork && scopes.networks.length > 1 ? (
                    <div className="narrow">
                        <SelectField
                            label="Network"
                            value={networkId}
                            onChange={filter}
                            placeholder="All networks"
                            options={scopes.networks.map((n) => ({ value: n.id, label: n.name }))}
                        />
                    </div>
                ) : (
                    <div className="grow" />
                )}
                {can('station.create') && (
                    <Button onClick={() => setAdding(true)} disabled={!scopes.loaded}>
                        <Plus size={18} aria-hidden /> Add station
                    </Button>
                )}
            </div>
            {added && (
                <Alert kind="success">
                    <strong>{added.name}</strong> was added.
                </Alert>
            )}
            {error && <LoadError error={error} retry={() => void load()} />}

            <div className="table-wrap">
                <table className="table" aria-busy={loading}>
                    <thead>
                        <tr>
                            <th>Station</th>
                            {showNetwork && <th>Network</th>}
                            <th>Status</th>
                            <th>Created</th>
                            <th className="num">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.items.map((s) => (
                            <tr key={s.id}>
                                <td>
                                    <Link to={`/stations/${s.id}`} className="cell-link">
                                        {s.name}
                                    </Link>
                                </td>
                                {showNetwork && <td>{scopes.networkName(s.networkId) ?? <span className="muted">—</span>}</td>}
                                <td>
                                    <span className={statusBadge(s.status)}>{capitalize(s.status)}</span>
                                </td>
                                <td className="nowrap">{formatDate(s.createdAt)}</td>
                                <td className="num">
                                    <Link className="btn btn-secondary btn-sm" to={`/stations/${s.id}`} aria-label={`View ${s.name}`}>
                                        View
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {loading && !data && <TableLoading />}
                {data && data.items.length === 0 && (
                    <div className="empty">{networkId ? 'This network has no stations yet.' : 'No charging stations yet.'}</div>
                )}
            </div>
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />}

            {adding && (
                <StationDialog
                    networks={scopes.networks}
                    networkId={networkId || undefined}
                    onClose={() => setAdding(false)}
                    onSaved={(s) => {
                        setAdding(false);
                        setAdded(s);
                        void load();
                    }}
                />
            )}
        </section>
    );
}

function ChargersTab() {
    const { can } = useAuth();
    const scopes = useScopes();
    const [params, setParams] = useSearchParams();
    const [page, setPage] = usePageParam();
    const networkId = params.get('network') ?? '';
    const fetch = useCallback(
        (p: number) => api.evsesPage({ page: p, pageSize: PAGE_SIZE, networkId: networkId || undefined }),
        [networkId],
    );
    const { data, error, loading, load } = usePaged<Evse>(fetch, page);
    const [adding, setAdding] = useState(false);
    const [added, setAdded] = useState<Evse | null>(null);
    // chargers can be added to stations of active networks
    const activeNetworks = new Set(scopes.networks.filter((n) => n.status === 'active').map((n) => n.id));
    const addable = scopes.stations.filter((s) => activeNetworks.has(s.networkId));

    const filter = (id: string) => {
        const next = new URLSearchParams(params);
        if (id) next.set('network', id);
        else next.delete('network');
        next.delete('page');
        setParams(next, { replace: true });
    };

    return (
        <section className="widget" aria-labelledby="chargers-title">
            <h2 className="widget-title" id="chargers-title">
                <Cable size={20} aria-hidden /> Charger Terminals Information
            </h2>

            <div className="toolbar">
                {can('network.read') && scopes.networks.length > 1 ? (
                    <div className="narrow">
                        <SelectField
                            label="Network"
                            value={networkId}
                            onChange={filter}
                            placeholder="All networks"
                            options={scopes.networks.map((n) => ({ value: n.id, label: n.name }))}
                        />
                    </div>
                ) : (
                    <div className="grow" />
                )}
                {can('evse.create') && (
                    <Button onClick={() => setAdding(true)} disabled={!scopes.loaded || addable.length === 0}>
                        <Plus size={18} aria-hidden /> Add charger
                    </Button>
                )}
            </div>
            {added && (
                <Alert kind="success">
                    <strong>{added.name ?? added.protocolIdentity}</strong> was added.{' '}
                    <Link to={`/stations/chargers/${added.id}`}>Open it</Link> to print its QR stickers.
                </Alert>
            )}
            {error && <LoadError error={error} retry={() => void load()} />}

            {data ? (
                <ChargersTable
                    chargers={data.items}
                    stationName={scopes.stationName}
                    empty={networkId ? 'This network has no chargers yet.' : 'No chargers registered yet.'}
                />
            ) : (
                loading && <TableLoading />
            )}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />}

            {adding && (
                <ChargerDialog
                    stations={networkId ? addable.filter((s) => s.networkId === networkId) : addable}
                    onClose={() => setAdding(false)}
                    onSaved={(e) => {
                        setAdding(false);
                        setAdded(e);
                        void load();
                    }}
                />
            )}
        </section>
    );
}

/** Every session in the user's scope, newest first, filtered by network, station and status. */
function SessionsTab() {
    const { can } = useAuth();
    const scopes = useScopes();
    const [params, setParams] = useSearchParams();
    const [page, setPage] = usePageParam();
    const networkId = params.get('network') ?? '';
    const stationId = params.get('station') ?? '';
    const asked = params.get('status');
    const status = SESSION_STATUSES.includes(asked as SessionStatus) ? (asked as SessionStatus) : undefined;
    const fetch = useCallback(
        (p: number) =>
            api.sessionsPage({ page: p, pageSize: PAGE_SIZE, networkId: networkId || undefined, stationId: stationId || undefined, status }),
        [networkId, stationId, status],
    );
    const { data, error, loading, load } = usePaged<ChargingSession>(fetch, page);
    const stations = networkId ? scopes.stations.filter((s) => s.networkId === networkId) : scopes.stations;

    // sessions in progress: keep their energy and duration current
    const charging = data?.items.some((s) => s.status === 'active') ?? false;
    useEffect(() => {
        if (!charging) return;
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') void load();
        }, SESSIONS_REFRESH_MS);
        return () => clearInterval(timer);
    }, [charging, load]);

    const filter = (changes: Record<string, string>) => {
        const next = new URLSearchParams(params);
        for (const [k, v] of Object.entries(changes)) {
            if (v) next.set(k, v);
            else next.delete(k);
        }
        next.delete('page');
        setParams(next, { replace: true });
    };

    return (
        <section className="widget" aria-labelledby="sessions-tab-title">
            <h2 className="widget-title" id="sessions-tab-title">
                <BatteryCharging size={20} aria-hidden /> Charging Sessions
            </h2>

            <div className="toolbar">
                {can('network.read') && scopes.networks.length > 1 && (
                    <div className="narrow">
                        <SelectField
                            label="Network"
                            value={networkId}
                            // a station of another network would hide everything
                            onChange={(v) => filter({ network: v, station: '' })}
                            placeholder="All networks"
                            options={scopes.networks.map((n) => ({ value: n.id, label: n.name }))}
                        />
                    </div>
                )}
                {stations.length > 1 && (
                    <div className="narrow">
                        <SelectField
                            label="Station"
                            value={stationId}
                            onChange={(v) => filter({ station: v })}
                            placeholder="All stations"
                            options={stations.map((s) => ({ value: s.id, label: s.name }))}
                        />
                    </div>
                )}
                <div className="narrow">
                    <SelectField
                        label="Status"
                        value={status ?? ''}
                        onChange={(v) => filter({ status: v })}
                        placeholder="Any status"
                        options={SESSION_STATUSES.map((s) => ({ value: s, label: SESSION_STATUS_LABELS[s] }))}
                    />
                </div>
            </div>
            {error && <LoadError error={error} retry={() => void load()} />}

            {data ? (
                <SessionsTable
                    sessions={data.items}
                    showStation
                    empty={networkId || stationId || status ? 'No sessions match these filters.' : 'No charging sessions yet.'}
                />
            ) : (
                loading && <TableLoading />
            )}
            {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} loading={loading} onPage={setPage} />}
        </section>
    );
}

export function TableLoading() {
    return (
        <div className="empty">
            <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
        </div>
    );
}
