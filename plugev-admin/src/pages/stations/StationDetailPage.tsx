import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Cable, Eye, EyeOff, Info, MapPin, Pencil, Plus, Power, ShieldAlert } from 'lucide-react';
import { api, ApiError, describeError } from '../../api/client';
import type { Evse, Network, Station } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { ConfirmDialog } from '../../components/dialogs';
import { Alert, Button } from '../../components/ui';
import { capitalize, formatDate, statusBadge } from '../format';
import { ChargerDialog } from './chargers/ChargerDialogs';
import { ChargersTable } from './chargers/ChargersTable';
import { StationDialog } from './dialogs';
import { AMENITY_LABELS, hoursSummary, isNetworkLevel, mapsLink } from './equipment';
import { StationDetailsDialog } from './StationDetailsDialog';
import { TableLoading } from './StationsPage';

type DialogKind = 'rename' | 'details' | 'status' | 'visibility' | 'charger';

export function StationDetailPage() {
    const { stationId = '' } = useParams();
    const { me, can } = useAuth();
    const [station, setStation] = useState<Station | null>(null);
    const [network, setNetwork] = useState<Network | null>(null);
    const [chargers, setChargers] = useState<Evse[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [dialog, setDialog] = useState<DialogKind | null>(null);
    const canNetworks = can('network.read');
    const canChargers = can('evse.read');

    const loadChargers = useCallback(async () => {
        if (!canChargers) return;
        try {
            setChargers((await api.evsesPage({ stationId, pageSize: 100 })).items);
        } catch {
            setChargers([]);
        }
    }, [stationId, canChargers]);

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
        void loadChargers();
    }, [load, loadChargers]);

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
    const archived = network?.status === 'archived';
    const canEdit = can('station.update') && !archived;
    // Station Admins lose access to an inactive station, and going public is the network's call (the API agrees)
    const networkLevel = canEdit && !!station && isNetworkLevel(me, station.networkId);
    const canAddCharger = can('evse.create') && network?.status === 'active';
    const deactivating = station?.status === 'active';
    const hours = hoursSummary(station?.operatingHours);
    const map = station ? mapsLink(station) : null;

    const saved = (s: Station, message: string) => {
        setStation(s);
        setDialog(null);
        setNotice(message);
    };

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
                            <span className={statusBadge(station.status)}>{capitalize(station.status)}</span>{' '}
                            {station.publicVisible ? (
                                <span className="badge badge-info">Shown in app</span>
                            ) : (
                                <span className="badge badge-neutral">Hidden from app</span>
                            )}
                        </p>
                    </div>

                    {notice && <Alert kind="success">{notice}</Alert>}

                    <div className="grid">
                        <section className="widget" aria-labelledby="station-info">
                            <h2 className="widget-title" id="station-info">
                                <Info size={20} aria-hidden /> Station Information
                            </h2>
                            <dl className="details">
                                {network && (
                                    <>
                                        <dt>Network</dt>
                                        <dd>
                                            <Link to={`/stations/networks/${network.id}`}>{network.name}</Link>
                                        </dd>
                                    </>
                                )}
                                <dt>Address</dt>
                                <dd>{station.address ?? <span className="muted">Not entered</span>}</dd>
                                <dt>Location</dt>
                                <dd>
                                    {map ? (
                                        <a href={map} target="_blank" rel="noreferrer">
                                            <MapPin size={14} aria-hidden /> {station.latitude}, {station.longitude}
                                        </a>
                                    ) : (
                                        <span className="muted">Not entered</span>
                                    )}
                                </dd>
                                <dt>Phone</dt>
                                <dd>{station.phone ?? '—'}</dd>
                                <dt>Opening hours</dt>
                                <dd>
                                    {hours.length ? hours.map((h) => <div key={h}>{h}</div>) : <span className="muted">Not entered</span>}
                                </dd>
                                <dt>Time zone</dt>
                                <dd>
                                    {(station.timeZone ?? network?.timeZone ?? '').replace(/_/g, ' ') || '—'}
                                    {!station.timeZone && network && <span className="muted"> (network)</span>}
                                </dd>
                                <dt>Amenities</dt>
                                <dd>
                                    {station.amenities?.length ? station.amenities.map((a) => AMENITY_LABELS[a] ?? a).join(', ') : '—'}
                                </dd>
                                <dt>Created</dt>
                                <dd>{formatDate(station.createdAt)}</dd>
                            </dl>
                            {canEdit && (
                                <div className="row" style={{ marginTop: 14 }}>
                                    <Button variant="secondary" onClick={() => setDialog('details')}>
                                        <Pencil size={16} aria-hidden /> Edit details
                                    </Button>
                                    <Button variant="secondary" onClick={() => setDialog('rename')}>
                                        Rename
                                    </Button>
                                </div>
                            )}
                        </section>

                        {networkLevel && (
                            <section className="widget danger-zone" aria-labelledby="station-status">
                                <h2 className="widget-title" id="station-status">
                                    <ShieldAlert size={20} aria-hidden /> Status and visibility
                                </h2>
                                <p className="muted">
                                    <strong>In the app:</strong>{' '}
                                    {station.publicVisible ? 'drivers can find this station.' : 'drivers cannot see this station yet.'}
                                    {!station.publicVisible && map === null && ' Add its location first.'}
                                </p>
                                <p className="muted">
                                    <strong>Status:</strong>{' '}
                                    {deactivating ? 'in service.' : 'out of service; its Station Admins have no access.'}
                                </p>
                                <div className="row">
                                    <Button
                                        variant="secondary"
                                        disabled={!station.publicVisible && map === null}
                                        onClick={() => setDialog('visibility')}
                                    >
                                        {station.publicVisible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}{' '}
                                        {station.publicVisible ? 'Hide from app' : 'Show in app'}
                                    </Button>
                                    <Button variant={deactivating ? 'danger' : 'secondary'} onClick={() => setDialog('status')}>
                                        <Power size={16} aria-hidden /> {deactivating ? 'Mark inactive' : 'Mark active'}
                                    </Button>
                                </div>
                            </section>
                        )}
                    </div>

                    {canChargers && (
                        <section className="widget" aria-labelledby="station-terminals">
                            <div className="widget-head">
                                <h2 className="widget-title" id="station-terminals">
                                    <Cable size={20} aria-hidden /> Charger Terminals
                                </h2>
                                {canAddCharger && (
                                    <Button onClick={() => setDialog('charger')}>
                                        <Plus size={18} aria-hidden /> Add new terminal
                                    </Button>
                                )}
                            </div>
                            {chargers ? (
                                <ChargersTable chargers={chargers} empty="No chargers at this station yet." />
                            ) : (
                                <TableLoading />
                            )}
                        </section>
                    )}

                    {dialog === 'details' && (
                        <StationDetailsDialog
                            station={station}
                            networkTimeZone={network?.timeZone}
                            onClose={() => setDialog(null)}
                            onSaved={(s) => saved(s, 'Station details saved.')}
                        />
                    )}
                    {dialog === 'rename' && (
                        <StationDialog station={station} onClose={() => setDialog(null)} onSaved={(s) => saved(s, 'Station renamed.')} />
                    )}
                    {dialog === 'charger' && (
                        <ChargerDialog
                            stationId={station.id}
                            onClose={() => setDialog(null)}
                            onSaved={(e) => {
                                setDialog(null);
                                setNotice(`Charger ${e.name ?? e.protocolIdentity} added with ${e.connectors.length} connector${e.connectors.length === 1 ? '' : 's'}.`);
                                void loadChargers();
                            }}
                        />
                    )}
                    {dialog === 'visibility' && (
                        <ConfirmDialog
                            title={`${station.publicVisible ? 'Hide from app' : 'Show in app'}: ${station.name}`}
                            explain={
                                station.publicVisible
                                    ? 'Drivers can no longer find this station in the app. Nothing else changes.'
                                    : 'Drivers can find this station, its location, opening hours and chargers in the app.'
                            }
                            confirm={station.publicVisible ? 'Hide from app' : 'Show in app'}
                            danger={station.publicVisible}
                            onClose={() => setDialog(null)}
                            onConfirm={async () => {
                                const s = await api.updateStation(station.id, { publicVisible: !station.publicVisible });
                                saved(s, s.publicVisible ? 'The station is now shown in the app.' : 'The station is hidden from the app.');
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
                                saved(s, `Station marked ${s.status}.`);
                            }}
                        />
                    )}
                </>
            )}
        </>
    );
}
