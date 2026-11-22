import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Cable, ExternalLink, Info, Pencil, Power } from 'lucide-react';
import { api, ApiError, describeError } from '../../api/client';
import type { Network, Station } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmDialog } from '../../components/dialogs';
import { Alert, Button } from '../../components/ui';
import { capitalize, formatDate, statusBadge } from '../format';
import { StationDialog } from './dialogs';

const CONSOLE_URL = import.meta.env.VITE_CONSOLE_URL as string | undefined;

export function StationDetailPage() {
    const { stationId = '' } = useParams();
    const { me, can } = useAuth();
    const [station, setStation] = useState<Station | null>(null);
    const [network, setNetwork] = useState<Network | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [dialog, setDialog] = useState<'rename' | 'status' | null>(null);
    const canNetworks = can('network.read');

    const load = useCallback(async () => {
        setError(null);
        try {
            const s = await api.getStation(stationId);
            setStation(s);
            if (canNetworks) setNetwork(await api.getNetwork(s.networkId).catch(() => null));
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) setNotFound(true);
            else setError(describeError(err));
        }
    }, [stationId, canNetworks]);

    useEffect(() => {
        void load();
    }, [load]);

    if (notFound) {
        return (
            <div className="widget" style={{ maxWidth: 560 }}>
                <h1>Station not found</h1>
                <p className="muted">This station does not exist or is outside your access.</p>
                <Link to="/stations?tab=stations">Back to Chargers Stations</Link>
            </div>
        );
    }

    const back = network ? { to: `/stations/networks/${network.id}`, label: network.name } : { to: '/stations?tab=stations', label: 'Chargers Stations' };
    const canEdit = can('station.update') && network?.status !== 'archived';
    // Station Admins lose access to an inactive station, so only network-level admins change its status (the API agrees)
    const canStatus =
        canEdit &&
        !!station &&
        (me?.roles.some((r) => r.role === 'SUPER_ADMIN' || (r.role === 'NETWORK_ADMIN' && r.networkId === station.networkId)) ?? false);
    const deactivating = station?.status === 'active';

    return (
        <>
            <Link to={back.to} className="back-link">
                <ArrowLeft size={16} aria-hidden /> {back.label}
            </Link>
            {error && <Alert kind="error">{error}</Alert>}
            {!station ? (
                !error && <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
            ) : (
                <>
                    <div className="page-title">
                        <h1>{station.name}</h1>
                        <p>
                            Chargers station{network ? ` · ${network.name}` : ''} ·{' '}
                            <span className={statusBadge(station.status)}>{capitalize(station.status)}</span>
                        </p>
                    </div>

                    {notice && <Alert kind="success">{notice}</Alert>}

                    <div className="grid">
                        <section className="widget" aria-labelledby="station-info">
                            <h2 className="widget-title" id="station-info">
                                <Info size={20} aria-hidden /> Station Information
                            </h2>
                            <dl className="details">
                                <dt>Name</dt>
                                <dd>{station.name}</dd>
                                {network && (
                                    <>
                                        <dt>Network</dt>
                                        <dd>
                                            <Link to={`/stations/networks/${network.id}`}>{network.name}</Link>
                                        </dd>
                                    </>
                                )}
                                <dt>Status</dt>
                                <dd>
                                    <span className={statusBadge(station.status)}>{capitalize(station.status)}</span>
                                </dd>
                                <dt>Created</dt>
                                <dd>{formatDate(station.createdAt)}</dd>
                            </dl>
                            <p className="muted small note">Address, phone and opening hours come with the full station screens.</p>
                            {canEdit && (
                                <div className="row">
                                    <Button variant="secondary" onClick={() => setDialog('rename')}>
                                        <Pencil size={16} aria-hidden /> Rename
                                    </Button>
                                    {canStatus && (
                                        <Button variant={deactivating ? 'danger' : 'secondary'} onClick={() => setDialog('status')}>
                                            <Power size={16} aria-hidden /> {deactivating ? 'Mark inactive' : 'Mark active'}
                                        </Button>
                                    )}
                                </div>
                            )}
                        </section>

                        <section className="widget" aria-labelledby="station-terminals">
                            <h2 className="widget-title" id="station-terminals">
                                <Cable size={20} aria-hidden /> Charger Terminals
                            </h2>
                            <p className="muted">
                                Terminals (chargers), their connectors, live status and charging sessions are added to stations in the
                                next phase.
                            </p>
                            {CONSOLE_URL && (
                                <a className="btn btn-secondary" href={CONSOLE_URL} target="_blank" rel="noreferrer">
                                    Open the charger console <ExternalLink size={16} aria-hidden />
                                </a>
                            )}
                        </section>
                    </div>

                    {dialog === 'rename' && (
                        <StationDialog
                            station={station}
                            onClose={() => setDialog(null)}
                            onSaved={(s) => {
                                setStation(s);
                                setDialog(null);
                                setNotice('Station renamed.');
                            }}
                        />
                    )}
                    {dialog === 'status' && (
                        <ConfirmDialog
                            title={`${deactivating ? 'Mark inactive' : 'Mark active'}: ${station.name}`}
                            explain={
                                deactivating
                                    ? 'Use this while the station is closed or out of service. Its Station Admins lose access until it is active again.'
                                    : 'The station is back in service and its Station Admins get their access back.'
                            }
                            confirm={deactivating ? 'Mark inactive' : 'Mark active'}
                            danger={deactivating}
                            onClose={() => setDialog(null)}
                            onConfirm={async () => {
                                const s = await api.updateStation(station.id, { status: deactivating ? 'inactive' : 'active' });
                                setStation(s);
                                setDialog(null);
                                setNotice(`Station marked ${s.status}.`);
                            }}
                        />
                    )}
                </>
            )}
        </>
    );
}
