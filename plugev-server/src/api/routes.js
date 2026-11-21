const express = require('express');
const mongoose = require('mongoose');
const Charger = require('../models/Charger');
const Command = require('../models/Command');
const Transaction = require('../models/Transaction');
const MeterValue = require('../models/MeterValue');
const OcppMessage = require('../models/OcppMessage');
const ConnectionEvent = require('../models/ConnectionEvent');
const config = require('../config');
const chargerService = require('../core/chargerService');
const commands = require('../core/commands');
const { buildReport } = require('../core/report');
const { ValidationError } = require('../util/errors');
const logger = require('../logger');

const OCPP_VERSIONS = ['1.5 SOAP', '1.6 SOAP', '1.6 JSON'];

function limitParam(req, def = 50, max = 500) {
    const n = Number.parseInt(req.query.limit, 10);
    return Number.isInteger(n) && n > 0 ? Math.min(n, max) : def;
}

function validCoordinates(c) {
    if (c === undefined || c === null) return undefined;
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new ValidationError('coordinates must be { lat: -90..90, lng: -180..180 }');
    }
    return { lat, lng };
}

function editableFields(body, { requireAll }) {
    const out = {};
    for (const f of ['name', 'district']) {
        if (body[f] !== undefined) {
            if (typeof body[f] !== 'string' || !body[f].trim() || body[f].length > 200) {
                throw new ValidationError(`${f} must be a non-empty string (max 200 characters)`);
            }
            out[f] = body[f].trim();
        } else if (requireAll) {
            throw new ValidationError('identity, name, and district are required.');
        }
    }
    if (body.ocppVersion !== undefined) {
        if (!OCPP_VERSIONS.includes(body.ocppVersion)) throw new ValidationError(`ocppVersion must be one of ${OCPP_VERSIONS.join(', ')}`);
        out.ocppVersion = body.ocppVersion;
    }
    const coords = validCoordinates(body.coordinates);
    if (coords) out.coordinates = coords;
    return out;
}

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createApiRouter() {
    const router = express.Router();
    router.use(express.json({ limit: '100kb' }));

    // Phase 0 stop-gap protection. Replaced by real user auth + RBAC in Phase 1.
    router.use((req, res, next) => {
        if (!config.apiKey || req.method === 'OPTIONS' || req.path === '/health') return next();
        if (req.get('x-api-key') === config.apiKey) return next();
        return res.status(401).json({ error: 'Missing or invalid API key' });
    });

    router.get('/health', (req, res) => {
        res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
    });

    router.get('/chargers', wrap(async (req, res) => {
        const docs = await Charger.find({}).sort({ registered: -1, identity: 1 }).lean();
        res.json(docs.map(chargerService.toApi));
    }));

    router.post('/chargers/register', wrap(async (req, res) => {
        const identity = typeof req.body.identity === 'string' ? req.body.identity.trim() : '';
        if (!identity || identity.length > 100) throw new ValidationError('identity, name, and district are required.');
        const fields = editableFields(req.body, { requireAll: true });

        const existing = await Charger.findOne({ identity });
        if (existing && existing.registered !== false) {
            return res.status(409).json({ error: 'Charger with this identity already exists.' });
        }
        let doc;
        if (existing) {
            // Charger connected before it was registered: adopt it, keeping everything observed so far.
            Object.assign(existing, fields, { registered: true, registeredAt: new Date() });
            doc = await existing.save();
        } else {
            doc = await Charger.create({ identity, ...fields, registered: true });
        }
        res.status(201).json({ message: 'Charger registered successfully', charger: chargerService.toApi(doc.toObject()) });
    }));

    router.get('/chargers/:id', wrap(async (req, res) => {
        const doc = await Charger.findOne({ identity: req.params.id }).lean();
        if (!doc) return res.status(404).json({ error: 'Charger not found' });
        res.json({ ...chargerService.toApi(doc), configuration: doc.configuration || [], bootInfo: doc.bootInfo || {} });
    }));

    router.patch('/chargers/:id', wrap(async (req, res) => {
        const fields = editableFields(req.body, { requireAll: false });
        const doc = await Charger.findOneAndUpdate({ identity: req.params.id }, { $set: fields }, { returnDocument: 'after' }).lean();
        if (!doc) return res.status(404).json({ error: 'Charger not found' });
        res.json(chargerService.toApi(doc));
    }));

    // --- Commands ---

    router.get('/commands', (req, res) => {
        res.json(Object.entries(commands.DEFINITIONS).map(([action, d]) => ({ action, versions: d.versions })));
    });

    router.post('/chargers/:id/commands/:action', wrap(async (req, res) => {
        const cmd = await commands.execute(req.params.id, req.params.action, req.body || {}, req.get('x-user') || 'portal');
        if (!cmd) return res.status(404).json({ error: 'Charger not found' });
        res.json(cmd);
    }));

    router.get('/chargers/:id/commands', wrap(async (req, res) => {
        res.json(await Command.find({ chargerIdentity: req.params.id }).sort({ createdAt: -1 }).limit(limitParam(req)).lean());
    }));

    router.get('/commands/:commandId', wrap(async (req, res) => {
        const cmd = await Command.findOne({ commandId: req.params.commandId }).lean();
        if (!cmd) return res.status(404).json({ error: 'Command not found' });
        res.json(cmd);
    }));

    // Backwards compatible start/stop used by the existing dashboard widgets.
    const legacy = (action, buildParams) => wrap(async (req, res) => {
        const params = await buildParams(req);
        const cmd = await commands.execute(req.params.id, action, params, req.get('x-user') || 'portal');
        if (!cmd) return res.status(404).json({ error: 'Charger not found' });
        const success = cmd.state === 'Accepted';
        res.json({
            success,
            state: cmd.state,
            message: success
                ? `${action} accepted by the charger (final state is confirmed by subsequent status events).`
                : `${action} ${cmd.state}${cmd.error ? `: ${cmd.error}` : ''}`,
            command: cmd,
        });
    });

    router.post('/chargers/:id/start', legacy('RemoteStartTransaction', async req => ({
        idTag: req.body?.idTag || 'CLIENT_USER',
        connectorId: req.body?.connectorId,
    })));

    router.post('/chargers/:id/stop', legacy('RemoteStopTransaction', async req => {
        if (req.body?.transactionId !== undefined && req.body.transactionId !== '') return { transactionId: req.body.transactionId };
        const active = await commands.findActiveTransaction(req.params.id, req.body?.connectorId);
        if (!active) throw new ValidationError('No active transaction on this charger; pass transactionId explicitly');
        return { transactionId: active.transactionId };
    }));

    // --- Sessions, telemetry, diagnostics ---

    router.get('/transactions', wrap(async (req, res) => {
        const q = {};
        if (req.query.status) q.status = String(req.query.status);
        if (req.query.charger) q.chargerIdentity = String(req.query.charger);
        res.json(await Transaction.find(q).sort({ createdAt: -1 }).limit(limitParam(req)).lean());
    }));

    router.get('/chargers/:id/transactions', wrap(async (req, res) => {
        res.json(await Transaction.find({ chargerIdentity: req.params.id }).sort({ createdAt: -1 }).limit(limitParam(req)).lean());
    }));

    router.get('/chargers/:id/transactions/:txId/meter-values', wrap(async (req, res) => {
        const transactionId = Number(req.params.txId);
        res.json(await MeterValue.find({ chargerIdentity: req.params.id, transactionId })
            .sort({ timestamp: 1 }).limit(limitParam(req, 1000, 10000)).lean());
    }));

    router.get('/chargers/:id/meter-values', wrap(async (req, res) => {
        res.json(await MeterValue.find({ chargerIdentity: req.params.id }).sort({ timestamp: -1 }).limit(limitParam(req, 100, 5000)).lean());
    }));

    router.get('/chargers/:id/messages', wrap(async (req, res) => {
        const q = { chargerIdentity: req.params.id };
        if (req.query.action) q.action = String(req.query.action);
        const projection = req.query.raw === 'true' ? {} : { raw: 0 };
        res.json(await OcppMessage.find(q, projection).sort({ createdAt: -1 }).limit(limitParam(req, 100, 1000)).lean());
    }));

    router.get('/chargers/:id/connection-events', wrap(async (req, res) => {
        res.json(await ConnectionEvent.find({ chargerIdentity: req.params.id }).sort({ at: -1 }).limit(limitParam(req)).lean());
    }));

    router.get('/chargers/:id/report', wrap(async (req, res) => {
        const report = await buildReport(req.params.id);
        if (!report) return res.status(404).json({ error: 'Charger not found' });
        res.json(report);
    }));

    router.use((req, res) => res.status(404).json({ error: 'Not found' }));

    // eslint-disable-next-line no-unused-vars
    router.use((err, req, res, next) => {
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
        logger.error(`API error on ${req.method} ${req.originalUrl}:`, err);
        res.status(500).json({ error: 'Internal server error' });
    });

    return router;
}

module.exports = { createApiRouter };
