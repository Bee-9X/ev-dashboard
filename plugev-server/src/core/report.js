/**
 * Phase 0 charger capability report (spec §7.6 protocol selection gate).
 * Everything here is derived from what the charger actually did, so it can be attached to the
 * discovery findings as evidence.
 */
const Charger = require('../models/Charger');
const OcppMessage = require('../models/OcppMessage');
const Command = require('../models/Command');
const Transaction = require('../models/Transaction');
const MeterValue = require('../models/MeterValue');
const ConnectionEvent = require('../models/ConnectionEvent');
const config = require('../config');

const ACCEPTED_STATES = ['Accepted', 'Completed', 'Unlocked', 'Scheduled'];

function check(id, title, status, evidence) {
    return { id, title, status, evidence };
}

function commandCheck(id, title, commandStats, action) {
    const rows = commandStats.filter(r => r.action === action);
    if (rows.length === 0) return check(id, title, 'not-tested', `No ${action} command sent yet`);
    const ok = rows.filter(r => ACCEPTED_STATES.includes(r.state));
    const summary = rows.map(r => `${r.state} x${r.count}`).join(', ');
    return check(id, title, ok.length ? 'verified' : 'failed', `${action}: ${summary}`);
}

async function buildReport(identity) {
    const charger = await Charger.findOne({ identity }).lean();
    if (!charger) return null;

    const [inbound, commandStats, statusPayloads, measurands, txStats, events, recentTx] = await Promise.all([
        OcppMessage.aggregate([
            { $match: { chargerIdentity: identity, direction: 'in', kind: 'CALL' } },
            { $group: { _id: '$action', count: { $sum: 1 }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } },
            { $sort: { _id: 1 } },
        ]),
        Command.aggregate([
            { $match: { chargerIdentity: identity } },
            { $group: { _id: { action: '$action', state: '$state' }, count: { $sum: 1 }, last: { $max: '$createdAt' } } },
            { $project: { _id: 0, action: '$_id.action', state: '$_id.state', count: 1, last: 1 } },
            { $sort: { action: 1, state: 1 } },
        ]),
        OcppMessage.aggregate([
            { $match: { chargerIdentity: identity, direction: 'in', kind: 'CALL', action: 'StatusNotification' } },
            { $group: { _id: { status: '$payload.status', errorCode: '$payload.errorCode', connectorId: '$payload.connectorId' }, count: { $sum: 1 } } },
            { $project: { _id: 0, status: '$_id.status', errorCode: '$_id.errorCode', connectorId: '$_id.connectorId', count: 1 } },
        ]),
        MeterValue.aggregate([
            { $match: { chargerIdentity: identity } },
            { $group: { _id: { measurand: '$measurand', unit: '$unit', phase: '$phase', context: '$context' }, count: { $sum: 1 }, last: { $max: '$timestamp' } } },
            { $project: { _id: 0, measurand: '$_id.measurand', unit: '$_id.unit', phase: '$_id.phase', context: '$_id.context', count: 1, last: 1 } },
            { $sort: { measurand: 1 } },
        ]),
        Transaction.aggregate([
            { $match: { chargerIdentity: identity } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        ConnectionEvent.find({ chargerIdentity: identity }).sort({ at: -1 }).limit(200).lean(),
        Transaction.find({ chargerIdentity: identity, status: 'Completed' }).sort({ stoppedAt: -1 }).limit(20).lean(),
    ]);

    const seen = Object.fromEntries(inbound.map(r => [r._id, r]));
    const txCounts = Object.fromEntries(txStats.map(r => [r._id, r.count]));
    const disconnects = events.filter(e => e.event === 'Disconnected');
    const reconnects = events.filter(e => e.event === 'Connected' && e.offlineDurationSec !== undefined);
    const outageDurations = reconnects.map(e => e.offlineDurationSec);

    const faults = statusPayloads.filter(s => s.status === 'Faulted' || (s.errorCode && s.errorCode !== 'NoError'));

    // Reconciliation: completed sessions that ended with a usable energy figure (meterStop - meterStart >= 0).
    const reconciled = recentTx.filter(tx => tx.energyWh !== undefined && tx.energyWh !== null && tx.energyWh >= 0).length;

    const has = a => Boolean(seen[a]);
    const checklist = [
        check('connect', 'Charger connects and is accepted (BootNotification)',
            has('BootNotification') ? 'verified' : 'not-observed',
            has('BootNotification') ? `${seen.BootNotification.count} boot(s), last ${seen.BootNotification.last.toISOString()}` : 'No BootNotification received'),
        check('heartbeat', 'Heartbeat at the configured interval',
            has('Heartbeat') ? 'verified' : 'not-observed',
            has('Heartbeat') ? `${seen.Heartbeat.count} heartbeat(s)` : 'No Heartbeat received'),
        check('status', 'Connector status reporting (StatusNotification)',
            has('StatusNotification') ? 'verified' : 'not-observed',
            statusPayloads.length ? `Statuses seen: ${[...new Set(statusPayloads.map(s => s.status))].join(', ')}` : 'No StatusNotification received'),
        check('authorize', 'Local authorisation (Authorize)',
            has('Authorize') ? 'verified' : 'not-observed',
            has('Authorize') ? `${seen.Authorize.count} request(s)` : 'No Authorize received (try an RFID card or a plug-and-charge start)'),
        commandCheck('remote-start', 'Remote start (RemoteStartTransaction)', commandStats, 'RemoteStartTransaction'),
        commandCheck('remote-stop', 'Remote stop (RemoteStopTransaction)', commandStats, 'RemoteStopTransaction'),
        check('session', 'Session start/stop events (StartTransaction / StopTransaction)',
            has('StartTransaction') && has('StopTransaction') ? 'verified' : has('StartTransaction') ? 'partial' : 'not-observed',
            `StartTransaction x${seen.StartTransaction?.count || 0}, StopTransaction x${seen.StopTransaction?.count || 0}`),
        check('meter-values', 'Meter values during charging (MeterValues)',
            has('MeterValues') ? 'verified' : 'not-observed',
            measurands.length ? `Measurands: ${measurands.map(m => `${m.measurand}${m.phase ? `(${m.phase})` : ''} [${m.unit || '?'}]`).join(', ')}` : 'No meter samples stored'),
        check('faults', 'Fault reporting (Faulted status / error codes)',
            faults.length ? 'verified' : 'not-observed',
            faults.length ? faults.map(f => `${f.status}/${f.errorCode} x${f.count}`).join(', ') : 'No fault reported yet (trigger one safely, e.g. emergency stop, if the vendor allows)'),
        check('reconnect', 'Reconnect after connection loss',
            reconnects.length ? 'verified' : 'not-observed',
            reconnects.length
                ? `${disconnects.length} disconnect(s); reconnected after ${Math.min(...outageDurations)}–${Math.max(...outageDurations)} s`
                : 'No reconnect observed (unplug the charger network for > OFFLINE_AFTER_SEC and restore it)'),
        check('reconciliation', 'Session reconciliation (meterStop − meterStart, no orphan/interrupted sessions)',
            reconciled > 0 && !txCounts.Orphan && !txCounts.Interrupted ? 'verified'
                : reconciled > 0 ? 'partial' : 'not-observed',
            `Completed ${txCounts.Completed || 0}, Active ${txCounts.Active || 0}, Interrupted ${txCounts.Interrupted || 0}, Orphan ${txCounts.Orphan || 0}`),
        commandCheck('reset', 'Reset', commandStats, 'Reset'),
        commandCheck('unlock', 'Unlock connector', commandStats, 'UnlockConnector'),
        commandCheck('availability', 'Change availability', commandStats, 'ChangeAvailability'),
        commandCheck('get-config', 'Read configuration (GetConfiguration)', commandStats, 'GetConfiguration'),
        commandCheck('change-config', 'Change configuration', commandStats, 'ChangeConfiguration'),
        ...(charger.protocol && charger.protocol.includes('1.6')
            ? [commandCheck('trigger', 'Trigger message (OCPP 1.6 only)', commandStats, 'TriggerMessage')]
            : []),
    ];

    return {
        generatedAt: new Date().toISOString(),
        messageRetentionDays: config.messageRetentionDays,
        charger: {
            identity: charger.identity,
            registered: charger.registered !== false,
            protocol: charger.protocol,
            vendor: charger.vendor,
            model: charger.model,
            chargePointSerialNumber: charger.chargePointSerialNumber,
            chargeBoxSerialNumber: charger.chargeBoxSerialNumber,
            firmwareVersion: charger.firmwareVersion,
            bootInfo: charger.bootInfo,
            endpoint: charger.endpoint,
            endpointOverride: charger.endpointOverride || null,
            ip: charger.ip,
            connectors: (charger.connectors || []).map(c => c.connectorId).sort((a, b) => a - b),
        },
        checklist,
        inboundActions: inbound.map(r => ({ action: r._id, count: r.count, first: r.first, last: r.last })),
        commands: commandStats,
        statusValues: statusPayloads,
        measurands,
        transactions: txCounts,
        connection: {
            disconnects: disconnects.length,
            reconnects: reconnects.length,
            maxOutageSec: outageDurations.length ? Math.max(...outageDurations) : null,
            recentEvents: events.slice(0, 20),
        },
        configuration: charger.configuration || [],
        configurationFetchedAt: charger.configurationFetchedAt || null,
    };
}

module.exports = { buildReport };
