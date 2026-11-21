import { bearer, createTestApp, inviteAndActivate, login, PASSWORD, seedSuperAdmin, Session, TestApp } from './helpers';

const ROOT = 'root@plugev.test';

async function loginEvents(t: TestApp, email: string): Promise<{ event_type: string; reason: string | null }[]> {
    return t.db.query(`SELECT event_type, reason FROM login_events WHERE email = $1 ORDER BY created_at`, [email]);
}

describe('authentication (FR AUTH 001-006)', () => {
    let t: TestApp;
    let root: Session;

    beforeAll(async () => {
        t = await createTestApp();
        await seedSuperAdmin(t.db, ROOT);
        root = await login(t, ROOT);
    });
    afterAll(() => t.close());

    it('login returns a short-lived bearer token, a refresh token and the user', async () => {
        const res = await t.http.post('/api/v1/auth/login').send({ email: '  ROOT@plugev.test ', password: PASSWORD }).expect(200);
        expect(res.body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, user: { email: ROOT } });
        expect(res.body.accessToken.split('.')).toHaveLength(3);
        expect(res.body.refreshToken).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/);
    });

    it('/users/me shows roles and effective permissions', async () => {
        const res = await t.http.get('/api/v1/users/me').set(bearer(root)).expect(200);
        expect(res.body.roles).toEqual([expect.objectContaining({ role: 'SUPER_ADMIN', networkId: null, stationId: null })]);
        expect(res.body.permissions).toEqual(expect.arrayContaining(['network.create', 'audit.read']));
        expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('wrong password and unknown email give the same answer, and both are logged', async () => {
        const a = await t.http.post('/api/v1/auth/login').send({ email: ROOT, password: 'wrong password!!' }).expect(401);
        const b = await t.http.post('/api/v1/auth/login').send({ email: 'ghost@plugev.test', password: 'wrong password!!' }).expect(401);
        expect(a.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(b.body.error).toMatchObject({ code: a.body.error.code, message: a.body.error.message });
        expect(await loginEvents(t, 'ghost@plugev.test')).toEqual([{ event_type: 'login_failed', reason: 'unknown_email' }]);
        // reset the failure counter for the next tests
        await login(t, ROOT);
    });

    it('rejects tampered or missing tokens', async () => {
        const tampered = root.accessToken.slice(0, -2) + (root.accessToken.endsWith('a') ? 'bb' : 'aa');
        const res = await t.http.get('/api/v1/users/me').set(bearer(tampered)).expect(401);
        expect(res.body.error.code).toBe('TOKEN_INVALID');
        await t.http.get('/api/v1/users/me').expect(401);
    });

    describe('refresh token rotation', () => {
        it('a refresh returns a new pair; the old refresh token stops working', async () => {
            const s = await login(t, ROOT);
            const r1 = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
            expect(r1.body.refreshToken).not.toBe(s.refreshToken);
            await t.http.get('/api/v1/users/me').set(bearer(r1.body.accessToken)).expect(200);
            const r2 = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }).expect(200);
            expect(r2.body.refreshToken).not.toBe(r1.body.refreshToken);
        });

        it('reusing a rotated token revokes the whole session family and is audited', async () => {
            const s = await login(t, ROOT);
            const fresh = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);

            // An attacker replays the old token:
            const replay = await t.http.post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
            expect(replay.body.error.code).toBe('TOKEN_INVALID');
            // ...so the legitimate newest token is now dead too.
            await t.http.post('/api/v1/auth/refresh').send({ refreshToken: fresh.body.refreshToken }).expect(401);

            const [audit] = await t.db.query(`SELECT outcome FROM audit_logs WHERE action = 'auth.refresh_token_reuse'`);
            expect(audit).toEqual({ outcome: 'denied' });
        });

        it('garbage and forged refresh tokens are rejected', async () => {
            await t.http.post('/api/v1/auth/refresh').send({ refreshToken: 'nonsense' }).expect(401);
            const s = await login(t, ROOT);
            const forged = s.refreshToken.split('.')[0] + '.' + 'A'.repeat(43);
            await t.http.post('/api/v1/auth/refresh').send({ refreshToken: forged }).expect(401);
        });

        it('logout ends the session', async () => {
            const s = await login(t, ROOT);
            await t.http.post('/api/v1/auth/logout').send({ refreshToken: s.refreshToken }).expect(204);
            await t.http.post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
            // idempotent
            await t.http.post('/api/v1/auth/logout').send({ refreshToken: s.refreshToken }).expect(204);
        });
    });

    describe('account lockout', () => {
        it('locks after 5 failures, even for the right password, and records it', async () => {
            const network = await t.http.post('/api/v1/networks').set(bearer(root)).send({ name: 'Lock Test' }).expect(201);
            const victim = 'locked@plugev.test';
            await inviteAndActivate(t, root, { email: victim, role: 'NETWORK_ADMIN', networkId: network.body.id });

            for (let i = 0; i < 5; i++) {
                await t.http.post('/api/v1/auth/login').send({ email: victim, password: 'nope nope nope' }).expect(401);
            }
            const res = await t.http.post('/api/v1/auth/login').send({ email: victim, password: PASSWORD }).expect(403);
            expect(res.body.error.code).toBe('ACCOUNT_LOCKED');

            const events = (await loginEvents(t, victim)).map(e => e.event_type);
            expect(events).toEqual(expect.arrayContaining(['account_locked']));
            const [audit] = await t.db.query(`SELECT action FROM audit_logs WHERE action = 'user.locked'`);
            expect(audit).toBeTruthy();

            // An administrator reactivating the account clears the lock.
            await t.db.query(`UPDATE users SET locked_until = now() - interval '1 second' WHERE email = $1`, [victim]);
            await login(t, victim);
        });
    });

    describe('invitations and password reset (FR AUTH 002)', () => {
        let networkId: string;
        beforeAll(async () => {
            networkId = (await t.http.post('/api/v1/networks').set(bearer(root)).send({ name: 'Invite Test' }).expect(201)).body.id;
        });

        it('an invited user cannot sign in until the invitation is accepted', async () => {
            const email = 'invitee@plugev.test';
            const res = await t.http.post('/api/v1/users').set(bearer(root))
                .send({ email, fullName: 'In Vitee', role: 'NETWORK_ADMIN', networkId }).expect(201);
            expect(res.body).toMatchObject({ email, status: 'invited', roles: [expect.objectContaining({ role: 'NETWORK_ADMIN', networkId })] });

            await t.http.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(401);

            const token = t.mail.tokenFor(email, 'invite');
            const weak = await t.http.post('/api/v1/auth/password/reset/confirm').send({ token, newPassword: 'short' }).expect(400);
            expect(weak.body.error.code).toBe('VALIDATION_FAILED');

            await t.http.post('/api/v1/auth/password/reset/confirm').send({ token, newPassword: PASSWORD }).expect(204);
            await login(t, email);
            // single use
            await t.http.post('/api/v1/auth/password/reset/confirm').send({ token, newPassword: PASSWORD }).expect(400);
        });

        it('duplicate email is refused', async () => {
            const res = await t.http.post('/api/v1/users').set(bearer(root))
                .send({ email: 'invitee@plugev.test', fullName: 'Again', role: 'NETWORK_ADMIN', networkId }).expect(409);
            expect(res.body.error.code).toBe('EMAIL_TAKEN');
        });

        it('reset: always 202, link works once, old password and sessions stop working', async () => {
            const email = 'invitee@plugev.test';
            const before = await login(t, email);
            const sentBefore = t.mail.sent.length;

            await t.http.post('/api/v1/auth/password/reset').send({ email: 'nobody@plugev.test' }).expect(202);
            expect(t.mail.sent.length).toBe(sentBefore); // nothing sent for unknown accounts

            await t.http.post('/api/v1/auth/password/reset').send({ email }).expect(202);
            const token = t.mail.tokenFor(email, 'reset');
            const newPassword = 'a brand new passphrase 42';
            await t.http.post('/api/v1/auth/password/reset/confirm').send({ token, newPassword }).expect(204);

            await t.http.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(401);
            await login(t, email, newPassword);
            await t.http.post('/api/v1/auth/refresh').send({ refreshToken: before.refreshToken }).expect(401);
            await t.http.post('/api/v1/auth/password/reset/confirm').send({ token, newPassword: PASSWORD }).expect(400);
        });

        it('a new reset request voids the previous link', async () => {
            const email = 'invitee@plugev.test';
            await t.http.post('/api/v1/auth/password/reset').send({ email }).expect(202);
            const first = t.mail.tokenFor(email, 'reset');
            await t.http.post('/api/v1/auth/password/reset').send({ email }).expect(202);
            await t.http.post('/api/v1/auth/password/reset/confirm').send({ token: first, newPassword: PASSWORD }).expect(400);
        });
    });

    describe('account status (FR AUTH 004)', () => {
        it('suspension blocks the user immediately, including an already issued access token', async () => {
            const network = await t.http.post('/api/v1/networks').set(bearer(root)).send({ name: 'Status Test' }).expect(201);
            const email = 'suspend-me@plugev.test';
            const s = await inviteAndActivate(t, root, { email, role: 'NETWORK_ADMIN', networkId: network.body.id });

            const noReason = await t.http.patch(`/api/v1/users/${s.userId}/status`).set(bearer(root)).send({ status: 'suspended' }).expect(400);
            expect(noReason.body.error.code).toBe('VALIDATION_FAILED');

            await t.http.patch(`/api/v1/users/${s.userId}/status`).set(bearer(root))
                .send({ status: 'suspended', reason: 'Left the company' }).expect(200);

            const me = await t.http.get('/api/v1/users/me').set(bearer(s)).expect(401);
            expect(me.body.error.code).toBe('ACCOUNT_INACTIVE');
            await t.http.post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
            const relogin = await t.http.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(403);
            expect(relogin.body.error.code).toBe('ACCOUNT_INACTIVE');

            // controlled reactivation
            await t.http.patch(`/api/v1/users/${s.userId}/status`).set(bearer(root))
                .send({ status: 'active', reason: 'Returned' }).expect(200);
            await login(t, email);

            const [audit] = await t.db.query(
                `SELECT details FROM audit_logs WHERE action = 'user.status_change' AND resource_id = $1 ORDER BY occurred_at LIMIT 1`, [s.userId]);
            expect(audit.details).toEqual({ from: 'active', to: 'suspended', reason: 'Left the company' });
        });

        it('you cannot change your own status, and the last Super Admin cannot be removed', async () => {
            const self = await t.http.patch(`/api/v1/users/${root.userId}/status`).set(bearer(root))
                .send({ status: 'suspended', reason: 'test' }).expect(400);
            expect(self.body.error.code).toBe('CANNOT_CHANGE_OWN_ACCESS');

            const me = await t.http.get('/api/v1/users/me').set(bearer(root)).expect(200);
            const res = await t.http.delete(`/api/v1/users/${root.userId}/roles/${me.body.roles[0].assignmentId}`).set(bearer(root)).expect(400);
            expect(res.body.error.code).toBe('CANNOT_CHANGE_OWN_ACCESS');
        });
    });

    it('security events are recorded (FR AUTH 005)', async () => {
        const types = (await t.db.query(`SELECT DISTINCT event_type FROM login_events`)).map((r: { event_type: string }) => r.event_type);
        expect(types).toEqual(expect.arrayContaining([
            'login_succeeded', 'login_failed', 'account_locked', 'logout', 'token_refreshed',
            'refresh_token_reuse', 'password_reset_requested', 'password_reset_completed', 'invite_accepted',
        ]));
    });

    it('passwords are stored as Argon2id hashes, never in plain text', async () => {
        const [row] = await t.db.query(`SELECT password_hash FROM users WHERE email = $1`, [ROOT]);
        expect(row.password_hash).toMatch(/^\$argon2id\$/);
    });
});
