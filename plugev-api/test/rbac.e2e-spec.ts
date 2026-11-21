import { bearer, createTestApp, inviteAndActivate, login, seedSuperAdmin, Session, TestApp } from './helpers';

/**
 * Tenant isolation and role scope (spec 2.2, 3.1-3.3; AC 02/03).
 * Two networks, A and B. Each has a Network Admin; network A has two stations, one with a Station Admin.
 */
describe('RBAC with network and station scope', () => {
    let t: TestApp;
    let root: Session;
    let netA: string, netB: string, stA1: string, stA2: string, stB1: string;
    let adminA: Session, adminB: Session, stationAdminA1: Session;

    beforeAll(async () => {
        t = await createTestApp();
        await seedSuperAdmin(t.db);
        root = await login(t, 'root@plugev.test');
        const post = (path: string, body: object) => t.http.post(`/api/v1${path}`).set(bearer(root)).send(body).expect(201);

        netA = (await post('/networks', { name: 'Network A' })).body.id;
        netB = (await post('/networks', { name: 'Network B' })).body.id;
        stA1 = (await post('/stations', { networkId: netA, name: 'A1' })).body.id;
        stA2 = (await post('/stations', { networkId: netA, name: 'A2' })).body.id;
        stB1 = (await post('/stations', { networkId: netB, name: 'B1' })).body.id;

        adminA = await inviteAndActivate(t, root, { email: 'admin-a@plugev.test', role: 'NETWORK_ADMIN', networkId: netA });
        adminB = await inviteAndActivate(t, root, { email: 'admin-b@plugev.test', role: 'NETWORK_ADMIN', networkId: netB });
        stationAdminA1 = await inviteAndActivate(t, adminA, { email: 'station-a1@plugev.test', role: 'STATION_ADMIN', stationId: stA1 });
    });
    afterAll(() => t.close());

    const get = (s: Session, path: string) => t.http.get(`/api/v1${path}`).set(bearer(s));

    describe('Network Admin', () => {
        it('sees only their own network; other networks look like they do not exist', async () => {
            const list = await get(adminA, '/networks').expect(200);
            expect(list.body.items.map((n: { id: string }) => n.id)).toEqual([netA]);
            expect(list.body.total).toBe(1);
            await get(adminA, `/networks/${netA}`).expect(200);
            const other = await get(adminA, `/networks/${netB}`).expect(404);
            expect(other.body.error.code).toBe('NOT_FOUND');
        });

        it('can edit their network but not suspend it or create networks', async () => {
            await t.http.patch(`/api/v1/networks/${netA}`).set(bearer(adminA)).send({ timeZone: 'Asia/Colombo', name: 'Network A (Colombo)' }).expect(200);
            await t.http.patch(`/api/v1/networks/${netB}`).set(bearer(adminA)).send({ name: 'pwned' }).expect(404);
            const suspend = await t.http.patch(`/api/v1/networks/${netA}`).set(bearer(adminA)).send({ status: 'suspended' }).expect(403);
            expect(suspend.body.error.code).toBe('FORBIDDEN');
            await t.http.post('/api/v1/networks').set(bearer(adminA)).send({ name: 'Mine' }).expect(403);
        });

        it('creates stations only in their network, even when naming another network id', async () => {
            await t.http.post('/api/v1/stations').set(bearer(adminA)).send({ networkId: netA, name: 'A3' }).expect(201);
            await t.http.post('/api/v1/stations').set(bearer(adminA)).send({ networkId: netB, name: 'Sneaky' }).expect(404);
            const list = await get(adminA, '/stations').expect(200);
            expect(new Set(list.body.items.map((s: { networkId: string }) => s.networkId))).toEqual(new Set([netA]));
            await get(adminA, `/stations/${stB1}`).expect(404);
            // asking for another network's stations by filter returns nothing rather than leaking
            const filtered = await get(adminA, `/stations?networkId=${netB}`).expect(200);
            expect(filtered.body.items).toEqual([]);
        });

        it('can invite Station Admins for own stations only, and cannot create Network or Super Admins', async () => {
            await t.http.post('/api/v1/users').set(bearer(adminA))
                .send({ email: 'sa-b@plugev.test', fullName: 'x', role: 'STATION_ADMIN', stationId: stB1 }).expect(404);
            const na = await t.http.post('/api/v1/users').set(bearer(adminA))
                .send({ email: 'na2@plugev.test', fullName: 'x', role: 'NETWORK_ADMIN', networkId: netA }).expect(403);
            expect(na.body.error.code).toBe('FORBIDDEN');
            await t.http.post('/api/v1/users').set(bearer(adminA))
                .send({ email: 'su@plugev.test', fullName: 'x', role: 'SUPER_ADMIN' }).expect(403);
            await t.http.post('/api/v1/users').set(bearer(adminA))
                .send({ email: 'sa-a2@plugev.test', fullName: 'Station A2', role: 'STATION_ADMIN', stationId: stA2 }).expect(201);
        });

        it('lists only users of their own network', async () => {
            const res = await get(adminA, '/users?pageSize=100').expect(200);
            const emails = res.body.items.map((u: { email: string }) => u.email).sort();
            expect(emails).toEqual(['admin-a@plugev.test', 'sa-a2@plugev.test', 'station-a1@plugev.test']);
            await get(adminA, `/users/${adminB.userId}`).expect(404);
            await get(adminA, `/users/${root.userId}`).expect(404);
        });

        it('manages Station Admins of their network, but not peers or users elsewhere', async () => {
            const peer = await inviteAndActivate(t, root, { email: 'admin-a2@plugev.test', role: 'NETWORK_ADMIN', networkId: netA });
            const res = await t.http.patch(`/api/v1/users/${peer.userId}/status`).set(bearer(adminA))
                .send({ status: 'suspended', reason: 'x' }).expect(403);
            expect(res.body.error.message).toMatch(/Station Admins/);
            await t.http.patch(`/api/v1/users/${adminB.userId}/status`).set(bearer(adminA))
                .send({ status: 'suspended', reason: 'x' }).expect(404);

            await t.http.patch(`/api/v1/users/${stationAdminA1.userId}/status`).set(bearer(adminA))
                .send({ status: 'suspended', reason: 'Investigation' }).expect(200);
            await get(stationAdminA1, '/users/me').expect(401);
            await t.http.patch(`/api/v1/users/${stationAdminA1.userId}/status`).set(bearer(adminA))
                .send({ status: 'active', reason: 'Cleared' }).expect(200);
            stationAdminA1 = await login(t, 'station-a1@plugev.test');
        });

        it('can add and remove a second station for a Station Admin', async () => {
            const added = await t.http.post(`/api/v1/users/${stationAdminA1.userId}/roles`).set(bearer(adminA))
                .send({ role: 'STATION_ADMIN', stationId: stA2 }).expect(201);
            const grant = added.body.roles.find((r: { stationId: string }) => r.stationId === stA2);
            const dup = await t.http.post(`/api/v1/users/${stationAdminA1.userId}/roles`).set(bearer(adminA))
                .send({ role: 'STATION_ADMIN', stationId: stA2 }).expect(409);
            expect(dup.body.error.code).toBe('ROLE_ALREADY_ASSIGNED');
            await get(stationAdminA1, `/stations/${stA2}`).expect(200);

            await t.http.delete(`/api/v1/users/${stationAdminA1.userId}/roles/${grant.assignmentId}`).set(bearer(adminA)).expect(200);
            await get(stationAdminA1, `/stations/${stA2}`).expect(404); // takes effect immediately
        });

        it('reads audit records of their own network only', async () => {
            const res = await get(adminA, '/audit-logs?pageSize=100').expect(200);
            expect(res.body.total).toBeGreaterThan(0);
            expect(res.body.items.every((a: { networkId: string }) => a.networkId === netA)).toBe(true);
            const all = await get(root, '/audit-logs?pageSize=100').expect(200);
            expect(all.body.items.some((a: { networkId: string }) => a.networkId === netB)).toBe(true);
        });
    });

    describe('Station Admin', () => {
        it('sees only assigned stations and nothing at network level', async () => {
            const list = await get(stationAdminA1, '/stations').expect(200);
            expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([stA1]);
            await get(stationAdminA1, `/stations/${stA2}`).expect(404);
            await get(stationAdminA1, `/networks/${netA}`).expect(403); // no network.read at all
        });

        it('cannot manage users, create stations or read the audit log', async () => {
            await get(stationAdminA1, '/users').expect(403);
            await t.http.post('/api/v1/stations').set(bearer(stationAdminA1)).send({ networkId: netA, name: 'x' }).expect(403);
            await get(stationAdminA1, '/audit-logs').expect(403);
        });
    });

    describe('Super Admin', () => {
        it('sees all networks and users', async () => {
            const nets = await get(root, '/networks').expect(200);
            expect(nets.body.total).toBe(2);
            const users = await get(root, '/users?pageSize=100').expect(200);
            expect(users.body.total).toBeGreaterThanOrEqual(6);
        });

        it('suspending a network cuts off its admins at once', async () => {
            await t.http.patch(`/api/v1/networks/${netB}`).set(bearer(root)).send({ status: 'suspended' }).expect(200);
            const res = await get(adminB, '/networks').expect(403);
            expect(res.body.error.code).toBe('FORBIDDEN');
            // their profile still works, with no permissions left
            const me = await get(adminB, '/users/me').expect(200);
            expect(me.body.permissions).toEqual([]);
            await t.http.post('/api/v1/stations').set(bearer(root)).send({ networkId: netB, name: 'B2' }).expect(409);

            await t.http.patch(`/api/v1/networks/${netB}`).set(bearer(root)).send({ status: 'active' }).expect(200);
            await get(adminB, '/networks').expect(200);
        });

        it('every privileged change is in the audit log with actor and correlation id', async () => {
            await t.http.post('/api/v1/networks').set(bearer(root)).set('X-Correlation-Id', 'corr-net-c').send({ name: 'Network C' }).expect(201);
            const res = await get(root, '/audit-logs?action=network.create&pageSize=100').expect(200);
            const entry = res.body.items.find((a: { correlationId: string }) => a.correlationId === 'corr-net-c');
            expect(entry).toMatchObject({ actorUserId: root.userId, actorRoles: ['SUPER_ADMIN'], outcome: 'success', resourceType: 'network' });

            const actions = new Set((await get(root, '/audit-logs?pageSize=100').expect(200)).body.items.map((a: { action: string }) => a.action));
            for (const a of ['network.create', 'network.update', 'network.status_change', 'station.create', 'user.invite',
                'user.invite_accepted', 'user.status_change', 'role.assign', 'role.revoke']) {
                expect(actions).toContain(a);
            }
        });
    });

    describe('database guarantees', () => {
        it('audit and login event rows cannot be changed or deleted, even with direct SQL', async () => {
            await expect(t.db.query(`UPDATE audit_logs SET action = 'tampered'`)).rejects.toThrow(/append-only/);
            await expect(t.db.query(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
            await expect(t.db.query(`TRUNCATE audit_logs`)).rejects.toThrow(/append-only/);
            await expect(t.db.query(`DELETE FROM login_events`)).rejects.toThrow(/append-only/);
        });

        it('a role cannot be stored with the wrong kind of scope', async () => {
            await expect(t.db.query(
                `INSERT INTO user_role_assignments (user_id, role_code, network_id) VALUES ($1, 'STATION_ADMIN', $2)`,
                [adminA.userId, netA])).rejects.toThrow(/requires station_id/);
            await expect(t.db.query(
                `INSERT INTO user_role_assignments (user_id, role_code, network_id) VALUES ($1, 'SUPER_ADMIN', $2)`,
                [adminA.userId, netA])).rejects.toThrow(/cannot be scoped/);
        });
    });
});
