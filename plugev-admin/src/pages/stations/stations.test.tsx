import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Me, Network, Station } from '../../api/types';
import { apiError, fakeApi, ME, tokens, type Handler } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const NET: Network = {
    id: '11111111-1111-4111-8111-111111111111', name: 'Plug EV Colombo', status: 'active', defaultCurrency: 'LKR',
    timeZone: 'Asia/Colombo', createdAt: '2026-11-01T00:00:00Z', stationCount: 1,
};
const NET2: Network = { ...NET, id: '22222222-2222-4222-8222-222222222222', name: 'Kandy Chargers', stationCount: 0 };
const ST: Station = { id: '33333333-3333-4333-8333-333333333333', networkId: NET.id, name: 'Kottawa Kinro', status: 'active', createdAt: '2026-11-02T00:00:00Z' };

const SUPER: Me = {
    ...ME,
    permissions: ['network.create', 'network.read', 'network.update', 'network.suspend', 'station.create', 'station.read', 'station.update'],
};
const STATION_ADMIN: Me = {
    ...ME,
    roles: [{ assignmentId: 'x', role: 'STATION_ADMIN', networkId: null, stationId: ST.id, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: ['station.read', 'station.update'],
};

const page = <T,>(items: T[]) => ({ body: { items, page: 1, pageSize: 20, total: items.length } });

function signedIn(me: Me, routes: Record<string, Handler>) {
    localStorage.setItem('plugev.refreshToken', 'refresh-0');
    return fakeApi({
        'POST /auth/refresh': () => ({ body: tokens(1) }),
        'GET /users/me': () => ({ body: me }),
        'GET /networks': () => page([NET, NET2]),
        'GET /stations': () => page([ST]),
        ...routes,
    });
}

describe('Charging networks', () => {
    it('lists networks with their station counts, as the old Charging Networks tab', async () => {
        signedIn(SUPER, {});
        renderApp('/stations');
        expect(await screen.findByRole('heading', { name: 'Charging Station Details' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Charging Networks' })).toHaveAttribute('aria-selected', 'true');
        // the terminals tab needs evse.read, which this user lacks
        expect(screen.queryByRole('tab', { name: /Charger Terminals/ })).not.toBeInTheDocument();
        const row = (await screen.findByRole('link', { name: 'Plug EV Colombo' })).closest('tr')!;
        expect(within(row).getByText('1')).toBeInTheDocument();
        expect(within(row).getByText('Asia/Colombo')).toBeInTheDocument();
    });

    it('adds a network', async () => {
        let listed = 0;
        signedIn(SUPER, {
            'GET /networks': () => {
                listed++;
                return page([NET]);
            },
            'POST /networks': (body) => {
                expect(body).toEqual({ name: 'Galle EV', defaultCurrency: 'LKR', timeZone: 'Asia/Colombo' });
                return { status: 201, body: { ...NET2, id: 'new', name: 'Galle EV' } };
            },
        });
        const { user } = renderApp('/stations');
        await user.click(await screen.findByRole('button', { name: /Add network/ }));
        const dialog = screen.getByRole('dialog', { name: 'Add a charging network' });
        await user.type(within(dialog).getByLabelText('Network name'), 'Galle EV');
        await user.click(within(dialog).getByRole('button', { name: 'Add network' }));
        expect(await screen.findByText(/was added/)).toHaveTextContent('Galle EV');
        await waitFor(() => expect(listed).toBeGreaterThanOrEqual(2));
    });

    it('shows a taken network name next to the field', async () => {
        signedIn(SUPER, { 'POST /networks': () => apiError(409, 'NAME_TAKEN', 'A network with this name already exists') });
        const { user } = renderApp('/stations');
        await user.click(await screen.findByRole('button', { name: /Add network/ }));
        const dialog = screen.getByRole('dialog');
        await user.type(within(dialog).getByLabelText('Network name'), 'Plug EV Colombo');
        await user.click(within(dialog).getByRole('button', { name: 'Add network' }));
        expect(await within(dialog).findByText('A network with this name already exists')).toBeInTheDocument();
    });

    it('opens a network, edits it and suspends it', async () => {
        let current = NET;
        signedIn(SUPER, {
            [`GET /networks/${NET.id}`]: () => ({ body: current }),
            [`PATCH /networks/${NET.id}`]: (body) => {
                current = { ...current, ...body };
                return { body: current };
            },
        });
        const { user } = renderApp(`/stations/networks/${NET.id}`);
        expect(await screen.findByRole('heading', { name: 'Plug EV Colombo' })).toBeInTheDocument();
        expect(await screen.findByRole('link', { name: 'Kottawa Kinro' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Update network/ }));
        const edit = screen.getByRole('dialog');
        const currency = within(edit).getByLabelText('Currency');
        await user.clear(currency);
        await user.type(currency, 'usd');
        await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByText('Network updated.')).toBeInTheDocument();
        expect(screen.getByText('USD')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Suspend network' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend network' }));
        expect(await screen.findByText(/This network is suspended/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reactivate network' })).toBeInTheDocument();
        // no stations can be added to a suspended network
        expect(screen.queryByRole('button', { name: /Add new station/ })).not.toBeInTheDocument();
    });

    it('adds a station inside a network', async () => {
        signedIn(SUPER, {
            [`GET /networks/${NET.id}`]: () => ({ body: NET }),
            'POST /stations': (body) => {
                expect(body).toEqual({ networkId: NET.id, name: 'Nugegoda' });
                return { status: 201, body: { ...ST, id: 'new', name: 'Nugegoda' } };
            },
        });
        const { user } = renderApp(`/stations/networks/${NET.id}`);
        await user.click(await screen.findByRole('button', { name: /Add new station/ }));
        const dialog = screen.getByRole('dialog', { name: 'Add a charging station' });
        expect(within(dialog).queryByLabelText('Network')).not.toBeInTheDocument();
        await user.type(within(dialog).getByLabelText('Station name'), 'Nugegoda');
        await user.click(within(dialog).getByRole('button', { name: 'Add station' }));
        expect(await screen.findByText('Nugegoda was added.')).toBeInTheDocument();
    });

    it('says when a network is outside your access', async () => {
        signedIn(SUPER, { 'GET /networks/missing': () => apiError(404, 'NOT_FOUND', 'Network not found') });
        renderApp('/stations/networks/missing');
        expect(await screen.findByRole('heading', { name: 'Network not found' })).toBeInTheDocument();
    });
});

describe('Chargers stations', () => {
    it('filters stations by network and adds one to a chosen network', async () => {
        const filters: (string | null)[] = [];
        signedIn(SUPER, {
            'GET /stations': (_b, _i, url) => {
                filters.push(url.searchParams.get('networkId'));
                return page(url.searchParams.get('networkId') === NET2.id ? [] : [ST]);
            },
            'POST /stations': (body) => {
                expect(body).toEqual({ networkId: NET2.id, name: 'Peradeniya Road' });
                return { status: 201, body: { ...ST, id: 'n', networkId: NET2.id, name: 'Peradeniya Road' } };
            },
        });
        const { user } = renderApp('/stations?tab=stations');
        const row = (await screen.findByRole('link', { name: 'Kottawa Kinro' })).closest('tr')!;
        expect(await within(row).findByText('Plug EV Colombo')).toBeInTheDocument();

        await user.selectOptions(await screen.findByLabelText('Network'), NET2.id);
        expect(await screen.findByText('This network has no stations yet.')).toBeInTheDocument();
        expect(filters).toContain(NET2.id);

        await user.click(screen.getByRole('button', { name: /Add station/ }));
        const dialog = screen.getByRole('dialog');
        await user.type(within(dialog).getByLabelText('Station name'), 'Peradeniya Road');
        await user.click(within(dialog).getByRole('button', { name: 'Add station' }));
        expect(await screen.findByText(/was added/)).toHaveTextContent('Peradeniya Road');
    });

    it('a Station Admin sees only the stations tab and can rename their station, but not switch it off', async () => {
        let current = ST;
        signedIn(STATION_ADMIN, {
            [`GET /stations/${ST.id}`]: () => ({ body: current }),
            [`PATCH /stations/${ST.id}`]: (body) => {
                current = { ...current, ...body };
                return { body: current };
            },
        });
        const { user } = renderApp('/stations');
        expect(await screen.findByRole('link', { name: 'Kottawa Kinro' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: 'Charging Networks' })).not.toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Network' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Add station/ })).not.toBeInTheDocument();

        await user.click(screen.getByRole('link', { name: 'View Kottawa Kinro' }));
        await user.click(await screen.findByRole('button', { name: /Rename/ }));
        const name = within(screen.getByRole('dialog')).getByLabelText('Station name');
        await user.clear(name);
        await user.type(name, 'Kottawa Main');
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
        expect(await screen.findByRole('heading', { name: 'Kottawa Main' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Mark inactive/ })).not.toBeInTheDocument();
    });

    it('a Super Admin marks a station inactive and active again', async () => {
        let current = ST;
        signedIn(SUPER, {
            [`GET /stations/${ST.id}`]: () => ({ body: current }),
            [`GET /networks/${NET.id}`]: () => ({ body: NET }),
            [`PATCH /stations/${ST.id}`]: (body) => {
                expect(Object.keys(body)).toEqual(['status']);
                current = { ...current, ...body };
                return { body: current };
            },
        });
        const { user } = renderApp(`/stations/${ST.id}`);
        expect((await screen.findAllByRole('link', { name: /Plug EV Colombo/ })).length).toBeGreaterThan(0);
        await user.click(await screen.findByRole('button', { name: /Mark inactive/ }));
        expect(within(screen.getByRole('dialog')).getByText(/lose access/)).toBeInTheDocument();
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark inactive' }));
        expect(await screen.findByText('Station marked inactive.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /Mark active/ }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark active' }));
        expect(await screen.findByText('Station marked active.')).toBeInTheDocument();
    });

    it('shows the Stations menu item only with station access', async () => {
        signedIn({ ...ME, permissions: [] }, {});
        renderApp('/stations');
        expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Stations' })).not.toBeInTheDocument();
    });
});
