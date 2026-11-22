import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiError, fakeApi } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

describe('password links from emails', () => {
    it('activates an invited account', async () => {
        const fetch = fakeApi({
            'POST /auth/password/reset/confirm': (body) => {
                expect(body).toEqual({ token: 'inv.tok', newPassword: 'a long enough passphrase' });
                return { status: 204 };
            },
        });
        const { user } = renderApp('/accept-invite?token=inv.tok');
        expect(screen.getByRole('heading', { name: 'Activate your account' })).toBeInTheDocument();

        await user.type(screen.getByLabelText('New password'), 'a long enough passphrase');
        await user.type(screen.getByLabelText('Confirm new password'), 'a long enough passphrase');
        await user.click(screen.getByRole('button', { name: 'Activate account' }));

        expect(await screen.findByText('Your account is active.')).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('checks length and confirmation before calling the API', async () => {
        const fetch = fakeApi({});
        const { user } = renderApp('/reset-password?token=t');
        await user.type(screen.getByLabelText('New password'), 'short');
        await user.type(screen.getByLabelText('Confirm new password'), 'different');
        await user.click(screen.getByRole('button', { name: 'Change password' }));
        expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument();
        expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('explains an expired or used link', async () => {
        fakeApi({ 'POST /auth/password/reset/confirm': () => apiError(400, 'TOKEN_INVALID', 'The link is invalid or has expired.') });
        const { user } = renderApp('/reset-password?token=old');
        await user.type(screen.getByLabelText('New password'), 'a long enough passphrase');
        await user.type(screen.getByLabelText('Confirm new password'), 'a long enough passphrase');
        await user.click(screen.getByRole('button', { name: 'Change password' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/invalid, has expired or was already used/);
        expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
    });

    it('treats a link without a token as invalid', () => {
        fakeApi({});
        renderApp('/accept-invite');
        expect(screen.getByRole('alert')).toHaveTextContent(/ask your administrator/i);
    });

    it('requests a reset link without revealing whether the email exists', async () => {
        fakeApi({
            'POST /auth/password/reset': (body) => {
                expect(body).toEqual({ email: 'someone@plugev.test' });
                return { status: 202 };
            },
        });
        const { user } = renderApp('/forgot-password');
        await user.type(screen.getByLabelText('Email'), 'someone@plugev.test');
        await user.click(screen.getByRole('button', { name: 'Send reset link' }));
        expect(await screen.findByText(/a reset link is on its way/)).toBeInTheDocument();
    });
});
