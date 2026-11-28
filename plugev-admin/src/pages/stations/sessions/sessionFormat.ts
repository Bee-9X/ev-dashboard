import type { ChargingSession, SessionStatus } from '../../../api/types';
import { CONNECTOR_LABELS } from '../equipment';

/** 4000 -> "4.00 kWh", 250 -> "0.25 kWh". */
export function formatEnergy(wh: number | null | undefined): string {
    if (wh === null || wh === undefined) return '—';
    const kwh = wh / 1000;
    return `${kwh.toFixed(kwh >= 100 ? 1 : 2)} kWh`;
}

/** 15000 -> "15.0 kW", 800 -> "0.8 kW". */
export function formatPower(w: number | null | undefined): string {
    if (w === null || w === undefined) return '—';
    return `${(w / 1000).toFixed(1)} kW`;
}

/** 3900 -> "1 h 05 min", 125 -> "2 min", 20 -> "20 s". */
export function formatDuration(sec: number | null | undefined): string {
    if (sec === null || sec === undefined) return '—';
    if (sec < 60) return `${sec} s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
    active: 'Charging',
    completed: 'Completed',
    interrupted: 'Interrupted',
    orphan: 'Unmatched stop',
};

/** What each status means, for a tooltip or a note. */
export const SESSION_STATUS_HELP: Record<SessionStatus, string> = {
    active: 'Charging now, or the charger has not reported the stop yet.',
    completed: 'The charger reported the stop.',
    interrupted: 'The charger started a new session on this connector before reporting the stop of this one.',
    orphan: 'The charger reported a stop for a session the platform never saw start.',
};

export function sessionBadge(status: SessionStatus): string {
    switch (status) {
        case 'active':
            return 'badge badge-info badge-dot';
        case 'completed':
            return 'badge badge-success badge-dot';
        case 'interrupted':
            return 'badge badge-warning badge-dot';
        default:
            return 'badge badge-danger badge-dot';
    }
}

/** OCPP StopTransaction reasons in words; anything else is shown as the charger sent it. */
const STOP_REASONS: Record<string, string> = {
    EVDisconnected: 'Cable unplugged',
    Local: 'Stopped at the charger',
    Remote: 'Stopped remotely',
    DeAuthorized: 'Card no longer accepted',
    EmergencyStop: 'Emergency stop',
    HardReset: 'Charger reset',
    SoftReset: 'Charger reset',
    Reboot: 'Charger restarted',
    PowerLoss: 'Power cut',
    UnlockCommand: 'Connector unlocked remotely',
    Other: 'Other',
};

export function stopReasonLabel(reason: string | null | undefined): string {
    if (!reason) return '—';
    return STOP_REASONS[reason] ?? reason;
}

/** "Connector 1 · CHAdeMO", or just the number when it is not registered. */
export function sessionConnector(s: Pick<ChargingSession, 'connectorNumber' | 'connectorType'>): string {
    if (s.connectorNumber === 0) return 'Unknown connector';
    return `Connector ${s.connectorNumber}${s.connectorType ? ` · ${CONNECTOR_LABELS[s.connectorType]}` : ''}`;
}

/** The charger as admins call it: its name, or its Charger ID. */
export function sessionCharger(s: Pick<ChargingSession, 'evseName' | 'protocolIdentity'>): string {
    return s.evseName ?? s.protocolIdentity;
}

/** OCPP measurand names in words, for the readings table. */
const MEASURANDS: Record<string, string> = {
    'Energy.Active.Import.Register': 'Energy meter',
    'Energy.Active.Import.Interval': 'Energy (interval)',
    'Power.Active.Import': 'Power',
    'Power.Offered': 'Power offered',
    'Current.Import': 'Current',
    'Current.Offered': 'Current offered',
    Voltage: 'Voltage',
    SoC: 'Battery',
    Temperature: 'Temperature',
    Frequency: 'Frequency',
};

export function measurandLabel(measurand: string, phase: string | null): string {
    return `${MEASURANDS[measurand] ?? measurand}${phase ? ` (${phase})` : ''}`;
}

/** "Percent" -> "%", "Celsius" -> "°C"; Wh, W, A and V stay. */
export function unitLabel(unit: string | null): string {
    if (!unit) return '';
    if (unit === 'Percent') return '%';
    if (unit === 'Celsius') return '°C';
    if (unit === 'Fahrenheit') return '°F';
    return unit;
}
