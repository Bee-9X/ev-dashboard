import type { DataSource, EntityManager } from 'typeorm';

/** What a session's latest meter readings say (FR MON 004, FR APP 007). Null where the charger did not report it. */
export interface SessionLiveView {
    /** Energy delivered so far: latest energy register minus the meter start. */
    energyWh: number | null;
    powerW: number | null;
    /** Battery state of charge, if the charger reports it (DC chargers usually do). */
    socPercent: number | null;
    /** Time of the newest reading used. */
    readingAt: Date | null;
}

const ENERGY = 'Energy.Active.Import.Register';
const POWER = 'Power.Active.Import';
const SOC = 'SoC';

/** OCPP's default units are Wh and W; chargers may also report kWh and kW. */
function toBaseUnit(value: number, unit: string | null): number {
    const u = (unit ?? '').toLowerCase();
    return u === 'kwh' || u === 'kw' ? value * 1000 : value;
}

interface LatestRow {
    session_id: string;
    measurand: string;
    phase: string | null;
    unit: string | null;
    numeric_value: number;
    measured_at: Date;
}

/**
 * Latest energy, power and state of charge per session, from the stored meter values.
 * A value without a phase is the total; when a charger only reports phases, they are added up.
 */
export async function latestReadings(
    db: DataSource | EntityManager,
    sessions: { id: string; meterStartWh: number | null }[],
): Promise<Map<string, SessionLiveView>> {
    const result = new Map<string, SessionLiveView>();
    if (!sessions.length) return result;
    const rows: LatestRow[] = await db.query(
        `SELECT DISTINCT ON (session_id, measurand, COALESCE(phase, ''))
                session_id, measurand, phase, unit, numeric_value, measured_at
         FROM meter_values
         WHERE session_id = ANY($1::uuid[]) AND numeric_value IS NOT NULL AND measurand = ANY($2::text[])
           AND (location IS NULL OR location = 'Outlet')
         ORDER BY session_id, measurand, COALESCE(phase, ''), measured_at DESC, id DESC`,
        [sessions.map(s => s.id), [ENERGY, POWER, SOC]],
    );

    for (const s of sessions) {
        const own = rows.filter(r => r.session_id === s.id);
        const pick = (measurand: string, sumPhases: boolean): { value: number; at: Date } | null => {
            const all = own.filter(r => r.measurand === measurand);
            const total = all.find(r => r.phase === null);
            if (total) return { value: toBaseUnit(Number(total.numeric_value), total.unit), at: total.measured_at };
            // phase values like L1-N are voltages between phases and neutral: only add up plain L1/L2/L3
            const phases = all.filter(r => /^L[123]$/.test(r.phase ?? ''));
            if (!phases.length) return null;
            const value = sumPhases
                ? phases.reduce((sum, r) => sum + toBaseUnit(Number(r.numeric_value), r.unit), 0)
                : toBaseUnit(Number(phases[0]!.numeric_value), phases[0]!.unit);
            return { value, at: new Date(Math.max(...phases.map(r => r.measured_at.getTime()))) };
        };
        const energy = pick(ENERGY, true);
        const power = pick(POWER, true);
        const soc = pick(SOC, false);
        const times = [energy?.at, power?.at, soc?.at].filter((d): d is Date => !!d).map(d => d.getTime());
        result.set(s.id, {
            energyWh: energy && s.meterStartWh !== null ? Math.max(0, round(energy.value - s.meterStartWh)) : null,
            powerW: power ? round(power.value) : null,
            socPercent: soc ? round(soc.value) : null,
            readingAt: times.length ? new Date(Math.max(...times)) : null,
        });
    }
    return result;
}

const round = (n: number) => Math.round(n * 1000) / 1000;
