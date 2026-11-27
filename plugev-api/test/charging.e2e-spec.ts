import { createServer } from 'node:net';
import { WebSocket } from 'ws';
import { ChargingServer } from '../src/charging/charging.server';
import { parseSoap } from '../src/charging/ocpp/xml';
import { bearer, createTestApp, login, seedSuperAdmin, Session, TestApp } from './helpers';

/**
 * The charging module inside the API (replaces the Phase 0 gateway; scenarios ported from plugev-server/test).
 * Chargers talk to their own port: SOAP 1.5 like the SETEC tablet, and OCPP 1.6J over WebSocket.
 */
describe('Charging module: chargers connect to the platform directly', () => {
    let t: TestApp;
    let root: Session;
    let base: string;
    let soapId: string, jsonId: string;

    const CS15 = 'urn://Ocpp/Cs/2012/06/';
    const CP_URL = 'http://192.0.2.10:8080/';
    const envelope = (identity: string, action: string, body: string, opts: { from?: string; messageId?: string } = {}) => {
        const element = action.charAt(0).toLowerCase() + action.slice(1) + 'Request';
        return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:cs="${CS15}">
  <soap:Header>
    <cs:chargeBoxIdentity soap:mustUnderstand="true">${identity}</cs:chargeBoxIdentity>
    <wsa:Action soap:mustUnderstand="true">/${action}</wsa:Action>
    <wsa:MessageID>${opts.messageId ?? `urn:uuid:${Math.random().toString(16).slice(2)}`}</wsa:MessageID>
    ${opts.from ? `<wsa:From><wsa:Address>${opts.from}</wsa:Address></wsa:From>` : ''}
    <wsa:To soap:mustUnderstand="true">http://cs/ocpp</wsa:To>
  </soap:Header>
  <soap:Body><cs:${element}>${body}</cs:${element}></soap:Body>
</soap:Envelope>`;
    };
    const soap = async (identity: string, action: string, body: string, opts?: { from?: string; messageId?: string }) => {
        const res = await fetch(`${base}/ocpp/${identity}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
            body: envelope(identity, action, body, opts),
        });
        const text = await res.text();
        return { status: res.status, text, parsed: await parseSoap(text) };
    };
    const evse = async (id: string) => (await t.http.get(`/api/v1/evses/${id}`).set(bearer(root)).expect(200)).body;
    const db = <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => t.db.query(sql, params);
    const until = async <T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 5000): Promise<T> => {
        const end = Date.now() + ms;
        for (;;) {
            const v = await fn();
            if (v) return v;
            if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
            await new Promise(r => setTimeout(r, 50));
        }
    };

    beforeAll(async () => {
        t = await createTestApp({ env: { OCPP_ENABLED: 'true', OCPP_PORT: '0', OCPP_HEARTBEAT_INTERVAL_SEC: '45' } });
        base = `http://localhost:${t.app.get(ChargingServer).port}`;
        await seedSuperAdmin(t.db);
        root = await login(t, 'root@plugev.test');
        const post = (path: string, body: object) => t.http.post(`/api/v1${path}`).set(bearer(root)).send(body).expect(201);
        const net = (await post('/networks', { name: 'Net' })).body.id;
        const st = (await post('/stations', { networkId: net, name: 'SETEC' })).body.id;
        soapId = (await post('/evses', {
            stationId: st, protocol: 'OCPP_1_5_S', protocolIdentity: 'CB-15', vendor: 'Setec', model: 'S1',
            connectors: [{ connectorNumber: 1, connectorType: 'CHADEMO', maxPowerKw: 50 }, { connectorNumber: 2, connectorType: 'CCS2', maxPowerKw: 50 }],
        })).body.id;
        jsonId = (await post('/evses', {
            stationId: st, protocol: 'OCPP_1_6_J', protocolIdentity: 'SIM-1', vendor: 'PlugEV', model: 'Sim',
            connectors: [{ connectorNumber: 1, connectorType: 'TYPE2', maxPowerKw: 7.4 }],
        })).body.id;
    });
    afterAll(() => t.close());

    describe('OCPP 1.5 SOAP (like the SETEC tablet)', () => {
        it('answers BootNotification in the 1.5 format with WS-Addressing headers, and shows the charger online', async () => {
            const r = await soap('CB-15', 'BootNotification',
                '<cs:chargePointVendor>Setec</cs:chargePointVendor><cs:chargePointModel>S1</cs:chargePointModel><cs:chargeBoxSerialNumber>SN1</cs:chargeBoxSerialNumber><cs:firmwareVersion>1.2</cs:firmwareVersion>',
                { from: CP_URL, messageId: 'urn:uuid:boot-1' });
            expect(r.status).toBe(200);
            expect(r.parsed.bodyElement).toBe('bootNotificationResponse');
            expect(Object.keys(r.parsed.payload)).toEqual(['status', 'currentTime', 'heartbeatInterval']);
            expect(r.parsed.payload).toMatchObject({ status: 'Accepted', heartbeatInterval: '45' });
            expect(r.parsed.header).toMatchObject({ RelatesTo: 'urn:uuid:boot-1', Action: '/BootNotificationResponse', To: CP_URL });
            expect(r.text).toMatch(/<bootNotificationResponse xmlns="urn:\/\/Ocpp\/Cs\/2012\/06\/">/);

            const c = await evse(soapId);
            expect(c.live).toMatchObject({ online: true, protocol: 'ocpp1.5-soap', reported: { vendor: 'Setec', serialNumber: 'SN1', firmwareVersion: '1.2' } });
            expect(c.firmwareVersion).toBe('1.2');
            const [state] = await db<{ endpoint: string }>('SELECT endpoint FROM evse_live_states WHERE evse_id = $1', [soapId]);
            expect(state!.endpoint).toBe(CP_URL);
        });

        it('a connector status survives later heartbeats', async () => {
            await soap('CB-15', 'StatusNotification', '<cs:connectorId>1</cs:connectorId><cs:status>Occupied</cs:status><cs:errorCode>NoError</cs:errorCode>');
            const hb = await soap('CB-15', 'Heartbeat', '');
            expect(hb.parsed.payload.currentTime).toBeTruthy();
            expect((await evse(soapId)).connectors[0].live.status).toBe('Occupied');
        });

        it('records a charging session: start (and a resent start), meter values, stop with energy', async () => {
            const startBody = '<cs:connectorId>1</cs:connectorId><cs:idTag>RFID1</cs:idTag><cs:timestamp>2026-11-20T10:00:00Z</cs:timestamp><cs:meterStart>1000</cs:meterStart>';
            const start = await soap('CB-15', 'StartTransaction', startBody);
            const txId = Number(start.parsed.payload.transactionId);
            expect(txId).toBeGreaterThan(0);
            expect(Object.keys(start.parsed.payload)).toEqual(['transactionId', 'idTagInfo']);
            expect((start.parsed.payload.idTagInfo as { status: string }).status).toBe('Accepted');
            // the charger missed our answer and sends it again: same transaction
            expect(Number((await soap('CB-15', 'StartTransaction', startBody)).parsed.payload.transactionId)).toBe(txId);

            await soap('CB-15', 'MeterValues', `<cs:connectorId>1</cs:connectorId><cs:transactionId>${txId}</cs:transactionId>
                <cs:values><cs:timestamp>2026-11-20T10:05:00Z</cs:timestamp>
                  <cs:value unit="Wh" measurand="Energy.Active.Import.Register" context="Sample.Periodic">1500</cs:value>
                  <cs:value unit="W" measurand="Power.Active.Import">6000</cs:value>
                </cs:values>`);
            const stop = await soap('CB-15', 'StopTransaction', `<cs:transactionId>${txId}</cs:transactionId><cs:idTag>RFID1</cs:idTag>
                <cs:timestamp>2026-11-20T10:30:00Z</cs:timestamp><cs:meterStop>4000</cs:meterStop>
                <cs:transactionData><cs:values><cs:timestamp>2026-11-20T10:30:00Z</cs:timestamp><cs:value>4000</cs:value></cs:values></cs:transactionData>`);
            expect((stop.parsed.payload.idTagInfo as { status: string }).status).toBe('Accepted');

            const [session] = await db<{ id: string; status: string; energy_wh: string; connector_number: number }>(
                'SELECT id, status, energy_wh, connector_number FROM charging_sessions WHERE evse_id = $1 AND ocpp_transaction_id = $2', [soapId, txId]);
            expect(session).toMatchObject({ status: 'completed', connector_number: 1 });
            expect(Number(session!.energy_wh)).toBe(3000);
            const values = await db<{ measurand: string; numeric_value: number; unit: string; source: string }>(
                'SELECT measurand, numeric_value, unit, source FROM meter_values WHERE session_id = $1 ORDER BY id', [session!.id]);
            expect(values).toHaveLength(3);
            expect(values).toContainEqual({ measurand: 'Power.Active.Import', numeric_value: 6000, unit: 'W', source: 'MeterValues' });
            const [live] = await db<{ meter: Record<string, { value: number }> }>(
                'SELECT meter FROM connector_live_states WHERE evse_id = $1 AND connector_number = 1', [soapId]);
            expect(live!.meter['Power.Active.Import']!.value).toBe(6000);
        });

        it('keeps a stop for an unknown transaction as an orphan session', async () => {
            await soap('CB-15', 'StopTransaction', '<cs:transactionId>777</cs:transactionId><cs:timestamp>2026-11-20T11:00:00Z</cs:timestamp><cs:meterStop>5000</cs:meterStop>');
            const rows = await db('SELECT status FROM charging_sessions WHERE evse_id = $1 AND ocpp_transaction_id = 777', [soapId]);
            expect(rows).toEqual([{ status: 'orphan' }]);
        });

        it('blocks charging on a disabled connector or charger (FR EVSE 006)', async () => {
            const c = await evse(soapId);
            await t.http.patch(`/api/v1/evses/${soapId}/connectors/${c.connectors[1].id}`).set(bearer(root)).send({ status: 'disabled' }).expect(200);
            const start = await soap('CB-15', 'StartTransaction', '<cs:connectorId>2</cs:connectorId><cs:idTag>RFID1</cs:idTag><cs:timestamp>2026-11-20T12:00:00Z</cs:timestamp><cs:meterStart>0</cs:meterStart>');
            expect((start.parsed.payload.idTagInfo as { status: string }).status).toBe('Blocked');

            await t.http.patch(`/api/v1/evses/${soapId}`).set(bearer(root)).send({ status: 'disabled' }).expect(200);
            const auth = await soap('CB-15', 'Authorize', '<cs:idTag>RFID1</cs:idTag>');
            expect((auth.parsed.payload.idTagInfo as { status: string }).status).toBe('Blocked');
            await t.http.patch(`/api/v1/evses/${soapId}`).set(bearer(root)).send({ status: 'active' }).expect(200);
        });

        it('rejects chargers that are not registered, and logs what they sent', async () => {
            const boot = await soap('ROGUE', 'BootNotification', '<cs:chargePointVendor>X</cs:chargePointVendor><cs:chargePointModel>Y</cs:chargePointModel>');
            expect(boot.status).toBe(200);
            expect(boot.parsed.payload.status).toBe('Rejected');
            const hb = await soap('ROGUE', 'Heartbeat', '');
            expect(hb.status).toBe(400);
            expect(hb.parsed.fault?.reason).toMatch(/not registered/);
            const logged = await until(async () => {
                const rows = await db<{ evse_id: string | null }>(`SELECT evse_id FROM ocpp_messages WHERE identity = 'ROGUE'`);
                return rows.length >= 4 ? rows : null;
            }, 'messages of the unregistered charger');
            expect(logged.every(r => r.evse_id === null)).toBe(true);
        });

        it('keeps every message, linked to the charger, for diagnosis', async () => {
            const rows = await db<{ direction: string; action: string; evse_id: string }>(
                `SELECT direction, action, evse_id FROM ocpp_messages WHERE identity = 'CB-15'`);
            expect(rows.some(r => r.direction === 'in' && r.action === 'BootNotification' && r.evse_id === soapId)).toBe(true);
            expect(rows.some(r => r.direction === 'out' && r.action === 'BootNotification')).toBe(true);
        });

        it('goes offline after the configured silence', async () => {
            await db(`UPDATE evse_live_states SET last_seen_at = now() - interval '10 minutes' WHERE evse_id = $1`, [soapId]);
            await t.app.get(ChargingServer).sweep();
            expect((await evse(soapId)).live).toMatchObject({ online: false, connectionState: 'offline', disconnectReason: expect.stringMatching(/no message for more than/) });
            await soap('CB-15', 'Heartbeat', '');
            expect((await evse(soapId)).live.online).toBe(true);
        });
    });

    describe('OCPP 1.6 JSON over WebSocket', () => {
        const open = (identity: string) => new Promise<WebSocket>((resolve, reject) => {
            const ws = new WebSocket(`${base.replace('http', 'ws')}/ocpp/${identity}`, ['ocpp1.6']);
            ws.once('open', () => resolve(ws));
            ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
            ws.once('error', reject);
        });
        const call = (ws: WebSocket, action: string, payload: object) => new Promise<unknown[]>(resolve => {
            const id = Math.random().toString(16).slice(2);
            const onMessage = (d: Buffer) => {
                const msg = JSON.parse(d.toString());
                if (msg[1] === id) {
                    ws.off('message', onMessage);
                    resolve(msg);
                }
            };
            ws.on('message', onMessage);
            ws.send(JSON.stringify([2, id, action, payload]));
        });

        it('refuses a charger that is not registered', async () => {
            await expect(open('NOPE')).rejects.toThrow('HTTP 404');
        });

        it('a registered charger connects, boots, reports status, and goes offline when it disconnects', async () => {
            const ws = await open('SIM-1');
            expect(ws.protocol).toBe('ocpp1.6');
            const boot = await call(ws, 'BootNotification', { chargePointVendor: 'PlugEV-Sim', chargePointModel: 'SIM-1', firmwareVersion: '0.1.0' });
            expect(boot[0]).toBe(3);
            expect(boot[2]).toMatchObject({ status: 'Accepted', interval: 45 });
            expect(Object.keys(boot[2] as object)).toEqual(['status', 'currentTime', 'interval']);
            await call(ws, 'StatusNotification', { connectorId: 1, status: 'Available', errorCode: 'NoError' });

            const unknown = await call(ws, 'SignCertificate', {});
            expect(unknown.slice(0, 3)).toEqual([4, unknown[1], 'NotImplemented']);

            let c = await evse(jsonId);
            expect(c.live).toMatchObject({ online: true, protocol: 'ocpp1.6-json', reported: { vendor: 'PlugEV-Sim', firmwareVersion: '0.1.0' } });
            expect(c.connectors[0].live.status).toBe('Available');

            // an open WebSocket keeps it online even when quiet
            await db(`UPDATE evse_live_states SET last_seen_at = now() - interval '10 minutes' WHERE evse_id = $1`, [jsonId]);
            await t.app.get(ChargingServer).sweep();
            expect((await evse(jsonId)).live.connectionState).toBe('online');

            ws.close();
            c = await until(async () => {
                const e = await evse(jsonId);
                return e.live.connectionState === 'offline' ? e : null;
            }, 'offline after disconnect');
            expect(c.live.disconnectReason).toMatch(/websocket closed/);
        });
    });
});

describe('Charging module: port already taken (e.g. the old gateway still running)', () => {
    it('the API still starts; chargers just cannot connect', async () => {
        const blocker = createServer();
        const port = await new Promise<number>(r => blocker.listen(0, () => r((blocker.address() as { port: number }).port)));
        try {
            const t = await createTestApp({ env: { OCPP_ENABLED: 'true', OCPP_PORT: String(port) } });
            try {
                expect(t.app.get(ChargingServer).port).toBeNull();
                await t.http.get('/api/v1/health/live').expect(200);
            } finally {
                await t.close();
            }
        } finally {
            blocker.close();
        }
    });
});
