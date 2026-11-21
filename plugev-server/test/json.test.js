const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { startStack, waitFor, api } = require('./helpers');
const { createSimulator } = require('../tools/simulate-charger');

let stack;
let sim;

test.before(async () => {
    stack = await startStack();
    sim = createSimulator({ url: `${stack.wsBase}/ocpp/SIM-1`, connectors: 2, meterIntervalSec: 1, log: () => {} });
    await sim.start();
});

test.after(async () => {
    sim?.stop();
    await stack?.stop();
});

const getCharger = async () => (await api(stack.base, 'GET', '/chargers/SIM-1')).body;

test('charger connects, boots and reports connector status', async () => {
    const c = await waitFor(async () => {
        const ch = await getCharger();
        return ch.connectors?.length === 3 ? ch : null;
    }, { message: 'connector statuses' });
    assert.equal(c.connectionState, 'Online');
    assert.equal(c.protocol, 'ocpp1.6-json');
    assert.equal(c.backend, 'JSON');
    assert.equal(c.registered, false);
    assert.equal(c.status, 'Available');
    assert.equal(c.info.chargePointVendor, 'PlugEV-Sim');
    assert.equal(c.info.firmwareVersion, '0.1.0');
});

test('register adopts an already-connected charger', async () => {
    const res = await api(stack.base, 'POST', '/chargers/register', { identity: 'SIM-1', name: 'Sim one', district: 'Colombo', ocppVersion: '1.6 JSON' });
    assert.equal(res.status, 201);
    assert.equal(res.body.charger.registered, true);
    assert.equal(res.body.charger.protocol, 'ocpp1.6-json');
    const again = await api(stack.base, 'POST', '/chargers/register', { identity: 'SIM-1', name: 'x', district: 'y' });
    assert.equal(again.status, 409);
});

test('remote start -> charging session with meter values; heartbeat does not reset status', async () => {
    const res = await api(stack.base, 'POST', '/chargers/SIM-1/commands/RemoteStartTransaction', { idTag: 'TAG1', connectorId: 2 });
    assert.equal(res.status, 200);
    assert.equal(res.body.state, 'Accepted');

    await waitFor(async () => (await getCharger()).status === 'Charging', { message: 'Charging status' });

    await sim.call('Heartbeat', {});
    assert.equal((await getCharger()).status, 'Charging', 'heartbeat must not overwrite connector status');

    const tx = await waitFor(async () => {
        const list = (await api(stack.base, 'GET', '/chargers/SIM-1/transactions')).body;
        return list.find(t => t.status === 'Active');
    }, { message: 'active transaction' });
    assert.equal(tx.connectorId, 2);
    assert.equal(tx.idTag, 'TAG1');

    await waitFor(async () => {
        const c = await getCharger();
        const conn = c.connectors.find(x => x.connectorId === 2);
        return conn.meter?.Power_Active_Import?.value === 7400;
    }, { message: 'live power reading' });
});

test('legacy /stop finds the active transaction and the session completes with energy', async () => {
    const res = await api(stack.base, 'POST', '/chargers/SIM-1/stop', {});
    assert.equal(res.body.success, true);
    assert.equal(res.body.state, 'Accepted');

    const tx = await waitFor(async () => {
        const list = (await api(stack.base, 'GET', '/chargers/SIM-1/transactions')).body;
        return list.find(t => t.status === 'Completed');
    }, { message: 'completed transaction' });
    assert.ok(tx.energyWh >= 0);
    assert.equal(tx.stopReason, 'Remote');

    const mv = (await api(stack.base, 'GET', `/chargers/SIM-1/transactions/${tx.transactionId}/meter-values`)).body;
    assert.ok(mv.some(m => m.source === 'StopTransaction'));
    await waitFor(async () => (await getCharger()).status === 'Available', { message: 'Available after stop' });
});

test('remote stop of an unknown transaction is reported as Rejected, not faked', async () => {
    const res = await api(stack.base, 'POST', '/chargers/SIM-1/commands/RemoteStopTransaction', { transactionId: 999999 });
    assert.equal(res.body.state, 'Rejected');
});

test('configuration commands', async () => {
    const get = await api(stack.base, 'POST', '/chargers/SIM-1/commands/GetConfiguration', {});
    assert.equal(get.body.state, 'Completed');
    const c = (await api(stack.base, 'GET', '/chargers/SIM-1')).body;
    assert.ok(c.configuration.find(k => k.key === 'NumberOfConnectors' && k.readonly === true && k.value === '2'));

    const ro = await api(stack.base, 'POST', '/chargers/SIM-1/commands/ChangeConfiguration', { key: 'NumberOfConnectors', value: '5' });
    assert.equal(ro.body.state, 'Rejected');
    const ok = await api(stack.base, 'POST', '/chargers/SIM-1/commands/ChangeConfiguration', { key: 'HeartbeatInterval', value: '60' });
    assert.equal(ok.body.state, 'Accepted');
});

test('other management commands', async () => {
    assert.equal((await api(stack.base, 'POST', '/chargers/SIM-1/commands/UnlockConnector', { connectorId: 1 })).body.state, 'Unlocked');
    assert.equal((await api(stack.base, 'POST', '/chargers/SIM-1/commands/ClearCache', {})).body.state, 'Accepted');
    assert.equal((await api(stack.base, 'POST', '/chargers/SIM-1/commands/ChangeAvailability', { connectorId: 1, type: 'Inoperative' })).body.state, 'Accepted');
    await waitFor(async () => (await getCharger()).connectors.find(x => x.connectorId === 1).status === 'Unavailable', { message: 'Unavailable connector' });
    assert.equal((await api(stack.base, 'POST', '/chargers/SIM-1/commands/ChangeAvailability', { connectorId: 1, type: 'Operative' })).body.state, 'Accepted');
    assert.equal((await api(stack.base, 'POST', '/chargers/SIM-1/commands/TriggerMessage', { requestedMessage: 'StatusNotification' })).body.state, 'Accepted');
});

test('invalid commands are rejected with 400 and nothing is sent', async () => {
    assert.equal((await api(stack.base, 'POST', '/chargers/SIM-1/commands/Explode', {})).status, 400);
    assert.equal((await api(stack.base, 'POST', '/chargers/SIM-1/commands/Reset', { type: 'Medium' })).status, 400);
    assert.equal((await api(stack.base, 'POST', '/chargers/SIM-1/commands/UnlockConnector', {})).status, 400);
    assert.equal((await api(stack.base, 'POST', '/chargers/NOPE/commands/Reset', { type: 'Soft' })).status, 404);
});

test('unknown inbound action gets a NotImplemented CallError', async () => {
    const ws = new WebSocket(`${stack.wsBase}/ocpp/RAW-1`, ['ocpp1.6']);
    await new Promise(r => ws.on('open', r));
    assert.equal(ws.protocol, 'ocpp1.6');
    const reply = new Promise(r => ws.once('message', d => r(JSON.parse(d.toString()))));
    ws.send(JSON.stringify([2, 'm1', 'SignCertificate', {}]));
    const msg = await reply;
    assert.equal(msg[0], 4);
    assert.equal(msg[2], 'NotImplemented');
    ws.close();
});

test('message log and capability report', async () => {
    const msgs = (await api(stack.base, 'GET', '/chargers/SIM-1/messages?limit=500')).body;
    assert.ok(msgs.some(m => m.direction === 'in' && m.action === 'BootNotification'));
    assert.ok(msgs.some(m => m.direction === 'out' && m.action === 'RemoteStartTransaction'));
    assert.equal(msgs[0].raw, undefined, 'raw frames are excluded unless raw=true');

    const report = (await api(stack.base, 'GET', '/chargers/SIM-1/report')).body;
    const byId = Object.fromEntries(report.checklist.map(c => [c.id, c.status]));
    assert.equal(byId.connect, 'verified');
    assert.equal(byId.status, 'verified');
    assert.equal(byId['remote-start'], 'verified');
    assert.equal(byId['remote-stop'], 'verified');
    assert.equal(byId.session, 'verified');
    assert.equal(byId['meter-values'], 'verified');
    assert.equal(byId.reconciliation, 'verified');
    assert.equal(byId['get-config'], 'verified');
    assert.equal(byId.trigger, 'verified');
    assert.equal(byId.reset, 'not-tested');
});

test('connection loss -> Offline, commands refused, reconnect recorded', async () => {
    sim.dropConnection();
    await waitFor(async () => (await getCharger()).connectionState === 'Offline', { message: 'Offline' });
    assert.equal((await getCharger()).status, 'Offline');

    const cmd = await api(stack.base, 'POST', '/chargers/SIM-1/commands/Reset', { type: 'Soft' });
    assert.equal(cmd.body.state, 'Offline');

    await waitFor(async () => (await getCharger()).connectionState === 'Online', { timeout: 10000, message: 'reconnect' });
    const events = (await api(stack.base, 'GET', '/chargers/SIM-1/connection-events')).body;
    assert.ok(events.some(e => e.event === 'Disconnected'));
    assert.ok(events.some(e => e.event === 'Connected' && typeof e.offlineDurationSec === 'number'));

    const report = (await api(stack.base, 'GET', '/chargers/SIM-1/report')).body;
    assert.equal(report.checklist.find(c => c.id === 'reconnect').status, 'verified');
});
