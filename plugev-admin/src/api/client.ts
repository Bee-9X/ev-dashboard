import { session } from './session';
import type {
    ApiErrorBody, ConnectorInput, EnrolledSignIn, EquipmentStatus, Evse, EvseInput, LoginResult, Me, MfaSetup, MfaStatus, Network,
    NetworkStatus, Page, RoleTarget, SignedIn, Station, StationDetails, StationStatus, TokenResponse, UserStatus, UserSummary,
} from './types';

export interface NetworkInput {
    name: string;
    defaultCurrency: string;
    timeZone: string;
}

export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/+$/, '');

export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly details?: unknown,
        readonly correlationId?: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    /** Send the access token (default true). Sign-in endpoints pass false. */
    auth?: boolean;
}

async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
        return await fetch(`${API_URL}${path}`, {
            method: opts.method ?? 'GET',
            headers,
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
            // account data and permissions must always be current, never a cached copy
            cache: 'no-store',
        });
    } catch {
        throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the PLUG EV server. Check your connection and try again.');
    }
}

async function parse<T>(res: Response): Promise<T> {
    if (res.status === 204 || res.status === 202) return undefined as T;
    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = undefined;
        }
    }
    if (res.ok) return data as T;
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
        res.status,
        err?.code ?? `HTTP_${res.status}`,
        err?.message ?? `The server returned an error (${res.status}).`,
        err?.details,
        err?.correlationId,
    );
}

let inflight: Promise<string | null> | null = null;

/**
 * Gets a new access token with the stored refresh token. Returns null (and ends the session) when
 * the refresh token is no longer accepted. Concurrent callers share one request.
 */
export function refreshAccessToken(): Promise<string | null> {
    if (!inflight) {
        inflight = session
            .withRefreshLock(async () => {
                // another tab may have refreshed while we waited for the lock: always use the latest token
                const refreshToken = session.getRefreshToken();
                if (!refreshToken) return null;
                const res = await send('/auth/refresh', { method: 'POST', body: { refreshToken } }, null);
                if (res.status === 401 || res.status === 403) {
                    session.clear();
                    return null;
                }
                const tokens = await parse<TokenResponse>(res);
                session.store(tokens);
                return tokens.accessToken;
            })
            .finally(() => {
                inflight = null;
            });
    }
    return inflight;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    if (opts.auth === false) return parse<T>(await send(path, opts, null));

    let token = session.getAccessToken() ?? (await refreshAccessToken());
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');

    try {
        return await parse<T>(await send(path, opts, token));
    } catch (err) {
        // Only a rejected access token is retried. Other 401s (e.g. INVALID_MFA_CODE) are answers,
        // and resending them would count as a second failed attempt.
        if (!(err instanceof ApiError) || err.status !== 401 || !TOKEN_ERRORS.has(err.code)) throw err;
    }
    token = await refreshAccessToken();
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
    return parse<T>(await send(path, opts, token));
}

const TOKEN_ERRORS = new Set(['TOKEN_INVALID', 'UNAUTHENTICATED']);

export const api = {
    login: (email: string, password: string) =>
        request<LoginResult>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
    verifyMfa: (mfaToken: string, input: { code: string } | { recoveryCode: string }) =>
        request<SignedIn>('/auth/mfa/verify', { method: 'POST', body: { mfaToken, ...input }, auth: false }),
    startEnrollment: (mfaToken: string) =>
        request<MfaSetup>('/auth/mfa/enroll', { method: 'POST', body: { mfaToken }, auth: false }),
    confirmEnrollment: (mfaToken: string, code: string) =>
        request<EnrolledSignIn>('/auth/mfa/enroll/confirm', { method: 'POST', body: { mfaToken, code }, auth: false }),
    logout: (refreshToken: string) =>
        request<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
    requestPasswordReset: (email: string) =>
        request<void>('/auth/password/reset', { method: 'POST', body: { email }, auth: false }),
    confirmPasswordReset: (token: string, newPassword: string) =>
        request<void>('/auth/password/reset/confirm', { method: 'POST', body: { token, newPassword }, auth: false }),

    me: () => request<Me>('/users/me'),
    mfaStatus: () => request<MfaStatus>('/users/me/mfa'),
    mfaSetup: () => request<MfaSetup>('/users/me/mfa/setup', { method: 'POST' }),
    mfaConfirm: (code: string) => request<{ recoveryCodes: string[] }>('/users/me/mfa/confirm', { method: 'POST', body: { code } }),
    mfaRegenerateCodes: (code: string) =>
        request<{ recoveryCodes: string[] }>('/users/me/mfa/recovery-codes', { method: 'POST', body: { code } }),
    mfaDisable: (code: string) => request<void>('/users/me/mfa', { method: 'DELETE', body: { code } }),

    listUsers: (q: { page?: number; pageSize?: number; search?: string; status?: string }) =>
        request<Page<UserSummary>>(`/users${query(q)}`),
    getUser: (id: string) => request<UserSummary>(`/users/${encodeURIComponent(id)}`),
    inviteUser: (body: RoleTarget & { email: string; fullName: string; phone?: string }) =>
        request<UserSummary>('/users', { method: 'POST', body }),
    setUserStatus: (id: string, status: Exclude<UserStatus, 'invited'>, reason: string) =>
        request<UserSummary>(`/users/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status, reason } }),
    resetUserMfa: (id: string, reason: string) =>
        request<UserSummary>(`/users/${encodeURIComponent(id)}/mfa/reset`, { method: 'POST', body: { reason } }),
    assignRole: (id: string, target: RoleTarget) =>
        request<UserSummary>(`/users/${encodeURIComponent(id)}/roles`, { method: 'POST', body: target }),
    revokeRole: (id: string, assignmentId: string) =>
        request<UserSummary>(`/users/${encodeURIComponent(id)}/roles/${encodeURIComponent(assignmentId)}`, { method: 'DELETE' }),

    /** Up to 100, for pickers and names. */
    listNetworks: () => request<Page<Network>>('/networks?pageSize=100'),
    /** Up to 100, for pickers and names. */
    listStations: (networkId?: string) => request<Page<Station>>(`/stations${query({ pageSize: 100, networkId })}`),

    networksPage: (q: { page?: number; pageSize?: number }) => request<Page<Network>>(`/networks${query(q)}`),
    getNetwork: (id: string) => request<Network>(`/networks/${encodeURIComponent(id)}`),
    createNetwork: (body: NetworkInput) => request<Network>('/networks', { method: 'POST', body }),
    updateNetwork: (id: string, body: Partial<NetworkInput> & { status?: NetworkStatus }) =>
        request<Network>(`/networks/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    stationsPage: (q: { page?: number; pageSize?: number; networkId?: string }) => request<Page<Station>>(`/stations${query(q)}`),
    getStation: (id: string) => request<Station>(`/stations/${encodeURIComponent(id)}`),
    createStation: (body: { networkId: string; name: string }) => request<Station>('/stations', { method: 'POST', body }),
    updateStation: (id: string, body: Partial<StationDetails> & { name?: string; status?: StationStatus; publicVisible?: boolean }) =>
        request<Station>(`/stations/${encodeURIComponent(id)}`, { method: 'PATCH', body }),

    evsesPage: (q: { page?: number; pageSize?: number; networkId?: string; stationId?: string }) =>
        request<Page<Evse>>(`/evses${query(q)}`),
    getEvse: (id: string) => request<Evse>(`/evses/${encodeURIComponent(id)}`),
    createEvse: (body: Partial<EvseInput> & Pick<EvseInput, 'protocol' | 'protocolIdentity' | 'vendor' | 'model'> & {
        stationId: string;
        connectors: ConnectorInput[];
    }) => request<Evse>('/evses', { method: 'POST', body }),
    updateEvse: (id: string, body: Partial<EvseInput> & { stationId?: string; status?: EquipmentStatus }) =>
        request<Evse>(`/evses/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
    addConnector: (evseId: string, body: ConnectorInput) =>
        request<Evse>(`/evses/${encodeURIComponent(evseId)}/connectors`, { method: 'POST', body }),
    updateConnector: (evseId: string, connectorId: string, body: Partial<Omit<ConnectorInput, 'connectorNumber'>> & { status?: EquipmentStatus }) =>
        request<Evse>(`/evses/${encodeURIComponent(evseId)}/connectors/${encodeURIComponent(connectorId)}`, { method: 'PATCH', body }),
};

/** ?a=1&b=x, skipping empty values. */
function query(params: Record<string, string | number | undefined>): string {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
    const s = q.toString();
    return s ? `?${s}` : '';
}

/** A sentence for the user; the correlation ID helps support find the request in the logs. */
export function describeError(err: unknown): string {
    if (err instanceof ApiError) {
        if (err.code === 'RATE_LIMITED') return 'Too many attempts. Wait a minute and try again.';
        if (err.status >= 500) {
            return `Something went wrong on the server.${err.correlationId ? ` Reference: ${err.correlationId}` : ''}`;
        }
        return err.message;
    }
    return 'Something went wrong. Please try again.';
}
