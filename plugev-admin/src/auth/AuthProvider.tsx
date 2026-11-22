import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import { session } from '../api/session';
import type { Me, TokenResponse } from '../api/types';

type Status = 'loading' | 'signedOut' | 'signedIn' | 'unreachable';

interface AuthState {
    status: Status;
    me: Me | null;
    /** Stores the tokens from a completed sign-in and loads the user's profile. */
    signIn(tokens: TokenResponse): Promise<void>;
    signOut(): Promise<void>;
    reloadMe(): Promise<void>;
    /** Retries loading the session after the server could not be reached. */
    retry(): void;
    can(permission: string): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<Status>(() => (session.hasSession() ? 'loading' : 'signedOut'));
    const [me, setMe] = useState<Me | null>(null);
    const [attempt, setAttempt] = useState(0);

    const loadMe = useCallback(async () => {
        try {
            setMe(await api.me());
            setStatus('signedIn');
        } catch (err) {
            if (err instanceof ApiError && err.status === 0) {
                setStatus('unreachable');
                return;
            }
            // token rejected, account suspended, ...: start again from the sign-in page
            session.clear();
            setMe(null);
            setStatus('signedOut');
        }
    }, []);

    // Resume a session after a reload
    useEffect(() => {
        if (session.hasSession()) void loadMe();
    }, [loadMe, attempt]);

    // Signed out elsewhere (another tab, or the refresh token was rejected)
    useEffect(
        () =>
            session.onChange((signedIn) => {
                if (!signedIn) {
                    setMe(null);
                    setStatus('signedOut');
                }
            }),
        [],
    );

    const signIn = useCallback(
        async (tokens: TokenResponse) => {
            session.store(tokens);
            await loadMe();
        },
        [loadMe],
    );

    const signOut = useCallback(async () => {
        const refreshToken = session.getRefreshToken();
        session.clear();
        setMe(null);
        setStatus('signedOut');
        if (refreshToken) await api.logout(refreshToken).catch(() => undefined); // best effort
    }, []);

    const value = useMemo<AuthState>(
        () => ({
            status,
            me,
            signIn,
            signOut,
            reloadMe: loadMe,
            retry: () => {
                setStatus('loading');
                setAttempt((a) => a + 1);
            },
            can: (permission) => me?.permissions.includes(permission) ?? false,
        }),
        [status, me, signIn, signOut, loadMe],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
