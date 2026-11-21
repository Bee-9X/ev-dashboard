const Charger = require('../models/Charger');
const ConnectionEvent = require('../models/ConnectionEvent');
const config = require('../config');
const registry = require('./registry');
const logger = require('../logger');

const PROTOCOL_LABELS = {
    'ocpp1.5-soap': '1.5 SOAP',
    'ocpp1.6-soap': '1.6 SOAP',
    'ocpp1.6-json': '1.6 JSON',
};

function recordEvent(entry) {
    return ConnectionEvent.create(entry).catch(err =>
        logger.warn(`Could not store connection event for ${entry.chargerIdentity}: ${err.message}`));
}

function isFresh(doc, now) {
    return doc.connectionState === 'Online'
        && doc.lastSeenAt
        && now - new Date(doc.lastSeenAt).getTime() < config.offlineAfterSec * 1000;
}

/**
 * Called for every message received from a charger.
 * Creates unregistered chargers when allowed, updates last-seen and marks the charger online.
 * Returns false when the charger is unknown and unregistered chargers are not allowed.
 */
async function touch(identity, { protocol, ip, endpoint } = {}) {
    const now = new Date();
    const set = { lastSeenAt: now, connectionState: 'Online' };
    if (protocol) set.protocol = protocol;
    if (ip) set.ip = ip;
    if (endpoint) set.endpoint = endpoint;

    // With ALLOW_UNREGISTERED=false, only chargers registered in the portal are accepted.
    const filter = config.allowUnregistered ? { identity } : { identity, registered: { $ne: false } };
    let before = await Charger.findOneAndUpdate(filter, { $set: set }, { returnDocument: 'before' });

    if (!before) {
        if (!config.allowUnregistered) return false;
        try {
            await Charger.create({
                identity,
                registered: false,
                ocppVersion: PROTOCOL_LABELS[protocol] || '1.5 SOAP',
                connectedAt: now,
                ...set,
            });
            recordEvent({ chargerIdentity: identity, event: 'Connected', protocol, reason: 'first contact' });
            logger.info(`[${identity}] New unregistered charger (${protocol})`);
            return true;
        } catch (err) {
            if (err.code !== 11000) throw err;
            // Created concurrently by another message; fall through to a normal update.
            before = await Charger.findOneAndUpdate({ identity }, { $set: set }, { returnDocument: 'before' });
        }
    }

    if (before && !isFresh(before, now.getTime())) {
        const offlineDurationSec = before.lastSeenAt
            ? Math.round((now - new Date(before.lastSeenAt)) / 1000)
            : undefined;
        await Charger.updateOne({ identity }, { $set: { connectedAt: now } });
        recordEvent({ chargerIdentity: identity, event: 'Connected', protocol, offlineDurationSec });
        logger.info(`[${identity}] Online (${protocol})` + (offlineDurationSec ? ` after ${offlineDurationSec}s` : ''));
    }
    return true;
}

async function markOffline(identity, reason) {
    const res = await Charger.updateOne(
        { identity, connectionState: 'Online' },
        { $set: { connectionState: 'Offline' } },
    );
    if (res.modifiedCount > 0) {
        recordEvent({ chargerIdentity: identity, event: 'Disconnected', reason });
        logger.info(`[${identity}] Offline (${reason})`);
    }
}

/** Mark chargers offline when nothing has been heard from them within OFFLINE_AFTER_SEC. */
async function sweepStale() {
    const cutoff = new Date(Date.now() - config.offlineAfterSec * 1000);
    const stale = await Charger.find(
        { connectionState: 'Online', lastSeenAt: { $lt: cutoff } },
        { identity: 1 },
    ).lean();
    for (const { identity } of stale) {
        if (registry.isOnline(identity)) continue;
        await markOffline(identity, `no message for more than ${config.offlineAfterSec}s`);
    }
}

/** On startup nothing is connected yet; state from a previous run cannot be trusted. */
async function resetConnectionStates() {
    const online = await Charger.find({ connectionState: 'Online' }, { identity: 1 }).lean();
    for (const { identity } of online) await markOffline(identity, 'server restart');
}

/** Make sure a connector entry exists so positional ($) updates work. */
async function ensureConnector(identity, connectorId) {
    await Charger.updateOne(
        { identity, 'connectors.connectorId': { $ne: connectorId } },
        { $push: { connectors: { connectorId, meter: {} } } },
    );
}

async function updateConnector(identity, connectorId, fields) {
    await ensureConnector(identity, connectorId);
    const set = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) set[`connectors.$.${k}`] = v;
    }
    await Charger.updateOne({ identity, 'connectors.connectorId': connectorId }, { $set: set });
}

// Highest priority first: what the overall charger badge should show.
const STATUS_PRIORITY = [
    'Faulted', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Occupied',
    'Preparing', 'Finishing', 'Reserved', 'Unavailable', 'Available',
];

function overallStatus(doc, online) {
    if (!online) return 'Offline';
    const connectors = doc.connectors || [];
    const cp = connectors.find(c => c.connectorId === 0);
    if (cp && ['Faulted', 'Unavailable'].includes(cp.status)) return cp.status;
    const statuses = connectors.filter(c => c.connectorId > 0 && c.status).map(c => c.status);
    if (statuses.length === 0) return cp?.status || 'Online';
    statuses.sort((a, b) => rank(a) - rank(b));
    return statuses[0];
}

function rank(status) {
    const i = STATUS_PRIORITY.indexOf(status);
    return i === -1 ? STATUS_PRIORITY.length : i;
}

/** Shape returned by the portal API. Keeps the fields the existing frontend already reads. */
function toApi(doc) {
    const now = Date.now();
    const online = registry.isOnline(doc.identity, now) || isFresh(doc, now);
    const protocol = doc.protocol || null;
    return {
        identity: doc.identity,
        registered: doc.registered !== false,
        name: doc.name,
        district: doc.district,
        coordinates: doc.coordinates,
        ocppVersion: doc.ocppVersion,
        protocol,
        backend: protocol ? (protocol.endsWith('json') ? 'JSON' : 'SOAP') : (doc.ocppVersion?.includes('JSON') ? 'JSON' : 'SOAP'),
        connectionState: online ? 'Online' : 'Offline',
        status: overallStatus(doc, online),
        lastSeenAt: doc.lastSeenAt || null,
        lastHeartbeat: doc.lastHeartbeatAt || doc.lastSeenAt || null, // kept for older UI code
        lastHeartbeatAt: doc.lastHeartbeatAt || null,
        lastBootAt: doc.lastBootAt || null,
        connectedAt: doc.connectedAt || null,
        ip: doc.ip || null,
        endpoint: doc.endpoint || null,
        endpointOverride: doc.endpointOverride || null,
        commandEndpoint: doc.endpointOverride || doc.endpoint || null,
        info: {
            chargePointVendor: doc.vendor,
            chargePointModel: doc.model,
            chargeBoxSerialNumber: doc.chargeBoxSerialNumber,
            chargePointSerialNumber: doc.chargePointSerialNumber,
            firmwareVersion: doc.firmwareVersion,
        },
        connectors: (doc.connectors || [])
            .slice()
            .sort((a, b) => a.connectorId - b.connectorId)
            .map(c => ({
                connectorId: c.connectorId,
                status: online ? c.status : 'Offline',
                lastKnownStatus: c.status,
                errorCode: c.errorCode,
                info: c.info,
                vendorErrorCode: c.vendorErrorCode,
                statusTimestamp: c.statusTimestamp,
                updatedAt: c.updatedAt,
                meter: c.meter || {},
            })),
        configurationFetchedAt: doc.configurationFetchedAt || null,
        firmwareStatus: doc.firmwareStatus || null,
        diagnosticsStatus: doc.diagnosticsStatus || null,
        registeredAt: doc.registeredAt,
    };
}

module.exports = {
    PROTOCOL_LABELS,
    touch,
    markOffline,
    sweepStale,
    resetConnectionStates,
    ensureConnector,
    updateConnector,
    overallStatus,
    toApi,
};
