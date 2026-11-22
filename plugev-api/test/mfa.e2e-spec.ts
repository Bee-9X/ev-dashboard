import { totpCode, totpStep } from '../src/auth/totp';
import { bearer, createTestApp, PASSWORD, seedSuperAdmin, Session, TestApp } from './helpers';

/**
 * MFA (FR AUTH 003) with the shipped policy: Super Admin and Network Admin must use MFA,
 * Station Admin may opt in.
 */
describe('multi-factor authentication', () => {
    let t: TestApp;
    const secrets = new Map<string, string>(); // email -> TOTP secret, as the user's phone would hold it
    let root: Session;
    let networkId: string;
    let stationId: string;

    const api = (path: string) => `/api/v1${path}`;
    const password = (email: string) => t.http.post(api('/auth/login')).send({ email, password: PASSWORD });

    /** Codes are single use per 30 s step; clear the marker so a test can sign in again within the same step. */
    const allowNextCode = (email: string) => t.db.query(`UPDATE users SET mfa_last_used_step = NULL WHERE email = $1`, [email]);

    async function enrollAtLogin(email: string): Promise<Session & { recoveryCodes: string[] }> {
        const step1 = await password(email).expect(200);
        expect(step1.body).toMatchObject({ status: 'mfa_enrollment_required', mfaTokenExpiresIn: 300 });
        expect(step1.body).not.toHaveProperty('accessToken');
        const setup = await t.http.post(api('/auth/mfa/enroll')).send({ mfaToken: step1.body.mfaToken }).expect(200);
        secrets.set(email, setup.body.secret);
        const done = await t.http.post(api('/auth/mfa/enroll/confirm'))
            .send({ mfaToken: step1.body.mfaToken, code: totpCode(setup.body.secret) }).expect(200);
        return { accessToken: done.body.accessToken, refreshToken: done.body.refreshToken, userId: done.body.user.id, recoveryCodes: done.body.recoveryCodes };
    }

    async function mfaLogin(email: string): Promise<Session> {
        await allowNextCode(email);
        const step1 = await password(email).expect(200);
        expect(step1.body.status).toBe('mfa_required');
        const res = await t.http.post(api('/auth/mfa/verify'))
            .send({ mfaToken: step1.body.mfaToken, code: totpCode(secrets.get(email)!) }).expect(200);
        return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, userId: res.body.user.id };
    }

    async function invite(by: Session, email: string, role: string, scope: object): Promise<void> {
        await t.http.post(api('/users')).set(bearer(by)).send({ email, fullName: email, role, ...scope }).expect(201);
        await t.http.post(api('/auth/password/reset/confirm'))
            .send({ token: t.mail.tokenFor(email, 'invite'), newPassword: PASSWORD }).expect(204);
    }

    beforeAll(async () => {
        t = await createTestApp({ requireMfa: true });
        await seedSuperAdmin(t.db, 'root@plugev.test');
    });
    afterAll(() => t.close());

    describe('first login of a role that requires MFA', () => {
        it('the password alone gives no access; the mfaToken is not an access token', async () => {
            const res = await password('root@plugev.test').expect(200);
            await t.http.get(api('/users/me')).set(bearer(res.body.mfaToken)).expect(401);
        });

        it('a wrong code during setup is refused', async () => {
            const step1 = await password('root@plugev.test').expect(200);
            await t.http.post(api('/auth/mfa/enroll')).send({ mfaToken: step1.body.mfaToken }).expect(200);
            const res = await t.http.post(api('/auth/mfa/enroll/confirm')).send({ mfaToken: step1.body.mfaToken, code: '000000' }).expect(401);
            expect(res.body.error.code).toBe('INVALID_MFA_CODE');
            await t.db.query(`UPDATE users SET failed_login_count = 0`);
        });

        it('setup with a valid code signs in and returns 10 one-time recovery codes', async () => {
            const s = await enrollAtLogin('root@plugev.test');
            root = s;
            expect(s.recoveryCodes).toHaveLength(10);
            expect(new Set(s.recoveryCodes).size).toBe(10);
            s.recoveryCodes.forEach(c => expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/));
            const me = await t.http.get(api('/users/me')).set(bearer(s)).expect(200);
            expect(me.body).toMatchObject({ mfaEnabled: true, mfaRequired: true });
            (root as Session & { recoveryCodes: string[] }).recoveryCodes = s.recoveryCodes;
        });

        it('the secret and recovery codes are not stored in readable form', async () => {
            const [row] = await t.db.query(`SELECT mfa_secret_encrypted FROM users WHERE email = 'root@plugev.test'`);
            expect(row.mfa_secret_encrypted).toMatch(/^v1\./);
            expect(row.mfa_secret_encrypted).not.toContain(secrets.get('root@plugev.test'));
            const codes = await t.db.query(`SELECT code_hash FROM mfa_recovery_codes`);
            expect(codes.map((c: { code_hash: string }) => c.code_hash)).not.toContain((root as unknown as { recoveryCodes: string[] }).recoveryCodes[0]);
        });
    });

    describe('signing in with MFA', () => {
        it('needs a valid code after the password', async () => {
            const s = await mfaLogin('root@plugev.test');
            await t.http.get(api('/users/me')).set(bearer(s)).expect(200);
        });

        it('a code cannot be used twice', async () => {
            await allowNextCode('root@plugev.test');
            const code = totpCode(secrets.get('root@plugev.test')!);
            const a = await password('root@plugev.test').expect(200);
            await t.http.post(api('/auth/mfa/verify')).send({ mfaToken: a.body.mfaToken, code }).expect(200);
            const b = await password('root@plugev.test').expect(200);
            const replay = await t.http.post(api('/auth/mfa/verify')).send({ mfaToken: b.body.mfaToken, code }).expect(401);
            expect(replay.body.error.code).toBe('INVALID_MFA_CODE');
        });

        it('old codes outside the clock-drift window are refused', async () => {
            await allowNextCode('root@plugev.test');
            const old = totpCode(secrets.get('root@plugev.test')!, totpStep() - 3);
            const a = await password('root@plugev.test').expect(200);
            await t.http.post(api('/auth/mfa/verify')).send({ mfaToken: a.body.mfaToken, code: old }).expect(401);
            await t.db.query(`UPDATE users SET failed_login_count = 0`);
        });

        it('a recovery code works exactly once', async () => {
            const code = (root as unknown as { recoveryCodes: string[] }).recoveryCodes[0];
            const a = await password('root@plugev.test').expect(200);
            await t.http.post(api('/auth/mfa/verify')).send({ mfaToken: a.body.mfaToken, recoveryCode: code.toLowerCase() }).expect(200);
            const b = await password('root@plugev.test').expect(200);
            await t.http.post(api('/auth/mfa/verify')).send({ mfaToken: b.body.mfaToken, recoveryCode: code }).expect(401);
            const status = await t.http.get(api('/users/me/mfa')).set(bearer(root)).expect(200);
            expect(status.body).toMatchObject({ enabled: true, required: true, recoveryCodesRemaining: 9 });
            await t.db.query(`UPDATE users SET failed_login_count = 0`);
        });

        it('an mfaToken for setup cannot be used to verify, and garbage tokens are refused', async () => {
            const res = await t.http.post(api('/auth/mfa/verify')).send({ mfaToken: 'nope', code: '123456' }).expect(401);
            expect(res.body.error.code).toBe('MFA_TOKEN_INVALID');
            const step1 = await password('root@plugev.test').expect(200);
            await t.http.post(api('/auth/mfa/enroll')).send({ mfaToken: step1.body.mfaToken }).expect(401); // challenge token, not enroll
        });

        it('wrong codes count towards the account lockout', async () => {
            const net = await t.http.post(api('/networks')).set(bearer(root)).send({ name: 'Net' }).expect(201);
            networkId = net.body.id;
            stationId = (await t.http.post(api('/stations')).set(bearer(root)).send({ networkId, name: 'St' }).expect(201)).body.id;
            await invite(root, 'victim@plugev.test', 'NETWORK_ADMIN', { networkId });
            await enrollAtLogin('victim@plugev.test');

            const step1 = await password('victim@plugev.test').expect(200);
            for (let i = 0; i < 5; i++) {
                await t.http.post(api('/auth/mfa/verify')).send({ mfaToken: step1.body.mfaToken, code: '000000' }).expect(401);
            }
            const locked = await t.http.post(api('/auth/mfa/verify'))
                .send({ mfaToken: step1.body.mfaToken, code: totpCode(secrets.get('victim@plugev.test')!) }).expect(403);
            expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
            await t.db.query(`UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE email = 'victim@plugev.test'`);
        });
    });

    describe('optional MFA (Station Admin)', () => {
        let sa: Session;

        it('signs in with a password only until they opt in', async () => {
            await invite(root, 'station@plugev.test', 'STATION_ADMIN', { stationId });
            const res = await password('station@plugev.test').expect(200);
            expect(res.body.status).toBe('authenticated');
            sa = { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, userId: res.body.user.id };
            const me = await t.http.get(api('/users/me')).set(bearer(sa)).expect(200);
            expect(me.body).toMatchObject({ mfaEnabled: false, mfaRequired: false });
        });

        it('can enable MFA from their profile; the next login asks for a code', async () => {
            const setup = await t.http.post(api('/users/me/mfa/setup')).set(bearer(sa)).expect(200);
            expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\/PLUG%20EV:station%40plugev\.test\?secret=/);
            secrets.set('station@plugev.test', setup.body.secret);
            const res = await t.http.post(api('/users/me/mfa/confirm')).set(bearer(sa)).send({ code: totpCode(setup.body.secret) }).expect(200);
            expect(res.body.recoveryCodes).toHaveLength(10);
            await t.http.post(api('/users/me/mfa/setup')).set(bearer(sa)).expect(409); // already on
            sa = await mfaLogin('station@plugev.test');
        });

        it('can regenerate recovery codes and turn MFA off with a current code', async () => {
            await allowNextCode('station@plugev.test');
            const regen = await t.http.post(api('/users/me/mfa/recovery-codes')).set(bearer(sa))
                .send({ code: totpCode(secrets.get('station@plugev.test')!) }).expect(200);
            expect(regen.body.recoveryCodes).toHaveLength(10);

            await t.http.delete(api('/users/me/mfa')).set(bearer(sa)).send({ code: '000000' }).expect(401);
            await allowNextCode('station@plugev.test');
            await t.http.delete(api('/users/me/mfa')).set(bearer(sa))
                .send({ code: totpCode(secrets.get('station@plugev.test')!) }).expect(204);
            expect((await password('station@plugev.test').expect(200)).body.status).toBe('authenticated');
        });
    });

    describe('administration', () => {
        it('a user whose role requires MFA cannot turn it off', async () => {
            await allowNextCode('root@plugev.test');
            const res = await t.http.delete(api('/users/me/mfa')).set(bearer(root))
                .send({ code: totpCode(secrets.get('root@plugev.test')!) }).expect(409);
            expect(res.body.error.code).toBe('MFA_REQUIRED_BY_ROLE');
        });

        it('a Super Admin can reset a lost authenticator; the user must set it up again', async () => {
            const victim = await mfaLogin('victim@plugev.test');
            const noReason = await t.http.post(api(`/users/${victim.userId}/mfa/reset`)).set(bearer(root)).send({}).expect(400);
            expect(noReason.body.error.code).toBe('VALIDATION_FAILED');
            const res = await t.http.post(api(`/users/${victim.userId}/mfa/reset`)).set(bearer(root))
                .send({ reason: 'Lost phone, identity checked by phone call' }).expect(200);
            expect(res.body.mfaEnabled).toBe(false);

            await t.http.post(api('/auth/refresh')).send({ refreshToken: victim.refreshToken }).expect(401); // sessions ended
            expect((await password('victim@plugev.test').expect(200)).body.status).toBe('mfa_enrollment_required');

            const [audit] = await t.db.query(`SELECT details FROM audit_logs WHERE action = 'user.mfa_reset'`);
            expect(audit.details).toEqual({ reason: 'Lost phone, identity checked by phone call' });
            await enrollAtLogin('victim@plugev.test');
        });

        it('a Network Admin cannot reset the Super Admin, and nobody can reset their own MFA this way', async () => {
            const na = await mfaLogin('victim@plugev.test');
            await t.http.post(api(`/users/${root.userId}/mfa/reset`)).set(bearer(na)).send({ reason: 'x' }).expect(404);
            const self = await t.http.post(api(`/users/${root.userId}/mfa/reset`)).set(bearer(root)).send({ reason: 'x' }).expect(400);
            expect(self.body.error.code).toBe('CANNOT_CHANGE_OWN_ACCESS');
        });

        it('the MFA requirement per role is visible and only a Super Admin can change it (audited)', async () => {
            const roles = await t.http.get(api('/roles')).set(bearer(root)).expect(200);
            const byCode = Object.fromEntries(roles.body.map((r: { code: string; mfaRequired: boolean }) => [r.code, r.mfaRequired]));
            expect(byCode).toEqual({ SUPER_ADMIN: true, NETWORK_ADMIN: true, STATION_ADMIN: false, EV_USER: false });

            const na = await mfaLogin('victim@plugev.test');
            await t.http.patch(api('/roles/STATION_ADMIN')).set(bearer(na)).send({ mfaRequired: true }).expect(403);
            await t.http.patch(api('/roles/NOPE')).set(bearer(root)).send({ mfaRequired: true }).expect(404);

            // Station Admin signed in without MFA; once the role requires it, the session cannot be renewed.
            const sa = await password('station@plugev.test').expect(200);
            const updated = await t.http.patch(api('/roles/STATION_ADMIN')).set(bearer(root)).send({ mfaRequired: true }).expect(200);
            expect(updated.body.mfaRequired).toBe(true);
            const refresh = await t.http.post(api('/auth/refresh')).send({ refreshToken: sa.body.refreshToken }).expect(401);
            expect(refresh.body.error.code).toBe('MFA_ENROLLMENT_REQUIRED');
            expect((await password('station@plugev.test').expect(200)).body.status).toBe('mfa_enrollment_required');

            const [audit] = await t.db.query(`SELECT details FROM audit_logs WHERE action = 'role.mfa_policy_change'`);
            expect(audit.details).toEqual({ from: false, to: true });
        });

        it('user listings show who has MFA', async () => {
            const res = await t.http.get(api('/users?pageSize=100')).set(bearer(root)).expect(200);
            const byEmail = Object.fromEntries(res.body.items.map((u: { email: string; mfaEnabled: boolean }) => [u.email, u.mfaEnabled]));
            expect(byEmail).toMatchObject({ 'root@plugev.test': true, 'victim@plugev.test': true, 'station@plugev.test': false });
        });

        it('every MFA event is in the security log', async () => {
            const types = (await t.db.query(`SELECT DISTINCT event_type FROM login_events`)).map((r: { event_type: string }) => r.event_type);
            expect(types).toEqual(expect.arrayContaining([
                'mfa_challenge_issued', 'mfa_failed', 'mfa_enabled', 'mfa_disabled', 'mfa_reset',
                'mfa_recovery_code_used', 'mfa_recovery_codes_regenerated', 'account_locked',
            ]));
        });
    });
});
