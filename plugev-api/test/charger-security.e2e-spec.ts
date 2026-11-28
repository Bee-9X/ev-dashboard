import { WebSocket } from 'ws';
import { ChargingServer } from '../src/charging/charging.server';
import { parseSoap } from '../src/charging/ocpp/xml';
import { bearer, createTestApp, inviteAndActivate, login, seedSuperAdmin, Session, TestApp } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSimulator } = require('../tools/simulate-charger.js') as {
    createSimulator(o: object): { start(): Promise<void>; stop(): void; state: { connected: boolean } };
};

const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/** Opens an OCPP-J WebSocket; resolves with 101 and the socket, or with the HTTP status it was refused with. */
const openWs = (port: number, identity: string, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; ws?: WebSocket; wwwAuthenticate?: string }>(resolve => {
        const ws = new WebSocket(`ws://localhost:${port}/ocpp/${identity}`, ['ocpp1.6'], { headers });
        ws.on('open', () => resolve({ status: 101, ws }));
        ws.on('unexpected-response', (_req, res) => {
            resolve({ status: res.statusCode!, wwwAuthenticate: res.headers['www-authenticate'] as string | undefined });
            ws.terminate();
        });
        ws.on('error', () => undefined);
    });

const soapEnvelope = (identity: string, action: string, body: string, from?: string) => {
    const element = action.charAt(0).toLowerCase() + action.slice(1) + 'Request';
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:cs="urn://Ocpp/Cs/2012/06/">
  <soap:Header><cs:chargeBoxIdentity>${identity}</cs:chargeBoxIdentity><wsa:Action>/${action}</wsa:Action>
    <wsa:MessageID>urn:uuid:${Math.random().toString(16).slice(2)}</wsa:MessageID>
    ${from ? `<wsa:From><wsa:Address>${from}</wsa:Address></wsa:From>` : ''}</soap:Header>
  <soap:Body><cs:${element}>${body}</cs:${element}></soap:Body>
</soap:Envelope>`;
};

/**
 * Charger connection security (spec 7.5, 11.4 "charger impersonation"; E3.2): per charger passwords (OCPP-J, HTTP
 * Basic) and allowed addresses (SOAP chargers such as the SETEC tablet), rotation, and who may change them.
 */
describe('Charger security', () => {
    let t: TestApp;
    let root: Session, adminA: Session, adminB: Session, stationAdmin: Session;
    let port: number;
    let jsonId: string, soapId: string;

    const api = (s: Session) => ({
        get: (path: string) => t.http.get(`/api/v1${path}`).set(bearer(s)),
        post: (path: string, body: object = {}) => t.http.post(`/api/v1${path}`).set(bearer(s)).send(body),
        put: (path: string, body: object) => t.http.put(`/api/v1${path}`).set(bearer(s)).send(body),
        delete: (path: string) => t.http.delete(`/api/v1${path}`).set(bearer(s)),
    });
    const security = async (id: string) => (await api(root).get(`/evses/${id}/security`).expect(200)).body;
    const soap = async (identity: string, action: string, body: string, opts: { xff?: string; auth?: string; from?: string } = {}) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/soap+xml; charset=utf-8' };
        if (opts.xff) headers['X-Forwarded-For'] = opts.xff;
        if (opts.auth) headers.Authorization = opts.auth;
        const res = await fetch(`http://localhost:${port}/ocpp/${identity}`, { method: 'POST', headers, body: soapEnvelope(identity, action, body, opts.from) });
        const text = await res.text();
        return { status: res.status, parsed: await parseSoap(text), wwwAuthenticate: res.headers.get('www-authenticate') };
    };
    const until = async <T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 8000): Promise<T> => {
        const end = Date.now() + ms;
        for (;;) {
            const v = await fn();
            if (v) return v;
            if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
            await new Promise(r => setTimeout(r, 50));
        }
    };

    beforeAll(async () => {
        // one trusted proxy, like ngrok in front of the charger port
        t = await createTestApp({ env: { OCPP_ENABLED: 'true', OCPP_PORT: '0', OCPP_TRUSTED_PROXIES: '1' } });
        port = t.app.get(ChargingServer).port!;
        await seedSuperAdmin(t.db);
        root = await login(t, 'root@plugev.test');
        const netA = (await api(root).post('/networks', { name: 'Network A' }).expect(201)).body.id;
        const netB = (await api(root).post('/networks', { name: 'Network B' }).expect(201)).body.id;
        const stA = (await api(root).post('/stations', { networkId: netA, name: 'A1' }).expect(201)).body.id;
        await api(root).post('/stations', { networkId: netB, name: 'B1' }).expect(201);
        const charger = (identity: string, protocol: string) => api(root).post('/evses', {
            stationId: stA, protocol, protocolIdentity: identity, vendor: 'PlugEV', model: 'Sim',
            connectors: [{ connectorNumber: 1, connectorType: 'CCS2', maxPowerKw: 50 }],
        }).expect(201).then(r => r.body.id as string);
        jsonId = await charger('SEC-J1', 'OCPP_1_6_J');
        soapId = await charger('SEC-S1', 'OCPP_1_5_S');
        adminA = await inviteAndActivate(t, root, { email: 'admin-a@plugev.test', role: 'NETWORK_ADMIN', networkId: netA });
        adminB = await inviteAndActivate(t, root, { email: 'admin-b@plugev.test', role: 'NETWORK_ADMIN', networkId: netB });
        stationAdmin = await inviteAndActivate(t, adminA, { email: 'st-a1@plugev.test', role: 'STATION_ADMIN', stationId: stA });
    });
    afterAll(() => t.close());

    it('starts with nothing set: not secured, but accepted outside production', async () => {
        expect(await security(jsonId)).toEqual({
            passwordSet: false, passwordSetAt: null, allowedAddresses: [], secured: false, unsecuredAccepted: true,
            lastAddress: null, lastRefusal: null,
        });
        const open = await openWs(port, 'SEC-J1');
        expect(open.status).toBe(101);
        open.ws!.close();
    });

    describe('a password (OCPP-J, HTTP Basic authentication)', () => {
        let password: string;

        it('is made by the platform, shown once and never stored or audited in plain text', async () => {
            const res = await api(adminA).post(`/evses/${jsonId}/security/password`).expect(200);
            expect(res.headers['cache-control']).toBe('no-store');
            password = res.body.password;
            expect(password).toMatch(/^[A-Za-z0-9]{24}$/);
            expect(res.body.security).toMatchObject({ passwordSet: true, secured: true });
            expect(JSON.stringify(await security(jsonId))).not.toContain(password);

            const [stored] = await t.db.query('SELECT password_hash, password_salt FROM charger_security WHERE evse_id = $1', [jsonId]);
            expect(stored.password_hash).toMatch(/^[0-9a-f]{64}$/);
            expect(stored.password_hash).not.toContain(password);
            const audits = await t.db.query(`SELECT action, details FROM audit_logs WHERE resource_id = $1 AND action LIKE 'evse.password%'`, [jsonId]);
            expect(audits).toEqual([{ action: 'evse.password_set', details: { protocolIdentity: 'SEC-J1', generated: true } }]);
        });

        it('is required: none, a wrong one, or another charger\'s user name are refused with 401', async () => {
            const none = await openWs(port, 'SEC-J1');
            expect(none.status).toBe(401);
            expect(none.wwwAuthenticate).toMatch(/^Basic realm="OCPP"/);
            await until(async () => (await security(jsonId)).lastRefusal?.reason === 'password_missing', 'refusal recorded');

            expect((await openWs(port, 'SEC-J1', { Authorization: basic('SEC-J1', 'wrong-password-123456') })).status).toBe(401);
            expect((await openWs(port, 'SEC-J1', { Authorization: basic('OTHER', password) })).status).toBe(401);
            const refused = await until(async () => {
                const s = await security(jsonId);
                return s.lastRefusal?.reason === 'password_wrong' && s;
            }, 'wrong password recorded');
            expect(refused.lastRefusal.address).toMatch(/127\.0\.0\.1|::1/);
        });

        it('lets the charger in with its password (the simulator, as OCPP 1.6 security profile 1)', async () => {
            const sim = createSimulator({ url: `ws://localhost:${port}/ocpp/SEC-J1`, password, log: () => undefined, reconnect: false });
            await sim.start();
            expect(sim.state.connected).toBe(true);
            const evse = await until(async () => {
                const e = (await api(root).get(`/evses/${jsonId}`).expect(200)).body;
                return e.live?.online && e;
            }, 'charger online');
            expect(evse.live.protocol).toBe('ocpp1.6-json');
            sim.stop();
        });

        it('replacing it closes the open connection; only the new one works from then on', async () => {
            const open = await openWs(port, 'SEC-J1', { Authorization: basic('sec-j1', password) }); // user name in any case
            expect(open.status).toBe(101);
            const closed = new Promise<number>(resolve => open.ws!.on('close', code => resolve(code)));

            const res = await api(adminA).post(`/evses/${jsonId}/security/password`, { password: 'Factory-Set-Password-42' }).expect(200);
            expect(res.body.password).toBe('Factory-Set-Password-42');
            expect(await closed).toBe(1008);

            expect((await openWs(port, 'SEC-J1', { Authorization: basic('SEC-J1', password) })).status).toBe(401);
            const fresh = await openWs(port, 'SEC-J1', { Authorization: basic('SEC-J1', 'Factory-Set-Password-42') });
            expect(fresh.status).toBe(101);
            fresh.ws!.close();
            const [audit] = await t.db.query(
                `SELECT details FROM audit_logs WHERE resource_id = $1 AND action = 'evse.password_replace'`, [jsonId]);
            expect(audit.details).toEqual({ protocolIdentity: 'SEC-J1', generated: false });
        });

        it('a password given by hand must be 16 to 40 characters', async () => {
            await api(adminA).post(`/evses/${jsonId}/security/password`, { password: 'short' }).expect(400);
            await api(adminA).post(`/evses/${jsonId}/security/password`, { password: 'has a space in it 1234' }).expect(400);
        });

        it('can be removed, after which the charger connects without one again', async () => {
            expect((await api(adminA).delete(`/evses/${jsonId}/security/password`).expect(200)).body).toMatchObject({ passwordSet: false, secured: false });
            const open = await openWs(port, 'SEC-J1');
            expect(open.status).toBe(101);
            open.ws!.close();
            expect((await t.db.query(`SELECT count(*)::int AS n FROM audit_logs WHERE resource_id = $1 AND action = 'evse.password_remove'`, [jsonId]))[0].n).toBe(1);
        });
    });

    describe('allowed addresses (for SOAP chargers, which cannot send a password)', () => {
        const boot = (opts: { xff?: string; auth?: string; from?: string } = {}) =>
            soap('SEC-S1', 'BootNotification', '<cs:chargePointVendor>Setec</cs:chargePointVendor><cs:chargePointModel>S1</cs:chargePointModel>', opts);

        it('rejects anything that is not an address or range, and tidies the rest', async () => {
            const bad = await api(adminA).put(`/evses/${soapId}/security/allowed-addresses`, { addresses: ['203.0.113.7', 'example.com'] }).expect(400);
            expect(bad.body.error.message).toContain('example.com');
            const res = await api(adminA).put(`/evses/${soapId}/security/allowed-addresses`, { addresses: [' 203.0.113.7 ', '198.51.100.0/24', '203.0.113.7', ''] }).expect(200);
            expect(res.body).toMatchObject({ allowedAddresses: ['203.0.113.7', '198.51.100.0/24'], secured: true, passwordSet: false });
        });

        it('accepts the charger from an allowed address, as reported by the trusted proxy', async () => {
            const ok = await boot({ xff: '203.0.113.7', from: 'http://203.0.113.7:8765/' });
            expect(ok.status).toBe(200);
            expect(ok.parsed.payload.status).toBe('Accepted');
            expect((await boot({ xff: '198.51.100.20' })).parsed.payload.status).toBe('Accepted');
            expect((await security(soapId)).lastAddress).toBe('198.51.100.20');
        });

        it('refuses other addresses, including one the charger puts in front of the proxy\'s entry', async () => {
            const other = await boot({ xff: '192.0.2.99', from: 'http://192.0.2.99:9999/' });
            expect(other.status).toBe(403);
            expect(other.parsed.fault).toMatchObject({ code: 'soap:Sender', reason: expect.stringMatching(/not allowed/) });
            const spoofed = await boot({ xff: '203.0.113.7, 192.0.2.99' });
            expect(spoofed.status).toBe(403);
            const s = await until(async () => {
                const v = await security(soapId);
                return v.lastRefusal?.reason === 'address_not_allowed' && v;
            }, 'refusal recorded');
            expect(s.lastRefusal.address).toBe('192.0.2.99');
            // a refused request must not change where commands go
            const [live] = await t.db.query('SELECT endpoint FROM evse_live_states WHERE evse_id = $1', [soapId]);
            expect(live.endpoint).not.toBe('http://192.0.2.99:9999/');
        });

        it('a password works over SOAP too, for chargers that can send one', async () => {
            const res = await api(adminA).post(`/evses/${soapId}/security/password`).expect(200);
            const missing = await boot({ xff: '203.0.113.7' });
            expect(missing.status).toBe(401);
            expect(missing.wwwAuthenticate).toMatch(/^Basic/);
            expect((await boot({ xff: '203.0.113.7', auth: basic('SEC-S1', res.body.password) })).parsed.payload.status).toBe('Accepted');
            // both must hold: the right password from a wrong address is still refused
            expect((await boot({ xff: '192.0.2.99', auth: basic('SEC-S1', res.body.password) })).status).toBe(403);
        });

        it('an empty list allows any address again, and the change is audited', async () => {
            await api(adminA).delete(`/evses/${soapId}/security/password`).expect(200);
            await api(adminA).put(`/evses/${soapId}/security/allowed-addresses`, { addresses: [] }).expect(200);
            expect((await boot({ xff: '192.0.2.99' })).parsed.payload.status).toBe('Accepted');
            const audits = await t.db.query(
                `SELECT details FROM audit_logs WHERE resource_id = $1 AND action = 'evse.allowed_addresses_change' ORDER BY occurred_at`, [soapId]);
            expect(audits.map((a: { details: { changes: { allowedAddresses: { to: string[] } } } }) => a.details.changes.allowedAddresses.to))
                .toEqual([['203.0.113.7', '198.51.100.0/24'], []]);
        });
    });

    describe('who may see and change it', () => {
        it('station admins see it but cannot change it', async () => {
            await api(stationAdmin).get(`/evses/${jsonId}/security`).expect(200);
            await api(stationAdmin).post(`/evses/${jsonId}/security/password`).expect(403);
            await api(stationAdmin).put(`/evses/${jsonId}/security/allowed-addresses`, { addresses: [] }).expect(403);
            await api(stationAdmin).delete(`/evses/${jsonId}/security/password`).expect(403);
        });

        it('admins of another network get 404, as if the charger did not exist', async () => {
            await api(adminB).get(`/evses/${jsonId}/security`).expect(404);
            await api(adminB).post(`/evses/${jsonId}/security/password`).expect(404);
        });
    });
});

describe('Charger security when unsecured chargers are not accepted (as in production)', () => {
    let t: TestApp;
    let root: Session;
    let port: number;
    let id: string;

    beforeAll(async () => {
        t = await createTestApp({ env: { OCPP_ENABLED: 'true', OCPP_PORT: '0', OCPP_ALLOW_UNSECURED_CHARGERS: 'false' } });
        port = t.app.get(ChargingServer).port!;
        await seedSuperAdmin(t.db);
        root = await login(t, 'root@plugev.test');
        const post = (path: string, body: object) => t.http.post(`/api/v1${path}`).set(bearer(root)).send(body).expect(201);
        const net = (await post('/networks', { name: 'Net' })).body.id;
        const st = (await post('/stations', { networkId: net, name: 'St' })).body.id;
        id = (await post('/evses', {
            stationId: st, protocol: 'OCPP_1_6_J', protocolIdentity: 'PROD-1', vendor: 'PlugEV', model: 'Sim',
            connectors: [{ connectorNumber: 1, connectorType: 'TYPE2', maxPowerKw: 7.4 }],
        })).body.id;
    });
    afterAll(() => t.close());

    it('refuses a charger with neither a password nor allowed addresses, and says why', async () => {
        expect((await openWs(port, 'PROD-1')).status).toBe(403);
        // the refusal is written in the background
        for (let i = 0; i < 50; i++) {
            const s = (await t.http.get(`/api/v1/evses/${id}/security`).set(bearer(root)).expect(200)).body;
            expect(s).toMatchObject({ secured: false, unsecuredAccepted: false });
            if (s.lastRefusal) {
                expect(s.lastRefusal.reason).toBe('not_secured');
                return;
            }
            await new Promise(r => setTimeout(r, 50));
        }
        throw new Error('the refusal was not recorded');
    });

    it('accepts it once it has a password', async () => {
        const { password } = (await t.http.post(`/api/v1/evses/${id}/security/password`).set(bearer(root)).send({}).expect(200)).body;
        const open = await openWs(port, 'PROD-1', { Authorization: basic('PROD-1', password) });
        expect(open.status).toBe(101);
        open.ws!.close();
    });
});
