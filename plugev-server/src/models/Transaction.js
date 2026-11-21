const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    // The OCPP transactionId. Ids we issue come from a global sequence; an Orphan keeps whatever id
    // the charger reported, so uniqueness is per charger.
    transactionId: { type: Number, required: true },
    chargerIdentity: { type: String, required: true },
    connectorId: { type: Number, required: true },
    idTag: String,
    stopIdTag: String,
    reservationId: Number,

    startedAt: Date,   // charger timestamp
    meterStart: Number, // Wh
    stoppedAt: Date,
    meterStop: Number,  // Wh
    energyWh: Number,
    stopReason: String,

    // Active: started, no stop yet. Completed: StopTransaction received.
    // Interrupted: superseded by a new StartTransaction on the same connector without a stop.
    // Orphan: a StopTransaction arrived for a transactionId we never issued.
    status: { type: String, enum: ['Active', 'Completed', 'Interrupted', 'Orphan'], default: 'Active' },
    notes: [String],
}, { timestamps: true });

transactionSchema.index({ chargerIdentity: 1, transactionId: 1 }, { unique: true });
transactionSchema.index({ chargerIdentity: 1, connectorId: 1, status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
