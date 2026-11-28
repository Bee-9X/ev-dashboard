#!/usr/bin/env node
/**
 * Minimal OCPP 1.6J charge point simulator.
 *
 *   node tools/simulate-charger.js --url ws://localhost:3003/ocpp/SIM-001 [--connectors 2] [--power 7400]
 *       [--charge 1] [--id-tag SIM-TAG] [--meter-interval 10]
 *
 * --charge <connector>: after start-up, a car plugs in and charges on that connector (a charging session with meter
 * values), as if a driver had tapped a card. Ctrl+C unplugs it first, so the session ends as completed.
 *
 * Supports: BootNotification, Heartbeat, StatusNotification, Authorize, Start/StopTransaction, MeterValues,
 * and answers RemoteStart/Stop, Reset, ChangeAvailability, UnlockConnector, Get/ChangeConfiguration,
 * ClearCache and TriggerMessage.
 */
const WebSocket = require('ws');
const { randomUUID } = require('crypto');

function createSimulator({
    url,
    connectors = 1,
    powerW = 7400,
    meterIntervalSec = 10,
    reconnect = true,
    log = console.log,
} = {}) {
    let ws = null;
    let stopped = false;
    let heartbeatTimer = null;
    let reconnectTimer = null;
    const pending = new Map();
    const state = {
        connected: false,
        heartbeatInterval: 30,
        connectors: Object.fromEntries(Array.from({ length: connectors }, (_, i) => [i + 1, {
            status: 'Available', meterWh: 1000 * (i + 1), transactionId: null, meterTimer: null, available: true,
        }])),
        config: {
            HeartbeatInterval: { value: '30', readonly: false },
            MeterValueSampleInterval: { value: String(meterIntervalSec), readonly: false },
            MeterValuesSampledData: { value: 'Energy.Active.Import.Register,Power.Active.Import', readonly: false },
            NumberOfConnectors: { value: String(connectors), readonly: true },
            AuthorizeRemoteTxRequests: { value: 'false', readonly: false },
        },
    };

    function call(action, payload) {
        return new Promise((resolve, reject) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error('not connected'));
            const id = randomUUID();
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`${action} timed out`));
            }, 15000);
            pending.set(id, { resolve, reject, timer });
            ws.send(JSON.stringify([2, id, action, payload]));
            log(`-> ${action}`);
        });
    }

    const now = () => new Date().toISOString();

    async function setStatus(connectorId, status, errorCode = 'NoError') {
        if (connectorId > 0) state.connectors[connectorId].status = status;
        await call('StatusNotification', { connectorId, errorCode, status, timestamp: now() });
    }

    function meterPayload(c, connectorId) {
        return {
            connectorId,
            transactionId: c.transactionId ?? undefined,
            meterValue: [{
                timestamp: now(),
                sampledValue: [
                    { value: String(c.meterWh), measurand: 'Energy.Active.Import.Register', unit: 'Wh', context: 'Sample.Periodic' },
                    { value: String(c.transactionId ? powerW : 0), measurand: 'Power.Active.Import', unit: 'W', context: 'Sample.Periodic' },
                ],
            }],
        };
    }

    async function startTransaction(connectorId, idTag) {
        const c = state.connectors[connectorId];
        await setStatus(connectorId, 'Preparing');
        const res = await call('StartTransaction', { connectorId, idTag, meterStart: c.meterWh, timestamp: now() });
        if (res.idTagInfo?.status !== 'Accepted') {
            log(`StartTransaction not accepted (${res.idTagInfo?.status}); stopping`);
            c.transactionId = res.transactionId;
            await stopTransaction(connectorId, 'DeAuthorized');
            return;
        }
        c.transactionId = res.transactionId;
        await setStatus(connectorId, 'Charging');
        c.meterTimer = setInterval(() => {
            c.meterWh += Math.round(powerW * meterIntervalSec / 3600);
            call('MeterValues', meterPayload(c, connectorId)).catch(() => {});
        }, meterIntervalSec * 1000);
    }

    async function stopTransaction(connectorId, reason = 'Remote') {
        const c = state.connectors[connectorId];
        if (c.transactionId === null) return;
        clearInterval(c.meterTimer);
        c.meterTimer = null;
        const transactionId = c.transactionId;
        c.transactionId = null;
        await setStatus(connectorId, 'Finishing');
        await call('StopTransaction', {
            transactionId, meterStop: c.meterWh, timestamp: now(), reason,
            transactionData: [meterPayload({ ...c, transactionId }, connectorId).meterValue[0]],
        });
        await setStatus(connectorId, c.available ? 'Available' : 'Unavailable');
    }

    // Handlers for commands from the central system. Return [response, afterFn?].
    const commandHandlers = {
        RemoteStartTransaction: p => {
            const connectorId = p.connectorId || Number(Object.keys(state.connectors).find(id => state.connectors[id].transactionId === null && state.connectors[id].available));
            const c = state.connectors[connectorId];
            if (!c || c.transactionId !== null || !c.available) return [{ status: 'Rejected' }];
            return [{ status: 'Accepted' }, () => startTransaction(connectorId, p.idTag)];
        },
        RemoteStopTransaction: p => {
            const entry = Object.entries(state.connectors).find(([, c]) => c.transactionId === p.transactionId);
            if (!entry) return [{ status: 'Rejected' }];
            return [{ status: 'Accepted' }, () => stopTransaction(Number(entry[0]), 'Remote')];
        },
        Reset: p => [{ status: 'Accepted' }, async () => {
            for (const id of Object.keys(state.connectors)) await stopTransaction(Number(id), p.type === 'Hard' ? 'HardReset' : 'SoftReset');
            log('Rebooting...');
            ws.close(1000, 'Reset');
        }],
        ChangeAvailability: p => {
            const ids = p.connectorId === 0 ? Object.keys(state.connectors).map(Number) : [p.connectorId];
            if (ids.some(id => !state.connectors[id])) return [{ status: 'Rejected' }];
            const available = p.type === 'Operative';
            const busy = ids.some(id => state.connectors[id].transactionId !== null);
            for (const id of ids) state.connectors[id].available = available;
            if (busy) return [{ status: 'Scheduled' }];
            return [{ status: 'Accepted' }, async () => {
                for (const id of ids) await setStatus(id, available ? 'Available' : 'Unavailable');
            }];
        },
        UnlockConnector: p => [{ status: state.connectors[p.connectorId] ? 'Unlocked' : 'NotSupported' }],
        GetConfiguration: p => {
            const keys = p.key && p.key.length ? p.key : Object.keys(state.config);
            const configurationKey = keys.filter(k => state.config[k]).map(k => ({ key: k, readonly: state.config[k].readonly, value: state.config[k].value }));
            const unknownKey = keys.filter(k => !state.config[k]);
            return [unknownKey.length ? { configurationKey, unknownKey } : { configurationKey }];
        },
        ChangeConfiguration: p => {
            const entry = state.config[p.key];
            if (!entry) return [{ status: 'NotSupported' }];
            if (entry.readonly) return [{ status: 'Rejected' }];
            entry.value = p.value;
            return [{ status: 'Accepted' }];
        },
        ClearCache: () => [{ status: 'Accepted' }],
        TriggerMessage: p => {
            const senders = {
                Heartbeat: () => call('Heartbeat', {}),
                BootNotification: () => boot(),
                StatusNotification: async () => {
                    const ids = p.connectorId ? [p.connectorId] : Object.keys(state.connectors).map(Number);
                    for (const id of ids) await setStatus(id, state.connectors[id].status);
                },
                MeterValues: async () => {
                    const ids = p.connectorId ? [p.connectorId] : Object.keys(state.connectors).map(Number);
                    for (const id of ids) await call('MeterValues', meterPayload(state.connectors[id], id));
                },
            };
            const send = senders[p.requestedMessage];
            if (!send) return [{ status: 'NotImplemented' }];
            return [{ status: 'Accepted' }, send];
        },
    };

    async function boot() {
        const res = await call('BootNotification', {
            chargePointVendor: 'PlugEV-Sim', chargePointModel: 'SIM-1', chargePointSerialNumber: 'SIM-SERIAL-1',
            chargeBoxSerialNumber: 'SIM-BOX-1', firmwareVersion: '0.1.0',
        });
        state.heartbeatInterval = res.interval || 30;
        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => call('Heartbeat', {}).catch(() => {}), state.heartbeatInterval * 1000);
        return res;
    }

    function connect() {
        return new Promise((resolve) => {
            ws = new WebSocket(url, ['ocpp1.6']);
            ws.on('open', async () => {
                state.connected = true;
                log(`Connected to ${url}`);
                try {
                    await boot();
                    await setStatus(0, 'Available');
                    for (const id of Object.keys(state.connectors)) await setStatus(Number(id), state.connectors[id].available ? 'Available' : 'Unavailable');
                } catch (err) {
                    log(`Startup sequence failed: ${err.message}`);
                }
                resolve();
            });
            ws.on('message', async (data) => {
                const msg = JSON.parse(data.toString());
                const [type, id] = msg;
                if (type === 3 || type === 4) {
                    const p = pending.get(id);
                    if (!p) return;
                    pending.delete(id);
                    clearTimeout(p.timer);
                    if (type === 3) p.resolve(msg[2]);
                    else p.reject(new Error(`${msg[2]}: ${msg[3]}`));
                    return;
                }
                if (type === 2) {
                    const [, , action, payload] = msg;
                    log(`<- ${action} ${JSON.stringify(payload)}`);
                    const handler = commandHandlers[action];
                    if (!handler) {
                        ws.send(JSON.stringify([4, id, 'NotImplemented', `${action} not supported by simulator`, {}]));
                        return;
                    }
                    const [response, after] = handler(payload || {});
                    ws.send(JSON.stringify([3, id, response]));
                    if (after) setTimeout(() => after().catch(err => log(`${action} follow-up failed: ${err.message}`)), 50);
                }
            });
            ws.on('close', () => {
                state.connected = false;
                clearInterval(heartbeatTimer);
                for (const c of Object.values(state.connectors)) clearInterval(c.meterTimer);
                for (const [, p] of pending) { clearTimeout(p.timer); p.reject(new Error('closed')); }
                pending.clear();
                log('Disconnected');
                if (!stopped && reconnect) reconnectTimer = setTimeout(() => connect(), 3000);
            });
            ws.on('error', err => log(`WebSocket error: ${err.message}`));
        });
    }

    return {
        state,
        start: connect,
        call,
        /** A car plugs in and a driver authorizes with idTag: starts a session with meter values. */
        async plugIn(connectorId, idTag = 'SIM-TAG') {
            const c = state.connectors[connectorId];
            if (!c) throw new Error(`no connector ${connectorId}`);
            if (c.transactionId !== null) throw new Error(`connector ${connectorId} is already charging`);
            await startTransaction(connectorId, idTag);
        },
        /** The car is unplugged: ends the session on that connector, if any. */
        unplug(connectorId) {
            return stopTransaction(connectorId, 'EVDisconnected');
        },
        stop() {
            stopped = true;
            clearTimeout(reconnectTimer);
            clearInterval(heartbeatTimer);
            for (const c of Object.values(state.connectors)) clearInterval(c.meterTimer);
            if (ws) ws.terminate();
        },
        /** Drop the TCP connection without a close handshake (simulates a network loss). */
        dropConnection() {
            if (ws) ws.terminate();
        },
    };
}

module.exports = { createSimulator };

if (require.main === module) {
    const args = process.argv.slice(2);
    const opt = (name, def) => {
        const i = args.indexOf(`--${name}`);
        return i >= 0 ? args[i + 1] : def;
    };
    const sim = createSimulator({
        url: opt('url', 'ws://localhost:3003/ocpp/SIM-001'),
        connectors: Number(opt('connectors', 1)),
        powerW: Number(opt('power', 7400)),
        meterIntervalSec: Number(opt('meter-interval', 10)),
        log: (...a) => console.log(new Date().toISOString(), ...a),
    });
    const charge = Number(opt('charge', 0));
    sim.start().then(async () => {
        if (!charge) return;
        try {
            await sim.plugIn(charge, opt('id-tag', 'SIM-TAG'));
        } catch (err) {
            console.log(new Date().toISOString(), `Could not start charging: ${err.message}`);
        }
    });
    let stopping = false;
    process.on('SIGINT', async () => {
        if (stopping) process.exit(0); // a second Ctrl+C quits at once
        stopping = true;
        const busy = Object.keys(sim.state.connectors).map(Number).filter(id => sim.state.connectors[id].transactionId !== null);
        if (busy.length) {
            console.log(new Date().toISOString(), 'Unplugging before quitting (Ctrl+C again to quit at once)...');
            await Promise.race([
                Promise.all(busy.map(id => sim.unplug(id).catch(() => {}))),
                new Promise(r => setTimeout(r, 5000)),
            ]);
        }
        sim.stop();
        process.exit(0);
    });
}
