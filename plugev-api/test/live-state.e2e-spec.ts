import { LiveEvent, LiveStateEvents } from '../src/charging/live-events';
import { bearer, createTestApp, login, seedSuperAdmin, Session, TestApp } from './helpers';

/**
 * Live charger state per charger and connector (FR EVSE 003, FR MON 002/003), as the charging module records it.
 * Ported from the tests of the former gateway link: the same order-safe events, now applied inside the API.
 */
describe('Live charger state', () => {
    let t: TestApp;
    let root: Session;
    let evseId: string;

    const send = (events: LiveEvent[]) => t.app.get(LiveStateEvents).apply(events);
    const charger = async () => (await t.http.get(`/api/v1/evses/${evseId}`).set(bearer(root)).expect(200)).body;
    const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();

    beforeAll(async () => {
        t = await createTestApp({ env: { CHARGER_OFFLINE_AFTER_SEC: '120' } });
        await seedSuperAdmin(t.db);
        root = await login(t, 'root@plugev.test');
        const net = (await t.http.post('/api/v1/networks').set(bearer(root)).send({ name: 'Net' }).expect(201)).body.id;
        const st = (await t.http.post('/api/v1/stations').set(bearer(root)).send({ networkId: net, name: 'SETEC' }).expect(201)).body.id;
        evseId = (await t.http.post('/api/v1/evses').set(bearer(root)).send({
            stationId: st, protocol: 'OCPP_1_5_S', protocolIdentity: 'c1', vendor: 'SETEC', model: 'Tablet',
            connectors: [{ connectorNumber: 1, connectorType: 'CHADEMO', maxPowerKw: 50 }],
        }).expect(201)).body.id;
    });
    afterAll(() => t.close());

    it('a new charger has no live state until it is heard from', async () => {
        expect((await charger()).live).toBeNull();
    });

    it('records boot, connection and connector status, matching the identity in any case', async () => {
        const res = await send([
            { type: 'connected', identity: 'C1', protocol: 'ocpp1.5-soap', at: ago(10) },
            {
                type: 'boot', identity: 'c1', protocol: 'ocpp1.5-soap', at: ago(9),
                vendor: 'SETEC', model: 'EVC-50', serialNumber: 'SN42', firmwareVersion: '2.1.7',
            },
            { type: 'connector_status', identity: 'c1', at: ago(8), connectorNumber: 0, status: 'Available', errorCode: 'NoError' },
            { type: 'connector_status', identity: 'c1', at: ago(8), connectorNumber: 1, status: 'Occupied', errorCode: 'NoError', statusAt: ago(8) },
            { type: 'connector_status', identity: 'c1', at: ago(8), connectorNumber: 2, status: 'Available' },
            { type: 'seen', identity: 'nobody-registered', at: ago(5) },
        ]);
        expect(res).toEqual({ applied: 5, unknownIdentities: ['nobody-registered'] });

        const c = await charger();
        expect(c.live).toMatchObject({
            online: true, connectionState: 'online', protocol: 'ocpp1.5-soap',
            reported: { vendor: 'SETEC', model: 'EVC-50', serialNumber: 'SN42', firmwareVersion: '2.1.7' },
            chargerStatus: { status: 'Available', errorCode: 'NoError' },
            unregisteredConnectors: [2],
        });
        expect(c.firmwareVersion).toBe('2.1.7');
        expect(c.connectors[0].live).toMatchObject({ status: 'Occupied', errorCode: 'NoError' });
    });

    it('ignores older news: a late status or a late disconnect does not undo newer state', async () => {
        await send([{ type: 'connector_status', identity: 'c1', at: ago(1), connectorNumber: 1, status: 'Available', statusAt: ago(60) }]);
        expect((await charger()).connectors[0].live.status).toBe('Occupied');

        await send([{ type: 'disconnected', identity: 'c1', at: ago(30), reason: 'old news' }]);
        expect((await charger()).live.online).toBe(true);
    });

    it('goes offline when disconnected, and online again on the next message', async () => {
        await send([{ type: 'disconnected', identity: 'c1', at: ago(0), reason: 'no message for more than 90s' }]);
        let c = await charger();
        expect(c.live).toMatchObject({ online: false, connectionState: 'offline', disconnectReason: 'no message for more than 90s' });

        await new Promise(r => setTimeout(r, 20));
        await send([{ type: 'seen', identity: 'c1', at: new Date().toISOString() }]);
        c = await charger();
        expect(c.live.online).toBe(true);
        expect(new Date(c.live.connectedAt).getTime()).toBeGreaterThan(new Date(c.live.disconnectedAt).getTime());
    });

    it('counts a charger as offline when nothing was heard for too long', async () => {
        await t.db.query(`UPDATE evse_live_states SET last_seen_at = now() - interval '10 minutes' WHERE evse_id = $1`, [evseId]);
        const c = await charger();
        expect(c.live).toMatchObject({ online: false, connectionState: 'online' });
    });

    it('the former gateway endpoint is gone', async () => {
        await t.http.post('/api/v1/gateway/events').send({ events: [] }).expect(404);
    });
});
