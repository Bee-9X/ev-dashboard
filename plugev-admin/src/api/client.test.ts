import { describe, expect, it, vi } from 'vitest';
import { apiError, authHeader, fakeApi, tokens, ME } from '../test/fakeApi';
import { api, ApiError, describeError, request } from './client';
import { session } from './session';

describe('api client', () => {
    it('turns the API error format into an ApiError', async () => {
        fakeApi({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect') });
        const err = await api.login('a@b.lk', 'x').catch((e) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    });

    it('reports an unreachable server as NETWORK_ERROR', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        const err = await api.login('a@b.lk', 'x').catch((e) => e);
        expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    });

    it('shows the correlation ID for server errors and a friendly rate-limit message', () => {
        expect(describeError(new ApiError(500, 'INTERNAL', 'boom', undefined, 'abc-123'))).toContain('abc-123');
        expect(describeError(new ApiError(429, 'RATE_LIMITED', 'x'))).toMatch(/too many attempts/i);
    });

    it('gets an access token with the stored refresh token, and shares one refresh between parallel calls', async () => {
        localStorage.setItem('plugev.refreshToken', 'refresh-0');
        const fetch = fakeApi({
            'POST /auth/refresh': (body) => {
                expect(body).toEqual({ refreshToken: 'refresh-0' });
                return { body: tokens(1) };
            },
            'GET /users/me': (_b, init) => {
                expect(authHeader(init)).toBe('Bearer access-1');
                return { body: ME };
            },
        });
        const [a, b] = await Promise.all([api.me(), api.me()]);
        expect(a.email).toBe(ME.email);
        expect(b.email).toBe(ME.email);
        expect(fetch.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'))).toHaveLength(1);
        expect(session.getRefreshToken()).toBe('refresh-1'); // rotated
    });

    it('refreshes and retries once when the access token is rejected', async () => {
        session.store(tokens(1));
        let meCalls = 0;
        fakeApi({
            'GET /users/me': (_b, init) => {
                meCalls++;
                return authHeader(init) === 'Bearer access-2' ? { body: ME } : apiError(401, 'TOKEN_INVALID');
            },
            'POST /auth/refresh': () => ({ body: tokens(2) }),
        });
        await expect(api.me()).resolves.toMatchObject({ id: 'u1' });
        expect(meCalls).toBe(2);
    });

    it('does not resend a wrong MFA code (only token errors are retried)', async () => {
        session.store(tokens(1));
        const fetch = fakeApi({ 'POST /users/me/mfa/recovery-codes': () => apiError(401, 'INVALID_MFA_CODE') });
        await expect(api.mfaRegenerateCodes('123456')).rejects.toMatchObject({ code: 'INVALID_MFA_CODE' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('ends the session when the refresh token is refused', async () => {
        localStorage.setItem('plugev.refreshToken', 'refresh-old');
        const ended: boolean[] = [];
        session.onChange((s) => ended.push(s));
        fakeApi({ 'POST /auth/refresh': () => apiError(401, 'TOKEN_INVALID') });
        await expect(request('/users/me')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
        expect(session.hasSession()).toBe(false);
        expect(ended).toEqual([false]);
    });

    it('keeps the session when the server is unreachable during a refresh', async () => {
        localStorage.setItem('plugev.refreshToken', 'refresh-1');
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
        await expect(api.me()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
        expect(session.getRefreshToken()).toBe('refresh-1');
    });
});
