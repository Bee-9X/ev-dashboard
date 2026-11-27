import { canonicalAction } from '../charging.handlers';
import { responseElementFor } from '../soap.adapter';
import { identityFromUrl } from '../json.adapter';
import { extractSamples, meterKey } from './common';
import { buildRequestEnvelope, parseSoap, toXml } from './xml';

// Ported from the Phase 0 gateway's unit tests (plugev-server/test/unit.test.js).
describe('OCPP helpers', () => {
    it('parseSoap strips prefixes and detects OCPP 1.5', async () => {
        const xml = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://www.w3.org/2005/08/addressing" xmlns:cs="urn://Ocpp/Cs/2012/06/">
 <s:Header><cs:chargeBoxIdentity s:mustUnderstand="true">CB1</cs:chargeBoxIdentity><a:Action>/BootNotification</a:Action>
 <a:MessageID>urn:uuid:abc</a:MessageID><a:From><a:Address>http://10.0.0.5:8080/</a:Address></a:From></s:Header>
 <s:Body><cs:bootNotificationRequest><cs:chargePointVendor>V</cs:chargePointVendor><cs:chargePointModel>M</cs:chargePointModel></cs:bootNotificationRequest></s:Body>
</s:Envelope>`;
        const p = await parseSoap(xml);
        expect(p.version).toBe('1.5');
        expect(p.namespace).toBe('urn://Ocpp/Cs/2012/06/');
        expect(p.bodyElement).toBe('bootNotificationRequest');
        expect(p.header.chargeBoxIdentity).toBe('CB1');
        expect((p.header.From as { Address: string }).Address).toBe('http://10.0.0.5:8080/');
        expect(p.payload).toEqual({ chargePointVendor: 'V', chargePointModel: 'M' });
    });

    it('parseSoap reports SOAP faults', async () => {
        const xml = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><s:Fault>
          <s:Code><s:Value>s:Sender</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Bad thing</s:Text></s:Reason></s:Fault></s:Body></s:Envelope>`;
        expect((await parseSoap(xml)).fault?.reason).toBe('Bad thing');
    });

    it('toXml keeps key order, repeats arrays and escapes text', () => {
        expect(toXml({ idTag: 'A<&>', connectorId: 1, key: ['x', 'y'], skip: undefined }))
            .toBe('<idTag>A&lt;&amp;&gt;</idTag><connectorId>1</connectorId><key>x</key><key>y</key>');
    });

    it('a request envelope carries chargeBoxIdentity and the namespace on the body element', () => {
        const xml = buildRequestEnvelope({ version: '1.5', identity: 'CB1', action: 'RemoteStartTransaction', to: 'http://cp/', messageId: 'm1', payload: { idTag: 'T' } });
        expect(xml).toMatch(/<cp:chargeBoxIdentity>CB1<\/cp:chargeBoxIdentity>/);
        expect(xml).toMatch(/<remoteStartTransactionRequest xmlns="urn:\/\/Ocpp\/Cp\/2012\/06\/"><idTag>T<\/idTag><\/remoteStartTransactionRequest>/);
        expect(xml).toMatch(/<wsa:Action>\/RemoteStartTransaction<\/wsa:Action>/);
    });

    it('extractSamples reads 1.6 sampledValue and 1.5 values/value, with and without attributes', () => {
        const s16 = extractSamples({ meterValue: [{ timestamp: '2026-01-01T00:00:00Z', sampledValue: [{ value: '10', measurand: 'Power.Active.Import', unit: 'W' }, { value: '20' }] }] });
        expect(s16).toHaveLength(2);
        expect(s16[0]!.numericValue).toBe(10);
        expect(s16[1]).toMatchObject({ measurand: 'Energy.Active.Import.Register', unit: 'Wh' });

        const s15 = extractSamples({ values: { timestamp: '2026-01-01T00:00:00Z', value: [{ value: '5', unit: 'Wh', measurand: 'Energy.Active.Import.Register' }, '7'] } });
        expect(s15.map(s => s.numericValue)).toEqual([5, 7]);

        const stop15 = extractSamples({ transactionData: { values: { timestamp: '2026-01-01T00:00:00Z', value: '99' } } });
        expect(stop15[0]!.numericValue).toBe(99);
        expect(meterKey({ measurand: 'Current.Import', phase: 'L1' })).toBe('Current.Import_L1');
    });

    it('names actions and response elements as chargers expect', () => {
        expect(canonicalAction('bootNotificationRequest')).toBe('BootNotification');
        expect(canonicalAction('heartbeatrequest')).toBe('Heartbeat');
        expect(canonicalAction('SomethingNew')).toBe('SomethingNew');
        expect(responseElementFor('bootNotificationRequest')).toBe('bootNotificationResponse');
        expect(responseElementFor('heartbeatrequest')).toBe('heartbeatresponse');
        expect(identityFromUrl('/ocpp/SIM%2D1?x=1')).toBe('SIM-1');
        expect(identityFromUrl('/')).toBeNull();
    });
});
