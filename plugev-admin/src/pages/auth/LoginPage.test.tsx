import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { session } from '../../api/session';
import { apiError, fakeApi, ME, tokens } from '../../test/fakeApi';
import { renderApp } from '../../test/renderApp';

const signedIn = { status: 'authenticated', ...tokens(1), user: { id: ME.id, email: ME.email, fullName: ME.fullName } };

async function enterCredentials(user: ReturnType<typeof renderApp>['user']) {
    await user.type(screen.getByLabelText('Email'), 'ada@plugev.test');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('sign in', () => {
    it('sends a signed-out visitor to the sign-in page', async () => {
        fakeApi({});
        renderApp('/profile');
        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    });

    it('signs in without MFA and opens the page that was asked for', async () => {
        fakeApi({
            'POST /auth/login': (body) => {
                expect(body).toEqual({ email: 'ada@plugev.test', password: 'correct horse battery staple' });
                return { body: signedIn };
            },
            'GET /users/me': () => ({ body: { ...ME, mfaEnabled: false, mfaRequired: false } }),
            'GET /users/me/mfa': () => ({ body: { enabled: false, required: false, enabledAt: null, recoveryCodesRemaining: 0 } }),
        });
        const { user } = renderApp('/profile');
        await screen.findByRole('button', { name: 'Sign in' });
        await enterCredentials(user);
        expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument();
        expect(session.getRefreshToken()).toBe('refresh-1');
    });

    it('shows the reason when the password is wrong', async () => {
        fakeApi({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect') });
        const { user } = renderApp('/login');
        await enterCredentials(user);
        expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
        expect(screen.getByLabelText('Password')).toHaveValue('correct horse battery staple');
    });

    it('asks for the authenticator code when MFA is on', async () => {
        fakeApi({
            'POST /auth/login': () => ({ body: { status: 'mfa_required', mfaToken: 'mfa-tok', mfaTokenExpiresIn: 300 } }),
            'POST /auth/mfa/verify': (body) =>
                body.code === '123456' ? { body: signedIn } : apiError(401, 'INVALID_MFA_CODE', 'The verification code is incorrect or has already been used'),
            'GET /users/me': () => ({ body: ME }),
        });
        const { user } = renderApp('/login');
        await enterCredentials(user);

        await user.type(await screen.findByLabelText('Verification code'), '999999');
        await user.click(screen.getByRole('button', { name: 'Verify' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('incorrect');

        await user.clear(screen.getByLabelText('Verification code'));
        await user.type(screen.getByLabelText('Verification code'), '123456');
        await user.click(screen.getByRole('button', { name: 'Verify' }));
        expect(await screen.findByRole('heading', { name: /Welcome back, Ada/ })).toBeInTheDocument();
    });

    it('accepts a recovery code instead of the app code', async () => {
        fakeApi({
            'POST /auth/login': () => ({ body: { status: 'mfa_required', mfaToken: 'mfa-tok', mfaTokenExpiresIn: 300 } }),
            'POST /auth/mfa/verify': (body) => {
                expect(body).toEqual({ mfaToken: 'mfa-tok', recoveryCode: 'ABCDE-FGHJK' });
                return { body: signedIn };
            },
            'GET /users/me': () => ({ body: ME }),
        });
        const { user } = renderApp('/login');
        await enterCredentials(user);
        await user.click(await screen.findByRole('button', { name: /use a recovery code/i }));
        await user.type(screen.getByLabelText('Recovery code'), 'ABCDE-FGHJK');
        await user.click(screen.getByRole('button', { name: 'Verify' }));
        expect(await screen.findByRole('heading', { name: /Welcome back/ })).toBeInTheDocument();
    });

    it('returns to email and password when the sign-in step has expired', async () => {
        fakeApi({
            'POST /auth/login': () => ({ body: { status: 'mfa_required', mfaToken: 'mfa-tok', mfaTokenExpiresIn: 300 } }),
            'POST /auth/mfa/verify': () => apiError(401, 'MFA_TOKEN_INVALID', 'The sign-in step has expired. Sign in again.'),
        });
        const { user } = renderApp('/login');
        await enterCredentials(user);
        await user.type(await screen.findByLabelText('Verification code'), '123456');
        await user.click(screen.getByRole('button', { name: 'Verify' }));
        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('expired');
    });

    it('walks a new administrator through MFA setup and shows the recovery codes once', async () => {
        const codes = Array.from({ length: 10 }, (_, i) => `CODE${i}-ABCDE`);
        fakeApi({
            'POST /auth/login': () => ({ body: { status: 'mfa_enrollment_required', mfaToken: 'enrol-tok', mfaTokenExpiresIn: 300 } }),
            'POST /auth/mfa/enroll': (body) => {
                expect(body).toEqual({ mfaToken: 'enrol-tok' });
                return { body: { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/PLUG%20EV:ada?secret=JBSWY3DPEHPK3PXP' } };
            },
            'POST /auth/mfa/enroll/confirm': (body) => {
                expect(body).toEqual({ mfaToken: 'enrol-tok', code: '654321' });
                return { body: { ...signedIn, recoveryCodes: codes } };
            },
            'GET /users/me': () => ({ body: ME }),
        });
        const { user } = renderApp('/login');
        await enterCredentials(user);

        expect(await screen.findByRole('heading', { name: 'Set up two-step verification' })).toBeInTheDocument();
        expect(await screen.findByTestId('mfa-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
        await user.type(screen.getByLabelText('Verification code'), '654321');
        await user.click(screen.getByRole('button', { name: /turn on and continue/i }));

        expect(await screen.findByRole('heading', { name: 'Save your recovery codes' })).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(10);
        const proceed = screen.getByRole('button', { name: 'Continue to PLUG EV' });
        expect(proceed).toBeDisabled();
        await user.click(screen.getByLabelText('I have saved my recovery codes'));
        await user.click(proceed);
        expect(await screen.findByRole('heading', { name: /Welcome back/ })).toBeInTheDocument();
    });

    it('resumes the session after a reload and signs out', async () => {
        localStorage.setItem('plugev.refreshToken', 'refresh-0');
        fakeApi({
            'POST /auth/refresh': () => ({ body: tokens(1) }),
            'GET /users/me': () => ({ body: ME }),
            'POST /auth/logout': (body) => {
                expect(body).toEqual({ refreshToken: 'refresh-1' });
                return { status: 204 };
            },
        });
        const { user } = renderApp('/');
        expect(await screen.findByRole('heading', { name: /Welcome back, Ada/ })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
        await user.click(screen.getByRole('menuitem', { name: /sign out/i }));
        expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
        await waitFor(() => expect(session.hasSession()).toBe(false));
    });

    it('offers a retry instead of signing out when the server cannot be reached', async () => {
        localStorage.setItem('plugev.refreshToken', 'refresh-0');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
        renderApp('/');
        expect(await screen.findByRole('heading', { name: /cannot reach/i })).toBeInTheDocument();
        expect(session.getRefreshToken()).toBe('refresh-0');
    });
});
