import { bearer, createTestApp, inviteAndActivate, login, seedSuperAdmin, Session, TestApp } from './helpers';

/**
 * Chargers (EVSEs) and connectors (FR EVSE 001, 002, 004, 006) and station details (FR ST 001, 004, 005).
 * Network A has stations A1 and A2 (A1 with a Station Admin); network B has B1.
 */
describe('Chargers, connectors and station details', () => {
    let t: TestApp;
    let root: Session, adminA: Session, stationAdmin: Session;
    let netA: string, netB: string, stA1: string, stA2: string, stB1: string;

    const api = (s: Session) => ({
        get: (path: string) => t.http.get(`/api/v1${path}`).set(bearer(s)),
        post: (path: string, body: object) => t.http.post(`/api/v1${path}`).set(bearer(s)).send(body),
        patch: (path: string, body: object) => t.http.patch(`/api/v1${path}`).set(bearer(s)).send(body),
    });

    const charger = (stationId: string, identity: string, extra: object = {}) => ({
        stationId,
        protocol: 'OCPP_1_6_J',
        protocolIdentity: identity,
        vendor: 'SETEC',
        model: 'DC60',
        connectors: [
            { connectorNumber: 1, connectorType: 'CCS2', maxPowerKw: 60 },
            { connectorNumber: 2, connectorType: 'CHADEMO', maxPowerKw: 50 },
        ],
        ...extra,
    });

    beforeAll(async () => {
        t = await createTestApp({ env: { QR_LINK_BASE: 'https://plugev.example/c' } });
        await seedSuperAdmin(t.db);
        root = await login(t, 'root@plugev.test');
        netA = (await api(root).post('/networks', { name: 'Network A' }).expect(201)).body.id;
        netB = (await api(root).post('/networks', { name: 'Network B' }).expect(201)).body.id;
        stA1 = (await api(root).post('/stations', { networkId: netA, name: 'A1' }).expect(201)).body.id;
        stA2 = (await api(root).post('/stations', { networkId: netA, name: 'A2' }).expect(201)).body.id;
        stB1 = (await api(root).post('/stations', { networkId: netB, name: 'B1' }).expect(201)).body.id;
        adminA = await inviteAndActivate(t, root, { email: 'admin-a@plugev.test', role: 'NETWORK_ADMIN', networkId: netA });
        stationAdmin = await inviteAndActivate(t, adminA, { email: 'st-a1@plugev.test', role: 'STATION_ADMIN', stationId: stA1 });
    });
    afterAll(() => t.close());

    describe('registering a charger', () => {
        let evseId: string;

        it('creates a charger with two connectors and a QR code for each', async () => {
            const res = await api(adminA).post('/evses', charger(stA1, 'KTW-01', { serialNumber: 'SN123', name: 'Fast charger 1' })).expect(201);
            evseId = res.body.id;
            expect(res.body).toMatchObject({
                networkId: netA, stationId: stA1, protocolIdentity: 'KTW-01', vendor: 'SETEC', status: 'active', serialNumber: 'SN123',
            });
            expect(res.body.publicCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
            expect(res.body.connectors).toHaveLength(2);
            const [c1, c2] = res.body.connectors;
            expect(c1).toMatchObject({ connectorNumber: 1, connectorType: 'CCS2', currentType: 'DC', maxPowerKw: 60, format: 'cable', status: 'active' });
            expect(c2).toMatchObject({ connectorNumber: 2, connectorType: 'CHADEMO', currentType: 'DC' });
            expect(c1.qrCode).toBe(`${res.body.publicCode}-1`);
            expect(c1.qrUrl).toBe(`https://plugev.example/c/${res.body.publicCode}-1`);
        });

        it('keeps protocol identities unique across all networks, whatever the case', async () => {
            const dup = await api(root).post('/evses', charger(stB1, 'ktw-01')).expect(409);
            expect(dup.body.error.code).toBe('PROTOCOL_IDENTITY_TAKEN');
        });

        it('checks connectors: number, count, type against current, sockets only for AC', async () => {
            const bad = (connectors: object[]) => api(adminA).post('/evses', charger(stA1, `X-${Math.random()}`.slice(0, 20), { connectors }));
            await bad([{ connectorNumber: 1, connectorType: 'CCS2', maxPowerKw: 60 }, { connectorNumber: 1, connectorType: 'CCS2', maxPowerKw: 60 }]).expect(400);
            await bad([1, 2, 3].map(n => ({ connectorNumber: n, connectorType: 'TYPE2', maxPowerKw: 22 }))).expect(400);
            await bad([]).expect(400);
            await bad([{ connectorNumber: 1, connectorType: 'CCS2', currentType: 'AC', maxPowerKw: 60 }]).expect(400);
            await bad([{ connectorNumber: 1, connectorType: 'GBT', maxPowerKw: 60 }]).expect(400); // GB/T needs AC or DC
            await bad([{ connectorNumber: 1, connectorType: 'CHADEMO', maxPowerKw: 50, format: 'socket' }]).expect(400);
            const ok = await bad([{ connectorNumber: 1, connectorType: 'TYPE2', maxPowerKw: 22, format: 'socket' }]).expect(201);
            expect(ok.body.connectors[0]).toMatchObject({ currentType: 'AC', format: 'socket' });
        });

        it('only in the caller\'s own network, and never with an identity that breaks the gateway URL', async () => {
            await api(adminA).post('/evses', charger(stB1, 'SNEAKY')).expect(404);
            await api(adminA).post('/evses', charger(stA1, 'has space')).expect(400);
            await api(stationAdmin).post('/evses', charger(stA1, 'ST-ADMIN')).expect(403);
        });

        it('swaps the hardware but keeps the QR codes, and disables without deleting', async () => {
            const before = await api(adminA).get(`/evses/${evseId}`).expect(200);
            const swapped = await api(adminA).patch(`/evses/${evseId}`, { protocolIdentity: 'KTW-01B', serialNumber: 'SN999' }).expect(200);
            expect(swapped.body.publicCode).toBe(before.body.publicCode);
            expect(swapped.body.connectors[0].qrCode).toBe(before.body.connectors[0].qrCode);

            const disabled = await api(adminA).patch(`/evses/${evseId}`, { status: 'disabled' }).expect(200);
            expect(disabled.body.status).toBe('disabled');
            await api(adminA).patch(`/evses/${evseId}`, { status: 'active' }).expect(200);
            await api(adminA).patch(`/evses/${evseId}`, { vendor: null }).expect(400); // required fields cannot be cleared
        });

        it('edits, disables and adds connectors up to the limit', async () => {
            const one = await api(adminA).post('/evses', charger(stA2, 'A2-01', {
                connectors: [{ connectorNumber: 1, connectorType: 'TYPE2', maxPowerKw: 22, format: 'socket' }],
            })).expect(201);
            const id = one.body.id;
            const c1 = one.body.connectors[0].id;

            // Type 2 socket to CCS2: the current follows the type, and DC means a cable
            const changed = await api(adminA).patch(`/evses/${id}/connectors/${c1}`, { connectorType: 'CCS2', maxPowerKw: 120 }).expect(200);
            expect(changed.body.connectors[0]).toMatchObject({ connectorType: 'CCS2', currentType: 'DC', format: 'cable', maxPowerKw: 120 });
            const off = await api(adminA).patch(`/evses/${id}/connectors/${c1}`, { status: 'disabled' }).expect(200);
            expect(off.body.connectors[0].status).toBe('disabled');

            await api(adminA).post(`/evses/${id}/connectors`, { connectorNumber: 1, connectorType: 'TYPE2', maxPowerKw: 22 }).expect(409);
            const two = await api(adminA).post(`/evses/${id}/connectors`, { connectorNumber: 2, connectorType: 'TYPE2', maxPowerKw: 22 }).expect(201);
            expect(two.body.connectors.map((c: { connectorNumber: number }) => c.connectorNumber)).toEqual([1, 2]);
            await api(adminA).post(`/evses/${id}/connectors`, { connectorNumber: 2, connectorType: 'TYPE2', maxPowerKw: 22 }).expect(409);

            const listed = await api(adminA).get(`/evses/${id}/connectors`).expect(200);
            expect(listed.body).toHaveLength(2);
        });

        it('moves a charger within its network only', async () => {
            const moved = await api(adminA).patch(`/evses/${evseId}`, { stationId: stA2 }).expect(200);
            expect(moved.body.stationId).toBe(stA2);
            await api(root).patch(`/evses/${evseId}`, { stationId: stB1 }).expect(409);
            await api(adminA).patch(`/evses/${evseId}`, { stationId: stA1 }).expect(200);
        });
    });

    describe('who sees which chargers', () => {
        it('a Station Admin sees only the chargers of their station, read only', async () => {
            const list = await api(stationAdmin).get('/evses').expect(200);
            expect(new Set(list.body.items.map((e: { stationId: string }) => e.stationId))).toEqual(new Set([stA1]));
            const own = list.body.items[0];
            await api(stationAdmin).patch(`/evses/${own.id}`, { name: 'mine' }).expect(403);
            const other = (await api(adminA).get(`/evses?stationId=${stA2}`).expect(200)).body.items[0];
            await api(stationAdmin).get(`/evses/${other.id}`).expect(404);
        });

        it('a Network Admin sees only their network; filters by station', async () => {
            await api(root).post('/evses', charger(stB1, 'B1-01')).expect(201);
            const list = await api(adminA).get('/evses?pageSize=100').expect(200);
            expect(new Set(list.body.items.map((e: { networkId: string }) => e.networkId))).toEqual(new Set([netA]));
            const all = await api(root).get('/evses?pageSize=100').expect(200);
            expect(all.body.total).toBe(list.body.total + 1);
            const b1 = (await api(root).get(`/evses?stationId=${stB1}`).expect(200)).body.items[0];
            await api(adminA).get(`/evses/${b1.id}`).expect(404);
        });

        it('a suspended network gets no new chargers', async () => {
            await api(root).patch(`/networks/${netB}`, { status: 'suspended' }).expect(200);
            const res = await api(root).post('/evses', charger(stB1, 'B1-02')).expect(409);
            expect(res.body.error.code).toBe('NETWORK_NOT_ACTIVE');
            await api(root).patch(`/networks/${netB}`, { status: 'active' }).expect(200);
        });
    });

    describe('station details', () => {
        const hours = {
            type: 'weekly',
            days: { mon: [{ open: '06:00', close: '22:00' }], sat: [{ open: '08:00', close: '12:00' }, { open: '13:00', close: '24:00' }] },
        };

        it('stores address, location, hours, amenities and a local time zone', async () => {
            const res = await api(adminA).patch(`/stations/${stA1}`, {
                address: '  120 High Level Road, Kottawa ', phone: '+94 11 234 5678', latitude: 6.841234, longitude: 79.965432,
                timeZone: 'Asia/Colombo', operatingHours: hours, amenities: ['parking', 'food'],
            }).expect(200);
            expect(res.body).toMatchObject({
                address: '120 High Level Road, Kottawa', latitude: 6.841234, longitude: 79.965432, operatingHours: hours,
                amenities: ['parking', 'food'], publicVisible: false,
            });
            const cleared = await api(adminA).patch(`/stations/${stA1}`, { address: '', operatingHours: { type: 'always' } }).expect(200);
            expect(cleared.body).toMatchObject({ address: null, operatingHours: { type: 'always' } });
        });

        it('rejects bad details', async () => {
            const bad = (body: object) => api(adminA).patch(`/stations/${stA1}`, body).expect(400);
            await bad({ latitude: 91, longitude: 0 });
            await bad({ latitude: null }); // longitude would be left alone
            await bad({ operatingHours: { type: 'weekly', days: { mon: [{ open: '22:00', close: '06:00' }] } } });
            await bad({ operatingHours: { type: 'weekly', days: { funday: [] } } });
            await bad({ amenities: ['casino'] });
            await bad({ timeZone: 'Mars/Base' });
            await bad({ name: null });
        });

        it('shows a station in the app only with a location, and only network-level admins decide', async () => {
            const noLocation = await api(adminA).patch(`/stations/${stA2}`, { publicVisible: true }).expect(409);
            expect(noLocation.body.error.code).toBe('LOCATION_REQUIRED');
            await api(stationAdmin).patch(`/stations/${stA1}`, { publicVisible: true }).expect(403);
            await api(stationAdmin).patch(`/stations/${stA1}`, { phone: '+94 77 111 2222' }).expect(200);
            const shown = await api(adminA).patch(`/stations/${stA1}`, { publicVisible: true }).expect(200);
            expect(shown.body.publicVisible).toBe(true);
            // a visible station cannot lose its location
            await api(adminA).patch(`/stations/${stA1}`, { latitude: null, longitude: null }).expect(409);
        });
    });

    it('records every change in the audit log', async () => {
        const res = await api(root).get('/audit-logs?pageSize=100').expect(200);
        const actions = new Set(res.body.items.map((a: { action: string }) => a.action));
        for (const a of ['evse.create', 'evse.update', 'evse.status_change', 'evse.move', 'connector.create', 'connector.update',
            'connector.status_change', 'station.update', 'station.visibility_change']) {
            expect(actions).toContain(a);
        }
    });
});
