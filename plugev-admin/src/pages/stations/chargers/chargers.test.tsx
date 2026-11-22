import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Evse, Me, Network, Station } from '../../../api/types';
import { apiError, fakeApi, ME, tokens, type Handler } from '../../../test/fakeApi';
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
const EVSE: Evse = {
    id: '55555555-5555-4555-8555-555555555555', networkId: NET.id, stationId: ST.id, publicCode: 'K7M3QX', name: 'Fast charger 1',
    protocol: 'OCPP_1_6_J', protocolIdentity: 'KTW-01', vendor: 'SETEC', model: 'DC60', serialNumber: 'SN1', firmwareVersion: null,
    maxPowerKw: 60, status: 'active', createdAt: '2026-11-22T00:00:00Z',
    connectors: [
        {
            id: 'c1', evseId: '55555555-5555-4555-8555-555555555555', connectorNumber: 1, connectorType: 'CCS2', currentType: 'DC',
            maxPowerKw: 60, format: 'cable', status: 'active', qrCode: 'K7M3QX-1', qrUrl: 'http://localhost:3000/c/K7M3QX-1',
        },
        {
            id: 'c2', evseId: '55555555-5555-4555-8555-555555555555', connectorNumber: 2, connectorType: 'CHADEMO', currentType: 'DC',
            maxPowerKw: 50, format: 'cable', status: 'active', qrCode: 'K7M3QX-2', qrUrl: 'http://localhost:3000/c/K7M3QX-2',
        },
    ],
};

const ALL = [
    'network.read', 'network.update', 'station.create', 'station.read', 'station.update', 'evse.read', 'evse.create', 'evse.update',
];
const NET_ADMIN: Me = {
    ...ME,
    roles: [{ assignmentId: 'x', role: 'NETWORK_ADMIN', networkId: NET.id, stationId: null, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: ALL,
};
const STATION_ADMIN: Me = {
    ...ME,
    roles: [{ assignmentId: 'y', role: 'STATION_ADMIN', networkId: null, stationId: ST.id, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: ['station.read', 'station.update', 'evse.read'],
};

const page = <T,>(items: T[]) => ({ body: { items, page: 1, pageSize: 20, total: items.length } });

function signedIn(me: Me, routes: Record<string, Handler>) {
    localStorage.setItem('plugev.refreshToken', 'refresh-0');
    return fakeApi({
        'POST /auth/refresh': () => ({ body: tokens(1) }),
        'GET /users/me': () => ({ body: me }),
        'GET /networks': () => page([NET]),
        [`GET /networks/${NET.id}`]: () => ({ body: NET }),
        'GET /stations': () => page([ST]),
        [`GET /stations/${ST.id}`]: () => ({ body: ST }),
        'GET /evses': () => page([EVSE]),
        [`GET /evses/${EVSE.id}`]: () => ({ body: EVSE }),
        ...routes,
    });
}

describe('Charger Terminals', () => {
    it('lists chargers with their station and connectors, as the old terminals table', async () => {
        signedIn(NET_ADMIN, {});
        renderApp('/stations?tab=chargers');
        expect(await screen.findByRole('tab', { name: 'Charger Terminals' })).toHaveAttribute('aria-selected', 'true');
        const row = (await screen.findByRole('link', { name: 'Fast charger 1' })).closest('tr')!;
        expect(within(row).getByText('KTW-01')).toBeInTheDocument();
        expect(await within(row).findByText('Kottawa Kinro')).toBeInTheDocument();
        expect(within(row).getByText('1 · CCS2 60 kW')).toBeInTheDocument();
        expect(within(row).getByText('2 · CHAdeMO 50 kW')).toBeInTheDocument();
    });

    it('registers a charger with two connectors at a station', async () => {
        let created = false;
        signedIn(NET_ADMIN, {
            'GET /evses': () => page(created ? [EVSE] : []),
            'POST /evses': (body) => {
                expect(body).toEqual({
                    stationId: ST.id, name: null, protocol: 'OCPP_1_6_S', protocolIdentity: 'KTW-02', vendor: 'SETEC', model: 'AC22',
                    serialNumber: null, maxPowerKw: null,
                    connectors: [
                        { connectorNumber: 1, connectorType: 'TYPE2', maxPowerKw: 22, format: 'socket' },
                        { connectorNumber: 2, connectorType: 'GBT', currentType: 'AC', maxPowerKw: 7.4, format: 'cable' },
                    ],
                });
                created = true;
                return { status: 201, body: { ...EVSE, name: null, protocolIdentity: 'KTW-02' } };
            },
        });
        const { user } = renderApp(`/stations/${ST.id}`);
        expect(await screen.findByText('No chargers at this station yet.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Add new terminal/ }));
        const dialog = screen.getByRole('dialog', { name: 'Add a charger' });
        const d = within(dialog);
        await user.type(d.getByLabelText('Charger ID (OCPP identity)'), 'KTW-02');
        await user.selectOptions(d.getByLabelText('Protocol'), 'OCPP_1_6_S');
        await user.type(d.getByLabelText('Make'), 'SETEC');
        await user.type(d.getByLabelText('Model'), 'AC22');

        await user.selectOptions(d.getByLabelText('Connector 1 type'), 'TYPE2');
        await user.type(d.getByLabelText('Connector 1 power (kW)'), '22');
        await user.selectOptions(d.getByLabelText('Connector 1 form'), 'socket');

        await user.click(d.getByRole('button', { name: /Add connector 2/ }));
        await user.selectOptions(d.getByLabelText('Connector 2 type'), 'GBT');
        // GB/T needs AC or DC
        await user.click(d.getByRole('button', { name: 'Add charger' }));
        expect(d.getByText('Choose AC or DC.')).toBeInTheDocument();
        await user.selectOptions(d.getByLabelText('Connector 2 current'), 'AC');
        await user.type(d.getByLabelText('Connector 2 power (kW)'), '7,4');
        await user.click(d.getByRole('button', { name: 'Add charger' }));

        expect(await screen.findByText(/Charger KTW-02 added with 2 connectors/)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('link', { name: 'Fast charger 1' })).toBeInTheDocument());
    });

    it('shows a taken charger ID next to the field', async () => {
        signedIn(NET_ADMIN, {
            'GET /evses': () => page([]),
            'POST /evses': () => apiError(409, 'PROTOCOL_IDENTITY_TAKEN', 'Another charger is already registered with this protocol identity'),
        });
        const { user } = renderApp(`/stations/${ST.id}`);
        await user.click(await screen.findByRole('button', { name: /Add new terminal/ }));
        const d = within(screen.getByRole('dialog'));
        await user.type(d.getByLabelText('Charger ID (OCPP identity)'), 'KTW-01');
        await user.selectOptions(d.getByLabelText('Protocol'), 'OCPP_1_6_J');
        await user.type(d.getByLabelText('Make'), 'SETEC');
        await user.type(d.getByLabelText('Model'), 'DC60');
        await user.selectOptions(d.getByLabelText('Connector 1 type'), 'CCS2');
        await user.type(d.getByLabelText('Connector 1 power (kW)'), '60');
        await user.click(d.getByRole('button', { name: 'Add charger' }));
        expect(await d.findByText(/already registered with this protocol identity/)).toBeInTheDocument();
    });

    it('shows each connector with its QR code, and disables one', async () => {
        signedIn(NET_ADMIN, {
            [`PATCH /evses/${EVSE.id}/connectors/c2`]: (body) => {
                expect(body).toEqual({ status: 'disabled' });
                return { body: { ...EVSE, connectors: [EVSE.connectors[0], { ...EVSE.connectors[1]!, status: 'disabled' }] } };
            },
        });
        const { user } = renderApp(`/stations/chargers/${EVSE.id}`);
        expect(await screen.findByRole('heading', { name: 'Fast charger 1' })).toBeInTheDocument();
        const c1 = screen.getByRole('article', { name: 'Connector 1' });
        expect(within(c1).getByText('K7M3QX-1')).toBeInTheDocument();
        expect(await within(c1).findByRole('img', { name: 'QR code for connector 1' })).toBeInTheDocument();
        // two connectors: the limit
        expect(screen.queryByRole('button', { name: /Add connector/ })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Disable connector 2' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable connector' }));
        expect(await screen.findByText('Connector 2 disabled.')).toBeInTheDocument();
        expect(within(screen.getByRole('article', { name: 'Connector 2' })).getByText('Disabled')).toBeInTheDocument();
    });

    it('a Station Admin sees the chargers of their station without changing them', async () => {
        signedIn(STATION_ADMIN, {});
        renderApp(`/stations/chargers/${EVSE.id}`);
        expect(await screen.findByRole('heading', { name: 'Fast charger 1' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Edit charger/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Disable connector/ })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Print QR stickers/ })).toBeInTheDocument();
    });

    it('prints one sticker per connector and warns about test links', async () => {
        signedIn(NET_ADMIN, {});
        renderApp(`/print/chargers/${EVSE.id}`);
        expect(await screen.findByText('K7M3QX-1')).toBeInTheDocument();
        expect(screen.getByText('K7M3QX-2')).toBeInTheDocument();
        expect(screen.getByText('Connector 1 · CCS2 · DC 60 kW')).toBeInTheDocument();
        expect(screen.getByText(/link to a test address/)).toBeInTheDocument();
        expect(await screen.findAllByText('Kottawa Kinro')).toHaveLength(2);
    });
});

describe('Station details', () => {
    it('saves address, location, opening hours and amenities', async () => {
        signedIn(NET_ADMIN, {
            [`PATCH /stations/${ST.id}`]: (body) => {
                expect(body).toEqual({
                    address: '120 High Level Road, Kottawa',
                    phone: null,
                    latitude: 6.841234,
                    longitude: 79.965432,
                    timeZone: null,
                    operatingHours: {
                        type: 'weekly',
                        days: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, [{ open: '06:00', close: '24:00' }]])),
                    },
                    amenities: ['parking', 'food'],
                });
                return { body: { ...ST, ...body } };
            },
        });
        const { user } = renderApp(`/stations/${ST.id}`);
        await user.click(await screen.findByRole('button', { name: /Edit details/ }));
        const d = within(screen.getByRole('dialog'));
        await user.type(d.getByLabelText('Address'), '120 High Level Road, Kottawa');
        await user.type(d.getByLabelText('GPS location'), '6.8412341, 79.965432');
        await user.click(d.getByLabelText('Set hours for each day'));
        const closes = d.getByLabelText('Monday closes');
        await user.clear(closes);
        await user.type(closes, '00:00');
        await user.click(d.getByRole('button', { name: /Use Monday's hours/ }));
        await user.click(d.getByLabelText('Open on Sunday'));
        await user.click(d.getByLabelText('Food and drinks'));
        await user.click(d.getByLabelText('Parking'));
        await user.click(d.getByRole('button', { name: 'Save details' }));

        expect(await screen.findByText('Station details saved.')).toBeInTheDocument();
        expect(screen.getByText('Mon–Sat 06:00–midnight')).toBeInTheDocument();
        expect(screen.getByText('Sun closed')).toBeInTheDocument();
        expect(screen.getByText('Parking, Food and drinks')).toBeInTheDocument();
    });

    it('shows a station in the app only once it has a location', async () => {
        let current = ST;
        signedIn(NET_ADMIN, {
            [`GET /stations/${ST.id}`]: () => ({ body: current }),
            [`PATCH /stations/${ST.id}`]: (body) => {
                current = { ...current, ...body };
                return { body: current };
            },
        });
        const { user, unmount } = renderApp(`/stations/${ST.id}`);
        expect(await screen.findByRole('button', { name: /Show in app/ })).toBeDisabled();
        expect(screen.getByText(/Add its location first/)).toBeInTheDocument();
        unmount();

        current = { ...ST, latitude: 6.84, longitude: 79.96 };
        renderApp(`/stations/${ST.id}`);
        await user.click(await screen.findByRole('button', { name: /Show in app/ }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Show in app' }));
        expect(await screen.findByText('The station is now shown in the app.')).toBeInTheDocument();
        expect(screen.getByText('Shown in app')).toBeInTheDocument();
    });

    it('a Station Admin edits details but not status or visibility', async () => {
        signedIn(STATION_ADMIN, {});
        renderApp(`/stations/${ST.id}`);
        expect(await screen.findByRole('button', { name: /Edit details/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Show in app/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Mark inactive/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add new terminal/ })).not.toBeInTheDocument();
    });
});
