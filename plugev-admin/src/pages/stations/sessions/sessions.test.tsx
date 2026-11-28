import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChargingSession, ChargingSessionDetail, Evse, Me, Network, Station } from '../../../api/types';
import { fakeApi, ME, tokens, type Handler } from '../../../test/fakeApi';
import { renderApp } from '../../../test/renderApp';
import { formatDuration, formatEnergy, formatPower } from './sessionFormat';

const NET: Network = {
    id: '11111111-1111-4111-8111-111111111111', name: 'Plug EV Colombo', status: 'active', defaultCurrency: 'LKR',
    timeZone: 'Asia/Colombo', createdAt: '2026-11-01T00:00:00Z',
};
const ST: Station = {
    id: '33333333-3333-4333-8333-333333333333', networkId: NET.id, name: 'Kottawa Kinro', status: 'active',
    address: null, phone: null, latitude: null, longitude: null, timeZone: null, operatingHours: null, amenities: [],
    publicVisible: false, createdAt: '2026-11-02T00:00:00Z',
};
const EVSE_ID = '55555555-5555-4555-8555-555555555555';
const startedAt = new Date(Date.now() - 25 * 60_000).toISOString();
const EVSE: Evse = {
    id: EVSE_ID, networkId: NET.id, stationId: ST.id, publicCode: 'K7M3QX', name: 'Fast charger 1',
    protocol: 'OCPP_1_5_S', protocolIdentity: 'c1', vendor: 'SETEC', model: 'CPM', serialNumber: null, firmwareVersion: null,
    maxPowerKw: 60, status: 'active', createdAt: '2026-11-22T00:00:00Z',
    connectors: [
        {
            id: 'c1', evseId: EVSE_ID, connectorNumber: 1, connectorType: 'CHADEMO', currentType: 'DC', maxPowerKw: 50, format: 'cable',
            status: 'active', qrCode: 'K7M3QX-1', qrUrl: 'http://localhost:3000/c/K7M3QX-1',
            activeSession: { id: 'sess-active', startedAt, energyWh: 2500, powerW: 15000, socPercent: 64, readingAt: new Date().toISOString() },
        },
        {
            id: 'c2', evseId: EVSE_ID, connectorNumber: 2, connectorType: 'CCS2', currentType: 'DC', maxPowerKw: 50, format: 'cable',
            status: 'active', qrCode: 'K7M3QX-2', qrUrl: 'http://localhost:3000/c/K7M3QX-2', activeSession: null,
        },
    ],
};

const session = (over: Partial<ChargingSession>): ChargingSession => ({
    id: 'sess-1', networkId: NET.id, networkName: NET.name, stationId: ST.id, stationName: ST.name, evseId: EVSE_ID,
    evseName: 'Fast charger 1', protocolIdentity: 'c1', connectorNumber: 1, connectorType: 'CHADEMO', ocppTransactionId: 41,
    idTag: 'RFID-7', stopIdTag: 'RFID-7', startedAt: '2026-11-27T10:00:00Z', stoppedAt: '2026-11-27T10:30:00Z', durationSec: 1800,
    meterStartWh: 10_000, meterStopWh: 14_000, energyWh: 4000, status: 'completed', stopReason: 'EVDisconnected', notes: [],
    createdAt: '2026-11-27T10:00:00Z', live: null, ...over,
});
const ACTIVE = session({
    id: 'sess-active', ocppTransactionId: 42, startedAt, stoppedAt: null, durationSec: 1500, meterStopWh: null, energyWh: null,
    status: 'active', stopReason: null, stopIdTag: null,
    live: { energyWh: 2500, powerW: 15000, socPercent: 64, readingAt: new Date().toISOString() },
});
const INTERRUPTED = session({
    id: 'sess-int', ocppTransactionId: 40, connectorNumber: 2, connectorType: 'CCS2', status: 'interrupted', stoppedAt: null,
    durationSec: null, energyWh: null, meterStopWh: null, stopReason: null, notes: ['Superseded by a new StartTransaction at 2026-11-27T09:00:00.000Z'],
});

const NET_ADMIN: Me = {
    ...ME,
    roles: [{ assignmentId: 'x', role: 'NETWORK_ADMIN', networkId: NET.id, stationId: null, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: ['network.read', 'station.read', 'evse.read', 'evse.update', 'session.read'],
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
        [`GET /evses/${EVSE_ID}`]: () => ({ body: EVSE }),
        [`GET /evses/${EVSE_ID}/commands`]: () => page([]),
        [`GET /evses/${EVSE_ID}/configuration`]: () => ({ body: { readAt: null, keys: [], unknownKeys: [] } }),
        [`GET /evses/${EVSE_ID}/security`]: () => ({ body: { passwordSet: false, passwordSetAt: null, allowedAddresses: [], secured: false, unsecuredAccepted: true, lastAddress: null, lastRefusal: null } }),
        ...routes,
    });
}

describe('session figures', () => {
    it('formats energy, power and duration the way admins read them', () => {
        expect(formatEnergy(4000)).toBe('4.00 kWh');
        expect(formatEnergy(250)).toBe('0.25 kWh');
        expect(formatEnergy(null)).toBe('—');
        expect(formatPower(15000)).toBe('15.0 kW');
        expect(formatDuration(20)).toBe('20 s');
        expect(formatDuration(125)).toBe('2 min');
        expect(formatDuration(3900)).toBe('1 h 05 min');
    });
});

describe('Charging Sessions tab', () => {
    it('lists sessions with energy, duration, status and how they ended', async () => {
        signedIn(NET_ADMIN, { 'GET /sessions': () => page([ACTIVE, session({}), INTERRUPTED]) });
        renderApp('/stations?tab=sessions');
        expect(await screen.findByRole('tab', { name: 'Charging Sessions' })).toHaveAttribute('aria-selected', 'true');

        const done = (await screen.findByRole('link', { name: 'View session 41' })).closest('tr')!;
        expect(within(done).getByText('Fast charger 1')).toBeInTheDocument();
        expect(within(done).getByText('Connector 1 · CHAdeMO')).toBeInTheDocument();
        expect(within(done).getByText('Kottawa Kinro')).toBeInTheDocument();
        expect(within(done).getByText('30 min')).toBeInTheDocument();
        expect(within(done).getByText('4.00 kWh')).toBeInTheDocument();
        expect(within(done).getByText('Completed')).toBeInTheDocument();
        expect(within(done).getByText('Cable unplugged')).toBeInTheDocument();

        const now = screen.getByRole('link', { name: 'View session 42' }).closest('tr')!;
        expect(within(now).getByText('Charging')).toBeInTheDocument();
        expect(within(now).getByText('2.50 kWh')).toBeInTheDocument();
        expect(within(now).getByText('15.0 kW now')).toBeInTheDocument();

        const missed = screen.getByRole('link', { name: 'View session 40' }).closest('tr')!;
        expect(within(missed).getByText('Interrupted')).toHaveAttribute('title', expect.stringMatching(/before reporting the stop/));
    });

    it('filters by status through the API', async () => {
        const asked: string[] = [];
        signedIn(NET_ADMIN, {
            'GET /sessions': (_b, _i, url) => {
                asked.push(url.searchParams.get('status') ?? '');
                return page(url.searchParams.get('status') === 'interrupted' ? [INTERRUPTED] : [ACTIVE, session({}), INTERRUPTED]);
            },
        });
        const { user } = renderApp('/stations?tab=sessions');
        await screen.findByRole('link', { name: 'View session 41' });
        await user.selectOptions(screen.getByLabelText('Status'), 'Interrupted');
        await waitFor(() => expect(screen.queryByRole('link', { name: 'View session 41' })).not.toBeInTheDocument());
        expect(screen.getByRole('link', { name: 'View session 40' })).toBeInTheDocument();
        expect(asked).toEqual(['', 'interrupted']);
    });

    it('is not offered without permission to view sessions', async () => {
        signedIn({ ...NET_ADMIN, permissions: ['network.read', 'station.read', 'evse.read'] }, {});
        renderApp('/stations?tab=sessions');
        expect(await screen.findByRole('tab', { name: 'Charging Networks' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('tab', { name: 'Charging Sessions' })).not.toBeInTheDocument();
    });
});

describe('charger page', () => {
    it('shows what is charging on a connector, and the charger’s sessions', async () => {
        signedIn(NET_ADMIN, {
            'GET /sessions': (_b, _i, url) => {
                expect(url.searchParams.get('evseId')).toBe(EVSE_ID);
                return page([ACTIVE, session({})]);
            },
        });
        renderApp(`/stations/chargers/${EVSE_ID}`);

        const now = await screen.findByLabelText('Charging now');
        expect(within(now).getByText('2.50 kWh')).toBeInTheDocument();
        expect(within(now).getByText('15.0 kW')).toBeInTheDocument();
        expect(within(now).getByText('64%')).toBeInTheDocument();
        expect(within(now).getByText(/for 25 min/)).toBeInTheDocument();
        expect(within(now).getByRole('link', { name: 'Open session' })).toHaveAttribute('href', '/stations/sessions/sess-active');
        // only connector 1 is charging
        expect(screen.getAllByLabelText('Charging now')).toHaveLength(1);

        const sessions = screen.getByRole('region', { name: 'Charging Sessions' });
        expect(await within(sessions).findByRole('link', { name: 'View session 41' })).toBeInTheDocument();
        // on the charger's own page the table shows the connector instead of the charger
        expect(within(sessions).queryByRole('columnheader', { name: 'Charger' })).not.toBeInTheDocument();
    });
});

describe('session page', () => {
    it('shows the summary, energy and every meter reading grouped by time', async () => {
        const detail: ChargingSessionDetail = {
            ...session({}),
            readings: [
                { measuredAt: '2026-11-27T10:10:00Z', measurand: 'Energy.Active.Import.Register', phase: null, unit: 'kWh', value: '12.5', numericValue: 12.5, context: null, location: null, source: 'MeterValues' },
                { measuredAt: '2026-11-27T10:10:00Z', measurand: 'SoC', phase: null, unit: 'Percent', value: '64', numericValue: 64, context: null, location: null, source: 'MeterValues' },
                { measuredAt: '2026-11-27T10:30:00Z', measurand: 'Energy.Active.Import.Register', phase: null, unit: 'Wh', value: '14000', numericValue: 14000, context: null, location: null, source: 'StopTransaction' },
            ],
            readingsTruncated: false,
        };
        signedIn(NET_ADMIN, { 'GET /sessions/sess-1': () => ({ body: detail }) });
        renderApp('/stations/sessions/sess-1');

        expect(await screen.findByRole('heading', { name: 'Charging session 41' })).toBeInTheDocument();
        const info = screen.getByRole('region', { name: 'Session Information' });
        expect(within(info).getByText('RFID-7')).toBeInTheDocument();
        expect(within(info).getByText('Cable unplugged')).toBeInTheDocument();
        expect(within(info).getByRole('link', { name: 'Kottawa Kinro' })).toHaveAttribute('href', `/stations/${ST.id}`);
        expect(within(screen.getByRole('region', { name: 'Energy' })).getByText('4.00 kWh')).toBeInTheDocument();

        const readings = screen.getByRole('region', { name: 'Meter Readings' });
        expect(within(readings).getByRole('columnheader', { name: 'Energy meter' })).toBeInTheDocument();
        expect(within(readings).getByRole('columnheader', { name: 'Battery' })).toBeInTheDocument();
        const rows = within(readings).getAllByRole('row');
        expect(rows).toHaveLength(3); // header + two times
        expect(within(rows[1]!).getByText('12.5 kWh')).toBeInTheDocument();
        expect(within(rows[1]!).getByText('64 %')).toBeInTheDocument();
        expect(within(rows[2]!).getByText(/at stop/)).toBeInTheDocument();
        expect(within(rows[2]!).getByText('14000 Wh')).toBeInTheDocument();
    });

    it('explains an interrupted session', async () => {
        signedIn(NET_ADMIN, { 'GET /sessions/sess-int': () => ({ body: { ...INTERRUPTED, readings: [], readingsTruncated: false } }) });
        renderApp('/stations/sessions/sess-int');
        expect(await screen.findByText(/started a new session on this connector before reporting the stop/, { selector: '.alert div' })).toBeInTheDocument();
        expect(screen.getByText('Superseded by a new StartTransaction at 2026-11-27T09:00:00.000Z')).toBeInTheDocument();
        expect(screen.getByText('The charger sent no meter readings for this session.')).toBeInTheDocument();
    });
});
