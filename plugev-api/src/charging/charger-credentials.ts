import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { BlockList, isIP } from 'node:net';

/**
 * Charger credentials (spec 7.5): a password per charger, never shared across a fleet, and the addresses a charger may
 * connect from. OCPP 1.6 security profiles 1/2 use HTTP Basic authentication with the Charger ID as user name and a
 * password of 16 to 40 characters.
 */

export const CHARGER_PASSWORD = /^[\x21-\x7e]{16,40}$/;
export const CHARGER_PASSWORD_RULE = '16 to 40 characters: letters, digits and symbols, no spaces';
export const MAX_ALLOWED_ADDRESSES = 20;

// letters and digits only (no look-alikes), so it can be typed into a charger's set-up screen
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const GENERATED_LENGTH = 24; // about 139 bits

export function generateChargerPassword(): string {
    let out = '';
    for (let i = 0; i < GENERATED_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)];
    return out;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export function hashChargerPassword(password: string, salt = randomBytes(16).toString('hex')): { salt: string; hash: string } {
    return { salt, hash: sha256(`${salt}:${password}`) };
}

export function chargerPasswordMatches(password: string, salt: string, hash: string): boolean {
    const a = Buffer.from(hashChargerPassword(password, salt).hash, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
}

/** `Authorization: Basic base64(user:password)`; null when absent or malformed. */
export function parseBasicAuth(header: string | string[] | undefined): { user: string; password: string } | null {
    const value = Array.isArray(header) ? header[0] : header;
    const m = /^Basic\s+([A-Za-z0-9+/]+={0,2})\s*$/i.exec(value ?? '');
    if (!m) return null;
    const decoded = Buffer.from(m[1]!, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    return colon < 0 ? null : { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
}

const familyOf = (ip: string) => (isIP(ip) === 6 ? 'ipv6' : 'ipv4');

/** "203.0.113.7" or "203.0.113.0/24" (IPv4 or IPv6), tidied; null when it is neither. */
export function normaliseAddressRule(rule: string): string | null {
    const parts = rule.trim().split('/');
    if (parts.length > 2) return null;
    const [address, prefix] = parts as [string, string | undefined];
    const family = isIP(address);
    if (!family) return null;
    const ip = address.toLowerCase();
    if (prefix === undefined) return ip;
    if (!/^\d{1,3}$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)) return null;
    return `${ip}/${Number(prefix)}`;
}

/** Whether `ip` matches one of the (already normalised) rules. */
export function addressAllowed(ip: string, rules: string[]): boolean {
    if (!isIP(ip)) return false;
    const list = new BlockList();
    for (const rule of rules) {
        const [address, prefix] = rule.split('/') as [string, string | undefined];
        if (!isIP(address)) continue;
        if (prefix === undefined) list.addAddress(address, familyOf(address));
        else list.addSubnet(address, Number(prefix), familyOf(address));
    }
    return list.check(ip, familyOf(ip));
}

/**
 * The address a charger connects from. X-Forwarded-For is only believed for the proxies we run (OCPP_TRUSTED_PROXIES):
 * each appends the address it saw, so the entry that many places from the end is the one our outermost proxy wrote.
 * Anything further left came from the client and could be made up.
 */
export function clientAddress(
    req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } },
    trustedProxies: number,
): string {
    let ip = req.socket.remoteAddress || '';
    if (trustedProxies > 0) {
        const header = req.headers['x-forwarded-for'];
        const hops = (Array.isArray(header) ? header.join(',') : header ?? '').split(',').map(s => s.trim()).filter(Boolean);
        if (hops.length) ip = hops[Math.max(hops.length - trustedProxies, 0)]!;
    }
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}
