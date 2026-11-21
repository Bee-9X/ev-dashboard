const mongoose = require('mongoose');

// Connect / disconnect history, used for outage duration and reconnect behaviour (spec §5.4).
const connectionEventSchema = new mongoose.Schema({
    chargerIdentity: { type: String, required: true },
    event: { type: String, enum: ['Connected', 'Disconnected', 'Boot'], required: true },
    protocol: String,
    reason: String,
    offlineDurationSec: Number, // on Connected: how long it had been offline
    at: { type: Date, default: Date.now },
});

connectionEventSchema.index({ chargerIdentity: 1, at: -1 });

module.exports = mongoose.model('ConnectionEvent', connectionEventSchema);
