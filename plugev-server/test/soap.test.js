const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startStack, waitFor, api } = require('./helpers');
const { parseSoap } = require('../src/util/xml');

let stack;
let cp;            // fake charge point endpoint (receives our commands)
let cpUrl;
const received = [];
let cpReply = () => ({ status: 'Accepted' });

const CS15 = 'urn://Ocpp/Cs/2012/06/';
const CS16 = 'urn://Ocpp/Cs/2015/10/';

function envelope({ ns, identity, action, body, from, messageId = `urn:uuid:${Math.random().toString(16).slice(2)}` }) {
    const element = action.charAt(0).toLowerCase() + action.slice(1) + 'Request';
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:cs="${ns}">
  <soap:Header>
    <cs:chargeBoxIdentity soap:mustUnderstand="true">${identity}</cs:chargeBoxIdentity>
    <wsa:Action soap:mustUnderstand="true">/${action}</wsa:Action>
    <wsa:MessageID>${messageId}</wsa:MessageID>
    ${from ? `<wsa:From><wsa:Address>${from}</wsa:Address></wsa:From>` : ''}
    <wsa:ReplyTo><wsa:Address>http://www.w3.org/2005/08/addressing/anonymous</wsa:Address></wsa:ReplyTo>
    <wsa:To soap:mustUnderstand="true">http://cs/ocpp</wsa:To>
  </soap:Header>
  <soap:Body><cs:${element}>${body}</cs:${element}></soap:Body>
</soap:Envelope>`;
}

async function post(xml, path = '/ocpp/CB-15') {
    const res = await fetch(stack.base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
        body: xml,
    });
    const text = await res.text();
    return { status: res.status, text, parsed: await parseSoap(text) };
}

test.before(async () => {
    stack = await startStack();
    cp = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', async () => {
            const parsed = await parseSoap(body);
            received.push({ body, parsed, contentType: req.headers['content-type'] });
            const responseElement = parsed.bodyElement.replace(/Request$/, 'Response');
            res.setHeader('Content-Type', 'application/soap+xml');
            res.end(`<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>
              <${responseElement} xmlns="urn://Ocpp/Cp/2012/06/">${Object.entries(cpReply(parsed)).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</${responseElement}>
              </s:Body></s:Envelope>`);
        });
    });
    await new Promise(r => cp.listen(0, r));
    cpUrl = `http://localhost:${cp.address().port}/`;
});

test.after(async () => {
    cp?.close();
    await stack?.stop();
});

test('OCPP 1.5 BootNotification is answered in the 1.5 format with WS-Addressing headers', async () => {
    const r = await post(envelope({
        ns: CS15, identity: 'CB-15', action: 'BootNotification', from: cpUrl, messageId: 'urn:uuid:boot-1',
        body: '<cs:chargePointVendor>Setec</cs:chargePointVendor><cs:chargePointModel>S1</cs:chargePointModel><cs:chargeBoxSerialNumber>SN1</cs:chargeBoxSerialNumber><cs:firmwareVersion>1.2</cs:firmwareVersion>',
    }));
    assert.equal(r.status, 200);
    assert.equal(r.parsed.bodyElement, 'bootNotificationResponse');
    assert.deepEqual(Object.keys(r.parsed.payload), ['status', 'currentTime', 'heartbeatInterval']);
    assert.equal(r.parsed.payload.status, 'Accepted');
    assert.equal(r.parsed.header.RelatesTo, 'urn:uuid:boot-1');
    assert.equal(r.parsed.header.Action, '/BootNotificationResponse');
    assert.equal(r.parsed.header.To, cpUrl);
    assert.match(r.text, /<bootNotificationResponse xmlns="urn:\/\/Ocpp\/Cs\/2012\/06\/">/);

    const c = (await api(stack.base, 'GET', '/chargers/CB-15')).body;
    assert.equal(c.protocol, 'ocpp1.5-soap');
    assert.equal(c.info.chargePointVendor, 'Setec');
    assert.equal(c.endpoint, cpUrl);
    assert.equal(c.connectionState, 'Online');
});

test('1.5 StatusNotification (Occupied) then Heartbeat keeps the status', async () => {
    await post(envelope({ ns: CS15, identity: 'CB-15', action: 'StatusNotification',
        body: '<cs:connectorId>1</cs:connectorId><cs:status>Occupied</cs:status><cs:errorCode>NoError</cs:errorCode>' }));
    const hb = await post(envelope({ ns: CS15, identity: 'CB-15', action: 'Heartbeat', body: '' }));
    assert.ok(hb.parsed.payload.currentTime);
    const c = (await api(stack.base, 'GET', '/chargers/CB-15')).body;
    assert.equal(c.status, 'Occupied');
});

let txId;
test('1.5 Start/MeterValues/Stop transaction lifecycle', async () => {
    const start = await post(envelope({ ns: CS15, identity: 'CB-15', action: 'StartTransaction',
        body: '<cs:connectorId>1</cs:connectorId><cs:idTag>RFID1</cs:idTag><cs:timestamp>2026-11-20T10:00:00Z</cs:timestamp><cs:meterStart>1000</cs:meterStart>' }));
    txId = Number(start.parsed.payload.transactionId);
    assert.ok(txId > 0);
    assert.equal(start.parsed.payload.idTagInfo.status, 'Accepted');
    assert.deepEqual(Object.keys(start.parsed.payload), ['transactionId', 'idTagInfo']);

    // Duplicate StartTransaction (charger retry) re-uses the id.
    const dup = await post(envelope({ ns: CS15, identity: 'CB-15', action: 'StartTransaction',
        body: '<cs:connectorId>1</cs:connectorId><cs:idTag>RFID1</cs:idTag><cs:timestamp>2026-11-20T10:00:00Z</cs:timestamp><cs:meterStart>1000</cs:meterStart>' }));
    assert.equal(Number(dup.parsed.payload.transactionId), txId);

    await post(envelope({ ns: CS15, identity: 'CB-15', action: 'MeterValues',
        body: `<cs:connectorId>1</cs:connectorId><cs:transactionId>${txId}</cs:transactionId>
               <cs:values><cs:timestamp>2026-11-20T10:05:00Z</cs:timestamp>
                 <cs:value unit="Wh" measurand="Energy.Active.Import.Register" context="Sample.Periodic">1500</cs:value>
                 <cs:value unit="W" measurand="Power.Active.Import">6000</cs:value>
               </cs:values>` }));

    const stop = await post(envelope({ ns: CS15, identity: 'CB-15', action: 'StopTransaction',
        body: `<cs:transactionId>${txId}</cs:transactionId><cs:idTag>RFID1</cs:idTag><cs:timestamp>2026-11-20T10:30:00Z</cs:timestamp><cs:meterStop>4000</cs:meterStop>
               <cs:transactionData><cs:values><cs:timestamp>2026-11-20T10:30:00Z</cs:timestamp><cs:value>4000</cs:value></cs:values></cs:transactionData>` }));
    assert.equal(stop.parsed.payload.idTagInfo.status, 'Accepted');

    const txs = (await api(stack.base, 'GET', '/chargers/CB-15/transactions')).body;
    const tx = txs.find(t => t.transactionId === txId);
    assert.equal(tx.status, 'Completed');
    assert.equal(tx.energyWh, 3000);

    const mv = (await api(stack.base, 'GET', `/chargers/CB-15/transactions/${txId}/meter-values`)).body;
    assert.equal(mv.length, 3);
    assert.ok(mv.find(m => m.measurand === 'Power.Active.Import' && m.numericValue === 6000 && m.unit === 'W'));

    const c = (await api(stack.base, 'GET', '/chargers/CB-15')).body;
    assert.equal(c.connectors.find(x => x.connectorId === 1).meter.Power_Active_Import.value, 6000);
});

test('StopTransaction for an unknown id is kept as an Orphan session', async () => {
    await post(envelope({ ns: CS15, identity: 'CB-15', action: 'StopTransaction',
        body: '<cs:transactionId>777</cs:transactionId><cs:timestamp>2026-11-20T11:00:00Z</cs:timestamp><cs:meterStop>5000</cs:meterStop>' }));
    const txs = (await api(stack.base, 'GET', '/transactions?status=Orphan')).body;
    assert.ok(txs.find(t => t.transactionId === 777 && t.chargerIdentity === 'CB-15'));
});

test('outbound SOAP command reaches the charger endpoint with a valid OCPP-S envelope', async () => {
    cpReply = () => ({ status: 'Accepted' });
    const res = await api(stack.base, 'POST', '/chargers/CB-15/commands/RemoteStartTransaction', { idTag: 'ADMIN', connectorId: 1 });
    assert.equal(res.body.state, 'Accepted', JSON.stringify(res.body));

    const req = received.at(-1);
    assert.equal(req.parsed.bodyElement, 'remoteStartTransactionRequest');
    assert.equal(req.parsed.header.chargeBoxIdentity, 'CB-15');
    assert.equal(req.parsed.header.Action, '/RemoteStartTransaction');
    assert.equal(req.parsed.version, '1.5');
    assert.deepEqual(Object.keys(req.parsed.payload), ['idTag', 'connectorId']);
    assert.match(req.contentType, /application\/soap\+xml/);
});

test('charger rejection is reported as Rejected', async () => {
    cpReply = () => ({ status: 'Rejected' });
    const res = await api(stack.base, 'POST', '/chargers/CB-15/commands/Reset', { type: 'Soft' });
    assert.equal(res.body.state, 'Rejected');
    cpReply = () => ({ status: 'Accepted' });
});

test('TriggerMessage is refused for an OCPP 1.5 charger without sending anything', async () => {
    const before = received.length;
    const res = await api(stack.base, 'POST', '/chargers/CB-15/commands/TriggerMessage', { requestedMessage: 'Heartbeat' });
    assert.equal(res.body.state, 'Unsupported');
    assert.equal(received.length, before);
});

test('unreachable charger endpoint -> Failed, with no simulated success', async () => {
    await post(envelope({ ns: CS16, identity: 'CB-16', action: 'BootNotification', from: 'http://127.0.0.1:1/unreachable',
        body: '<cs:chargePointVendor>X</cs:chargePointVendor><cs:chargePointModel>Y</cs:chargePointModel>' }), '/ocpp/CB-16');
    const res = await api(stack.base, 'POST', '/chargers/CB-16/start', { idTag: 'T' });
    assert.equal(res.body.success, false);
    assert.equal(res.body.state, 'Failed');
    assert.match(res.body.message, /Could not reach charger/);
    const c = (await api(stack.base, 'GET', '/chargers/CB-16')).body;
    assert.notEqual(c.status, 'Charging');
    assert.equal(c.protocol, 'ocpp1.6-soap');
});

test('1.6 SOAP boot uses "interval" and identity falls back to the URL', async () => {
    const xml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
      <bootNotificationRequest xmlns="${CS16}"><chargePointVendor>A</chargePointVendor><chargePointModel>B</chargePointModel></bootNotificationRequest>
    </soap:Body></soap:Envelope>`;
    const r = await post(xml, '/webServices/ocpp/URL-ID');
    assert.deepEqual(Object.keys(r.parsed.payload), ['status', 'currentTime', 'interval']);
    assert.equal((await api(stack.base, 'GET', '/chargers/URL-ID')).status, 200);
});

test('malformed XML gets a SOAP fault, discovery GET gets 200', async () => {
    const bad = await fetch(stack.base + '/ocpp/CB-15', { method: 'POST', body: '<not-xml' });
    assert.equal(bad.status, 400);
    const get = await fetch(stack.base + '/ocpp/CB-15');
    assert.equal(get.status, 200);
});
