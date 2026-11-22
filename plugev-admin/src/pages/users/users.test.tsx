import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Me, UserSummary } from '../../api/types';
import { apiError, fakeApi, ME, tokens, type Handler } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const NET = { id: '11111111-1111-4111-8111-111111111111', name: 'Plug EV Colombo', status: 'active', defaultCurrency: 'LKR', timeZone: 'Asia/Colombo' };
const NET2 = { id: '22222222-2222-4222-8222-222222222222', name: 'Kandy Chargers', status: 'active', defaultCurrency: 'LKR', timeZone: 'Asia/Colombo' };
const ST = { id: '33333333-3333-4333-8333-333333333333', networkId: NET.id, name: 'Kottawa Kinro', status: 'active' };

const SUPER: Me = {
    ...ME,
    permissions: ['user.read', 'user.create', 'user.update_status', 'role.assign', 'network.read', 'station.read'],
};

const NET_ADMIN: Me = {
    ...ME,
    id: 'na',
    fullName: 'Nimal Perera',
    roles: [{ assignmentId: 'x', role: 'NETWORK_ADMIN', networkId: NET.id, stationId: null, effectiveFrom: '2026-11-01T00:00:00Z' }],
    permissions: SUPER.permissions,
};

const KAMAL: UserSummary = {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'kamal@plugev.test',
    fullName: 'Kamal Silva',
    phone: '+94 77 000 0000',
    status: 'active',
    mfaEnabled: true,
    lastLoginAt: null,
    createdAt: '2026-11-10T00:00:00Z',
    roles: [{ assignmentId: '55555555-5555-4555-8555-555555555555', role: 'NETWORK_ADMIN', networkId: NET.id, stationId: null, effectiveFrom: '2026-11-10T00:00:00Z' }],
};

const page = (items: UserSummary[]) => ({ body: { items, page: 1, pageSize: 20, total: items.length } });

/** A signed-in session as `me`, plus the given routes. */
function signedIn(me: Me, routes: Record<string, Handler>) {
    localStorage.setItem('plugev.refreshToken', 'refresh-0');
    return fakeApi({
        'POST /auth/refresh': () => ({ body: tokens(1) }),
        'GET /users/me': () => ({ body: me }),
        'GET /networks': () => page([NET, NET2] as never),
        'GET /stations': () => page([ST] as never),
        ...routes,
    });
}

describe('User Management list', () => {
    it('lists administrators with their roles and network names, and searches', async () => {
        const searches: (string | null)[] = [];
        signedIn(SUPER, {
            'GET /users': (_b, _i, url) => {
                searches.push(url.searchParams.get('search'));
                return page(url.searchParams.get('search') === 'zzz' ? [] : [ME as UserSummary, KAMAL]);
            },
        });
        const { user } = renderApp('/users');

        expect(await screen.findByRole('heading', { name: 'User Management' })).toBeInTheDocument();
        const row = (await screen.findByText('Kamal Silva')).closest('tr')!;
        expect(within(row).getByText('Network Admin')).toBeInTheDocument();
        expect(await within(row).findByText(/Plug EV Colombo/)).toBeInTheDocument();
        expect(screen.getByText('(you)')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /EV Users/ })).toBeDisabled();

        await user.type(screen.getByLabelText('Search'), 'zzz');
        expect(await screen.findByText('No administrators match.')).toBeInTheDocument();
        expect(searches).toContain('zzz');
    });

    it('invites a Network Admin for a chosen network', async () => {
        let listed = 0;
        signedIn(SUPER, {
            'GET /users': () => {
                listed++;
                return page([KAMAL]);
            },
            'POST /users': (body) => {
                expect(body).toEqual({ role: 'NETWORK_ADMIN', networkId: NET2.id, fullName: 'Sunil Fernando', email: 'sunil@plugev.test' });
                return { status: 201, body: { ...KAMAL, id: 'new', email: body.email, status: 'invited' } };
            },
        });
        const { user } = renderApp('/users');
        await user.click(await screen.findByRole('button', { name: /invite admin/i }));

        const dialog = screen.getByRole('dialog', { name: 'Invite an administrator' });
        await user.type(within(dialog).getByLabelText('Full name'), 'Sunil Fernando');
        await user.type(within(dialog).getByLabelText('Email'), 'sunil@plugev.test');
        await user.selectOptions(within(dialog).getByLabelText('Role'), 'NETWORK_ADMIN');
        await user.selectOptions(within(dialog).getByLabelText('Network'), NET2.id);
        await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));

        expect(await screen.findByText(/Invitation sent to/)).toHaveTextContent('sunil@plugev.test');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await waitFor(() => expect(listed).toBe(2));
    });

    it('shows a taken email next to the field', async () => {
        signedIn(SUPER, {
            'GET /users': () => page([]),
            'POST /users': () => apiError(409, 'EMAIL_TAKEN', 'A user with this email already exists'),
        });
        const { user } = renderApp('/users');
        await user.click(await screen.findByRole('button', { name: /invite admin/i }));
        const dialog = screen.getByRole('dialog');
        await user.type(within(dialog).getByLabelText('Full name'), 'Dup');
        await user.type(within(dialog).getByLabelText('Email'), 'kamal@plugev.test');
        await user.selectOptions(within(dialog).getByLabelText('Role'), 'SUPER_ADMIN');
        await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
        expect(await within(dialog).findByText('A user with this email already exists')).toBeInTheDocument();
    });

    it('lets a Network Admin invite only Station Admins', async () => {
        signedIn(NET_ADMIN, {
            'GET /users': () => page([]),
            'GET /networks': () => page([NET] as never),
        });
        const { user } = renderApp('/users');
        await user.click(await screen.findByRole('button', { name: /invite admin/i }));
        const roles = within(screen.getByLabelText('Role')).getAllByRole('option').map((o) => o.textContent);
        expect(roles).toEqual(['Choose a role', 'Station Admin']);
        // a single network: the station list shows directly
        expect(await screen.findByRole('option', { name: 'Kottawa Kinro' })).toBeInTheDocument();
    });

    it('tells users without the permission that the screen is not for them', async () => {
        signedIn({ ...ME, permissions: [] }, {});
        renderApp('/users');
        expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    });
});

describe('User profile (admin view)', () => {
    it('suspends a user with a reason', async () => {
        signedIn(SUPER, {
            [`GET /users/${KAMAL.id}`]: () => ({ body: KAMAL }),
            [`PATCH /users/${KAMAL.id}/status`]: (body) => {
                expect(body).toEqual({ status: 'suspended', reason: 'Left the company' });
                return { body: { ...KAMAL, status: 'suspended' } };
            },
        });
        const { user } = renderApp(`/users/${KAMAL.id}`);
        await user.click(await screen.findByRole('button', { name: 'Suspend' }));
        const dialog = screen.getByRole('dialog');
        const confirm = within(dialog).getByRole('button', { name: 'Suspend' });
        expect(confirm).toBeDisabled();
        await user.type(within(dialog).getByLabelText('Reason'), 'Left the company');
        await user.click(confirm);

        expect(await screen.findByText('Status changed to suspended.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
    });

    it('resets two-step verification', async () => {
        signedIn(SUPER, {
            [`GET /users/${KAMAL.id}`]: () => ({ body: KAMAL }),
            [`POST /users/${KAMAL.id}/mfa/reset`]: (body) => {
                expect(body).toEqual({ reason: 'Lost phone' });
                return { body: { ...KAMAL, mfaEnabled: false } };
            },
        });
        const { user } = renderApp(`/users/${KAMAL.id}`);
        await user.click(await screen.findByRole('button', { name: 'Reset two-step verification' }));
        await user.type(within(screen.getByRole('dialog')).getByLabelText('Reason'), 'Lost phone');
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset' }));
        expect(await screen.findByText(/was reset/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reset two-step verification' })).not.toBeInTheDocument();
    });

    it('shows the API reason when a role cannot be removed', async () => {
        const superUser = { ...KAMAL, roles: [{ ...KAMAL.roles[0]!, role: 'SUPER_ADMIN', networkId: null }] };
        signedIn(SUPER, {
            [`GET /users/${KAMAL.id}`]: () => ({ body: superUser }),
            [`DELETE /users/${KAMAL.id}/roles/${KAMAL.roles[0]!.assignmentId}`]: () =>
                apiError(409, 'LAST_SUPER_ADMIN', 'The platform must keep at least one active Super Admin'),
        });
        const { user } = renderApp(`/users/${KAMAL.id}`);
        await user.click(await screen.findByRole('button', { name: 'Remove Super Admin' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove role' }));
        expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('at least one active Super Admin');
    });

    it('adds a Station Admin role', async () => {
        signedIn(SUPER, {
            [`GET /users/${KAMAL.id}`]: () => ({ body: KAMAL }),
            [`POST /users/${KAMAL.id}/roles`]: (body) => {
                expect(body).toEqual({ role: 'STATION_ADMIN', stationId: ST.id });
                return { status: 201, body: { ...KAMAL, roles: [...KAMAL.roles, { assignmentId: 'n', role: 'STATION_ADMIN', networkId: null, stationId: ST.id, effectiveFrom: '2026-11-22T00:00:00Z' }] } };
            },
        });
        const { user } = renderApp(`/users/${KAMAL.id}`);
        await user.click(await screen.findByRole('button', { name: 'Add role' }));
        const dialog = screen.getByRole('dialog');
        await user.selectOptions(within(dialog).getByLabelText('Role'), 'STATION_ADMIN');
        await user.selectOptions(within(dialog).getByLabelText('Network'), NET.id);
        await user.selectOptions(within(dialog).getByLabelText('Station'), ST.id);
        await user.click(within(dialog).getByRole('button', { name: 'Add role' }));
        expect(await screen.findByText('Station Admin added.')).toBeInTheDocument();
        expect(screen.getByText(/Kottawa Kinro · Plug EV Colombo/)).toBeInTheDocument();
    });

    it('does not offer changes to your own account', async () => {
        signedIn(SUPER, { [`GET /users/${ME.id}`]: () => ({ body: ME }) });
        renderApp(`/users/${ME.id}`);
        expect(await screen.findByText(/This is your account/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add role' })).not.toBeInTheDocument();
    });

    it('says when a user is outside your networks', async () => {
        signedIn(SUPER, { 'GET /users/missing': () => apiError(404, 'NOT_FOUND', 'User not found') });
        renderApp('/users/missing');
        expect(await screen.findByRole('heading', { name: 'User not found' })).toBeInTheDocument();
    });
});
