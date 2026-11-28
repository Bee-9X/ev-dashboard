import { ChargingServer } from '../src/charging/charging.server';
import { bearer, createTestApp, inviteAndActivate, login, seedSuperAdmin, Session, TestApp } from './helpers';

/**
 * Charging sessions for administrators (FR SES 001-003, 007, FR MON 004, spec 9.2), fed by real OCPP 1.5 SOAP
 * messages like the SETEC tablet sends. Network A has stations A1 (with a Station Admin) and A2; network B has B1.
 */
describe('Charging sessions', () => {
    let t: TestApp;
    let root: Session, adminA: Session, adminB: Session, stationAdmin: Session;
    let netA: string, stA1: string, stA2: string, stB1: string;
    let evA1: string, evA2: string, evB1: string;
    let base: string;

    const api = (s: Session) => ({
        get: (path: string) => t.http.get(`/api/v1${path}`).set(bearer(s)),
        post: (path: string, body: object) => t.http.post(`/api/v1${path}`).set(bearer(s)).send(body),
    });

    /** Sends one OCPP 1.5 SOAP message and returns the response payload's text. */
    const soap = async (identity: string, action: string, body: string): Promise<string> => {
        const element = action.charAt(0).toLowerCase() + action.slice(1) + 'Request';
        const res = await fetch(`${base}/ocpp/${identity}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
            body: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:cs="urn://Ocpp/Cs/2012/06/">
  <soap:Header>
    <cs:chargeBoxIdentity>${identity}</cs:chargeBoxIdentity>
    <wsa:Action>/${action}</wsa:Action>
    <wsa:MessageID>urn:uuid:${Math.random().toString(16).slice(2)}</wsa:MessageID>
  </soap:Header>
  <soap:Body><cs:${element}>${body}</cs:${element}></soap:Body>
</soap:Envelope>`,
        });
        expect(res.status).toBe(200);
        return res.text();
    };
    const start = async (identity: string, connector: number, at: string, meterStart: number): Promise<number> => {
        const text = await soap(identity, 'StartTransaction',
            `<cs:connectorId>${connector}</cs:connectorId><cs:idTag>RFID-${identity}</cs:idTag><cs:timestamp>${at}</cs:timestamp><cs:meterStart>${meterStart}</cs:meterStart>`);
        return Number(/<transactionId>(\d+)<\/transactionId>/.exec(text)![1]);
    };
    const stop = (identity: string, tx: number, at: string, meterStop: number, reason = 'EVDisconnected') =>
        soap(identity, 'StopTransaction',
            `<cs:transactionId>${tx}</cs:transactionId><cs:idTag>RFID-${identity}</cs:idTag><cs:timestamp>${at}</cs:timestamp><cs:meterStop>${meterStop}</cs:meterStop>`
            + `<cs:reason>${reason}</cs:reason>`);

    const charger = (stationId: string, identity: string) => ({
        stationId, protocol: 'OCPP_1_5_S', protocolIdentity: identity, vendor: 'SETEC', model: 'CPM',
        connectors: [{ connectorNumber: 1, connectorType: 'CHADEMO', maxPowerKw: 50 }, { connectorNumber: 2, connectorType: 'CCS2', maxPowerKw: 50 }],
    });

    beforeAll(async () => {
        t = await createTestApp({ env: { OCPP_ENABLED: 'true', OCPP_PORT: '0' } });
        base = `http://localhost:${t.app.get(ChargingServer).port}`;
        await seedSuperAdmin(t.db);
        root = await login(t, 'root@plugev.test');
        netA = (await api(root).post('/networks', { name: 'Network A' }).expect(201)).body.id;
        const netB = (await api(root).post('/networks', { name: 'Network B' }).expect(201)).body.id;
        stA1 = (await api(root).post('/stations', { networkId: netA, name: 'A1' }).expect(201)).body.id;
        stA2 = (await api(root).post('/stations', { networkId: netA, name: 'A2' }).expect(201)).body.id;
        stB1 = (await api(root).post('/stations', { networkId: netB, name: 'B1' }).expect(201)).body.id;
        evA1 = (await api(root).post('/evses', charger(stA1, 'A1-01')).expect(201)).body.id;
        evA2 = (await api(root).post('/evses', charger(stA2, 'A2-01')).expect(201)).body.id;
        evB1 = (await api(root).post('/evses', charger(stB1, 'B1-01')).expect(201)).body.id;
        adminA = await inviteAndActivate(t, root, { email: 'admin-a@plugev.test', role: 'NETWORK_ADMIN', networkId: netA });
        adminB = await inviteAndActivate(t, root, { email: 'admin-b@plugev.test', role: 'NETWORK_ADMIN', networkId: netB });
        stationAdmin = await inviteAndActivate(t, adminA, { email: 'st-a1@plugev.test', role: 'STATION_ADMIN', stationId: stA1 });
    });
    afterAll(() => t.close());

    describe('a session while it charges and after it ends', () => {
        let tx: number;
        let sessionId: string;
        const startedAt = new Date(Date.now() - 20 * 60_000);

        it('shows the session on the charger with live energy and power while charging', async () => {
            tx = await start('A1-01', 1, startedAt.toISOString(), 10_000);
            // OCPP 1.5 chargers may leave out the transactionId: the readings still belong to the running session
            await soap('A1-01', 'MeterValues', `<cs:connectorId>1</cs:connectorId>
                <cs:values><cs:timestamp>${new Date(startedAt.getTime() + 10 * 60_000).toISOString()}</cs:timestamp>
                  <cs:value unit="kWh" measurand="Energy.Active.Import.Register">12.5</cs:value>
                  <cs:value unit="kW" measurand="Power.Active.Import">15</cs:value>
                  <cs:value unit="Percent" measurand="SoC">64</cs:value>
                </cs:values>`);

            const evse = (await api(stationAdmin).get(`/evses/${evA1}`).expect(200)).body;
            expect(evse.connectors[0].activeSession).toMatchObject({
                startedAt: startedAt.toISOString(), energyWh: 2500, powerW: 15000, socPercent: 64,
            });
            expect(evse.connectors[1].activeSession).toBeNull();
            sessionId = evse.connectors[0].activeSession.id;

            const list = (await api(stationAdmin).get(`/sessions?evseId=${evA1}`).expect(200)).body;
            expect(list.total).toBe(1);
            expect(list.items[0]).toMatchObject({
                id: sessionId, status: 'active', networkName: 'Network A', stationName: 'A1', protocolIdentity: 'A1-01',
                connectorNumber: 1, connectorType: 'CHADEMO', ocppTransactionId: tx, idTag: 'RFID-A1-01', meterStartWh: 10_000,
                energyWh: null, live: { energyWh: 2500, powerW: 15000, socPercent: 64 },
            });
            expect(list.items[0].durationSec).toBeGreaterThanOrEqual(20 * 60 - 5);
        });

        it('adds up phase values when the charger reports no total', async () => {
            await soap('A1-01', 'MeterValues', `<cs:connectorId>1</cs:connectorId><cs:transactionId>${tx}</cs:transactionId>
                <cs:values><cs:timestamp>${new Date(startedAt.getTime() + 15 * 60_000).toISOString()}</cs:timestamp>
                  <cs:value unit="W" measurand="Power.Active.Import" phase="L1">3000</cs:value>
                  <cs:value unit="W" measurand="Power.Active.Import" phase="L2">3100</cs:value>
                  <cs:value unit="W" measurand="Power.Active.Import" phase="L3">2900</cs:value>
                  <cs:value unit="V" measurand="Voltage" phase="L1-N">230</cs:value>
                </cs:values>`);
            // the total from 10 minutes in is still the newest total, so it wins over the phases
            const s = (await api(root).get(`/sessions/${sessionId}`).expect(200)).body;
            expect(s.live.powerW).toBe(15000);
            await t.db.query(`DELETE FROM meter_values WHERE session_id = $1 AND measurand = 'Power.Active.Import' AND phase IS NULL`, [sessionId]);
            expect((await api(root).get(`/sessions/${sessionId}`).expect(200)).body.live.powerW).toBe(9000);
        });

        it('keeps the final energy, duration and stop reason once stopped, and every reading in order', async () => {
            const stoppedAt = new Date(startedAt.getTime() + 30 * 60_000);
            await stop('A1-01', tx, stoppedAt.toISOString(), 14_000);

            const evse = (await api(stationAdmin).get(`/evses/${evA1}`).expect(200)).body;
            expect(evse.connectors[0].activeSession).toBeNull();

            const s = (await api(stationAdmin).get(`/sessions/${sessionId}`).expect(200)).body;
            expect(s).toMatchObject({
                status: 'completed', stoppedAt: stoppedAt.toISOString(), meterStopWh: 14_000, energyWh: 4000, durationSec: 1800,
                stopReason: 'EVDisconnected', live: null, readingsTruncated: false,
            });
            expect(s.readings.map((r: { measurand: string; phase: string | null }) => r.measurand + (r.phase ? `/${r.phase}` : ''))).toEqual([
                'Energy.Active.Import.Register', 'SoC',
                'Power.Active.Import/L1', 'Power.Active.Import/L2', 'Power.Active.Import/L3', 'Voltage/L1-N',
            ]);
            expect(s.readings[0]).toMatchObject({ unit: 'kWh', value: '12.5', numericValue: 12.5, source: 'MeterValues' });
        });
    });

    describe('lists, filters and scope', () => {
        beforeAll(async () => {
            const h = (n: number) => new Date(Date.now() - n * 3600_000).toISOString();
            // A2: one completed session 5 h ago, then a start whose stop was missed, then a new start (interrupts it)
            const a2 = await start('A2-01', 1, h(5), 0);
            await stop('A2-01', a2, h(4.5), 7000, 'Local');
            await start('A2-01', 2, h(3), 100);
            await start('A2-01', 2, h(2), 200);
            // B1: a stop for a transaction the platform never started
            await stop('B1-01', 987654, h(1), 5000);
        });

        it('lists everything newest first for a Super Admin, with paging', async () => {
            const all = (await api(root).get('/sessions').expect(200)).body;
            expect(all.total).toBe(5);
            const order = all.items.map((s: { protocolIdentity: string; status: string }) => `${s.protocolIdentity} ${s.status}`);
            expect(order).toEqual(['A1-01 completed', 'B1-01 orphan', 'A2-01 active', 'A2-01 interrupted', 'A2-01 completed']);
            expect(all.items[1]).toMatchObject({ startedAt: null, connectorNumber: 0, connectorType: null, durationSec: null });
            expect(all.items[3].notes[0]).toMatch(/Superseded by a new StartTransaction/);

            const page2 = (await api(root).get('/sessions?pageSize=2&page=2').expect(200)).body;
            expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 5 });
            expect(page2.items.map((s: { status: string }) => s.status)).toEqual(['active', 'interrupted']);
        });

        it('filters by network, station, charger, status and time', async () => {
            const count = async (q: string) => (await api(root).get(`/sessions?${q}`).expect(200)).body.total;
            expect(await count(`networkId=${netA}`)).toBe(4);
            expect(await count(`stationId=${stA2}`)).toBe(3);
            expect(await count(`evseId=${evB1}`)).toBe(1);
            expect(await count('status=interrupted')).toBe(1);
            expect(await count(`stationId=${stA2}&status=active`)).toBe(1);
            const since = new Date(Date.now() - 3.5 * 3600_000).toISOString();
            expect(await count(`from=${encodeURIComponent(since)}`)).toBe(4);
            expect(await count(`to=${encodeURIComponent(since)}`)).toBe(1);
            await api(root).get('/sessions?status=charging').expect(400);
            await api(root).get('/sessions?from=yesterday').expect(400);
        });

        it('shows each admin only their own scope', async () => {
            const ids = async (s: Session, q = '') =>
                (await api(s).get(`/sessions${q}`).expect(200)).body.items.map((x: { stationName: string }) => x.stationName).sort();
            expect(await ids(adminA)).toEqual(['A1', 'A2', 'A2', 'A2']);
            expect(await ids(adminB)).toEqual(['B1']);
            expect(await ids(stationAdmin)).toEqual(['A1']);
            // filtering for something outside the scope finds nothing rather than leaking it
            expect(await ids(stationAdmin, `?stationId=${stA2}`)).toEqual([]);
            expect(await ids(adminB, `?networkId=${netA}`)).toEqual([]);

            const a2 = (await api(root).get(`/sessions?stationId=${stA2}`).expect(200)).body.items[0];
            await api(stationAdmin).get(`/sessions/${a2.id}`).expect(404);
            await api(adminB).get(`/sessions/${a2.id}`).expect(404);
            await api(adminA).get(`/sessions/${a2.id}`).expect(200);
            await api(root).get('/sessions/00000000-0000-4000-8000-000000000000').expect(404);
        });
    });

    describe('the charger simulator (npm run simulate -- --charge 1)', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { createSimulator } = require('../tools/simulate-charger.js') as {
            createSimulator(o: object): {
                start(): Promise<void>; stop(): void; plugIn(n: number, tag?: string): Promise<void>; unplug(n: number): Promise<void>;
            };
        };

        it('charges like a real OCPP 1.6J charger: a live session with meter values, completed when unplugged', async () => {
            const sim = await (async () => {
                const evse = (await api(root).post('/evses', {
                    stationId: stB1, protocol: 'OCPP_1_6_J', protocolIdentity: 'SIM-001', vendor: 'PlugEV', model: 'Sim',
                    connectors: [{ connectorNumber: 1, connectorType: 'TYPE2', maxPowerKw: 7.4 }],
                }).expect(201)).body;
                const s = createSimulator({
                    url: `ws://localhost:${t.app.get(ChargingServer).port}/ocpp/SIM-001`, powerW: 7200, meterIntervalSec: 1,
                    reconnect: false, log: () => undefined,
                });
                await s.start();
                return Object.assign(s, { evseId: evse.id as string });
            })();
            try {
                await sim.plugIn(1, 'SIM-TAG');
                const deadline = Date.now() + 10_000;
                let active: { id: string; energyWh: number | null; powerW: number | null } | null = null;
                while (Date.now() < deadline) {
                    active = (await api(adminB).get(`/evses/${sim.evseId}`).expect(200)).body.connectors[0].activeSession;
                    if (active?.powerW) break;
                    await new Promise(r => setTimeout(r, 200));
                }
                expect(active).toMatchObject({ powerW: 7200 });
                expect(active!.energyWh).toBeGreaterThanOrEqual(0);

                await sim.unplug(1);
                const s = (await api(adminB).get(`/sessions/${active!.id}`).expect(200)).body;
                expect(s).toMatchObject({ status: 'completed', stopReason: 'EVDisconnected', idTag: 'SIM-TAG', live: null });
                expect(s.readings.some((r: { source: string }) => r.source === 'StopTransaction')).toBe(true);
                expect((await api(adminB).get(`/evses/${sim.evseId}`).expect(200)).body.connectors[0].activeSession).toBeNull();
            } finally {
                sim.stop();
            }
        });
    });
});
