const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSoap, toXml, buildRequestEnvelope } = require('../src/util/xml');
const { extractSamples } = require('../src/core/meter');
const { canonicalAction } = require('../src/core/handlers');
const { responseElementFor } = require('../src/adapters/ocppSoap');
const { overallStatus } = require('../src/core/chargerService');

test('parseSoap strips prefixes and detects OCPP 1.5', async () => {
    const xml = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:cs="urn://Ocpp/Cs/2012/06/">
 <s:Header><cs:chargeBoxIdentity s:mustUnderstand="true">CB1</cs:chargeBoxIdentity><a:Action>/BootNotification</a:Action>
 <a:MessageID>urn:uuid:abc</a:MessageID><a:From><a:Address>http://10.0.0.5:8080/</a:Address></a:From></s:Header>
 <s:Body><cs:bootNotificationRequest><cs:chargePointVendor>V</cs:chargePointVendor><cs:chargePointModel>M</cs:chargePointModel></cs:bootNotificationRequest></s:Body>
</s:Envelope>`;
    const p = await parseSoap(xml);
    assert.equal(p.version, '1.5');
    assert.equal(p.namespace, 'urn://Ocpp/Cs/2012/06/');
    assert.equal(p.bodyElement, 'bootNotificationRequest');
    assert.equal(p.header.chargeBoxIdentity, 'CB1');
    assert.equal(p.header.From.Address, 'http://10.0.0.5:8080/');
    assert.deepEqual(p.payload, { chargePointVendor: 'V', chargePointModel: 'M' });
});

test('parseSoap reports SOAP faults', async () => {
    const xml = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><s:Fault>
      <s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Bad thing</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;
    const p = await parseSoap(xml);
    assert.equal(p.fault.reason, 'Bad thing');
});

test('toXml keeps key order, repeats arrays and escapes text', () => {
    assert.equal(
        toXml({ idTag: 'A<&>', connectorId: 1, key: ['x', 'y'], skip: undefined }),
        '<idTag>A&lt;&amp;&gt;</idTag><connectorId>1</connectorId><key>x</key><key>y</key>',
    );
});

test('request envelope carries chargeBoxIdentity and default namespace on the body element', () => {
    const xml = buildRequestEnvelope({ version: '1.5', identity: 'CB1', action: 'RemoteStartTransaction', to: 'http://cp/', messageId: 'm1', payload: { idTag: 'T' } });
    assert.match(xml, /<cp:chargeBoxIdentity>CB1<\/cp:chargeBoxIdentity>/);
    assert.match(xml, /<remoteStartTransactionRequest xmlns="urn:\/\/Ocpp\/Cp\/2012\/06\/"><idTag>T<\/idTag><\/remoteStartTransactionRequest>/);
    assert.match(xml, /<wsa:Action>\/RemoteStartTransaction<\/wsa:Action>/);
});

test('extractSamples handles 1.6 sampledValue and 1.5 values/value (with and without attributes)', () => {
    const s16 = extractSamples({ meterValue: [{ timestamp: '2026-01-01T00:00:00Z', sampledValue: [{ value: '10', measurand: 'Power.Active.Import', unit: 'W' }, { value: '20' }] }] });
    assert.equal(s16.length, 2);
    assert.equal(s16[0].numericValue, 10);
    assert.equal(s16[1].measurand, 'Energy.Active.Import.Register');
    assert.equal(s16[1].unit, 'Wh');

    const s15 = extractSamples({ values: { timestamp: '2026-01-01T00:00:00Z', value: [{ value: '5', unit: 'Wh', measurand: 'Energy.Active.Import.Register' }, '7'] } });
    assert.deepEqual(s15.map(s => s.numericValue), [5, 7]);

    const stop15 = extractSamples({ transactionData: { values: { timestamp: '2026-01-01T00:00:00Z', value: '99' } } });
    assert.equal(stop15[0].numericValue, 99);
});

test('canonicalAction and responseElementFor', () => {
    assert.equal(canonicalAction('bootNotificationRequest'), 'BootNotification');
    assert.equal(canonicalAction('heartbeatrequest'), 'Heartbeat');
    assert.equal(canonicalAction('SomethingNew'), 'SomethingNew');
    assert.equal(responseElementFor('bootNotificationRequest'), 'bootNotificationResponse');
    assert.equal(responseElementFor('heartbeatrequest'), 'heartbeatresponse');
});

test('overallStatus prefers offline, then charge-point level faults, then busiest connector', () => {
    const doc = { connectors: [{ connectorId: 0, status: 'Available' }, { connectorId: 1, status: 'Available' }, { connectorId: 2, status: 'Charging' }] };
    assert.equal(overallStatus(doc, false), 'Offline');
    assert.equal(overallStatus(doc, true), 'Charging');
    assert.equal(overallStatus({ connectors: [{ connectorId: 0, status: 'Faulted' }, { connectorId: 1, status: 'Charging' }] }, true), 'Faulted');
    assert.equal(overallStatus({ connectors: [] }, true), 'Online');
    assert.equal(overallStatus({ connectors: [{ connectorId: 1, status: 'Occupied' }] }, true), 'Occupied');
});
