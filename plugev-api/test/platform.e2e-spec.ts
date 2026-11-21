import { Controller, Get } from '@nestjs/common';
import { createTestApp, login, seedSuperAdmin, bearer, TestApp } from './helpers';

/** A route that forgot to declare an access policy. The guard must refuse it (deny by default). */
@Controller('forgotten-policy')
class ForgottenPolicyController {
    @Get()
    secret() {
        return { leaked: true };
    }
}

describe('API platform: errors, correlation ids, health, docs, deny-by-default', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await createTestApp({ controllers: [ForgottenPolicyController] });
        await seedSuperAdmin(t.db);
    });
    afterAll(() => t.close());

    it('health: live and ready (database up, migrations applied)', async () => {
        await t.http.get('/api/v1/health/live').expect(200, { status: 'ok' });
        const ready = await t.http.get('/api/v1/health/ready').expect(200);
        expect(ready.body).toEqual({ status: 'ok', database: 'up', migrations: 'applied' });
    });

    it('publishes the OpenAPI document', async () => {
        const res = await t.http.get('/api/docs/openapi.json').expect(200);
        expect(res.body.openapi).toMatch(/^3\./);
        expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/api/v1/auth/login', '/api/v1/users/me']));
    });

    it('echoes a caller supplied correlation id and uses it in error bodies', async () => {
        const res = await t.http.get('/api/v1/users/me').set('X-Correlation-Id', 'abc-123').expect(401);
        expect(res.headers['x-correlation-id']).toBe('abc-123');
        expect(res.body).toEqual({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required', correlationId: 'abc-123' } });
    });

    it('generates a correlation id when none (or a malformed one) is sent', async () => {
        const res = await t.http.get('/api/v1/health/live').set('X-Correlation-Id', 'bad id with spaces');
        expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('unknown routes use the standard error shape', async () => {
        const res = await t.http.get('/api/v1/nope').expect(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(res.body.error.correlationId).toBeTruthy();
    });

    it('validation errors list the fields, and unknown fields are rejected', async () => {
        const res = await t.http.post('/api/v1/auth/login').send({ email: 'not-an-email', password: 'x', extra: 1 }).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_FAILED');
        const fields = res.body.error.details.map((d: { field: string }) => d.field);
        expect(fields).toEqual(expect.arrayContaining(['email', 'extra']));
    });

    it('malformed JSON gets INVALID_JSON, without internals', async () => {
        const res = await t.http.post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":').expect(400);
        expect(res.body.error.code).toBe('INVALID_JSON');
        expect(JSON.stringify(res.body)).not.toMatch(/stack|at .*\.js/);
    });

    it('a route without an access policy is refused even for a Super Admin', async () => {
        const s = await login(t, 'root@plugev.test');
        const res = await t.http.get('/api/v1/forgotten-policy').set(bearer(s)).expect(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect(res.body).not.toHaveProperty('leaked');
    });

    it('CORS only allows the configured portal origin', async () => {
        const ok = await t.http.options('/api/v1/auth/login')
            .set('Origin', 'http://portal.test').set('Access-Control-Request-Method', 'POST');
        expect(ok.headers['access-control-allow-origin']).toBe('http://portal.test');
        const bad = await t.http.options('/api/v1/auth/login')
            .set('Origin', 'http://evil.test').set('Access-Control-Request-Method', 'POST');
        expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });
});

describe('rate limiting on authentication endpoints', () => {
    let t: TestApp;
    beforeAll(async () => { t = await createTestApp({ env: { AUTH_RATE_LIMIT_PER_MIN: '3' } }); });
    afterAll(() => t.close());

    it('returns 429 RATE_LIMITED after the per-minute limit', async () => {
        const attempt = () => t.http.post('/api/v1/auth/login').send({ email: 'x@plugev.test', password: 'whatever' });
        for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
        const res = await attempt();
        expect(res.status).toBe(429);
        expect(res.body.error.code).toBe('RATE_LIMITED');
        // Other endpoints are not affected by the auth limit.
        await t.http.get('/api/v1/health/live').expect(200);
    });
});
