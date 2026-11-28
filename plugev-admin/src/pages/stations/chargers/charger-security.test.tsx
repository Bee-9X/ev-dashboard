import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChargerSecurity, Evse, Me, Network, Station } from '../../../api/types';
import { fakeApi, ME, tokens, type Handler } from '../../../test/fakeApi';
import { renderApp } from '../../../test/renderApp';

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
const evse = (protocol: Evse['protocol'], protocolIdentity: string): Evse => ({
    id: ID, networkId: NET.id, stationId: ST.id, publicCode: 'K7M3QX', name: null, protocol, protocolIdentity,
    vendor: 'SETEC', model: 'CPM', serialNumber: null, firmwareVersion: null, maxPowerKw: 60, status: 'active', commandUrl: null,
    createdAt: '2026-11-22T00:00:00Z', connectors: [],
});
const OPEN: ChargerSecurity = {
    passwordSet: false, passwordSetAt: null, allowedAddresses: [], secured: false, unsecuredAccepted: true,
    lastAddress: '203.0.113.7', lastRefusal: null,
};

const NET_ADMIN: Me = {
    ...ME,
    roles: [{ assignmentId: 'x', role: 'NETWORK_ADMIN', networkId: NET.id, stationId: null, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: ['network.read', 'station.read', 'evse.read', 'evse.update', 'session.read'],
};
const STATION_ADMIN: Me = {
    ...ME,
    roles: [{ assignmentId: 'y', role: 'STATION_ADMIN', networkId: null, stationId: ST.id, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: ['station.read', 'station.update', 'evse.read', 'session.read'],
};

const page = <T,>(items: T[]) => ({ body: { items, page: 1, pageSize: 10, total: items.length } });

function signedIn(me: Me, charger: Evse, security: ChargerSecurity, routes: Record<string, Handler> = {}) {
    localStorage.setItem('plugev.refreshToken', 'refresh-0');
    return fakeApi({
        'POST /auth/refresh': () => ({ body: tokens(1) }),
        'GET /users/me': () => ({ body: me }),
        'GET /networks': () => page([NET]),
        [`GET /networks/${NET.id}`]: () => ({ body: NET }),
        'GET /stations': () => page([ST]),
        [`GET /stations/${ST.id}`]: () => ({ body: ST }),
        [`GET /evses/${ID}`]: () => ({ body: charger }),
        [`GET /evses/${ID}/commands`]: () => page([]),
        [`GET /evses/${ID}/configuration`]: () => ({ body: { readAt: null, keys: [], unknownKeys: [] } }),
        [`GET /evses/${ID}/security`]: () => ({ body: security }),
        'GET /sessions': () => page([]),
        ...routes,
    });
}

const section = async () => screen.findByRole('region', { name: /Connection security/ });

describe('connection security on the charger page', () => {
    it('warns about an unsecured SOAP charger and limits it to the address it connects from', async () => {
        let saved: unknown = null;
        signedIn(NET_ADMIN, evse('OCPP_1_5_S', 'c1'), OPEN, {
            [`PUT /evses/${ID}/security/allowed-addresses`]: (body) => {
                saved = body;
                return { body: { ...OPEN, allowedAddresses: body.addresses, secured: true } };
            },
        });
        const { user } = renderApp(`/stations/chargers/${ID}`);
        const region = await section();
        expect(await within(region).findByText('Not secured')).toBeInTheDocument();
        expect(within(region).getByText(/SOAP chargers usually cannot send a password/)).toBeInTheDocument();

        await user.click(within(region).getByRole('button', { name: /Edit allowed addresses/ }));
        const dialog = screen.getByRole('dialog', { name: 'Allowed addresses: c1' });
        await user.click(within(dialog).getByRole('button', { name: /Add 203\.0\.113\.7/ }));
        await user.type(within(dialog).getByLabelText('Addresses (one per line)'), '{Enter}198.51.100.0/24');
        await user.click(within(dialog).getByRole('button', { name: 'Save addresses' }));
        await waitFor(() => expect(saved).toEqual({ addresses: ['203.0.113.7', '198.51.100.0/24'] }));

        expect(await within(region).findByText('Secured')).toBeInTheDocument();
        const list = within(region).getByRole('list', { name: 'Allowed addresses' });
        expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['203.0.113.7', '198.51.100.0/24']);
    });

    it('does not offer ngrok\'s own address (when the API does not trust ngrok) and warns about it', async () => {
        signedIn(NET_ADMIN, evse('OCPP_1_5_S', 'c1'), { ...OPEN, lastAddress: '127.0.0.1' });
        const { user } = renderApp(`/stations/chargers/${ID}`);
        await user.click(await within(await section()).findByRole('button', { name: /Edit allowed addresses/ }));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).queryByRole('button', { name: /Add 127\.0\.0\.1/ })).not.toBeInTheDocument();
        expect(within(dialog).getByText(/Set OCPP_TRUSTED_PROXIES=1/)).toBeInTheDocument();
    });

    it('sets a password made by the platform and shows it only once', async () => {
        let body: unknown = null;
        signedIn(NET_ADMIN, evse('OCPP_1_6_J', 'SIM-001'), OPEN, {
            [`POST /evses/${ID}/security/password`]: (b) => {
                body = b;
                return {
                    body: {
                        password: 'Gq7RmTz3Xk9WpL2vNa8HcE4d',
                        security: { ...OPEN, passwordSet: true, passwordSetAt: new Date().toISOString(), secured: true },
                    },
                };
            },
        });
        const { user } = renderApp(`/stations/chargers/${ID}`);
        const region = await section();
        await user.click(await within(region).findByRole('button', { name: /Set password/ }));
        const dialog = screen.getByRole('dialog', { name: 'Set password: SIM-001' });
        await user.click(within(dialog).getByRole('button', { name: 'Set password' }));

        const shown = await screen.findByRole('dialog', { name: 'Charger password' });
        expect(body).toEqual({});
        expect(within(shown).getByLabelText('New password')).toHaveTextContent('Gq7RmTz3Xk9WpL2vNa8HcE4d');
        expect(within(shown).getByText('This is the only time the password is shown. Enter it on the charger now, or copy it somewhere safe.')).toBeInTheDocument();
        await user.click(within(shown).getByRole('button', { name: 'Done' }));

        expect(screen.queryByText('Gq7RmTz3Xk9WpL2vNa8HcE4d')).not.toBeInTheDocument();
        expect(within(region).getByText('Secured')).toBeInTheDocument();
        expect(within(region).getByRole('button', { name: /Replace password/ })).toBeInTheDocument();
    });

    it('checks a password typed in by hand before sending it', async () => {
        let body: unknown = null;
        signedIn(NET_ADMIN, evse('OCPP_1_6_J', 'SIM-001'), OPEN, {
            [`POST /evses/${ID}/security/password`]: (b) => {
                body = b;
                return { body: { password: b.password, security: { ...OPEN, passwordSet: true, secured: true } } };
            },
        });
        const { user } = renderApp(`/stations/chargers/${ID}`);
        await user.click(await within(await section()).findByRole('button', { name: /Set password/ }));
        const dialog = screen.getByRole('dialog');
        await user.click(within(dialog).getByLabelText('The charger has a fixed password: enter it'));
        const field = within(dialog).getByLabelText('Charger password');
        await user.type(field, 'too-short');
        await user.click(within(dialog).getByRole('button', { name: 'Set password' }));
        expect(within(dialog).getByText('16 to 40 characters: letters, digits and symbols, no spaces.')).toBeInTheDocument();
        expect(body).toBeNull();

        await user.type(field, '-but-now-long-enough');
        await user.click(within(dialog).getByRole('button', { name: 'Set password' }));
        await waitFor(() => expect(body).toEqual({ password: 'too-short-but-now-long-enough' }));
    });

    it('shows a Station Admin why the charger was last refused, without the buttons', async () => {
        signedIn(STATION_ADMIN, evse('OCPP_1_6_J', 'SIM-001'), {
            ...OPEN, passwordSet: true, secured: true, passwordSetAt: new Date().toISOString(),
            lastRefusal: { at: new Date().toISOString(), address: '192.0.2.99', reason: 'password_wrong' },
        });
        renderApp(`/stations/chargers/${ID}`);
        const region = await section();
        expect(await within(region).findByText('Because it sent a wrong password.')).toBeInTheDocument();
        expect(within(region).getByText('192.0.2.99')).toBeInTheDocument();
        expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    });
});
