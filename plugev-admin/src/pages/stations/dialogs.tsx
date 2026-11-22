import { useMemo, useState, type FormEvent } from 'react';
import { EvCharger, Network as NetworkIcon } from 'lucide-react';
import { api, ApiError, describeError, type NetworkInput } from '../../api/client';
import type { Network, Station } from '../../api/types';
import { Alert, Button, leadIcon, Modal, SelectField, TextField } from '../../components/ui';

const CURRENCY = /^[A-Z]{3}$/;

function timeZones(current: string): string[] {
    let zones: string[] = [];
    try {
        zones = Intl.supportedValuesOf('timeZone');
    } catch {
        // older browsers: the current value and the default are enough
    }
    return [...new Set([current, 'Asia/Colombo', ...zones])].filter(Boolean).sort();
}

/** Adds a network, or edits one when `network` is given. */
export function NetworkDialog({ network, onClose, onSaved }: {
    network?: Network;
    onClose: () => void;
    onSaved: (network: Network) => void;
}) {
    const [name, setName] = useState(network?.name ?? '');
    const [currency, setCurrency] = useState(network?.defaultCurrency ?? 'LKR');
    const [timeZone, setTimeZone] = useState(network?.timeZone ?? 'Asia/Colombo');
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const zones = useMemo(() => timeZones(network?.timeZone ?? ''), [network?.timeZone]);

    const currencyOk = CURRENCY.test(currency);
    const valid = name.trim() && currencyOk && timeZone;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!valid) return;
        setBusy(true);
        setError(null);
        setNameError(null);
        const body: NetworkInput = { name: name.trim(), defaultCurrency: currency, timeZone };
        try {
            onSaved(network ? await api.updateNetwork(network.id, body) : await api.createNetwork(body));
        } catch (err) {
            if (err instanceof ApiError && err.code === 'NAME_TAKEN') setNameError(err.message);
            else setError(describeError(err));
            setBusy(false);
        }
    };

    return (
        <Modal title={network ? `Update network: ${network.name}` : 'Add a charging network'} onClose={onClose} busy={busy}>
            <form onSubmit={submit} noValidate>
                {!network && <p className="muted">A network is one operator. Its stations, admins and reports stay within it.</p>}
                {error && <Alert kind="error">{error}</Alert>}
                <TextField
                    label="Network name"
                    value={name}
                    onChange={setName}
                    icon={leadIcon(NetworkIcon)}
                    maxLength={200}
                    error={nameError ?? (touched && !name.trim() ? 'Enter a name.' : null)}
                    autoFocus
                    required
                />
                <div className="form-row">
                    <TextField
                        label="Currency"
                        value={currency}
                        onChange={(v) => setCurrency(v.toUpperCase())}
                        maxLength={3}
                        hint="ISO code, such as LKR"
                        error={touched && !currencyOk ? 'Use a three-letter code such as LKR.' : null}
                        required
                    />
                    <SelectField
                        label="Time zone"
                        value={timeZone}
                        onChange={setTimeZone}
                        options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))}
                        hint="Used for reports and tariffs"
                        required
                    />
                </div>
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        {network ? 'Save changes' : 'Add network'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * Adds a station, or renames one when `station` is given.
 * When adding, `networkId` fixes the network; otherwise the user picks one of `networks`.
 */
export function StationDialog({ station, networkId, networks, onClose, onSaved }: {
    station?: Station;
    networkId?: string;
    networks?: Network[];
    onClose: () => void;
    onSaved: (station: Station) => void;
}) {
    const choices = (networks ?? []).filter((n) => n.status === 'active');
    const [name, setName] = useState(station?.name ?? '');
    const [network, setNetwork] = useState(networkId ?? (choices.length === 1 ? choices[0]!.id : ''));
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nameError, setNameError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const valid = name.trim() && (station || network);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!valid) return;
        setBusy(true);
        setError(null);
        setNameError(null);
        try {
            onSaved(
                station
                    ? await api.updateStation(station.id, { name: name.trim() })
                    : await api.createStation({ networkId: network, name: name.trim() }),
            );
        } catch (err) {
            if (err instanceof ApiError && err.code === 'NAME_TAKEN') setNameError(err.message);
            else setError(describeError(err));
            setBusy(false);
        }
    };

    return (
        <Modal title={station ? `Rename station: ${station.name}` : 'Add a charging station'} onClose={onClose} busy={busy}>
            <form onSubmit={submit} noValidate>
                {!station && (
                    <p className="muted">
                        A station is one site. Its chargers (terminals) and connectors are added in a later release.
                    </p>
                )}
                {error && <Alert kind="error">{error}</Alert>}
                {!station && !networkId && (
                    <SelectField
                        label="Network"
                        value={network}
                        onChange={setNetwork}
                        placeholder="Choose a network"
                        options={choices.map((n) => ({ value: n.id, label: n.name }))}
                        error={touched && !network ? 'Choose a network.' : null}
                        hint={choices.length === 0 ? 'Stations can only be added to an active network.' : undefined}
                        required
                    />
                )}
                <TextField
                    label="Station name"
                    value={name}
                    onChange={setName}
                    icon={leadIcon(EvCharger)}
                    maxLength={200}
                    placeholder="e.g. Kottawa Kinro"
                    error={nameError ?? (touched && !name.trim() ? 'Enter a name.' : null)}
                    autoFocus
                    required
                />
                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        {station ? 'Save' : 'Add station'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
