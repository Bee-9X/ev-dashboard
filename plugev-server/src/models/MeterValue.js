const mongoose = require('mongoose');

// One document per sampled value (spec §8.1 meter_values).
const meterValueSchema = new mongoose.Schema({
    chargerIdentity: { type: String, required: true },
    connectorId: Number,
    transactionId: Number,
    timestamp: Date,
    measurand: { type: String, default: 'Energy.Active.Import.Register' },
    value: String,       // raw value as sent (may be a signed/encoded value)
    numericValue: Number,
    unit: String,
    phase: String,
    context: String,
    location: String,
    format: String,
    source: { type: String, enum: ['MeterValues', 'StopTransaction'], default: 'MeterValues' },
}, { timestamps: { createdAt: true, updatedAt: false } });

meterValueSchema.index({ chargerIdentity: 1, timestamp: -1 });
meterValueSchema.index({ transactionId: 1, timestamp: 1 });

module.exports = mongoose.model('MeterValue', meterValueSchema);
