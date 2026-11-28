import { useState, type FormEvent } from 'react';
import { Cable, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, describeError } from '../../../api/client';
import type { Connector, ConnectorInput, ConnectorType, Evse, EvseProtocol, Station } from '../../../api/types';
import { CONNECTOR_TYPES, MAX_CONNECTORS } from '../../../api/types';
import { Alert, Button, leadIcon, Modal, SelectField, TextField } from '../../../components/ui';
import { CONNECTOR_LABELS, fixedCurrent, PROTOCOL_LABELS } from '../equipment';

const IDENTITY = /^[A-Za-z0-9._:-]{1,48}$/;

/** Text to a power in kW, or undefined when not a valid value. Empty is null. */
function parseKw(text: string, max: number): number | null | undefined {
    const t = text.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 100) / 100 : undefined;
}

interface ConnectorDraft {
    connectorType: ConnectorType | '';
    currentType: 'AC' | 'DC' | '';
    power: string;
    format: 'cable' | 'socket';
}

const emptyConnector: ConnectorDraft = { connectorType: '', currentType: '', power: '', format: 'cable' };

function draftOf(c: Connector): ConnectorDraft {
    return { connectorType: c.connectorType, currentType: c.currentType, power: String(c.maxPowerKw), format: c.format };
}

/** Same rules as the API: the type fixes AC or DC (except GB/T), and only AC has sockets. */
function connectorInput(d: ConnectorDraft, connectorNumber: number): ConnectorInput | null {
    if (!d.connectorType) return null;
    const current = fixedCurrent(d.connectorType) ?? (d.currentType || null);
    const power = parseKw(d.power, 1000);
    if (!current || !power) return null;
    return {
        connectorNumber,
        connectorType: d.connectorType,
        ...(d.connectorType === 'GBT' ? { currentType: current } : {}),
        maxPowerKw: power,
        format: current === 'AC' ? d.format : 'cable',
    };
}

function ConnectorFields({ value, onChange, touched, number }: {
    value: ConnectorDraft;
    onChange: (d: ConnectorDraft) => void;
    touched: boolean;
    number: number;
}) {
    const fixed = value.connectorType ? fixedCurrent(value.connectorType) : null;
    const current = fixed ?? value.currentType;
    const power = parseKw(value.power, 1000);
    const set = (change: Partial<ConnectorDraft>) => onChange({ ...value, ...change });
    return (
        <>
            <div className="form-row">
                <SelectField
                    label={`Connector ${number} type`}
                    value={value.connectorType}
                    onChange={(v) => set({ connectorType: v as ConnectorType })}
                    placeholder="Choose the plug type"
                    options={CONNECTOR_TYPES.map((t) => ({ value: t, label: CONNECTOR_LABELS[t] }))}
                    error={touched && !value.connectorType ? 'Choose the plug type.' : null}
                    hint={fixed ? `${CONNECTOR_LABELS[value.connectorType as ConnectorType]} is always ${fixed}.` : undefined}
                />
                <TextField
                    label={`Connector ${number} power (kW)`}
                    inputMode="decimal"
                    value={value.power}
                    onChange={(v) => set({ power: v })}
                    placeholder="60"
                    error={touched && !power ? 'Enter the maximum power in kW.' : null}
                />
            </div>
            <div className="form-row">
                {value.connectorType === 'GBT' ? (
                    <SelectField
                        label={`Connector ${number} current`}
                        value={value.currentType}
                        onChange={(v) => set({ currentType: v as 'AC' | 'DC' })}
                        placeholder="AC or DC"
                        options={[
                            { value: 'DC', label: 'DC (fast)' },
                            { value: 'AC', label: 'AC' },
                        ]}
                        error={touched && !value.currentType ? 'Choose AC or DC.' : null}
                    />
                ) : (
                    <span />
                )}
                {current === 'AC' ? (
                    <SelectField
                        label={`Connector ${number} form`}
                        value={value.format}
                        onChange={(v) => set({ format: v as 'cable' | 'socket' })}
                        options={[
                            { value: 'cable', label: 'Attached cable' },
                            { value: 'socket', label: 'Socket (driver brings a cable)' },
                        ]}
                    />
                ) : (
                    <span />
                )}
            </div>
        </>
    );
}

interface ChargerDraft {
    name: string;
    protocolIdentity: string;
    protocol: EvseProtocol | '';
    vendor: string;
    model: string;
    serialNumber: string;
    power: string;
    commandUrl: string;
}

/** Empty, or an http(s) address (the API checks the same). */
const COMMAND_URL = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

/**
 * Registers a charger with its connectors, or edits one when `evse` is given.
 * When adding, `stationId` fixes the station; otherwise the user picks one of `stations`.
 * When editing, `stations` (same network) lets the charger move.
 */
export function ChargerDialog({ evse, stationId, stations, onClose, onSaved }: {
    evse?: Evse;
    stationId?: string;
    stations?: Station[];
    onClose: () => void;
    onSaved: (evse: Evse) => void;
}) {
    const [draft, setDraft] = useState<ChargerDraft>({
        name: evse?.name ?? '',
        protocolIdentity: evse?.protocolIdentity ?? '',
        protocol: evse?.protocol ?? '',
        vendor: evse?.vendor ?? '',
        model: evse?.model ?? '',
        serialNumber: evse?.serialNumber ?? '',
        power: evse?.maxPowerKw ? String(evse.maxPowerKw) : '',
        commandUrl: evse?.commandUrl ?? '',
    });
    const [station, setStation] = useState(evse?.stationId ?? stationId ?? '');
    const [connectors, setConnectors] = useState<ConnectorDraft[]>([emptyConnector]);
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [identityError, setIdentityError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const set = (change: Partial<ChargerDraft>) => setDraft((d) => ({ ...d, ...change }));
    const power = parseKw(draft.power, 2000);
    const identityOk = IDENTITY.test(draft.protocolIdentity.trim());
    const connectorInputs = connectors.map((c, i) => connectorInput(c, i + 1));
    const stationChoices = (stations ?? []).filter((s) => !evse || s.networkId === evse.networkId);
    const soap = draft.protocol === 'OCPP_1_5_S' || draft.protocol === 'OCPP_1_6_S';
    const commandUrlOk = !soap || !draft.commandUrl.trim() || COMMAND_URL.test(draft.commandUrl.trim());
    const valid =
        commandUrlOk && identityOk && draft.protocol && draft.vendor.trim() && draft.model.trim() && power !== undefined && station &&
        (evse || connectorInputs.every(Boolean));

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!valid || !draft.protocol) return;
        setBusy(true);
        setError(null);
        setIdentityError(null);
        const body = {
            name: draft.name.trim() || null,
            protocol: draft.protocol,
            protocolIdentity: draft.protocolIdentity.trim(),
            vendor: draft.vendor.trim(),
            model: draft.model.trim(),
            serialNumber: draft.serialNumber.trim() || null,
            maxPowerKw: power ?? null,
            // only SOAP chargers take commands at an address; it is set when editing
            ...(evse ? { commandUrl: soap ? draft.commandUrl.trim() || null : null } : {}),
        };
        try {
            onSaved(
                evse
                    ? await api.updateEvse(evse.id, { ...body, ...(station !== evse.stationId ? { stationId: station } : {}) })
                    : await api.createEvse({ ...body, stationId: station, connectors: connectorInputs as ConnectorInput[] }),
            );
        } catch (err) {
            if (err instanceof ApiError && err.code === 'PROTOCOL_IDENTITY_TAKEN') setIdentityError(err.message);
            else setError(describeError(err));
            setBusy(false);
        }
    };

    return (
        <Modal title={evse ? `Edit charger: ${evse.name ?? evse.protocolIdentity}` : 'Add a charger'} onClose={onClose} busy={busy} wide>
            <form onSubmit={submit} noValidate>
                {!evse && (
                    <p className="muted">
                        Register the charger with the identity it uses to connect to PLUG EV. Each connector gets its own
                        QR code.
                    </p>
                )}
                {error && <Alert kind="error">{error}</Alert>}
                {((!evse && !stationId) || (evse && stationChoices.length > 1)) && (
                    <SelectField
                        label="Station"
                        value={station}
                        onChange={setStation}
                        placeholder="Choose a station"
                        options={stationChoices.map((s) => ({ value: s.id, label: s.name }))}
                        error={touched && !station ? 'Choose a station.' : null}
                        hint={evse ? 'Move the charger to another station of the same network.' : undefined}
                    />
                )}
                <div className="form-row">
                    <TextField
                        label="Charger ID (OCPP identity)"
                        value={draft.protocolIdentity}
                        onChange={(v) => set({ protocolIdentity: v })}
                        icon={leadIcon(Cable)}
                        maxLength={48}
                        placeholder="KTW-01"
                        hint={evse ? 'When a charger is replaced, enter the new one here. Its QR codes stay the same.' : 'Exactly as set in the charger'}
                        error={identityError ?? (touched && !identityOk ? 'Use 1–48 letters, digits or . _ : -' : null)}
                        autoFocus
                    />
                    <SelectField
                        label="Protocol"
                        value={draft.protocol}
                        onChange={(v) => set({ protocol: v as EvseProtocol })}
                        placeholder="Choose"
                        options={Object.entries(PROTOCOL_LABELS).map(([value, label]) => ({ value, label }))}
                        error={touched && !draft.protocol ? 'Choose the protocol.' : null}
                    />
                </div>
                <div className="form-row">
                    <TextField
                        label="Make"
                        value={draft.vendor}
                        onChange={(v) => set({ vendor: v })}
                        maxLength={100}
                        placeholder="SETEC"
                        error={touched && !draft.vendor.trim() ? 'Enter the manufacturer.' : null}
                    />
                    <TextField
                        label="Model"
                        value={draft.model}
                        onChange={(v) => set({ model: v })}
                        maxLength={100}
                        error={touched && !draft.model.trim() ? 'Enter the model.' : null}
                    />
                </div>
                <div className="form-row">
                    <TextField label="Serial number (optional)" value={draft.serialNumber} onChange={(v) => set({ serialNumber: v })} maxLength={100} />
                    <TextField
                        label="Total power, kW (optional)"
                        inputMode="decimal"
                        value={draft.power}
                        onChange={(v) => set({ power: v })}
                        error={touched && power === undefined ? 'Enter a power in kW, or leave it empty.' : null}
                    />
                </div>
                <TextField
                    label="Name (optional)"
                    value={draft.name}
                    onChange={(v) => set({ name: v })}
                    maxLength={100}
                    placeholder="Fast charger 1"
                    hint="A label for admins. Without one, the charger ID is shown."
                />
                {evse && soap && (
                    <TextField
                        label="Command address (optional)"
                        value={draft.commandUrl}
                        onChange={(v) => set({ commandUrl: v })}
                        maxLength={500}
                        placeholder="http://203.0.113.7:8765/"
                        hint="Only when the charger is behind a router: its public address with port forwarding. Leave empty to use the address the charger reports."
                        error={touched && !commandUrlOk ? 'Enter an http:// or https:// address, or leave it empty.' : null}
                    />
                )}

                {!evse && (
                    <div className="form-section">
                        <h3>Connectors</h3>
                        <p className="muted small">The plugs that go into the car, numbered as the charger numbers them.</p>
                        {connectors.map((c, i) => (
                            <div key={i}>
                                <ConnectorFields
                                    value={c}
                                    number={i + 1}
                                    touched={touched}
                                    onChange={(d) => setConnectors((all) => all.map((x, j) => (j === i ? d : x)))}
                                />
                            </div>
                        ))}
                        <div className="row" style={{ marginBottom: 10 }}>
                            {connectors.length < MAX_CONNECTORS && (
                                <Button variant="secondary" className="btn-sm" onClick={() => setConnectors((all) => [...all, emptyConnector])}>
                                    <Plus size={15} aria-hidden /> Add connector {connectors.length + 1}
                                </Button>
                            )}
                            {connectors.length > 1 && (
                                <Button variant="secondary" className="btn-sm" onClick={() => setConnectors((all) => all.slice(0, -1))}>
                                    <Trash2 size={15} aria-hidden /> Remove connector {connectors.length}
                                </Button>
                            )}
                        </div>
                    </div>
                )}

                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        {evse ? 'Save changes' : 'Add charger'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/** Adds the next connector to a charger, or edits `connector`. */
export function ConnectorDialog({ evse, connector, onClose, onSaved }: {
    evse: Evse;
    connector?: Connector;
    onClose: () => void;
    onSaved: (evse: Evse) => void;
}) {
    const number = connector?.connectorNumber ?? [1, 2].find((n) => !evse.connectors.some((c) => c.connectorNumber === n)) ?? 1;
    const [draft, setDraft] = useState<ConnectorDraft>(connector ? draftOf(connector) : emptyConnector);
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const input = connectorInput(draft, number);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!input) return;
        setBusy(true);
        setError(null);
        try {
            const { connectorNumber: _n, ...changes } = input;
            onSaved(
                connector
                    ? await api.updateConnector(evse.id, connector.id, { ...changes, currentType: fixedCurrent(input.connectorType) ?? input.currentType })
                    : await api.addConnector(evse.id, input),
            );
        } catch (err) {
            setError(describeError(err));
            setBusy(false);
        }
    };

    return (
        <Modal title={connector ? `Edit connector ${number}` : `Add connector ${number}`} onClose={onClose} busy={busy}>
            <form onSubmit={submit} noValidate>
                {error && <Alert kind="error">{error}</Alert>}
                {!connector && <p className="muted">Connector {number} of {evse.name ?? evse.protocolIdentity}. Its QR code is made automatically.</p>}
                <ConnectorFields value={draft} onChange={setDraft} touched={touched} number={number} />
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        {connector ? 'Save' : 'Add connector'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
