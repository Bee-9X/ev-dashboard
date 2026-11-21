/**
 * Protocol-neutral handlers for messages a charger sends to us.
 * Each handler receives ctx = { identity, protocol, version } and the normalised payload
 * (same field names as OCPP-J; SOAP values arrive as strings) and returns the response payload.
 * Keys are returned in OCPP schema sequence order because SOAP serialisation preserves it.
 */
const Charger = require('../models/Charger');
const Transaction = require('../models/Transaction');
const MeterValue = require('../models/MeterValue');
const ConnectionEvent = require('../models/ConnectionEvent');
const { nextSequence } = require('../models/Counter');
const config = require('../config');
const chargerService = require('./chargerService');
const { extractSamples, meterKey } = require('./meter');
const { OcppError } = require('../util/errors');
const logger = require('../logger');

function num(v) {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
}

function str(v) {
    if (v === undefined || v === null || v === '') return undefined;
    return typeof v === 'object' ? (v.value !== undefined ? String(v.value) : JSON.stringify(v)) : String(v);
}

function date(v) {
    const s = str(v);
    if (!s) return undefined;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

function idTagStatus(idTag) {
    if (!idTag) return 'Invalid';
    if (config.idTagAllowList.length === 0) return 'Accepted';
    return config.idTagAllowList.includes(idTag) ? 'Accepted' : 'Invalid';
}

async function storeSamples(ctx, samples, { connectorId, transactionId, source }) {
    if (samples.length === 0) return;
    await MeterValue.insertMany(samples.map(s => ({
        ...s,
        chargerIdentity: ctx.identity,
        connectorId,
        transactionId,
        source,
    })));

    if (connectorId === undefined) return;
    // Keep the newest sample per measurand on the connector for live display.
    const latest = {};
    for (const s of samples) {
        const k = meterKey(s);
        if (!latest[k] || latest[k].timestamp <= s.timestamp) latest[k] = s;
    }
    await chargerService.ensureConnector(ctx.identity, connectorId);
    const set = {};
    for (const [k, s] of Object.entries(latest)) {
        set[`connectors.$.meter.${k}`] = {
            measurand: s.measurand, phase: s.phase, value: s.numericValue ?? s.value, unit: s.unit, timestamp: s.timestamp,
        };
    }
    await Charger.updateOne({ identity: ctx.identity, 'connectors.connectorId': connectorId }, { $set: set });
}

const handlers = {
    async BootNotification(ctx, p) {
        const now = new Date();
        await Charger.updateOne({ identity: ctx.identity }, {
            $set: {
                vendor: str(p.chargePointVendor),
                model: str(p.chargePointModel),
                chargePointSerialNumber: str(p.chargePointSerialNumber),
                chargeBoxSerialNumber: str(p.chargeBoxSerialNumber),
                firmwareVersion: str(p.firmwareVersion),
                bootInfo: p,
                lastBootAt: now,
            },
        });
        ConnectionEvent.create({ chargerIdentity: ctx.identity, event: 'Boot', protocol: ctx.protocol })
            .catch(err => logger.warn(`Could not store boot event: ${err.message}`));

        return ctx.version === '1.5'
            ? { status: 'Accepted', currentTime: now.toISOString(), heartbeatInterval: config.heartbeatIntervalSec }
            : { status: 'Accepted', currentTime: now.toISOString(), interval: config.heartbeatIntervalSec };
    },

    async Heartbeat(ctx) {
        // Deliberately does NOT touch connector status: a heartbeat says nothing about charging state.
        await Charger.updateOne({ identity: ctx.identity }, { $set: { lastHeartbeatAt: new Date() } });
        return { currentTime: new Date().toISOString() };
    },

    async StatusNotification(ctx, p) {
        const connectorId = num(p.connectorId) ?? 0;
        await chargerService.updateConnector(ctx.identity, connectorId, {
            status: str(p.status),
            errorCode: str(p.errorCode),
            info: str(p.info),
            vendorId: str(p.vendorId),
            vendorErrorCode: str(p.vendorErrorCode),
            statusTimestamp: date(p.timestamp),
            updatedAt: new Date(),
        });
        return {};
    },

    async Authorize(ctx, p) {
        return { idTagInfo: { status: idTagStatus(str(p.idTag)) } };
    },

    async StartTransaction(ctx, p) {
        const connectorId = num(p.connectorId) ?? 1;
        const idTag = str(p.idTag);
        const startedAt = date(p.timestamp) || new Date();
        const meterStart = num(p.meterStart);
        const status = idTagStatus(idTag);

        // Idempotency: a charger may resend StartTransaction if it missed our response.
        const existing = await Transaction.findOne({
            chargerIdentity: ctx.identity, connectorId, idTag, startedAt, meterStart,
        });
        if (existing) {
            logger.info(`[${ctx.identity}] Duplicate StartTransaction, re-using transaction ${existing.transactionId}`);
            return { transactionId: existing.transactionId, idTagInfo: { status } };
        }

        // A new start on a connector that still has an open transaction means we missed the stop.
        await Transaction.updateMany(
            { chargerIdentity: ctx.identity, connectorId, status: 'Active' },
            { $set: { status: 'Interrupted' }, $push: { notes: `Superseded by a new StartTransaction at ${startedAt.toISOString()}` } },
        );

        const transactionId = await nextSequence('transactionId');
        await Transaction.create({
            transactionId,
            chargerIdentity: ctx.identity,
            connectorId,
            idTag,
            reservationId: num(p.reservationId),
            startedAt,
            meterStart,
            status: 'Active',
            notes: status === 'Accepted' ? [] : [`idTag ${idTag} not accepted (${status})`],
        });
        return { transactionId, idTagInfo: { status } };
    },

    async StopTransaction(ctx, p) {
        const transactionId = num(p.transactionId);
        const stoppedAt = date(p.timestamp) || new Date();
        const meterStop = num(p.meterStop);
        const stopIdTag = str(p.idTag);

        let tx = await Transaction.findOne({ chargerIdentity: ctx.identity, transactionId });
        if (!tx) {
            logger.warn(`[${ctx.identity}] StopTransaction for unknown transaction ${transactionId}; recording as Orphan`);
            tx = await Transaction.create({
                transactionId: transactionId ?? -Date.now(),
                chargerIdentity: ctx.identity,
                connectorId: 0,
                stopIdTag,
                stoppedAt,
                meterStop,
                stopReason: str(p.reason),
                status: 'Orphan',
                notes: ['StopTransaction received for a transaction this server did not start'],
            });
        } else if (tx.status === 'Completed') {
            logger.info(`[${ctx.identity}] Duplicate StopTransaction for ${transactionId}, ignoring`);
        } else {
            tx.stoppedAt = stoppedAt;
            tx.meterStop = meterStop;
            tx.stopIdTag = stopIdTag;
            tx.stopReason = str(p.reason) || tx.stopReason;
            tx.energyWh = meterStop !== undefined && tx.meterStart !== undefined ? meterStop - tx.meterStart : undefined;
            if (tx.status === 'Interrupted') tx.notes.push('StopTransaction arrived after the transaction was marked Interrupted');
            tx.status = 'Completed';
            await tx.save();
        }

        const samples = extractSamples(p);
        if (samples.length) {
            await storeSamples(ctx, samples, { connectorId: tx.connectorId || undefined, transactionId, source: 'StopTransaction' });
        }

        return stopIdTag ? { idTagInfo: { status: idTagStatus(stopIdTag) } } : {};
    },

    async MeterValues(ctx, p) {
        const connectorId = num(p.connectorId) ?? 0;
        const transactionId = num(p.transactionId);
        await storeSamples(ctx, extractSamples(p), { connectorId, transactionId, source: 'MeterValues' });
        return {};
    },

    async DataTransfer(ctx, p) {
        logger.info(`[${ctx.identity}] DataTransfer vendorId=${str(p.vendorId)} messageId=${str(p.messageId)}`);
        return { status: 'UnknownVendorId' };
    },

    async FirmwareStatusNotification(ctx, p) {
        await Charger.updateOne({ identity: ctx.identity }, { $set: { firmwareStatus: str(p.status) } });
        return {};
    },

    async DiagnosticsStatusNotification(ctx, p) {
        await Charger.updateOne({ identity: ctx.identity }, { $set: { diagnosticsStatus: str(p.status) } });
        return {};
    },
};

const ACTIONS_BY_LOWER = Object.fromEntries(Object.keys(handlers).map(a => [a.toLowerCase(), a]));

/** "bootNotificationRequest" / "BootNotification" / "bootnotification" -> "BootNotification" (or the input if unknown). */
function canonicalAction(name) {
    const base = String(name).replace(/request$/i, '');
    return ACTIONS_BY_LOWER[base.toLowerCase()] || base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Entry point used by every protocol adapter.
 * ctx = { identity, protocol, version, ip, endpoint }
 */
async function handleInbound(ctx, action, payload) {
    const known = await chargerService.touch(ctx.identity, ctx);
    if (!known) {
        if (action === 'BootNotification') {
            logger.warn(`[${ctx.identity}] Rejected BootNotification from unregistered charger`);
            const now = new Date().toISOString();
            return ctx.version === '1.5'
                ? { status: 'Rejected', currentTime: now, heartbeatInterval: config.heartbeatIntervalSec }
                : { status: 'Rejected', currentTime: now, interval: config.heartbeatIntervalSec };
        }
        throw new OcppError('SecurityError', `Charge point ${ctx.identity} is not registered`);
    }

    const handler = handlers[action];
    if (!handler) throw new OcppError('NotImplemented', `Action ${action} is not supported by this server`);
    return handler(ctx, payload || {});
}

module.exports = { handleInbound, canonicalAction, SUPPORTED_ACTIONS: Object.keys(handlers) };
