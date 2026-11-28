import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Cable, Info, Pencil, Plus, Power, Printer, Radio } from 'lucide-react';
import { api, ApiError, describeError } from '../../../api/client';
import type { ActiveSession, Connector, ConnectorLive, Evse, EvseLive, Network, Station } from '../../../api/types';
import { MAX_CONNECTORS } from '../../../api/types';
import { useAuth } from '../../../auth/AuthProvider';
import { ConfirmDialog } from '../../../components/dialogs';
import { Alert, Button, QrCode } from '../../../components/ui';
import { capitalize, formatDate, formatDateTime, statusBadge } from '../../format';
import { connectorLabel, evseTitle, formatKw, liveBadge, liveLabel, PROTOCOL_LABELS, protocolMismatch, timeAgo } from '../equipment';
import { formatDuration, formatEnergy, formatPower } from '../sessions/sessionFormat';
import { SessionsSection } from '../sessions/SessionsTable';
import { ChargerDialog, ConnectorDialog } from './ChargerDialogs';
import { ConfigurationSection, ConnectorCommands, RemoteControlSection, useCommands } from './RemoteControl';

const LIVE_REFRESH_MS = 15000;

type DialogState =
    | { kind: 'edit' }
    | { kind: 'status' }
    | { kind: 'addConnector' }
    | { kind: 'editConnector'; connector: Connector }
    | { kind: 'connectorStatus'; connector: Connector };

export function ChargerDetailPage() {
    const { evseId = '' } = useParams();
    const { can } = useAuth();
    const [evse, setEvse] = useState<Evse | null>(null);
    const [station, setStation] = useState<Station | null>(null);
    const [network, setNetwork] = useState<Network | null>(null);
    const [stations, setStations] = useState<Station[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const canNetworks = can('network.read');
    const canEdit = can('evse.update') && network?.status !== 'archived';
    // a command that settled may have changed the charger's status and sessions: reload both quietly
    const [refreshKey, setRefreshKey] = useState(0);
    const commands = useCommands(evseId, () => {
        api.getEvse(evseId).then(setEvse, () => undefined);
        setRefreshKey((k) => k + 1);
    });

    const load = useCallback(async () => {
        setError(null);
        try {
            const e = await api.getEvse(evseId);
            setEvse(e);
            const [s, n] = await Promise.all([
                api.getStation(e.stationId).catch(() => null),
                canNetworks ? api.getNetwork(e.networkId).catch(() => null) : Promise.resolve(null),
            ]);
            setStation(s);
            setNetwork(n);
        } catch (err) {
            if (err instanceof ApiError && err.status === 404) setNotFound(true);
            else setError(describeError(err));
        }
    }, [evseId, canNetworks]);

    useEffect(() => {
        void load();
    }, [load]);

    // live status: refresh quietly while the page is open
    useEffect(() => {
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') api.getEvse(evseId).then(setEvse, () => undefined);
        }, LIVE_REFRESH_MS);
        return () => clearInterval(timer);
    }, [evseId]);

    // other stations of the network, so the charger can be moved
    useEffect(() => {
        if (!evse || !can('evse.update')) return;
        api.listStations(evse.networkId).then((p) => setStations(p.items), () => setStations([]));
    }, [evse?.networkId]); // eslint-disable-line react-hooks/exhaustive-deps

    const saved = (e: Evse, message: string) => {
        setDialog(null);
        setNotice(message);
        if (e.stationId !== evse?.stationId) void load();
        setEvse(e);
    };

    if (notFound) {
        return (
            <div className="widget" style={{ maxWidth: 560 }}>
                <h1>Charger not found</h1>
                <p className="muted">This charger does not exist or is outside your access.</p>
                <Link to="/stations?tab=chargers">Back to Charger Terminals</Link>
            </div>
        );
    }

    const disabled = evse?.status === 'disabled';

    return (
        <>
            <Link to={station ? `/stations/${station.id}` : '/stations?tab=chargers'} className="back-link">
                <ArrowLeft size={16} aria-hidden /> {station?.name ?? 'Charger Terminals'}
            </Link>
            {error && <Alert kind="error">{error}</Alert>}
            {!evse ? (
                !error && <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
            ) : (
                <>
                    <div className="page-title">
                        <h1>{evseTitle(evse)}</h1>
                        <p>
                            Charger terminal{station ? ` · ${station.name}` : ''}
                            {network ? ` · ${network.name}` : ''} ·{' '}
                            <span className={statusBadge(evse.status)}>{capitalize(evse.status)}</span>
                        </p>
                    </div>

                    {notice && <Alert kind="success">{notice}</Alert>}
                    {disabled && <Alert kind="warning">This charger is disabled: drivers cannot charge on it. Its history is kept.</Alert>}

                    <div className="grid">
                        <section className="widget" aria-labelledby="charger-info">
                            <h2 className="widget-title" id="charger-info">
                                <Info size={20} aria-hidden /> Charger Information
                            </h2>
                            <dl className="details">
                                <dt>Charger ID</dt>
                                <dd className="code-text">{evse.protocolIdentity}</dd>
                                <dt>Protocol</dt>
                                <dd>{PROTOCOL_LABELS[evse.protocol]}</dd>
                                <dt>Make and model</dt>
                                <dd>
                                    {evse.vendor} {evse.model}
                                </dd>
                                <dt>Serial number</dt>
                                <dd>{evse.serialNumber ?? '—'}</dd>
                                <dt>Firmware</dt>
                                <dd>{evse.firmwareVersion ?? <span className="muted">Reported by the charger once it is connected</span>}</dd>
                                <dt>Total power</dt>
                                <dd>{formatKw(evse.maxPowerKw)}</dd>
                                <dt>Station</dt>
                                <dd>{station ? <Link to={`/stations/${station.id}`}>{station.name}</Link> : '—'}</dd>
                                <dt>Registered</dt>
                                <dd>{formatDate(evse.createdAt)}</dd>
                            </dl>
                            {canEdit && (
                                <div className="row" style={{ marginTop: 14 }}>
                                    <Button variant="secondary" onClick={() => setDialog({ kind: 'edit' })}>
                                        <Pencil size={16} aria-hidden /> Edit charger
                                    </Button>
                                    <Button variant={disabled ? 'secondary' : 'danger'} onClick={() => setDialog({ kind: 'status' })}>
                                        <Power size={16} aria-hidden /> {disabled ? 'Enable charger' : 'Disable charger'}
                                    </Button>
                                </div>
                            )}
                        </section>

                        <LiveStatus evse={evse} />
                    </div>

                    <section className="widget" aria-labelledby="charger-connectors">
                        <div className="widget-head">
                            <h2 className="widget-title" id="charger-connectors">
                                <Cable size={20} aria-hidden /> Connectors
                            </h2>
                            <div className="row">
                                {evse.connectors.length > 0 && (
                                    <Link className="btn btn-secondary" to={`/print/chargers/${evse.id}`}>
                                        <Printer size={18} aria-hidden /> Print QR stickers
                                    </Link>
                                )}
                                {canEdit && evse.connectors.length < MAX_CONNECTORS && (
                                    <Button onClick={() => setDialog({ kind: 'addConnector' })}>
                                        <Plus size={18} aria-hidden /> Add connector
                                    </Button>
                                )}
                            </div>
                        </div>
                        <div className="connectors">
                            {evse.connectors.map((c) => (
                                <article key={c.id} className="connector-card" aria-label={`Connector ${c.connectorNumber}`}>
                                    <QrCode value={c.qrUrl} label={`QR code for connector ${c.connectorNumber}`} className="qr qr-small" />
                                    <div className="connector-body">
                                        <h3>
                                            <span className="connector-number">{c.connectorNumber}</span> {connectorLabel(c)}
                                        </h3>
                                        <p className="muted">
                                            {c.format === 'socket' ? 'Socket: the driver brings a cable' : 'Attached cable'}
                                            {c.status === 'disabled' && (
                                                <>
                                                    {' · '}
                                                    <span className={statusBadge(c.status)}>Disabled</span>
                                                </>
                                            )}
                                        </p>
                                        <ConnectorStatus live={c.live} online={evse.live?.online ?? false} />
                                        {c.activeSession && (
                                            <ChargingNow session={c.activeSession} canOpen={can('session.read')} online={evse.live?.online ?? false} />
                                        )}
                                        {network?.status !== 'archived' && <ConnectorCommands evse={evse} connector={c} issue={commands.issue} />}
                                        <p className="small">
                                            QR code <strong className="code-text">{c.qrCode}</strong>
                                        </p>
                                        {canEdit && (
                                            <div className="row">
                                                <Button
                                                    variant="secondary"
                                                    className="btn-sm"
                                                    aria-label={`Edit connector ${c.connectorNumber}`}
                                                    onClick={() => setDialog({ kind: 'editConnector', connector: c })}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    className="btn-sm"
                                                    aria-label={`${c.status === 'active' ? 'Disable' : 'Enable'} connector ${c.connectorNumber}`}
                                                    onClick={() => setDialog({ kind: 'connectorStatus', connector: c })}
                                                >
                                                    {c.status === 'active' ? 'Disable' : 'Enable'}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                        {evse.connectors.length === 0 && <div className="empty">No connectors yet.</div>}
                    </section>

                    <RemoteControlSection evse={evse} commands={commands.commands} error={commands.error} issue={commands.issue} />

                    {can('session.read') && (
                        <SessionsSection
                            filter={{ evseId: evse.id }}
                            showCharger={false}
                            empty="No charging sessions on this charger yet."
                            refreshKey={refreshKey}
                        />
                    )}

                    {canEdit && <ConfigurationSection evse={evse} commands={commands.commands} issue={commands.issue} />}

                    {dialog?.kind === 'edit' && (
                        <ChargerDialog evse={evse} stations={stations} onClose={() => setDialog(null)} onSaved={(e) => saved(e, 'Charger updated.')} />
                    )}
                    {dialog?.kind === 'status' && (
                        <ConfirmDialog
                            title={`${disabled ? 'Enable' : 'Disable'} charger: ${evseTitle(evse)}`}
                            explain={
                                disabled
                                    ? 'Drivers can charge on it again.'
                                    : 'Drivers can no longer start charging on it, for example while it is broken or being serviced. Nothing is deleted.'
                            }
                            confirm={disabled ? 'Enable charger' : 'Disable charger'}
                            danger={!disabled}
                            onClose={() => setDialog(null)}
                            onConfirm={async () =>
                                saved(await api.updateEvse(evse.id, { status: disabled ? 'active' : 'disabled' }), disabled ? 'Charger enabled.' : 'Charger disabled.')
                            }
                        />
                    )}
                    {dialog?.kind === 'addConnector' && (
                        <ConnectorDialog evse={evse} onClose={() => setDialog(null)} onSaved={(e) => saved(e, 'Connector added.')} />
                    )}
                    {dialog?.kind === 'editConnector' && (
                        <ConnectorDialog
                            evse={evse}
                            connector={dialog.connector}
                            onClose={() => setDialog(null)}
                            onSaved={(e) => saved(e, `Connector ${dialog.connector.connectorNumber} updated.`)}
                        />
                    )}
                    {dialog?.kind === 'connectorStatus' && (
                        <ConfirmDialog
                            title={`${dialog.connector.status === 'active' ? 'Disable' : 'Enable'} connector ${dialog.connector.connectorNumber}`}
                            explain={
                                dialog.connector.status === 'active'
                                    ? 'Drivers cannot charge on this plug, for example when it is damaged. The other connector is not affected.'
                                    : 'Drivers can charge on this plug again.'
                            }
                            confirm={dialog.connector.status === 'active' ? 'Disable connector' : 'Enable connector'}
                            danger={dialog.connector.status === 'active'}
                            onClose={() => setDialog(null)}
                            onConfirm={async () => {
                                const next = dialog.connector.status === 'active' ? 'disabled' : 'active';
                                saved(
                                    await api.updateConnector(evse.id, dialog.connector.id, { status: next }),
                                    `Connector ${dialog.connector.connectorNumber} ${next === 'active' ? 'enabled' : 'disabled'}.`,
                                );
                            }}
                        />
                    )}
                </>
            )}
        </>
    );
}

/** Online state, last seen, what the charger reported at boot, and its overall status (FR EVSE 003, FR MON 003). */
function LiveStatus({ evse }: { evse: Evse }) {
    const live: EvseLive | null | undefined = evse.live;
    const mismatch = protocolMismatch(evse);
    return (
        <section className="widget" aria-labelledby="charger-live">
            <h2 className="widget-title" id="charger-live">
                <Radio size={20} aria-hidden /> Live status
            </h2>
            {!live ? (
                <p className="muted">
                    Not heard from yet. The charger appears here once it connects to PLUG EV with the Charger ID{' '}
                    <strong className="code-text">{evse.protocolIdentity}</strong>.
                </p>
            ) : (
                <>
                    <dl className="details">
                        <dt>Connection</dt>
                        <dd>
                            {live.online ? (
                                <span className="badge badge-success badge-dot">Online</span>
                            ) : (
                                <span className="badge badge-neutral badge-dot">Offline</span>
                            )}
                        </dd>
                        <dt>Last message</dt>
                        <dd title={formatDateTime(live.lastSeenAt)}>{timeAgo(live.lastSeenAt)}</dd>
                        {live.online ? (
                            <>
                                <dt>Online since</dt>
                                <dd>{formatDateTime(live.connectedAt)}</dd>
                            </>
                        ) : (
                            live.disconnectedAt && (
                                <>
                                    <dt>Offline since</dt>
                                    <dd>
                                        {formatDateTime(live.disconnectedAt)}
                                        {live.disconnectReason && <div className="muted small">{live.disconnectReason}</div>}
                                    </dd>
                                </>
                            )
                        )}
                        {live.chargerStatus && (
                            <>
                                <dt>Charger status</dt>
                                <dd>
                                    <StatusLine live={live.chargerStatus} online={live.online} />
                                </dd>
                            </>
                        )}
                        <dt>Last boot</dt>
                        <dd>{formatDateTime(live.lastBootAt)}</dd>
                        {(live.reported.vendor || live.reported.model) && (
                            <>
                                <dt>Reports itself as</dt>
                                <dd>
                                    {[live.reported.vendor, live.reported.model].filter(Boolean).join(' ')}
                                    {live.reported.serialNumber && <div className="muted small">Serial {live.reported.serialNumber}</div>}
                                </dd>
                            </>
                        )}
                    </dl>
                    {mismatch && (
                        <Alert kind="warning">
                            The charger connects with {mismatch}, but is registered as {PROTOCOL_LABELS[evse.protocol]}. Edit the charger
                            to match.
                        </Alert>
                    )}
                    {live.reported.serialNumber && evse.serialNumber && live.reported.serialNumber !== evse.serialNumber && (
                        <Alert kind="info">
                            The charger reports serial number {live.reported.serialNumber}; {evse.serialNumber} is registered.
                        </Alert>
                    )}
                    {live.unregisteredConnectors.length > 0 && (
                        <Alert kind="info">
                            The charger also reports connector {live.unregisteredConnectors.join(' and ')}, which is not registered here.
                        </Alert>
                    )}
                </>
            )}
        </section>
    );
}

/** The connector's last reported status; while the charger is offline it is only the last known one. */
function ConnectorStatus({ live, online }: { live: ConnectorLive | null | undefined; online: boolean }) {
    return (
        <p className="small">
            {live ? <StatusLine live={live} online={online} /> : <span className="muted">No status reported yet</span>}
        </p>
    );
}

function StatusLine({ live, online }: { live: ConnectorLive; online: boolean }) {
    const fault = live.errorCode && live.errorCode !== 'NoError' ? live.errorCode : null;
    return (
        <>
            {online ? (
                <span className={liveBadge(live.status)}>{liveLabel(live.status)}</span>
            ) : (
                <span className="badge badge-neutral badge-dot" title="The charger is offline">
                    Offline · last {liveLabel(live.status)}
                </span>
            )}{' '}
            <span className="muted small" title={formatDateTime(live.statusAt)}>
                {timeAgo(live.statusAt)}
            </span>
            {(fault || live.info) && (
                <span className="muted small">
                    {' · '}
                    {[fault, live.info, live.vendorErrorCode].filter(Boolean).join(' · ')}
                </span>
            )}
        </>
    );
}

/** What is charging on a connector right now (FR MON 004): since when, energy so far, power, battery. */
function ChargingNow({ session, canOpen, online }: { session: ActiveSession; canOpen: boolean; online: boolean }) {
    const since = session.startedAt ? Math.max(0, Math.round((Date.now() - Date.parse(session.startedAt)) / 1000)) : null;
    return (
        <div className="connector-charging" aria-label="Charging now">
            <strong className="small">Charging now</strong>
            {since !== null && <span className="muted small"> · for {formatDuration(since)}</span>}
            <div className="stats">
                <div className="stat">
                    <span className="stat-label">Energy</span>
                    <span className="stat-value">{formatEnergy(session.energyWh)}</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Power</span>
                    <span className="stat-value">{formatPower(session.powerW)}</span>
                </div>
                {session.socPercent !== null && (
                    <div className="stat">
                        <span className="stat-label">Battery</span>
                        <span className="stat-value">{Math.round(session.socPercent)}%</span>
                    </div>
                )}
            </div>
            <span className="muted small" title={formatDateTime(session.readingAt)}>
                {session.readingAt ? `Reading ${timeAgo(session.readingAt)}` : 'No meter reading yet'}
                {!online && ' · the charger is offline'}
            </span>
            {canOpen && (
                <>
                    {' · '}
                    <Link to={`/stations/sessions/${session.id}`} className="small">
                        Open session
                    </Link>
                </>
            )}
        </div>
    );
}
