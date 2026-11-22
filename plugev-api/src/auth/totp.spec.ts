import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUrl, totpCode, totpStep, verifyTotp } from './totp';

// RFC 6238 Appendix B test secret (ASCII "12345678901234567890"); the RFC lists 8-digit values,
// so the expected 6-digit codes are their last six digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
    it.each([
        [59, '287082'],
        [1111111109, '081804'],
        [1111111111, '050471'],
        [1234567890, '005924'],
        [2000000000, '279037'],
    ])('matches the RFC test vector at t=%i', (seconds, expected) => {
        expect(totpCode(RFC_SECRET, totpStep(seconds * 1000))).toBe(expected);
    });

    it('HOTP matches RFC 4226 vectors', () => {
        const secret = Buffer.from('12345678901234567890');
        expect([0, 1, 2, 9].map(c => hotp(secret, c))).toEqual(['755224', '287082', '359152', '520489']);
    });

    it('base32 round-trips and secrets are 32 characters (160 bits)', () => {
        const buf = Buffer.from([0, 1, 2, 250, 251, 255, 7]);
        expect(base32Decode(base32Encode(buf))).toEqual(buf);
        expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
    });

    it('accepts one step of clock drift either way, and returns the matched step', () => {
        const secret = generateTotpSecret();
        const now = 1_800_000_000_000;
        const step = totpStep(now);
        expect(verifyTotp(secret, totpCode(secret, step), now)).toBe(step);
        expect(verifyTotp(secret, totpCode(secret, step - 1), now)).toBe(step - 1);
        expect(verifyTotp(secret, totpCode(secret, step + 1), now)).toBe(step + 1);
        expect(verifyTotp(secret, totpCode(secret, step + 3), now)).toBeNull();
    });

    it.each(['', '12345', '1234567', 'abcdef', '12 345'])('rejects malformed code %p', code => {
        expect(verifyTotp(generateTotpSecret(), code)).toBeNull();
    });

    it('builds an otpauth URL for authenticator apps', () => {
        const url = otpauthUrl('JBSWY3DPEHPK3PXP', 'admin@plugev.lk', 'PLUG EV');
        expect(url).toBe('otpauth://totp/PLUG%20EV:admin%40plugev.lk?secret=JBSWY3DPEHPK3PXP&issuer=PLUG+EV&algorithm=SHA1&digits=6&period=30');
    });
});
