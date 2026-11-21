const mongoose = require('mongoose');

const PROTOCOLS = ['ocpp1.5-soap', 'ocpp1.6-soap', 'ocpp1.6-json'];

const connectorSchema = new mongoose.Schema({
    connectorId: { type: Number, required: true }, // 0 = the charge point as a whole
    status: String,          // raw OCPP status (e.g. Available, Occupied, Charging, Faulted)
    errorCode: String,
    info: String,
    vendorId: String,
    vendorErrorCode: String,
    statusTimestamp: Date,   // timestamp reported by the charger
    updatedAt: Date,         // when we received it
    // Latest sample per measurand, e.g. { "Energy.Active.Import.Register": { value, unit, timestamp } }
    meter: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const configurationKeySchema = new mongoose.Schema({
    key: String,
    value: String,
    readonly: Boolean,
}, { _id: false });

const chargerSchema = new mongoose.Schema({
    identity: { type: String, required: true, unique: true },

    // Portal-managed details
    registered: { type: Boolean, default: true },
    name: { type: String, default: 'Unregistered Charger' },
    district: { type: String, default: 'Unknown' },
    coordinates: {
        lat: { type: Number, default: 7.8731 },
        lng: { type: Number, default: 80.7718 },
    },
    // What the admin said the charger uses when registering it
    ocppVersion: { type: String, enum: ['1.5 SOAP', '1.6 SOAP', '1.6 JSON'], default: '1.5 SOAP' },
    registeredAt: { type: Date, default: Date.now },

    // Observed from the device
    protocol: { type: String, enum: PROTOCOLS },
    vendor: String,
    model: String,
    chargePointSerialNumber: String,
    chargeBoxSerialNumber: String,
    firmwareVersion: String,
    bootInfo: { type: mongoose.Schema.Types.Mixed, default: {} }, // full BootNotification payload
    endpoint: String, // SOAP only: where the charger listens for commands (wsa:From)
    ip: String,

    connectionState: { type: String, enum: ['Online', 'Offline'], default: 'Offline' },
    connectedAt: Date,
    lastSeenAt: Date,
    lastHeartbeatAt: Date,
    lastBootAt: Date,

    connectors: { type: [connectorSchema], default: [] },

    configuration: { type: [configurationKeySchema], default: [] },
    configurationFetchedAt: Date,
    firmwareStatus: String,
    diagnosticsStatus: String,
}, { timestamps: true });

chargerSchema.statics.PROTOCOLS = PROTOCOLS;

module.exports = mongoose.model('Charger', chargerSchema);
