import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Opaque tokens of the form "<uuid>.<secret>". The uuid locates the row; only a SHA-256 of the
 * secret is stored, so a database leak does not expose usable tokens.
 */
export function newSecretToken(): { id: string; token: string; hash: string } {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    return { id, token: `${id}.${secret}`, hash: sha256(secret) };
}

export function parseSecretToken(token: unknown): { id: string; secret: string } | null {
    if (typeof token !== 'string' || token.length > 200) return null;
    const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{20,100})$/i.exec(token);
    return m ? { id: m[1].toLowerCase(), secret: m[2] } : null;
}

export function secretMatches(secret: string, storedHash: string): boolean {
    const a = Buffer.from(sha256(secret), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}
