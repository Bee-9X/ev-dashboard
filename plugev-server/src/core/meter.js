function toArray(v) {
    if (v === undefined || v === null || v === '') return [];
    return Array.isArray(v) ? v : [v];
}

function sampleFrom(raw, timestamp) {
    const s = typeof raw === 'object' ? raw : { value: raw };
    const value = s.value === undefined ? undefined : String(s.value);
    const format = s.format;
    const numeric = format === 'SignedData' ? NaN : Number.parseFloat(value);
    return {
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        measurand: s.measurand || 'Energy.Active.Import.Register',
        value,
        numericValue: Number.isFinite(numeric) ? numeric : undefined,
        unit: s.unit || (s.measurand ? undefined : 'Wh'),
        phase: s.phase,
        context: s.context,
        location: s.location,
        format,
    };
}

/**
 * Flatten meter readings from any supported OCPP version into a list of samples.
 *
 * OCPP 1.6 (JSON and SOAP): meterValue[] = { timestamp, sampledValue[] = { value, measurand, unit, ... } }
 * OCPP 1.5 (SOAP):          values[]     = { timestamp, value[] = "123" | { value, measurand, unit, ... } }
 * StopTransaction.transactionData: 1.6 = MeterValue[], 1.5 = { values: MeterValue[] }[]
 */
function extractSamples(payload) {
    const groups = [...toArray(payload.meterValue), ...toArray(payload.values)];
    for (const td of toArray(payload.transactionData)) {
        if (td && typeof td === 'object' && td.values !== undefined) groups.push(...toArray(td.values));
        else groups.push(td);
    }

    const samples = [];
    for (const g of groups) {
        if (!g || typeof g !== 'object') continue;
        const raws = [...toArray(g.sampledValue), ...toArray(g.value)];
        for (const raw of raws) samples.push(sampleFrom(raw, g.timestamp));
    }
    return samples;
}

/** Key for the "latest value per measurand" map on a connector. Mongo paths can't contain dots. */
function meterKey(sample) {
    return (sample.measurand + (sample.phase ? `_${sample.phase}` : '')).replace(/[.$]/g, '_');
}

module.exports = { toArray, extractSamples, meterKey };
