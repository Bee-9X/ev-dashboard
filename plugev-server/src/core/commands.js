const { randomUUID } = require('crypto');
const Command = require('../models/Command');
const Charger = require('../models/Charger');
const Transaction = require('../models/Transaction');
const config = require('../config');
const registry = require('./registry');
const { toArray } = require('./meter');
const { ValidationError, CommandError } = require('../util/errors');
const logger = require('../logger');

function requireInt(v, name, { min = 0 } = {}) {
    const n = Number(v);
    if (v === undefined || v === null || v === '' || !Number.isInteger(n) || n < min) {
        throw new ValidationError(`${name} must be an integer >= ${min}`);
    }
    return n;
}

function optionalInt(v, name, opts) {
    return v === undefined || v === null || v === '' ? undefined : requireInt(v, name, opts);
}

function requireOneOf(v, name, allowed) {
    if (!allowed.includes(v)) throw new ValidationError(`${name} must be one of ${allowed.join(', ')}`);
    return v;
}

function requireString(v, name, max = 500) {
    if (typeof v !== 'string' || v.trim() === '' || v.length > max) {
        throw new ValidationError(`${name} is required (max ${max} characters)`);
    }
    return v.trim();
}

const TRIGGERABLE = [
    'BootNotification', 'DiagnosticsStatusNotification', 'FirmwareStatusNotification',
    'Heartbeat', 'MeterValues', 'StatusNotification',
];

/**
 * Supported commands. `build` validates portal input and returns the OCPP payload with keys in
 * schema sequence order (SOAP is order sensitive). `versions` lists the OCPP versions that define it.
 */
const DEFINITIONS = {
    RemoteStartTransaction: {
        versions: ['1.5', '1.6'],
        build: p => ({
            idTag: requireString(p.idTag, 'idTag', 20),
            connectorId: optionalInt(p.connectorId, 'connectorId', { min: 1 }),
        }),
    },
    RemoteStopTransaction: {
        versions: ['1.5', '1.6'],
        build: p => ({ transactionId: requireInt(p.transactionId, 'transactionId', { min: -2147483648 }) }),
    },
    Reset: {
        versions: ['1.5', '1.6'],
        build: p => ({ type: requireOneOf(p.type, 'type', ['Soft', 'Hard']) }),
    },
    ChangeAvailability: {
        versions: ['1.5', '1.6'],
        build: p => ({
            connectorId: requireInt(p.connectorId ?? 0, 'connectorId'),
            type: requireOneOf(p.type, 'type', ['Operative', 'Inoperative']),
        }),
    },
    UnlockConnector: {
        versions: ['1.5', '1.6'],
        build: p => ({ connectorId: requireInt(p.connectorId, 'connectorId', { min: 1 }) }),
    },
    GetConfiguration: {
        versions: ['1.5', '1.6'],
        build: p => {
            const keys = toArray(p.key).map(k => requireString(k, 'key', 50));
            return keys.length ? { key: keys } : {};
        },
    },
    ChangeConfiguration: {
        versions: ['1.5', '1.6'],
        build: p => ({
            key: requireString(p.key, 'key', 50),
            value: requireString(String(p.value ?? ''), 'value', 500),
        }),
    },
    ClearCache: {
        versions: ['1.5', '1.6'],
        build: () => ({}),
    },
    TriggerMessage: {
        versions: ['1.6'],
        build: p => ({
            requestedMessage: requireOneOf(p.requestedMessage, 'requestedMessage', TRIGGERABLE),
            connectorId: optionalInt(p.connectorId, 'connectorId', { min: 0 }),
        }),
    },
};

function versionOf(protocol) {
    if (!protocol) return null;
    return protocol.includes('1.5') ? '1.5' : '1.6';
}

function finalState(action, response) {
    if (response && typeof response === 'object' && typeof response.status === 'string' && response.status) {
        return response.status; // Accepted, Rejected, Unlocked, UnlockFailed, NotSupported, Scheduled, ...
    }
    return 'Completed'; // e.g. GetConfiguration has no status field
}

async function afterAccepted(identity, action, response) {
    if (action === 'GetConfiguration' && response) {
        const keys = toArray(response.configurationKey).map(k => ({
            key: String(k.key),
            value: k.value === undefined ? undefined : String(k.value),
            readonly: String(k.readonly) === 'true',
        }));
        // Only replace the stored snapshot when the full configuration was requested.
        await Charger.updateOne({ identity }, { $set: { configuration: keys, configurationFetchedAt: new Date() } });
    }
}

/**
 * Validate, record and deliver a command, then wait for the charger's answer.
 * Always resolves with the stored Command document (state tells the outcome);
 * throws ValidationError for bad input and returns null if the charger does not exist.
 */
async function execute(identity, action, params = {}, requestedBy = 'portal') {
    const def = DEFINITIONS[action];
    if (!def) throw new ValidationError(`Unknown command ${action}. Supported: ${Object.keys(DEFINITIONS).join(', ')}`);

    const charger = await Charger.findOne({ identity }).lean();
    if (!charger) return null;

    const payload = def.build(params);
    const cmd = await Command.create({
        commandId: randomUUID(),
        chargerIdentity: identity,
        action,
        payload,
        requestedBy,
        state: 'Pending',
    });

    const finish = async (fields) => {
        Object.assign(cmd, fields, { completedAt: new Date() });
        await cmd.save();
        logger.info(`[${identity}] Command ${action} ${cmd.commandId} -> ${cmd.state}${cmd.error ? ` (${cmd.error})` : ''}`);
        return cmd.toObject();
    };

    const session = registry.get(identity);
    if (!session || !registry.isOnline(identity)) {
        return finish({ state: 'Offline', error: 'Charger is not connected' });
    }

    const version = session.version || versionOf(charger.protocol);
    if (!def.versions.includes(version)) {
        return finish({ state: 'Unsupported', error: `${action} is not defined in OCPP ${version}` });
    }

    cmd.state = 'Sent';
    cmd.sentAt = new Date();
    await cmd.save();

    const timeoutMs = session.protocol.endsWith('soap') ? config.soapCommandTimeoutMs : config.commandTimeoutMs;
    try {
        const response = await session.sendCommand(action, payload, timeoutMs);
        const state = finalState(action, response);
        if (state === 'Accepted' || state === 'Completed') await afterAccepted(identity, action, response);
        return finish({ state, response });
    } catch (err) {
        if (err instanceof CommandError) return finish({ state: err.state, error: err.message, response: err.details });
        logger.error(`[${identity}] Unexpected error sending ${action}:`, err);
        return finish({ state: 'Failed', error: err.message });
    }
}

/** Latest open transaction on a charger (optionally a specific connector). */
async function findActiveTransaction(identity, connectorId) {
    const q = { chargerIdentity: identity, status: 'Active' };
    if (connectorId !== undefined) q.connectorId = connectorId;
    return Transaction.findOne(q).sort({ startedAt: -1 }).lean();
}

module.exports = { execute, findActiveTransaction, DEFINITIONS, TRIGGERABLE };
