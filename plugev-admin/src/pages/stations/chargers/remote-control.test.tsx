import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChargerCommand, Evse, Me, Network, Station } from '../../../api/types';
import { fakeApi, ME, tokens, type Handler } from '../../../test/fakeApi';
import { renderApp } from '../../../test/renderApp';
import { commandLabel } from './RemoteControl';

const NET: Network = {
    id: '11111111-1111-4111-8111-111111111111', name: 'Plug EV Colombo', status: 'active', defaultCurrency: 'LKR',
    timeZone: 'Asia/Colombo', createdAt: '2026-11-01T00:00:00Z',
};
const ST: Station = {
    id: '33333333-3333-4333-8333-333333333333', networkId: NET.id, name: 'Kottawa Kinro', status: 'active',
    address: null, phone: null, latitude: null, longitude: null, timeZone: null, operatingHours: null, amenities: [],
    publicVisible: false, createdAt: '2026-11-02T00:00:00Z',
};
const ID = '55555555-5555-4555-8555-555555555555';
const EVSE: Evse = {
    id: ID, networkId: NET.id, stationId: ST.id, publicCode: 'K7M3QX', name: null, protocol: 'OCPP_1_5_S', protocolIdentity: 'c1',
    vendor: 'SETEC', model: 'CPM', serialNumber: null, firmwareVersion: null, maxPowerKw: 60, status: 'active', commandUrl: null,
    createdAt: '2026-11-22T00:00:00Z',
    connectors: [
        {
            id: 'k1', evseId: ID, connectorNumber: 1, connectorType: 'CHADEMO', currentType: 'DC', maxPowerKw: 50, format: 'cable',
            status: 'active', qrCode: 'K7M3QX-1', qrUrl: 'http://localhost:3000/c/K7M3QX-1', activeSession: null,
        },
    ],
};

const cmd = (over: Partial<ChargerCommand>): ChargerCommand => ({
    id: 'cmd-1', evseId: ID, action: 'RemoteStartTransaction', connectorNumber: 1, payload: { idTag: 'PLUGEV-ADMIN', connectorId: 1 },
    status: 'queued', responseStatus: null, error: null, requestedBy: { id: 'u1', name: 'Ada Lovelace' },
    createdAt: new Date().toISOString(), sentAt: null, answeredAt: null, confirmation: null, ...over,
});

const NET_ADMIN: Me = {
    ...ME,
    roles: [{ assignmentId: 'x', role: 'NETWORK_ADMIN', networkId: NET.id, stationId: null, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: [
        'network.read', 'station.read', 'evse.read', 'evse.update', 'session.read',
        'evse.remote_start', 'evse.remote_stop', 'evse.reset', 'evse.unlock',
    ],
};
const STATION_ADMIN: Me = {
    ...ME,
    roles: [{ assignmentId: 'y', role: 'STATION_ADMIN', networkId: null, stationId: ST.id, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: ['station.read', 'station.update', 'evse.read', 'session.read'],
};

const page = <T,>(items: T[]) => ({ body: { items, page: 1, pageSize: 10, total: items.length } });

function signedIn(me: Me, routes: Record<string, Handler>) {
    localStorage.setItem('plugev.refreshToken', 'refresh-0');
    return fakeApi({
        'POST /auth/refresh': () => ({ body: tokens(1) }),
        'GET /users/me': () => ({ body: me }),
        'GET /networks': () => page([NET]),
        [`GET /networks/${NET.id}`]: () => ({ body: NET }),
        'GET /stations': () => page([ST]),
        [`GET /stations/${ST.id}`]: () => ({ body: ST }),
        [`GET /evses/${ID}`]: () => ({ body: EVSE }),
        [`GET /evses/${ID}/commands`]: () => page([]),
        [`GET /evses/${ID}/configuration`]: () => ({ body: { readAt: null, keys: [], unknownKeys: [] } }),
        [`GET /evses/${ID}/security`]: () => ({ body: { passwordSet: false, passwordSetAt: null, allowedAddresses: [], secured: false, unsecuredAccepted: true, lastAddress: null, lastRefusal: null } }),
        'GET /sessions': () => page([]),
        ...routes,
    });
}

describe('command labels', () => {
    it('describes each command in plain words', () => {
        expect(commandLabel(cmd({}))).toBe('Start charging (connector 1)');
        expect(commandLabel(cmd({ action: 'Reset', connectorNumber: null, payload: { type: 'Hard' } }))).toBe('Hard reset');
        expect(commandLabel(cmd({ action: 'ChangeAvailability', connectorNumber: 0, payload: { connectorId: 0, type: 'Inoperative' } })))
            .toBe('Make charger unavailable');
        expect(commandLabel(cmd({ action: 'ChangeConfiguration', connectorNumber: null, payload: { key: 'HeartbeatInterval', value: '60' } })))
            .toBe('Change HeartbeatInterval to 60');
    });
});

describe('remote control on the charger page', () => {
    it('starts charging on a connector and follows the command until the charger confirms it', async () => {
        let polls = 0;
        let sent: unknown = null;
        signedIn(NET_ADMIN, {
            [`POST /evses/${ID}/commands/remote-start`]: (body) => {
                sent = body;
                return { status: 202, body: cmd({}) };
            },
            [`GET /evses/${ID}/commands`]: () => {
                if (!sent) return page([]);
                polls += 1;
                return page([polls < 2
                    ? cmd({ status: 'accepted', responseStatus: 'Accepted', confirmation: { state: 'waiting', at: null, detail: null, sessionId: null } })
                    : cmd({
                        status: 'accepted', responseStatus: 'Accepted',
                        confirmation: { state: 'confirmed', at: new Date().toISOString(), detail: 'The charger started a session on connector 1', sessionId: 's-9' },
                    })]);
            },
        });
        const { user } = renderApp(`/stations/chargers/${ID}`);

        await user.click(await screen.findByRole('button', { name: 'Start charging on connector 1' }));
        const dialog = screen.getByRole('dialog', { name: 'Start charging on connector 1' });
        await user.click(within(dialog).getByRole('button', { name: 'Start charging' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(sent).toEqual({ connectorNumber: 1 });

        const table = screen.getByRole('table', { name: 'Recent commands' });
        expect(within(table).getByText('Start charging (connector 1)')).toBeInTheDocument();
        expect(within(table).getByText('Sending')).toBeInTheDocument();
        await waitFor(() => expect(within(table).getByText(/The charger started a session on connector 1/, { selector: 'span.small' })).toBeInTheDocument(), { timeout: 6000 });
        expect(within(table).getByRole('link', { name: 'Session' })).toHaveAttribute('href', '/stations/sessions/s-9');
        expect(within(table).getByText('Ada Lovelace')).toBeInTheDocument();
    }, 12_000); // two real polls of the command list

    it('shows a stop button while charging, and asks before a hard reset', async () => {
        const posted: { path: string; body: unknown }[] = [];
        const record = (path: string): Handler => (body) => {
            posted.push({ path, body });
            return { status: 202, body: cmd({ action: path, status: 'queued' }) };
        };
        signedIn(NET_ADMIN, {
            [`GET /evses/${ID}`]: () => ({
                body: {
                    ...EVSE,
                    connectors: [{
                        ...EVSE.connectors[0]!,
                        activeSession: { id: 's-1', startedAt: new Date().toISOString(), energyWh: 100, powerW: 5000, socPercent: null, readingAt: null },
                    }],
                },
            }),
            [`POST /evses/${ID}/commands/remote-stop`]: record('remote-stop'),
            [`POST /evses/${ID}/commands/reset`]: record('reset'),
        });
        const { user } = renderApp(`/stations/chargers/${ID}`);

        expect(await screen.findByRole('button', { name: 'Stop charging on connector 1' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Start charging on connector 1' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Stop charging on connector 1' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop charging' }));

        await user.click(screen.getByRole('button', { name: 'Hard reset' }));
        const dialog = screen.getByRole('dialog', { name: 'Hard reset: c1' });
        expect(within(dialog).getByText(/Sessions in progress end abruptly/)).toBeInTheDocument();
        await user.click(within(dialog).getByRole('button', { name: 'Hard reset' }));
        await waitFor(() => expect(posted).toEqual([
            { path: 'remote-stop', body: { connectorNumber: 1 } },
            { path: 'reset', body: { type: 'Hard' } },
        ]));
    });

    it('shows a Station Admin what was sent, without the buttons', async () => {
        signedIn(STATION_ADMIN, {
            [`GET /evses/${ID}/commands`]: () => page([cmd({ status: 'failed', error: 'Could not reach the charger at http://192.168.1.136:8765/' })]),
        });
        renderApp(`/stations/chargers/${ID}`);
        const table = await screen.findByRole('table', { name: 'Recent commands' });
        expect(await within(table).findByText('Failed')).toBeInTheDocument();
        expect(within(table).getByText(/Could not reach the charger/)).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: 'Remote control for connector 1' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Soft reset' })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Configuration' })).not.toBeInTheDocument();
    });

    it('reads the configuration and changes a setting', async () => {
        let changed: unknown = null;
        signedIn(NET_ADMIN, {
            [`GET /evses/${ID}/configuration`]: () => ({
                body: {
                    readAt: new Date().toISOString(), unknownKeys: [],
                    keys: [
                        { key: 'HeartbeatInterval', value: '30', readonly: false },
                        { key: 'NumberOfConnectors', value: '1', readonly: true },
                    ],
                },
            }),
            [`POST /evses/${ID}/commands/change-configuration`]: (body) => {
                changed = body;
                return { status: 202, body: cmd({ action: 'ChangeConfiguration', connectorNumber: null, payload: body }) };
            },
        });
        const { user } = renderApp(`/stations/chargers/${ID}`);

        const settings = await screen.findByRole('table', { name: 'Charger settings' });
        expect(within(settings).getByText('Read-only')).toBeInTheDocument();
        await user.click(within(settings).getByRole('button', { name: 'Change HeartbeatInterval' }));
        const dialog = screen.getByRole('dialog', { name: 'Change HeartbeatInterval' });
        const input = within(dialog).getByLabelText('New value');
        await user.clear(input);
        await user.type(input, '60');
        await user.click(within(dialog).getByRole('button', { name: 'Change' }));
        await waitFor(() => expect(changed).toEqual({ key: 'HeartbeatInterval', value: '60' }));
        expect(await screen.findByText('Change HeartbeatInterval to 60')).toBeInTheDocument();
    });

    it('sets the command address of a SOAP charger', async () => {
        let patched: Record<string, unknown> | null = null;
        signedIn(NET_ADMIN, {
            [`PATCH /evses/${ID}`]: (body) => {
                patched = body;
                return { body: { ...EVSE, commandUrl: body.commandUrl } };
            },
        });
        const { user } = renderApp(`/stations/chargers/${ID}`);
        await user.click(await screen.findByRole('button', { name: /Edit charger/ }));
        const dialog = screen.getByRole('dialog');
        const field = within(dialog).getByLabelText('Command address (optional)');
        await user.type(field, 'not an address');
        await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
        expect(within(dialog).getByText('Enter an http:// or https:// address, or leave it empty.')).toBeInTheDocument();
        await user.clear(field);
        await user.type(field, 'http://203.0.113.7:8765/');
        await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(patched).toMatchObject({ commandUrl: 'http://203.0.113.7:8765/' }));
    });
});
