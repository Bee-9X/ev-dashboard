// Holds the tokens of the signed-in user.
//
// - The access token (15 min) lives in memory only.
// - The refresh token is kept in localStorage so a reload or a second tab stays signed in.
//   The API rotates it on every use and treats a reused one as theft (it then signs out every
//   session), so tabs must never refresh with a stale copy: refreshes are serialised across tabs
//   with the Web Locks API and always read the latest token from storage first.

const REFRESH_KEY = 'plugev.refreshToken';
const LOCK_NAME = 'plugev.refresh';

let accessToken: string | null = null;
let accessExpiresAt = 0;

type Listener = (signedIn: boolean) => void;
const listeners = new Set<Listener>();

function readStored(): string | null {
    try {
        return localStorage.getItem(REFRESH_KEY);
    } catch {
        return null;
    }
}

function writeStored(token: string | null): void {
    try {
        if (token) localStorage.setItem(REFRESH_KEY, token);
        else localStorage.removeItem(REFRESH_KEY);
    } catch {
        // storage blocked (private mode): the session then lasts until the page is closed
    }
}

export const session = {
    getAccessToken(): string | null {
        // treat the token as expired 30 s early, so a request never arrives with a token that just ran out
        return accessToken && Date.now() < accessExpiresAt - 30_000 ? accessToken : null;
    },

    getRefreshToken(): string | null {
        return readStored();
    },

    hasSession(): boolean {
        return readStored() !== null;
    },

    store(tokens: { accessToken: string; expiresIn: number; refreshToken: string }): void {
        accessToken = tokens.accessToken;
        accessExpiresAt = Date.now() + tokens.expiresIn * 1000;
        writeStored(tokens.refreshToken);
    },

    clear(): void {
        const had = accessToken !== null || readStored() !== null;
        accessToken = null;
        accessExpiresAt = 0;
        writeStored(null);
        if (had) listeners.forEach((l) => l(false));
    },

    /** Called when the session ends (sign out here or in another tab, or the refresh token is rejected). */
    onChange(listener: Listener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    /** Runs fn while holding the cross-tab refresh lock (falls back to a per-tab queue without Web Locks). */
    withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
        const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
        if (locks?.request) return locks.request(LOCK_NAME, fn) as Promise<T>;
        const run = localQueue.then(fn, fn);
        localQueue = run.then(noop, noop);
        return run;
    },
};

let localQueue: Promise<unknown> = Promise.resolve();
function noop(): void {}

// Another tab signed out (removed the refresh token): end the session here too.
if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
        if (e.key === REFRESH_KEY && e.newValue === null && accessToken !== null) {
            accessToken = null;
            accessExpiresAt = 0;
            listeners.forEach((l) => l(false));
        }
    });
}

/** Test helper: forget the in-memory token without touching storage. */
export function resetSessionForTests(): void {
    accessToken = null;
    accessExpiresAt = 0;
    listeners.clear();
    localQueue = Promise.resolve();
}
