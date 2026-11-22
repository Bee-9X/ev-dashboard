import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Cable, ExternalLink, Info, Pencil, Plus, Power, Printer, Radio } from 'lucide-react';
import { api, ApiError, describeError } from '../../../api/client';
import type { Connector, Evse, Network, Station } from '../../../api/types';
import { MAX_CONNECTORS } from '../../../api/types';
import { useAuth } from '../../../auth/AuthProvider';
import { ConfirmDialog } from '../../../components/dialogs';
import { Alert, Button, QrCode } from '../../../components/ui';
import { capitalize, formatDate, statusBadge } from '../../format';
import { connectorLabel, evseTitle, formatKw, PROTOCOL_LABELS } from '../equipment';
import { ChargerDialog, ConnectorDialog } from './ChargerDialogs';

const CONSOLE_URL = import.meta.env.VITE_CONSOLE_URL as string | undefined;

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

                        <section className="widget" aria-labelledby="charger-live">
                            <h2 className="widget-title" id="charger-live">
                                <Radio size={20} aria-hidden /> Live status
                            </h2>
                            <p className="muted">
                                Online or offline, last seen, connector availability and faults appear here once the PLUG EV gateway is
                                connected to this platform (next phase).
                            </p>
                            {CONSOLE_URL && (
                                <a className="btn btn-secondary" href={CONSOLE_URL} target="_blank" rel="noreferrer">
                                    Open the charger console <ExternalLink size={16} aria-hidden />
                                </a>
                            )}
                        </section>
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
                                            {c.format === 'socket' ? 'Socket: the driver brings a cable' : 'Attached cable'} ·{' '}
                                            <span className={statusBadge(c.status)}>{capitalize(c.status)}</span>
                                        </p>
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
