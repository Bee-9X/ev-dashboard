const mongoose = require('mongoose');

const chargerSchema = new mongoose.Schema({
    identity: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    district: {
        type: String,
        required: true
    },
    coordinates: {
        lat: {
            type: Number,
            default: 7.8731
        },
        lng: {
            type: Number,
            default: 80.7718
        }
    },
    registeredAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Charger', chargerSchema);
