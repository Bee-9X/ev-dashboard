import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, EvCharger, Info, Pencil, Plus, ShieldAlert } from 'lucide-react';
import { api, ApiError, describeError } from '../../api/client';
import type { Network, NetworkStatus, Station } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmDialog } from '../../components/dialogs';
import { Alert, Button } from '../../components/ui';
import { capitalize, formatDate, statusBadge } from '../format';
import { NetworkDialog, StationDialog } from './dialogs';
import { SessionsSection } from './sessions/SessionsTable';
import { TableLoading } from './StationsPage';

const STATUS_ACTIONS: Record<NetworkStatus, { status: NetworkStatus; label: string; danger?: boolean }[]> = {
    active: [
        { status: 'suspended', label: 'Suspend network' },
        { status: 'archived', label: 'Archive network', danger: true },
    ],
    suspended: [
        { status: 'active', label: 'Reactivate network' },
        { status: 'archived', label: 'Archive network', danger: true },
    ],
    archived: [],
};

const STATUS_EXPLAIN: Record<NetworkStatus, string> = {
    suspended: 'Its Network Admins and Station Admins lose access at once, and no stations can be added. You can reactivate it later.',
    archived: 'The network is closed for good: its admins lose access, and it can no longer be changed or reactivated.',
    active: 'Its admins get their access back.',
};

export function NetworkDetailPage() {
    const { networkId = '' } = useParams();
    const { can } = useAuth();
    const [network, setNetwork] = useState<Network | null>(null);
    const [stations, setStations] = useState<Station[] | null>(null);
    const [stationTotal, setStationTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [dialog, setDialog] = useState<'edit' | 'station' | NetworkStatus | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const [n, s] = await Promise.all([api.getNetwork(networkId), api.stationsPage({ networkId, pageSize: 100 })]);
            setNetwork(n);
            setStations(s.items);
            setStationTotal(s.total);
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) setNotFound(true);
            else setError(describeError(err));
        }
    }, [networkId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (notFound) {
        return (
            <div className="widget" style={{ maxWidth: 560 }}>
                <h1>Network not found</h1>
                <p className="muted">This network does not exist or is outside your access.</p>
                <Link to="/stations">Back to Charging Networks</Link>
            </div>
        );
    }

    const archived = network?.status === 'archived';
    const canEdit = can('network.update') && !archived;
    const canStatus = can('network.suspend') && !archived;
    const canAddStation = can('station.create') && network?.status === 'active';

    return (
        <>
            <Link to="/stations" className="back-link">
                <ArrowLeft size={16} aria-hidden /> Charging Networks
            </Link>
            {error && <Alert kind="error">{error}</Alert>}
            {!network ? (
                !error && <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
            ) : (
                <>
                    <div className="page-title">
                        <h1>{network.name}</h1>
                        <p>
                            Charging network · <span className={statusBadge(network.status)}>{capitalize(network.status)}</span>
                        </p>
                    </div>

                    {notice && <Alert kind="success">{notice}</Alert>}
                    {network.status === 'suspended' && (
                        <Alert kind="warning">This network is suspended. Its admins cannot use the portal and no stations can be added.</Alert>
                    )}
                    {archived && <Alert kind="info">This network is archived and can no longer be changed.</Alert>}

                    <div className="grid">
                        <section className="widget" aria-labelledby="network-profile">
                            <h2 className="widget-title" id="network-profile">
                                <Info size={20} aria-hidden /> Profile Information
                            </h2>
                            <dl className="details">
                                <dt>Name</dt>
                                <dd>{network.name}</dd>
                                <dt>Currency</dt>
                                <dd>{network.defaultCurrency}</dd>
                                <dt>Time zone</dt>
                                <dd>{network.timeZone.replace(/_/g, ' ')}</dd>
                                <dt>Stations</dt>
                                <dd>{stationTotal}</dd>
                                <dt>Created</dt>
                                <dd>{formatDate(network.createdAt)}</dd>
                            </dl>
                            <p className="muted small note">Contact, address and bank details come with the Accounts screens.</p>
                            {canEdit && (
                                <Button variant="secondary" onClick={() => setDialog('edit')}>
                                    <Pencil size={16} aria-hidden /> Update network
                                </Button>
                            )}
                        </section>

                        {canStatus && (
                            <section className="widget danger-zone" aria-labelledby="network-status">
                                <h2 className="widget-title" id="network-status">
                                    <ShieldAlert size={20} aria-hidden /> Network status
                                </h2>
                                <p className="muted">Changes take effect at once and are kept in the audit log.</p>
                                <div className="row">
                                    {STATUS_ACTIONS[network.status].map((a) => (
                                        <Button key={a.status} variant={a.danger ? 'danger' : 'secondary'} onClick={() => setDialog(a.status)}>
                                            {a.label}
                                        </Button>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>

                    <section className="widget" aria-labelledby="network-stations">
                        <div className="widget-head">
                            <h2 className="widget-title" id="network-stations">
                                <EvCharger size={20} aria-hidden /> Chargers Stations
                            </h2>
                            {canAddStation && (
                                <Button onClick={() => setDialog('station')}>
                                    <Plus size={18} aria-hidden /> Add new station
                                </Button>
                            )}
                        </div>
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Chargers Station</th>
                                        <th>Status</th>
                                        <th>Created</th>
                                        <th className="num">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stations?.map((s) => (
                                        <tr key={s.id}>
                                            <td>
                                                <Link to={`/stations/${s.id}`} className="cell-link">
                                                    {s.name}
                                                </Link>
                                            </td>
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
                            {!stations && <TableLoading />}
                            {stations?.length === 0 && <div className="empty">No stations in this network yet.</div>}
                        </div>
                        {stationTotal > (stations?.length ?? 0) && (
                            <p className="muted small">
                                Showing the first {stations?.length}.{' '}
                                <Link to={`/stations?tab=stations&network=${network.id}`}>See all {stationTotal} stations</Link>
                            </p>
                        )}
                    </section>

                    {can('session.read') && (
                        <SessionsSection
                            filter={{ networkId: network.id }}
                            showStation
                            empty="No charging sessions in this network yet."
                            allLink={`/stations?tab=sessions&network=${network.id}`}
                        />
                    )}

                    {dialog === 'edit' && (
                        <NetworkDialog
                            network={network}
                            onClose={() => setDialog(null)}
                            onSaved={(n) => {
                                setNetwork(n);
                                setDialog(null);
                                setNotice('Network updated.');
                            }}
                        />
                    )}
                    {dialog === 'station' && (
                        <StationDialog
                            networkId={network.id}
                            onClose={() => setDialog(null)}
                            onSaved={(s) => {
                                setDialog(null);
                                setNotice(`${s.name} was added.`);
                                void load();
                            }}
                        />
                    )}
                    {(dialog === 'active' || dialog === 'suspended' || dialog === 'archived') && (
                        <ConfirmDialog
                            title={`${STATUS_ACTIONS[network.status].find((a) => a.status === dialog)?.label ?? 'Change status'}: ${network.name}`}
                            explain={STATUS_EXPLAIN[dialog]}
                            confirm={STATUS_ACTIONS[network.status].find((a) => a.status === dialog)?.label ?? 'Confirm'}
                            danger={dialog !== 'active'}
                            onClose={() => setDialog(null)}
                            onConfirm={async () => {
                                setNetwork(await api.updateNetwork(network.id, { status: dialog }));
                                setDialog(null);
                                setNotice(`Network ${dialog === 'active' ? 'reactivated' : dialog}.`);
                            }}
                        />
                    )}
                </>
            )}
        </>
    );
}
