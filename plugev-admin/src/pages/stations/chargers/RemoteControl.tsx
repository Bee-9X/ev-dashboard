import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Gamepad2, RefreshCw, Settings2 } from 'lucide-react';
import { api, describeError } from '../../../api/client';
import type { ChargerCommand, ChargerConfiguration, Connector, Evse } from '../../../api/types';
import { useAuth } from '../../../auth/AuthProvider';
import { ConfirmDialog, useSubmit } from '../../../components/dialogs';
import { Alert, Button, Modal, TextField } from '../../../components/ui';
import { formatDateTime } from '../../format';
import { evseTitle, timeAgo } from '../equipment';

/** How often the command list refreshes while a command waits for the charger. */
export const COMMAND_POLL_MS = 2000;

// ---------- words ----------

/** What a command did, in the admin's words. */
export function commandLabel(c: Pick<ChargerCommand, 'action' | 'connectorNumber' | 'payload'>): string {
    const on = c.connectorNumber ? ` (connector ${c.connectorNumber})` : '';
    switch (c.action) {
        case 'RemoteStartTransaction':
            return `Start charging${on}`;
        case 'RemoteStopTransaction':
            return `Stop charging${on}`;
        case 'Reset':
            return c.payload.type === 'Hard' ? 'Hard reset' : 'Soft reset';
        case 'UnlockConnector':
            return `Unlock connector${on}`;
        case 'ChangeAvailability': {
            const what = c.connectorNumber ? `connector ${c.connectorNumber}` : 'charger';
            return `Make ${what} ${c.payload.type === 'Inoperative' ? 'unavailable' : 'available'}`;
        }
        case 'GetConfiguration':
            return 'Read configuration';
        case 'ChangeConfiguration':
            return `Change ${String(c.payload.key)} to ${String(c.payload.value)}`;
        case 'TriggerMessage':
            return `Ask for ${String(c.payload.requestedMessage)}`;
        default:
            return c.action;
    }
}

const STATUS: Record<ChargerCommand['status'], { label: string; badge: string }> = {
    queued: { label: 'Sending', badge: 'badge badge-info badge-dot' },
    sent: { label: 'Waiting for the charger', badge: 'badge badge-info badge-dot' },
    accepted: { label: 'Accepted', badge: 'badge badge-success badge-dot' },
    rejected: { label: 'Rejected', badge: 'badge badge-warning badge-dot' },
    failed: { label: 'Failed', badge: 'badge badge-danger badge-dot' },
    timed_out: { label: 'No answer', badge: 'badge badge-danger badge-dot' },
};

/** Still waiting for the charger: its answer, or the confirmation of an accepted command. */
export function isPending(c: ChargerCommand): boolean {
    return c.status === 'queued' || c.status === 'sent' || c.confirmation?.state === 'waiting';
}

// ---------- state shared by the charger page ----------

/**
 * The charger's recent commands, refreshed while one is pending. `onSettled` runs when a command stops being
 * pending, so the page can reload the charger's status and sessions.
 */
export function useCommands(evseId: string, onSettled: () => void) {
    const [commands, setCommands] = useState<ChargerCommand[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const pendingIds = useRef<Set<string>>(new Set());
    const settled = useRef(onSettled);
    settled.current = onSettled;

    const load = useCallback(async () => {
        try {
            const page = await api.commandsPage(evseId, { pageSize: 10 });
            const now = new Set(page.items.filter(isPending).map((c) => c.id));
            const finished = [...pendingIds.current].some((id) => !now.has(id));
            pendingIds.current = now;
            setCommands(page.items);
            setError(null);
            if (finished) settled.current();
        } catch (err) {
            setError(describeError(err));
        }
    }, [evseId]);

    useEffect(() => {
        void load();
    }, [load]);

    const pending = commands?.some(isPending) ?? false;
    useEffect(() => {
        if (!pending) return;
        const timer = setInterval(() => void load(), COMMAND_POLL_MS);
        return () => clearInterval(timer);
    }, [pending, load]);

    /** Sends a command (the API answers at once) and starts following it. */
    const issue = useCallback(
        async (send: Promise<ChargerCommand>) => {
            const c = await send;
            pendingIds.current.add(c.id);
            setCommands((all) => [c, ...(all ?? []).filter((x) => x.id !== c.id)].slice(0, 10));
            return c;
        },
        [],
    );

    return { commands, error, issue, reload: load };
}

export type IssueCommand = (send: Promise<ChargerCommand>) => Promise<ChargerCommand>;

// ---------- per connector ----------

type ConnectorDialog = 'start' | 'stop' | 'unlock' | 'availability';

/** Start or stop charging, unlock, and (un)availability for one connector, as the user's role allows. */
export function ConnectorCommands({ evse, connector, issue }: { evse: Evse; connector: Connector; issue: IssueCommand }) {
    const { can } = useAuth();
    const [dialog, setDialog] = useState<ConnectorDialog | null>(null);
    const n = connector.connectorNumber;
    const charging = !!connector.activeSession;
    const unavailable = connector.live?.status === 'Unavailable';
    const canStart = can('evse.remote_start') && !charging && evse.status === 'active' && connector.status === 'active';

    const buttons = [
        canStart && { key: 'start', label: 'Start charging', dialog: 'start' as const },
        can('evse.remote_stop') && charging && { key: 'stop', label: 'Stop charging', dialog: 'stop' as const },
        can('evse.unlock') && { key: 'unlock', label: 'Unlock', dialog: 'unlock' as const },
        can('evse.update') && { key: 'availability', label: unavailable ? 'Make available' : 'Make unavailable', dialog: 'availability' as const },
    ].filter(Boolean) as { key: string; label: string; dialog: ConnectorDialog }[];
    if (!buttons.length) return null;

    return (
        <>
            <div className="row command-row" role="group" aria-label={`Remote control for connector ${n}`}>
                {buttons.map((b) => (
                    <Button
                        key={b.key}
                        variant={b.key === 'start' ? 'primary' : 'secondary'}
                        className="btn-sm"
                        aria-label={`${b.label} on connector ${n}`}
                        onClick={() => setDialog(b.dialog)}
                    >
                        {b.label}
                    </Button>
                ))}
            </div>
            {dialog === 'start' && (
                <StartDialog evse={evse} connector={connector} issue={issue} onClose={() => setDialog(null)} />
            )}
            {dialog === 'stop' && (
                <ConfirmDialog
                    title={`Stop charging on connector ${n}`}
                    explain="The charger is asked to end the session. The driver's car stops charging; the session is kept with its energy so far."
                    confirm="Stop charging"
                    onClose={() => setDialog(null)}
                    onConfirm={async () => {
                        await issue(api.remoteStop(evse.id, n));
                        setDialog(null);
                    }}
                />
            )}
            {dialog === 'unlock' && (
                <ConfirmDialog
                    title={`Unlock connector ${n}`}
                    explain="Releases the plug's lock so the cable can be removed, for example when it is stuck. If a session is running, the charger may end it."
                    confirm="Unlock"
                    onClose={() => setDialog(null)}
                    onConfirm={async () => {
                        await issue(api.unlock(evse.id, n));
                        setDialog(null);
                    }}
                />
            )}
            {dialog === 'availability' && (
                <ConfirmDialog
                    title={`${unavailable ? 'Make available' : 'Make unavailable'}: connector ${n}`}
                    explain={
                        unavailable
                            ? 'The charger offers this connector for charging again.'
                            : 'The charger shows this connector as out of service and refuses to charge on it. If it is charging now, this happens when the session ends. To block it on the platform side too, disable it here.'
                    }
                    confirm={unavailable ? 'Make available' : 'Make unavailable'}
                    danger={!unavailable}
                    onClose={() => setDialog(null)}
                    onConfirm={async () => {
                        await issue(api.setAvailability(evse.id, n, unavailable));
                        setDialog(null);
                    }}
                />
            )}
        </>
    );
}

function StartDialog({ evse, connector, issue, onClose }: { evse: Evse; connector: Connector; issue: IssueCommand; onClose: () => void }) {
    const [idTag, setIdTag] = useState('');
    const valid = !idTag.trim() || /^[\x21-\x7e]{1,20}$/.test(idTag.trim());
    const { busy, error, run } = useSubmit(async () => {
        await issue(api.remoteStart(evse.id, { connectorNumber: connector.connectorNumber, idTag: idTag.trim() || undefined }));
        onClose();
    });
    return (
        <Modal title={`Start charging on connector ${connector.connectorNumber}`} onClose={onClose} busy={busy}>
            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    if (valid) void run();
                }}
                noValidate
            >
                <p className="muted">
                    The charger is asked to start a session, as if a driver had tapped a card. The car must be plugged in: most chargers
                    wait a minute or two for it, then give up.
                </p>
                {error && <Alert kind="error">{error}</Alert>}
                <TextField
                    label="Card or token (optional)"
                    value={idTag}
                    onChange={setIdTag}
                    maxLength={20}
                    placeholder="PLUGEV-ADMIN"
                    hint="The session is recorded under this card. Leave empty to use the platform's own."
                    error={!valid ? 'Use up to 20 characters without spaces.' : null}
                />
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy} disabled={!valid}>
                        Start charging
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// ---------- the charger as a whole ----------

type ChargerDialog = 'soft' | 'hard' | 'availability';

/** Reset and (un)availability for the whole charger, and what recent commands came to (spec 5.3 step 21). */
export function RemoteControlSection({ evse, commands, error, issue }: {
    evse: Evse;
    commands: ChargerCommand[] | null;
    error: string | null;
    issue: IssueCommand;
}) {
    const { can } = useAuth();
    const [dialog, setDialog] = useState<ChargerDialog | null>(null);
    const unavailable = evse.live?.chargerStatus?.status === 'Unavailable';
    const soap = evse.protocol !== 'OCPP_1_6_J';

    return (
        <section className="widget" aria-labelledby="remote-control">
            <div className="widget-head">
                <h2 className="widget-title" id="remote-control" style={{ marginBottom: 0 }}>
                    <Gamepad2 size={20} aria-hidden /> Remote Control
                </h2>
                <div className="row">
                    {can('evse.reset') && (
                        <>
                            <Button variant="secondary" onClick={() => setDialog('soft')}>
                                Soft reset
                            </Button>
                            <Button variant="danger" onClick={() => setDialog('hard')}>
                                Hard reset
                            </Button>
                        </>
                    )}
                    {can('evse.update') && (
                        <Button variant="secondary" onClick={() => setDialog('availability')}>
                            {unavailable ? 'Make charger available' : 'Make charger unavailable'}
                        </Button>
                    )}
                </div>
            </div>
            <p className="muted small">
                Start and stop charging from each connector above. “Accepted” means the charger took the command; it is confirmed once the
                charger reports that it happened.
                {soap && !evse.live?.online && ' This SOAP charger is offline: commands reach it only at an address the platform can reach.'}
            </p>
            {error && <Alert kind="error">{error}</Alert>}
            <CommandsTable commands={commands} />

            {(dialog === 'soft' || dialog === 'hard') && (
                <ConfirmDialog
                    title={`${dialog === 'soft' ? 'Soft' : 'Hard'} reset: ${evseTitle(evse)}`}
                    explain={
                        dialog === 'soft'
                            ? 'The charger restarts its software. Sessions in progress are ended cleanly first.'
                            : 'The charger restarts as if switched off and on. Sessions in progress end abruptly. Use it when a soft reset does not help.'
                    }
                    confirm={dialog === 'soft' ? 'Soft reset' : 'Hard reset'}
                    onClose={() => setDialog(null)}
                    onConfirm={async () => {
                        await issue(api.reset(evse.id, dialog === 'soft' ? 'Soft' : 'Hard'));
                        setDialog(null);
                    }}
                />
            )}
            {dialog === 'availability' && (
                <ConfirmDialog
                    title={`${unavailable ? 'Make available' : 'Make unavailable'}: ${evseTitle(evse)}`}
                    explain={
                        unavailable
                            ? 'The charger offers its connectors for charging again.'
                            : 'The charger shows itself as out of service and refuses to charge, for example during maintenance. Sessions in progress finish first.'
                    }
                    confirm={unavailable ? 'Make available' : 'Make unavailable'}
                    danger={!unavailable}
                    onClose={() => setDialog(null)}
                    onConfirm={async () => {
                        await issue(api.setAvailability(evse.id, 0, unavailable));
                        setDialog(null);
                    }}
                />
            )}
        </section>
    );
}

function CommandsTable({ commands }: { commands: ChargerCommand[] | null }) {
    if (!commands) {
        return (
            <div className="empty">
                <span className="spinner" aria-label="Loading" style={{ display: 'inline-block' }} />
            </div>
        );
    }
    return (
        <div className="table-wrap">
            <table className="table" aria-label="Recent commands">
                <thead>
                    <tr>
                        <th>When</th>
                        <th>Command</th>
                        <th>Charger’s answer</th>
                        <th>Result</th>
                        <th>By</th>
                    </tr>
                </thead>
                <tbody>
                    {commands.map((c) => (
                        <tr key={c.id}>
                            <td className="nowrap" title={formatDateTime(c.createdAt)}>
                                {timeAgo(c.createdAt)}
                            </td>
                            <td>{commandLabel(c)}</td>
                            <td className="nowrap">
                                <span className={STATUS[c.status].badge}>{STATUS[c.status].label}</span>
                                {c.responseStatus && c.responseStatus !== 'Accepted' && c.status === 'accepted' && (
                                    <div className="muted small">{c.responseStatus === 'Scheduled' ? 'Scheduled: after the session ends' : c.responseStatus}</div>
                                )}
                                {c.responseStatus && c.status === 'rejected' && <div className="muted small">{c.responseStatus}</div>}
                            </td>
                            <td>
                                <CommandResult command={c} />
                            </td>
                            <td className="nowrap">{c.requestedBy?.name ?? <span className="muted">—</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {commands.length === 0 && <div className="empty">No commands sent to this charger yet.</div>}
        </div>
    );
}

function CommandResult({ command: c }: { command: ChargerCommand }) {
    if (c.error) return <span className="small">{c.error}</span>;
    if (c.status === 'rejected') return <span className="muted small">The charger refused it.</span>;
    const conf = c.confirmation;
    if (!conf) return c.status === 'accepted' ? <span className="muted small">Done</span> : <span className="muted">—</span>;
    if (conf.state === 'waiting') return <span className="muted small">Waiting for the charger to report it…</span>;
    if (conf.state === 'not_confirmed') {
        return <span className="small">Not confirmed: the charger has not reported it{c.action === 'RemoteStartTransaction' ? ' (was a car plugged in?)' : ''}.</span>;
    }
    return (
        <span className="small">
            <span className="badge badge-success">Confirmed</span> {conf.detail}
            {conf.sessionId && (
                <>
                    {' · '}
                    <Link to={`/stations/sessions/${conf.sessionId}`}>Session</Link>
                </>
            )}
        </span>
    );
}

// ---------- configuration ----------

/** The charger's settings as read with GetConfiguration, and changing one (OCPP ChangeConfiguration). */
export function ConfigurationSection({ evse, commands, issue }: { evse: Evse; commands: ChargerCommand[] | null; issue: IssueCommand }) {
    const [config, setConfig] = useState<ChargerConfiguration | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
    const [reading, setReading] = useState(false);

    const load = useCallback(() => {
        api.configuration(evse.id).then(setConfig, (err) => setError(describeError(err)));
    }, [evse.id]);
    useEffect(load, [load]);

    // reload once a read or change has been answered
    const lastAnswered = commands?.find((c) => c.action === 'GetConfiguration' || c.action === 'ChangeConfiguration');
    const answeredKey = lastAnswered && !isPending(lastAnswered) ? `${lastAnswered.id}:${lastAnswered.status}` : null;
    useEffect(() => {
        if (answeredKey) load();
    }, [answeredKey, load]);
    const readPending = commands?.some((c) => c.action === 'GetConfiguration' && isPending(c)) ?? false;

    const read = async () => {
        setReading(true);
        setError(null);
        try {
            await issue(api.readConfiguration(evse.id));
        } catch (err) {
            setError(describeError(err));
        } finally {
            setReading(false);
        }
    };

    return (
        <section className="widget" aria-labelledby="charger-configuration">
            <div className="widget-head">
                <h2 className="widget-title" id="charger-configuration" style={{ marginBottom: 0 }}>
                    <Settings2 size={20} aria-hidden /> Configuration
                </h2>
                <Button variant="secondary" onClick={() => void read()} loading={reading || readPending}>
                    <RefreshCw size={16} aria-hidden /> Read from charger
                </Button>
            </div>
            {error && <Alert kind="error">{error}</Alert>}
            {config?.readAt ? (
                <>
                    <p className="muted small">Read {timeAgo(config.readAt)} ({formatDateTime(config.readAt)}).</p>
                    <div className="table-wrap">
                        <table className="table" aria-label="Charger settings">
                            <thead>
                                <tr>
                                    <th>Setting</th>
                                    <th>Value</th>
                                    <th className="num">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {config.keys.map((k) => (
                                    <tr key={k.key}>
                                        <td className="code-text">{k.key}</td>
                                        <td className="code-text">{k.value ?? <span className="muted">—</span>}</td>
                                        <td className="num">
                                            {k.readonly ? (
                                                <span className="muted small">Read-only</span>
                                            ) : (
                                                <Button
                                                    variant="secondary"
                                                    className="btn-sm"
                                                    aria-label={`Change ${k.key}`}
                                                    onClick={() => setEditing({ key: k.key, value: k.value ?? '' })}
                                                >
                                                    Change
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {config.unknownKeys.length > 0 && (
                        <p className="muted small">The charger does not know: {config.unknownKeys.join(', ')}.</p>
                    )}
                </>
            ) : (
                config && <p className="muted">Not read yet. “Read from charger” asks the charger for all its settings.</p>
            )}
            {editing && (
                <ChangeSettingDialog
                    evse={evse}
                    setting={editing}
                    issue={issue}
                    onClose={() => setEditing(null)}
                />
            )}
        </section>
    );
}

function ChangeSettingDialog({ evse, setting, issue, onClose }: {
    evse: Evse;
    setting: { key: string; value: string };
    issue: IssueCommand;
    onClose: () => void;
}) {
    const [value, setValue] = useState(setting.value);
    const { busy, error, run } = useSubmit(async () => {
        await issue(api.changeConfiguration(evse.id, setting.key, value));
        onClose();
    });
    return (
        <Modal title={`Change ${setting.key}`} onClose={onClose} busy={busy}>
            <form
                onSubmit={(e: FormEvent) => {
                    e.preventDefault();
                    void run();
                }}
                noValidate
            >
                <p className="muted">
                    The charger is asked to change this setting. Some settings only take effect after a reset; the charger then answers
                    “RebootRequired”.
                </p>
                {error && <Alert kind="error">{error}</Alert>}
                <TextField label="New value" value={value} onChange={setValue} maxLength={500} autoFocus />
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        Change
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
