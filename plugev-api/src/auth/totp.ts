import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238, HMAC-SHA1, 6 digits, 30 s), compatible with Google
 * Authenticator, Microsoft Authenticator, Authy, 1Password and similar apps.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
}

export function base32Decode(input: string): Buffer {
    const clean = input.toUpperCase().replace(/[\s=-]/g, '');
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of clean) {
        const idx = ALPHABET.indexOf(ch);
        if (idx < 0) throw new Error('Invalid base32 character');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

/** 160-bit secret, base32 encoded (the length RFC 4226 recommends). */
export function generateTotpSecret(): string {
    return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
    const msg = Buffer.alloc(8);
    msg.writeBigUInt64BE(BigInt(counter));
    const h = createHmac('sha1', secret).update(msg).digest();
    const offset = h[h.length - 1] & 0x0f;
    const binary = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
    return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export const totpStep = (nowMs = Date.now()): number => Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);

export function totpCode(secretBase32: string, step = totpStep()): string {
    return hotp(base32Decode(secretBase32), step);
}

/**
 * Returns the time step the code matches (within ±window steps for clock drift), or null.
 * The caller must reject steps at or before the last accepted one to stop replays.
 */
export function verifyTotp(secretBase32: string, code: string, nowMs = Date.now(), window = 1): number | null {
    if (!/^\d{6}$/.test(code)) return null;
    const secret = base32Decode(secretBase32);
    const current = totpStep(nowMs);
    let matched: number | null = null;
    for (let d = -window; d <= window; d++) {
        const step = current + d;
        // compare every candidate so timing does not reveal which one matched
        if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code)) && matched === null) matched = step;
    }
    return matched;
}

export function otpauthUrl(secretBase32: string, accountName: string, issuer: string): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
    const params = new URLSearchParams({
        secret: secretBase32, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
}
