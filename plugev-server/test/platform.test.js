// The platform link: charger activity is forwarded to plugev-api as events.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const KEY = 'platform-test-key-0123456789abcdefghij';
let platformReply = () => ({ status: 200, body: { applied: 1, unknownIdentities: [] } });
const batches = [];

// a fake plugev-api
const platform = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
        const reply = platformReply();
        if (reply.status === 200) batches.push({ url: req.url, key: req.headers['x-gateway-key'], events: JSON.parse(body).events });
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply.body ?? {}));
    });
});

const { startStack, waitFor } = require('./helpers');

const CS15 = 'urn://Ocpp/Cs/2012/06/';
function envelope(identity, action, body) {
    const element = action.charAt(0).toLowerCase() + action.slice(1) + 'Request';
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:cs="${CS15}">
  <soap:Header>
    <cs:chargeBoxIdentity soap:mustUnderstand="true">${identity}</cs:chargeBoxIdentity>
    <wsa:Action soap:mustUnderstand="true">/${action}</wsa:Action>
    <wsa:MessageID>urn:uuid:${Math.random().toString(16).slice(2)}</wsa:MessageID>
    <wsa:To soap:mustUnderstand="true">http://cs/ocpp</wsa:To>
  </soap:Header>
  <soap:Body><cs:${element}>${body}</cs:${element}></soap:Body>
</soap:Envelope>`;
}

let stack;
const post = (identity, action, body) => fetch(`${stack.base}/ocpp/${identity}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
    body: envelope(identity, action, body),
});
const allEvents = () => batches.flatMap(b => b.events);

test.before(async () => {
    await new Promise(r => platform.listen(0, r));
    process.env.PLATFORM_API_URL = `http://localhost:${platform.address().port}/api/v1`;
    process.env.PLATFORM_GATEWAY_KEY = KEY;
    stack = await startStack();
});

test.after(async () => {
    await stack?.stop();
    platform.close();
});

test('boot, connection and connector status reach the platform with the gateway key', async () => {
    assert.equal((await post('c1', 'BootNotification',
        '<cs:chargePointVendor>SETEC</cs:chargePointVendor><cs:chargePointModel>EVC-50</cs:chargePointModel>'
        + '<cs:chargeBoxSerialNumber>SN42</cs:chargeBoxSerialNumber><cs:firmwareVersion>2.1.7</cs:firmwareVersion>')).status, 200);
    assert.equal((await post('c1', 'StatusNotification',
        '<cs:connectorId>1</cs:connectorId><cs:status>Occupied</cs:status><cs:errorCode>NoError</cs:errorCode>'
        + '<cs:timestamp>2026-11-22T10:00:00Z</cs:timestamp>')).status, 200);

    await waitFor(() => allEvents().some(e => e.type === 'connector_status'), { message: 'status event' });
    const events = allEvents();
    assert.ok(batches.every(b => b.url === '/api/v1/gateway/events' && b.key === KEY));

    assert.deepEqual(events.map(e => e.type).filter(t => t !== 'seen'), ['connected', 'boot', 'connector_status']);
    const boot = events.find(e => e.type === 'boot');
    assert.deepEqual(
        { identity: boot.identity, protocol: boot.protocol, vendor: boot.vendor, model: boot.model, serialNumber: boot.serialNumber, firmwareVersion: boot.firmwareVersion },
        { identity: 'c1', protocol: 'ocpp1.5-soap', vendor: 'SETEC', model: 'EVC-50', serialNumber: 'SN42', firmwareVersion: '2.1.7' },
    );
    const status = events.find(e => e.type === 'connector_status');
    assert.equal(status.connectorNumber, 1);
    assert.equal(status.status, 'Occupied');
    assert.equal(status.statusAt, '2026-11-22T10:00:00.000Z');
    assert.ok(events.every(e => e.id && !Number.isNaN(Date.parse(e.at))));
});

test('heartbeats count as "seen" at most every 20 s, so a busy charger does not flood the platform', async () => {
    const before = allEvents().filter(e => e.type === 'seen').length;
    for (let i = 0; i < 3; i++) await post('c1', 'Heartbeat', '');
    await new Promise(r => setTimeout(r, 1200));
    assert.equal(allEvents().filter(e => e.type === 'seen').length, before);
});

test('events wait while the platform is down and arrive once it is back', async () => {
    let calls = 0;
    platformReply = () => (++calls <= 2 ? { status: 503 } : { status: 200, body: { applied: 1, unknownIdentities: ['c2'] } });
    await post('c2', 'StatusNotification', '<cs:connectorId>0</cs:connectorId><cs:status>Available</cs:status><cs:errorCode>NoError</cs:errorCode>');
    await waitFor(() => allEvents().some(e => e.identity === 'c2' && e.type === 'connector_status'), { timeout: 10000, message: 'retried event' });
    assert.ok(calls >= 3);
});
