import { vi } from 'vitest';
import type { Me } from '../api/types';

export type Handler = (body: any, init: RequestInit) => { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;

/**
 * Replaces fetch with a tiny fake of plugev-api. Routes are "METHOD /path" (path after /api/v1).
 * Returns the mock so tests can inspect calls.
 */
export function fakeApi(routes: Record<string, Handler>) {
    const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = new URL(String(input));
        const path = url.pathname.replace(/^\/api\/v1/, '');
        const key = `${init.method ?? 'GET'} ${path}`;
        const handler = routes[key];
        if (!handler) throw new Error(`fakeApi: no route for ${key}`);
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        const res = await handler(body, init);
        const status = res.status ?? 200;
        return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    });
    vi.stubGlobal('fetch', fn);
    return fn;
}

export const apiError = (status: number, code: string, message = code) => ({
    status,
    body: { error: { code, message, correlationId: 'test-correlation' } },
});

export const tokens = (n = 1) => ({
    tokenType: 'Bearer',
    accessToken: `access-${n}`,
    expiresIn: 900,
    refreshToken: `refresh-${n}`,
    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
});

export const ME: Me = {
    id: 'u1',
    email: 'ada@plugev.test',
    fullName: 'Ada Lovelace',
    phone: null,
    status: 'active',
    mfaEnabled: true,
    mfaRequired: true,
    lastLoginAt: '2026-11-22T08:00:00.000Z',
    createdAt: '2026-11-01T08:00:00.000Z',
    roles: [{ assignmentId: 'a1', role: 'SUPER_ADMIN', networkId: null, stationId: null, effectiveFrom: '2026-11-01T08:00:00.000Z' }],
    permissions: ['user.read', 'user.create'],
};

export function authHeader(init: RequestInit): string | undefined {
    return (init.headers as Record<string, string> | undefined)?.Authorization;
}
