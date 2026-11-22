import type { Me } from '../../api/types';
import type { Connector, ConnectorType, Evse, EvseProtocol, OperatingHours, Station, Weekday } from '../../api/types';
import { WEEKDAYS } from '../../api/types';

export const CONNECTOR_LABELS: Record<ConnectorType, string> = {
    CCS2: 'CCS2',
    CCS1: 'CCS1',
    CHADEMO: 'CHAdeMO',
    TYPE2: 'Type 2',
    TYPE1: 'Type 1',
    GBT: 'GB/T',
};

/** The current a connector type always carries; GB/T comes in both. */
export function fixedCurrent(type: ConnectorType): 'AC' | 'DC' | null {
    if (type === 'CCS2' || type === 'CCS1' || type === 'CHADEMO') return 'DC';
    if (type === 'TYPE2' || type === 'TYPE1') return 'AC';
    return null;
}

export const PROTOCOL_LABELS: Record<EvseProtocol, string> = {
    OCPP_1_6_J: 'OCPP 1.6 (JSON)',
    OCPP_1_6_S: 'OCPP 1.6 (SOAP)',
    OCPP_1_5_S: 'OCPP 1.5 (SOAP)',
};

export const AMENITY_LABELS: Record<string, string> = {
    parking: 'Parking',
    restrooms: 'Restrooms',
    food: 'Food and drinks',
    wifi: 'Wi-Fi',
    shopping: 'Shopping',
    lodging: 'Hotel',
    waiting_area: 'Waiting area',
};

export const DAY_LABELS: Record<Weekday, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
};

/** "CCS2 · DC 60 kW" */
export function connectorLabel(c: Pick<Connector, 'connectorType' | 'currentType' | 'maxPowerKw'>): string {
    return `${CONNECTOR_LABELS[c.connectorType]} · ${c.currentType} ${formatKw(c.maxPowerKw)}`;
}

export function formatKw(kw: number | null | undefined): string {
    if (kw === null || kw === undefined) return '—';
    return `${Number.isInteger(kw) ? kw : kw.toFixed(1)} kW`;
}

/** What admins call a charger: its name, or its OCPP identity. */
export function evseTitle(e: Pick<Evse, 'name' | 'protocolIdentity'>): string {
    return e.name ?? e.protocolIdentity;
}

/** Network Admin of this network, or Super Admin: decides status and app visibility. */
export function isNetworkLevel(me: Me | null, networkId: string): boolean {
    return me?.roles.some((r) => r.role === 'SUPER_ADMIN' || (r.role === 'NETWORK_ADMIN' && r.networkId === networkId)) ?? false;
}

const display = (t: string) => (t === '24:00' ? 'midnight' : t);

/** One line per group of days with the same hours: "Mon–Fri 06:00–22:00", "Sun closed". */
export function hoursSummary(hours: OperatingHours | null | undefined): string[] {
    if (!hours) return [];
    if (hours.type === 'always') return ['Open 24 hours, every day'];
    const text = (d: Weekday) => {
        const ranges = hours.days[d] ?? [];
        if (!ranges.length) return 'closed';
        if (ranges.length === 1 && ranges[0]!.open === '00:00' && ranges[0]!.close === '24:00') return 'open 24 hours';
        return ranges.map((r) => `${display(r.open)}–${display(r.close)}`).join(', ');
    };
    const lines: string[] = [];
    let start = 0;
    for (let i = 1; i <= WEEKDAYS.length; i++) {
        if (i < WEEKDAYS.length && text(WEEKDAYS[i]!) === text(WEEKDAYS[start]!)) continue;
        const from = DAY_LABELS[WEEKDAYS[start]!].slice(0, 3);
        const to = DAY_LABELS[WEEKDAYS[i - 1]!].slice(0, 3);
        lines.push(`${i - 1 === start ? from : `${from}–${to}`} ${text(WEEKDAYS[start]!)}`);
        start = i;
    }
    return lines;
}

export function mapsLink(s: Pick<Station, 'latitude' | 'longitude'>): string | null {
    if (s.latitude === null || s.latitude === undefined || s.longitude === null || s.longitude === undefined) return null;
    return `https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`;
}

/** Reads "6.841234, 79.965432" as copied from Google Maps. Null when empty; undefined when not valid. */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null | undefined {
    const t = text.trim();
    if (!t) return null;
    const m = /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(t);
    if (!m) return undefined;
    const latitude = Math.round(Number(m[1]) * 1e6) / 1e6;
    const longitude = Math.round(Number(m[2]) * 1e6) / 1e6;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
    return { latitude, longitude };
}

export function formatCoordinates(s: Pick<Station, 'latitude' | 'longitude'>): string {
    return s.latitude === null || s.latitude === undefined || s.longitude === null || s.longitude === undefined
        ? ''
        : `${s.latitude}, ${s.longitude}`;
}
