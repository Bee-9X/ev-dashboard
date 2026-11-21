const mongoose = require('mongoose');

// A remote command sent (or attempted) from the portal to a charger (spec §5.3 / §9.4).
const commandSchema = new mongoose.Schema({
    commandId: { type: String, required: true, unique: true }, // correlation id
    chargerIdentity: { type: String, required: true, index: true },
    action: { type: String, required: true },
    payload: mongoose.Schema.Types.Mixed,
    requestedBy: String,
    // Pending: created. Sent: on the wire, waiting. Then one of:
    // Accepted / Rejected / other charger status (e.g. Unlocked, Scheduled, NotSupported),
    // Failed (transport/protocol error), Timeout (no answer), Offline (charger not connected),
    // Unsupported (action not available for the charger's protocol version).
    state: { type: String, required: true, default: 'Pending' },
    response: mongoose.Schema.Types.Mixed,
    error: String,
    sentAt: Date,
    completedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Command', commandSchema);
