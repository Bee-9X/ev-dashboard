// Runs in its own process, so these env settings only apply here.
process.env.API_KEY = 'test-key';
process.env.ALLOW_UNREGISTERED = 'false';

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { startStack, api } = require('./helpers');

let stack;
const KEY = { 'x-api-key': 'test-key' };

test.before(async () => { stack = await startStack(); });
test.after(async () => { await stack?.stop(); });

test('API requires the key (health stays open)', async () => {
    assert.equal((await api(stack.base, 'GET', '/chargers')).status, 401);
    assert.equal((await api(stack.base, 'GET', '/chargers', undefined, { 'x-api-key': 'wrong' })).status, 401);
    assert.equal((await api(stack.base, 'GET', '/chargers', undefined, KEY)).status, 200);
    assert.equal((await api(stack.base, 'GET', '/health')).status, 200);
});

test('CORS only allows the configured origin', async () => {
    const ok = await fetch(stack.base + '/api/health', { headers: { Origin: 'http://localhost:3000' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    const bad = await fetch(stack.base + '/api/health', { headers: { Origin: 'http://evil.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('unregistered SOAP charger gets BootNotification Rejected and nothing is stored', async () => {
    const xml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
      <bootNotificationRequest xmlns="urn://Ocpp/Cs/2012/06/"><chargePointVendor>A</chargePointVendor><chargePointModel>B</chargePointModel></bootNotificationRequest>
    </soap:Body></soap:Envelope>`;
    const res = await fetch(stack.base + '/ocpp/STRANGER', { method: 'POST', headers: { 'Content-Type': 'application/soap+xml' }, body: xml });
    assert.match(await res.text(), /<status>Rejected<\/status>/);
    assert.equal((await api(stack.base, 'GET', '/chargers/STRANGER', undefined, KEY)).status, 404);

    const hb = await fetch(stack.base + '/ocpp/STRANGER', { method: 'POST', body: xml.replace(/bootNotification/g, 'heartbeat') });
    assert.equal(hb.status, 400);
    assert.match(await hb.text(), /SecurityError/);
});

test('unregistered OCPP-J charger cannot open a WebSocket; registered one can', async () => {
    const refused = await new Promise(resolve => {
        const ws = new WebSocket(`${stack.wsBase}/ocpp/STRANGER-J`, ['ocpp1.6']);
        ws.on('open', () => { ws.close(); resolve(false); });
        ws.on('error', () => resolve(true));
    });
    assert.equal(refused, true);

    const reg = await api(stack.base, 'POST', '/chargers/register', { identity: 'KNOWN-J', name: 'K', district: 'Kandy', ocppVersion: '1.6 JSON' }, KEY);
    assert.equal(reg.status, 201);
    const accepted = await new Promise(resolve => {
        const ws = new WebSocket(`${stack.wsBase}/ocpp/KNOWN-J`, ['ocpp1.6']);
        ws.on('open', () => { ws.close(); resolve(true); });
        ws.on('error', () => resolve(false));
    });
    assert.equal(accepted, true);
});

test('register validates input', async () => {
    assert.equal((await api(stack.base, 'POST', '/chargers/register', { identity: 'X' }, KEY)).status, 400);
    assert.equal((await api(stack.base, 'POST', '/chargers/register', { identity: 'X', name: 'n', district: 'd', ocppVersion: '2.0' }, KEY)).status, 400);
    assert.equal((await api(stack.base, 'POST', '/chargers/register', { identity: 'X', name: 'n', district: 'd', coordinates: { lat: 200, lng: 0 } }, KEY)).status, 400);
});
