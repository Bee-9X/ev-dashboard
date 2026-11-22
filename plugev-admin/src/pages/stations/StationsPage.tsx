import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EvCharger, Network as NetworkIcon, Plus } from 'lucide-react';
import { api, describeError } from '../../api/client';
import type { Network, Page, Station } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { Pagination } from '../../components/dialogs';
import { Alert, Button, SelectField } from '../../components/ui';
import { capitalize, formatDate, statusBadge } from '../format';
import { useScopes } from '../users/scopes';
import { NetworkDialog, StationDialog } from './dialogs';

const PAGE_SIZE = 20;

/** Same page as the Phase 0 portal: "Charging Station Details" with a tab per level. */
export function StationsPage() {
    const { can } = useAuth();
    const [params, setParams] = useSearchParams();
    const canNetworks = can('network.read');
    // Station Admins have no network view; they start on their stations
    const tab = canNetworks && params.get('tab') !== 'stations' ? 'networks' : 'stations';

    const select = (next: 'networks' | 'stations') => setParams(next === 'networks' ? {} : { tab: next }, { replace: true });

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
                <button type="button" role="tab" className="tab" aria-selected={false} disabled>
                    Charger Terminals <span className="soon">Soon</span>
                </button>
            </div>

            {tab === 'networks' ? <NetworksTab /> : <StationsTab />}
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

export function TableLoading() {
    return (
        <div className="empty">
            <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
        </div>
    );
}
