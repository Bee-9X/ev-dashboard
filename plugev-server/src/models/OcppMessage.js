const mongoose = require('mongoose');
const config = require('../config');

// Every OCPP message in both directions, kept for a limited diagnostic window.
// This is the main evidence source for the Phase 0 charger capability report.
const ocppMessageSchema = new mongoose.Schema({
    chargerIdentity: { type: String, required: true },
    protocol: String,
    direction: { type: String, enum: ['in', 'out'], required: true }, // relative to this server
    kind: { type: String, enum: ['CALL', 'CALLRESULT', 'CALLERROR'], required: true },
    action: String,
    messageId: String,
    payload: mongoose.Schema.Types.Mixed, // normalised payload
    error: mongoose.Schema.Types.Mixed,
    raw: String,                          // raw frame / XML (truncated)
    createdAt: { type: Date, default: Date.now },
});

ocppMessageSchema.index({ chargerIdentity: 1, createdAt: -1 });
ocppMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: config.messageRetentionDays * 24 * 3600 });

module.exports = mongoose.model('OcppMessage', ocppMessageSchema);
