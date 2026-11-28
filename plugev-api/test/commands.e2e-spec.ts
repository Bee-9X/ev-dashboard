import { createServer, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ChargingServer } from '../src/charging/charging.server';
import { bearer, createTestApp, inviteAndActivate, login, seedSuperAdmin, Session, TestApp } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createSimulator } = require('../tools/simulate-charger.js') as {
    createSimulator(o: object): { start(): Promise<void>; stop(): void; state: { connectors: Record<number, { status: string }> } };
};

/**
 * Remote commands from the portal (spec 5.3, 9.4, AC 11): permission and scope, audit, delivery over OCPP-J (the
 * simulator) and OCPP 1.5 SOAP (a fake charger standing in for the SETEC tablet), the charger's answer, and
 * confirmation from its later messages.
 */
describe('Remote commands', () => {
    let t: TestApp;
    let root: Session, adminA: Session, adminB: Session, stationAdmin: Session;
    let netA: string, stA1: string;
    let simId: string, offlineId: string, soapId: string;
    let ocppPort: number;
    let sim: ReturnType<typeof createSimulator>;

    const api = (s: Session) => ({
        get: (path: string) => t.http.get(`/api/v1${path}`).set(bearer(s)),
        post: (path: string, body: object = {}) => t.http.post(`/api/v1${path}`).set(bearer(s)).send(body),
        patch: (path: string, body: object) => t.http.patch(`/api/v1${path}`).set(bearer(s)).send(body),
    });
    const until = async <T>(fn: () => Promise<T | null | undefined | false>, what: string, ms = 10_000): Promise<T> => {
        const end = Date.now() + ms;
        for (;;) {
            const v = await fn();
            if (v) return v;
            if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
            await new Promise(r => setTimeout(r, 100));
        }
    };
    /** Sends a command and waits until the charger has answered. */
    const command = async (s: Session, evseId: string, name: string, body: object = {}) => {
        const res = await api(s).post(`/evses/${evseId}/commands/${name}`, body).expect(202);
        expect(res.body).toMatchObject({ status: 'queued', evseId });
        return until(async () => {
            const c = (await api(s).get(`/evses/${evseId}/commands/${res.body.id}`).expect(200)).body;
            return c.status !== 'queued' && c.status !== 'sent' && c;
        }, `answer to ${name}`);
    };
    const confirmed = (evseId: string, id: string) => until(async () => {
        const c = (await api(root).get(`/evses/${evseId}/commands/${id}`).expect(200)).body;
        return c.confirmation?.state === 'confirmed' && c;
    }, 'confirmation');

    /** A SOAP charger's command endpoint: records each request and answers like a charger would. */
    const fakeSoapCharger = (answer: (action: string) => string) => {
        const received: string[] = [];
        const server: Server = createServer((req, res) => {
            let body = '';
            req.on('data', c => (body += c));
            req.on('end', () => {
                received.push(body);
                const action = /<(?:\w+:)?(\w+)Request[\s>]/.exec(body)?.[1] ?? 'unknown';
                res.setHeader('Content-Type', 'application/soap+xml; charset=utf-8');
                res.end(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:cp="urn://Ocpp/Cp/2012/06/">
  <soap:Body><cp:${action}Response>${answer(action)}</cp:${action}Response></soap:Body>
</soap:Envelope>`);
            });
        });
        return new Promise<{ url: string; received: string[]; close: () => void }>(resolve => server.listen(0, () => resolve({
            url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, received, close: () => server.close(),
        })));
    };
    const soapToCharger = (identity: string, action: string, body: string, from?: string) => {
        const element = action.charAt(0).toLowerCase() + action.slice(1) + 'Request';
        return fetch(`http://localhost:${ocppPort}/ocpp/${identity}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
            body: `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:cs="urn://Ocpp/Cs/2012/06/">
  <soap:Header><cs:chargeBoxIdentity>${identity}</cs:chargeBoxIdentity><wsa:Action>/${action}</wsa:Action>
    <wsa:MessageID>urn:uuid:${Math.random().toString(16).slice(2)}</wsa:MessageID>
    ${from ? `<wsa:From><wsa:Address>${from}</wsa:Address></wsa:From>` : ''}</soap:Header>
  <soap:Body><cs:${element}>${body}</cs:${element}></soap:Body>
</soap:Envelope>`,
        }).then(r => r.text());
    };

    beforeAll(async () => {
        t = await createTestApp({ env: { OCPP_ENABLED: 'true', OCPP_PORT: '0', OCPP_SOAP_COMMAND_TIMEOUT_MS: '3000' } });
        ocppPort = t.app.get(ChargingServer).port!;
        await seedSuperAdmin(t.db);
        root = await login(t, 'root@plugev.test');
        netA = (await api(root).post('/networks', { name: 'Network A' }).expect(201)).body.id;
        const netB = (await api(root).post('/networks', { name: 'Network B' }).expect(201)).body.id;
        stA1 = (await api(root).post('/stations', { networkId: netA, name: 'A1' }).expect(201)).body.id;
        await api(root).post('/stations', { networkId: netB, name: 'B1' }).expect(201);
        const charger = (identity: string, protocol: string) => api(root).post('/evses', {
            stationId: stA1, protocol, protocolIdentity: identity, vendor: 'PlugEV', model: 'Sim',
            connectors: [{ connectorNumber: 1, connectorType: 'CCS2', maxPowerKw: 50 }, { connectorNumber: 2, connectorType: 'CHADEMO', maxPowerKw: 50 }],
        }).expect(201).then(r => r.body.id as string);
        simId = await charger('SIM-A1', 'OCPP_1_6_J');
        offlineId = await charger('OFF-A1', 'OCPP_1_6_J');
        soapId = await charger('c1', 'OCPP_1_5_S');
        adminA = await inviteAndActivate(t, root, { email: 'admin-a@plugev.test', role: 'NETWORK_ADMIN', networkId: netA });
        adminB = await inviteAndActivate(t, root, { email: 'admin-b@plugev.test', role: 'NETWORK_ADMIN', networkId: netB });
        stationAdmin = await inviteAndActivate(t, adminA, { email: 'st-a1@plugev.test', role: 'STATION_ADMIN', stationId: stA1 });

        sim = createSimulator({ url: `ws://localhost:${ocppPort}/ocpp/SIM-A1`, connectors: 2, meterIntervalSec: 1, log: () => undefined });
        await sim.start();
    });
    afterAll(async () => {
        sim?.stop();
        await t.close();
    });

    describe('an OCPP 1.6 (JSON) charger', () => {
        it('starts charging remotely: accepted, then confirmed by the new session, and audited', async () => {
            const c = await command(adminA, simId, 'remote-start', { connectorNumber: 1 });
            expect(c).toMatchObject({
                action: 'RemoteStartTransaction', status: 'accepted', responseStatus: 'Accepted', connectorNumber: 1,
                payload: { idTag: 'PLUGEV-ADMIN', connectorId: 1 }, requestedBy: { id: adminA.userId, name: 'admin-a' },
            });
            const done = await confirmed(simId, c.id);
            expect(done.confirmation).toMatchObject({ state: 'confirmed', detail: 'The charger started a session on connector 1' });
            const session = (await api(adminA).get(`/sessions/${done.confirmation.sessionId}`).expect(200)).body;
            expect(session).toMatchObject({ status: 'active', connectorNumber: 1, idTag: 'PLUGEV-ADMIN' });

            const [audit] = await t.db.query(`SELECT actor_user_id, details FROM audit_logs WHERE action = 'evse.command' AND resource_id = $1`, [simId]);
            expect(audit).toMatchObject({ actor_user_id: adminA.userId, details: { commandId: c.id, command: 'RemoteStartTransaction', connectorNumber: 1 } });
        });

        it('refuses a start on a connector that is already charging', async () => {
            const res = await api(adminA).post(`/evses/${simId}/commands/remote-start`, { connectorNumber: 1 }).expect(409);
            expect(res.body.error.code).toBe('CONNECTOR_BUSY');
        });

        it('stops the session remotely, confirmed when the charger reports the stop', async () => {
            const c = await command(adminA, simId, 'remote-stop', { connectorNumber: 1 });
            expect(c).toMatchObject({ action: 'RemoteStopTransaction', status: 'accepted' });
            const done = await confirmed(simId, c.id);
            const session = (await api(adminA).get(`/sessions/${done.confirmation.sessionId}`).expect(200)).body;
            expect(session).toMatchObject({ status: 'completed', stopReason: 'Remote' });
            const res = await api(adminA).post(`/evses/${simId}/commands/remote-stop`, { connectorNumber: 1 }).expect(409);
            expect(res.body.error.code).toBe('NO_ACTIVE_SESSION');
        });

        it('unlocks a connector (Unlocked is the physical result) and changes availability (confirmed by its status)', async () => {
            const unlock = await command(adminA, simId, 'unlock', { connectorNumber: 2 });
            expect(unlock).toMatchObject({ status: 'accepted', responseStatus: 'Unlocked', confirmation: { state: 'confirmed' } });

            const off = await command(adminA, simId, 'availability', { connectorNumber: 2, available: false });
            expect(off).toMatchObject({ action: 'ChangeAvailability', payload: { connectorId: 2, type: 'Inoperative' }, status: 'accepted' });
            expect((await confirmed(simId, off.id)).confirmation.detail).toBe('Connector 2 reported Unavailable');
            const on = await command(adminA, simId, 'availability', { connectorNumber: 2, available: true });
            await confirmed(simId, on.id);
        });

        it('reads and changes the configuration', async () => {
            const read = await command(adminA, simId, 'get-configuration');
            expect(read).toMatchObject({ action: 'GetConfiguration', status: 'accepted', responseStatus: null, confirmation: null });
            const cfg = (await api(adminA).get(`/evses/${simId}/configuration`).expect(200)).body;
            expect(cfg.readAt).toBeTruthy();
            expect(cfg.keys).toEqual(expect.arrayContaining([
                { key: 'HeartbeatInterval', value: '30', readonly: false },
                { key: 'NumberOfConnectors', value: '2', readonly: true },
            ]));

            expect(await command(adminA, simId, 'change-configuration', { key: 'HeartbeatInterval', value: '60' }))
                .toMatchObject({ status: 'accepted', responseStatus: 'Accepted' });
            // reading one key updates just that one
            await command(adminA, simId, 'get-configuration', { keys: ['HeartbeatInterval', 'NoSuchKey'] });
            const after = (await api(adminA).get(`/evses/${simId}/configuration`).expect(200)).body;
            expect(after.keys.find((k: { key: string }) => k.key === 'HeartbeatInterval').value).toBe('60');
            expect(after.keys.some((k: { key: string }) => k.key === 'NumberOfConnectors')).toBe(true);
        });

        it('resets the charger, confirmed when it boots again', async () => {
            const c = await command(adminA, simId, 'reset', { type: 'Soft' });
            expect(c).toMatchObject({ action: 'Reset', status: 'accepted', confirmation: { state: 'waiting' } });
            expect((await confirmed(simId, c.id)).confirmation.detail).toBe('The charger restarted (BootNotification)');
        });

        it('fails at once when the charger is not connected', async () => {
            const c = await command(adminA, offlineId, 'reset', { type: 'Hard' });
            expect(c).toMatchObject({ status: 'failed', error: expect.stringMatching(/not connected/) });
        });

        it('lists the commands newest first', async () => {
            const list = (await api(stationAdmin).get(`/evses/${simId}/commands?pageSize=3`).expect(200)).body;
            // start, stop, unlock, 2 x availability, 2 x get and 1 x change configuration, reset
            expect(list.total).toBe(9);
            expect(list.items.map((c: { action: string }) => c.action)).toEqual(['Reset', 'GetConfiguration', 'ChangeConfiguration']);
        });
    });

    describe('an OCPP 1.5 SOAP charger (like the SETEC tablet)', () => {
        it('sends commands to the address the charger reports, in the 1.5 format', async () => {
            const charger = await fakeSoapCharger(() => '<cp:status>Accepted</cp:status>');
            try {
                await soapToCharger('c1', 'BootNotification', '<cs:chargePointVendor>SETEC</cs:chargePointVendor><cs:chargePointModel>CPM</cs:chargePointModel>', charger.url);
                const c = await command(adminA, soapId, 'reset', { type: 'Soft' });
                expect(c).toMatchObject({ status: 'accepted', responseStatus: 'Accepted' });
                expect(charger.received).toHaveLength(1);
                expect(charger.received[0]).toMatch(/<(?:\w+:)?chargeBoxIdentity[^>]*>c1<\/(?:\w+:)?chargeBoxIdentity>/);
                expect(charger.received[0]).toMatch(/urn:\/\/Ocpp\/Cp\/2012\/06\//);
                expect(charger.received[0]).toMatch(/<resetRequest[^>]*>\s*<type>Soft<\/type>/);
            } finally {
                charger.close();
            }
        });

        it('uses the command address set in the portal instead, and reports an unreachable charger', async () => {
            const forwarded = await fakeSoapCharger(a => (a === 'unlockConnector' ? '<cp:status>Accepted</cp:status>' : ''));
            try {
                await api(adminA).patch(`/evses/${soapId}`, { commandUrl: 'not a url' }).expect(400);
                expect((await api(adminA).patch(`/evses/${soapId}`, { commandUrl: forwarded.url }).expect(200)).body.commandUrl).toBe(forwarded.url);
                expect(await command(adminA, soapId, 'unlock', { connectorNumber: 1 })).toMatchObject({ status: 'accepted', responseStatus: 'Accepted' });
                expect(forwarded.received).toHaveLength(1);
            } finally {
                forwarded.close();
            }
            const failed = await command(adminA, soapId, 'unlock', { connectorNumber: 1 });
            expect(failed).toMatchObject({ status: 'failed', error: expect.stringMatching(/Could not reach the charger/) });
            expect((await api(adminA).patch(`/evses/${soapId}`, { commandUrl: '' }).expect(200)).body.commandUrl).toBeNull();
        });

        it('rejects TriggerMessage, which OCPP 1.5 does not have', async () => {
            const res = await api(adminA).post(`/evses/${soapId}/commands/trigger-message`, { message: 'StatusNotification' }).expect(400);
            expect(res.body.error.code).toBe('NOT_SUPPORTED');
        });
    });

    describe('who may send what', () => {
        it('needs the command permission and scope', async () => {
            // Station Admins monitor; remote commands are not delegated to them by default
            await api(stationAdmin).post(`/evses/${simId}/commands/remote-start`, {}).expect(403);
            await api(stationAdmin).post(`/evses/${simId}/commands/reset`, { type: 'Soft' }).expect(403);
            await api(stationAdmin).get(`/evses/${simId}/configuration`).expect(403);
            // another network's admin cannot even see the charger
            await api(adminB).post(`/evses/${simId}/commands/reset`, { type: 'Soft' }).expect(404);
            await api(adminB).get(`/evses/${simId}/commands`).expect(404);
        });

        it('checks the charger and network state before starting', async () => {
            await api(adminA).patch(`/evses/${simId}`, { status: 'disabled' }).expect(200);
            expect((await api(adminA).post(`/evses/${simId}/commands/remote-start`, {}).expect(409)).body.error.code).toBe('CHARGER_DISABLED');
            await api(adminA).patch(`/evses/${simId}`, { status: 'active' }).expect(200);

            await api(root).patch(`/networks/${netA}`, { status: 'suspended' }).expect(200);
            expect((await api(root).post(`/evses/${simId}/commands/remote-start`, {}).expect(409)).body.error.code).toBe('NETWORK_NOT_ACTIVE');
            await api(root).patch(`/networks/${netA}`, { status: 'active' }).expect(200);

            await api(adminA).post(`/evses/${simId}/commands/unlock`, { connectorNumber: 3 }).expect(400);
            await api(adminA).post(`/evses/${simId}/commands/reset`, { type: 'Gentle' }).expect(400);
            await api(adminA).post(`/evses/${simId}/commands/remote-start`, { idTag: 'has space' }).expect(400);
        });
    });

    it('times out a command that never got an answer (e.g. the API restarted while it waited)', async () => {
        const [row] = await t.db.query(
            `INSERT INTO charger_commands (network_id, station_id, evse_id, action, payload, status, expires_at)
             VALUES ($1, $2, $3, 'Reset', '{"type":"Soft"}', 'sent', now() - interval '1 second') RETURNING id`,
            [netA, stA1, simId],
        );
        await t.app.get(ChargingServer).sweep();
        const c = (await api(root).get(`/evses/${simId}/commands/${row.id}`).expect(200)).body;
        expect(c).toMatchObject({ status: 'timed_out', error: 'No answer from the charger in time' });
    });
});
