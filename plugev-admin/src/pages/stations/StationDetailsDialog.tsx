import { useMemo, useState, type FormEvent } from 'react';
import { MapPin, Phone } from 'lucide-react';
import { api, describeError } from '../../api/client';
import type { OperatingHours, Station, TimeRange, Weekday } from '../../api/types';
import { AMENITIES, WEEKDAYS } from '../../api/types';
import { Alert, Button, leadIcon, Modal, SelectField, TextField } from '../../components/ui';
import { AMENITY_LABELS, DAY_LABELS, formatCoordinates, parseCoordinates } from './equipment';

const PHONE = /^\+?[0-9 ()-]{6,20}$/;

type HoursMode = 'unset' | 'always' | 'weekly';
/** One range per day in the editor; "24:00" is shown as 00:00 in a time input. */
type DayDraft = { open: boolean; from: string; to: string };

function draftDays(hours: OperatingHours | null | undefined): Record<Weekday, DayDraft> {
    const days = {} as Record<Weekday, DayDraft>;
    for (const d of WEEKDAYS) {
        const first: TimeRange | undefined = hours?.type === 'weekly' ? hours.days[d]?.[0] : undefined;
        days[d] = first
            ? { open: true, from: first.open, to: first.close === '24:00' ? '00:00' : first.close }
            : { open: hours?.type !== 'weekly', from: '06:00', to: '22:00' };
    }
    return days;
}

function timeZones(): string[] {
    try {
        return Intl.supportedValuesOf('timeZone');
    } catch {
        return ['Asia/Colombo'];
    }
}

/** Address, location, phone, time zone, opening hours and amenities (FR ST 001, 005). */
export function StationDetailsDialog({ station, networkTimeZone, onClose, onSaved }: {
    station: Station;
    /** Shown as the default; unknown to Station Admins. */
    networkTimeZone?: string;
    onClose: () => void;
    onSaved: (station: Station) => void;
}) {
    const [address, setAddress] = useState(station.address ?? '');
    const [phone, setPhone] = useState(station.phone ?? '');
    const [coordinates, setCoordinates] = useState(formatCoordinates(station));
    const [timeZone, setTimeZone] = useState(station.timeZone ?? '');
    const [mode, setMode] = useState<HoursMode>(station.operatingHours ? station.operatingHours.type : 'unset');
    const [days, setDays] = useState(() => draftDays(station.operatingHours));
    const [amenities, setAmenities] = useState<string[]>(station.amenities ?? []);
    const [touched, setTouched] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const zones = useMemo(timeZones, []);

    const location = parseCoordinates(coordinates);
    const phoneOk = !phone.trim() || PHONE.test(phone.trim());
    const splitHours = station.operatingHours?.type === 'weekly' && Object.values(station.operatingHours.days).some((r) => (r?.length ?? 0) > 1);
    const badDays = mode === 'weekly' ? WEEKDAYS.filter((d) => days[d].open && days[d].to !== '00:00' && days[d].from >= days[d].to) : [];
    const locationRequired = station.publicVisible && location === null;
    const valid = location !== undefined && phoneOk && !badDays.length && !locationRequired;

    const setDay = (d: Weekday, change: Partial<DayDraft>) => setDays((all) => ({ ...all, [d]: { ...all[d], ...change } }));
    const copyMonday = () => setDays((all) => Object.fromEntries(WEEKDAYS.map((d) => [d, { ...all.mon }])) as Record<Weekday, DayDraft>);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!valid) return;
        const operatingHours: OperatingHours | null =
            mode === 'unset'
                ? null
                : mode === 'always'
                  ? { type: 'always' }
                  : {
                        type: 'weekly',
                        days: Object.fromEntries(
                            WEEKDAYS.filter((d) => days[d].open).map((d) => [
                                d,
                                [{ open: days[d].from, close: days[d].to === '00:00' ? '24:00' : days[d].to }],
                            ]),
                        ),
                    };
        setBusy(true);
        setError(null);
        try {
            onSaved(
                await api.updateStation(station.id, {
                    address: address.trim() || null,
                    phone: phone.trim() || null,
                    latitude: location?.latitude ?? null,
                    longitude: location?.longitude ?? null,
                    timeZone: timeZone || null,
                    operatingHours,
                    amenities: AMENITIES.filter((a) => amenities.includes(a)),
                }),
            );
        } catch (err) {
            setError(describeError(err));
            setBusy(false);
        }
    };

    return (
        <Modal title={`Station details: ${station.name}`} onClose={onClose} busy={busy} wide>
            <form onSubmit={submit} noValidate>
                <p className="muted">Drivers see these details in the app once the station is shown there.</p>
                {error && <Alert kind="error">{error}</Alert>}
                <TextField label="Address" value={address} onChange={setAddress} icon={leadIcon(MapPin)} maxLength={500} autoFocus />
                <div className="form-row">
                    <TextField
                        label="Phone"
                        type="tel"
                        value={phone}
                        onChange={setPhone}
                        icon={leadIcon(Phone)}
                        maxLength={20}
                        error={touched && !phoneOk ? 'Enter a phone number, for example +94 11 234 5678.' : null}
                    />
                    <TextField
                        label="GPS location"
                        value={coordinates}
                        onChange={setCoordinates}
                        placeholder="6.841234, 79.965432"
                        hint="In Google Maps, right-click the place and click the numbers to copy them."
                        error={
                            location === undefined
                                ? 'Enter latitude and longitude, separated by a comma.'
                                : locationRequired
                                  ? 'This station is shown in the app, so it needs a location.'
                                  : null
                        }
                    />
                </div>
                <SelectField
                    label="Time zone"
                    value={timeZone}
                    onChange={setTimeZone}
                    placeholder={`Same as the network${networkTimeZone ? ` (${networkTimeZone.replace(/_/g, ' ')})` : ''}`}
                    options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))}
                    hint="The opening hours below are in this time zone."
                />

                <div className="form-section">
                    <h3>Opening hours</h3>
                    <div className="radio-row" role="radiogroup" aria-label="Opening hours">
                        {(
                            [
                                ['unset', 'Not set'],
                                ['always', 'Open 24 hours'],
                                ['weekly', 'Set hours for each day'],
                            ] as const
                        ).map(([value, label]) => (
                            <label key={value} className="checkbox">
                                <input type="radio" name="hours-mode" checked={mode === value} onChange={() => setMode(value)} />
                                {label}
                            </label>
                        ))}
                    </div>
                    {mode === 'weekly' && (
                        <>
                            {splitHours && (
                                <Alert kind="info">Some days had more than one opening period. Saving keeps only the first period of each day.</Alert>
                            )}
                            <div className="hours">
                                {WEEKDAYS.map((d) => (
                                    <DayRow key={d} day={d} value={days[d]} invalid={touched && badDays.includes(d)} onChange={(c) => setDay(d, c)} />
                                ))}
                            </div>
                            <p className="muted small">
                                To close at midnight, set the closing time to 00:00 (12:00 AM).{' '}
                                <Button variant="link" onClick={copyMonday}>
                                    Use Monday's hours for every day
                                </Button>
                            </p>
                            {touched && badDays.length > 0 && (
                                <Alert kind="error">Opening must be before closing: {badDays.map((d) => DAY_LABELS[d]).join(', ')}.</Alert>
                            )}
                        </>
                    )}
                </div>

                <div className="form-section">
                    <h3>Amenities</h3>
                    <div className="checks">
                        {AMENITIES.map((a) => (
                            <label key={a} className="checkbox">
                                <input
                                    type="checkbox"
                                    checked={amenities.includes(a)}
                                    onChange={(e) => setAmenities((all) => (e.target.checked ? [...all, a] : all.filter((x) => x !== a)))}
                                />
                                {AMENITY_LABELS[a]}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="modal-actions">
                    <Button variant="secondary" onClick={onClose} disabled={busy}>
                        Cancel
                    </Button>
                    <Button type="submit" loading={busy}>
                        Save details
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

function DayRow({ day, value, invalid, onChange }: {
    day: Weekday;
    value: DayDraft;
    invalid: boolean;
    onChange: (change: Partial<DayDraft>) => void;
}) {
    const label = DAY_LABELS[day];
    return (
        <>
            <span>{label}</span>
            <label className="checkbox">
                <input type="checkbox" checked={value.open} onChange={(e) => onChange({ open: e.target.checked })} aria-label={`Open on ${label}`} />
                Open
            </label>
            {value.open ? (
                <>
                    <input
                        className="input"
                        type="time"
                        value={value.from}
                        onChange={(e) => onChange({ from: e.target.value })}
                        aria-label={`${label} opens`}
                        aria-invalid={invalid || undefined}
                        required
                    />
                    <input
                        className="input"
                        type="time"
                        value={value.to}
                        onChange={(e) => onChange({ to: e.target.value })}
                        aria-label={`${label} closes`}
                        aria-invalid={invalid || undefined}
                        required
                    />
                </>
            ) : (
                <span className="closed">Closed</span>
            )}
        </>
    );
}
