/** Shared OCPP helpers: errors, value readers and meter sample extraction (ported from the Phase 0 gateway). */

/** An OCPP-level error; `code` uses OCPP-J CallError codes (NotImplemented, SecurityError, ...). */
export class OcppError extends Error {
    constructor(readonly code: string, description: string, readonly details: Record<string, unknown> = {}) {
        super(description);
    }
}

/** A command could not be delivered or answered (transport problem, timeout, CallError, SOAP fault). */
export class CommandError extends Error {
    constructor(readonly state: 'Failed' | 'Timeout', message: string, readonly details?: unknown) {
        super(message);
    }
}

export type Protocol = 'ocpp1.5-soap' | 'ocpp1.6-soap' | 'ocpp1.6-json';

/** Number, or undefined for anything that is not one. */
export function num(v: unknown): number | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

/** String, or undefined when empty. SOAP elements with attributes arrive as { value }. */
export function str(v: unknown): string | undefined {
    if (v === undefined || v === null || v === '') return undefined;
    if (typeof v === 'object') {
        const value = (v as { value?: unknown }).value;
        return value !== undefined ? String(value) : JSON.stringify(v);
    }
    return String(v);
}

export function date(v: unknown): Date | undefined {
    const s = str(v);
    if (!s) return undefined;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

export function toArray<T = unknown>(v: unknown): T[] {
    if (v === undefined || v === null || v === '') return [];
    return (Array.isArray(v) ? v : [v]) as T[];
}

export interface MeterSample {
    measuredAt: Date;
    measurand: string;
    value: string;
    numericValue: number | null;
    unit: string | null;
    phase: string | null;
    context: string | null;
    location: string | null;
    format: string | null;
}

function sampleFrom(raw: unknown, timestamp: unknown): MeterSample | null {
    const s = (typeof raw === 'object' && raw !== null ? raw : { value: raw }) as Record<string, unknown>;
    const value = s.value === undefined || s.value === null ? undefined : String(s.value);
    if (value === undefined) return null;
    const format = str(s.format) ?? null;
    const numeric = format === 'SignedData' ? NaN : Number.parseFloat(value);
    const measurand = str(s.measurand);
    return {
        measuredAt: date(timestamp) ?? new Date(),
        measurand: measurand ?? 'Energy.Active.Import.Register',
        value,
        numericValue: Number.isFinite(numeric) ? numeric : null,
        unit: str(s.unit) ?? (measurand ? null : 'Wh'),
        phase: str(s.phase) ?? null,
        context: str(s.context) ?? null,
        location: str(s.location) ?? null,
        format,
    };
}

/**
 * Flattens meter readings from any supported OCPP version into samples.
 * OCPP 1.6 (JSON and SOAP): meterValue[] = { timestamp, sampledValue[] = { value, measurand, unit, ... } }
 * OCPP 1.5 (SOAP):          values[]     = { timestamp, value[] = "123" | { value, measurand, unit, ... } }
 * StopTransaction.transactionData: 1.6 = MeterValue[], 1.5 = { values: MeterValue[] }[]
 */
export function extractSamples(payload: Record<string, unknown>): MeterSample[] {
    const groups: unknown[] = [...toArray(payload.meterValue), ...toArray(payload.values)];
    for (const td of toArray(payload.transactionData)) {
        if (td && typeof td === 'object' && (td as Record<string, unknown>).values !== undefined) {
            groups.push(...toArray((td as Record<string, unknown>).values));
        } else {
            groups.push(td);
        }
    }
    const samples: MeterSample[] = [];
    for (const g of groups) {
        if (!g || typeof g !== 'object') continue;
        const group = g as Record<string, unknown>;
        for (const raw of [...toArray(group.sampledValue), ...toArray(group.value)]) {
            const s = sampleFrom(raw, group.timestamp);
            if (s) samples.push(s);
        }
    }
    return samples;
}

/** Key for the latest value of a measurand on a connector, e.g. "Power.Active.Import" or "Current.Import_L1". */
export function meterKey(s: Pick<MeterSample, 'measurand' | 'phase'>): string {
    return s.measurand + (s.phase ? `_${s.phase}` : '');
}
