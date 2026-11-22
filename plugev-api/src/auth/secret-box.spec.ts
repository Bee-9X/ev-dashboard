import { randomBytes } from 'node:crypto';
import { SecretBox } from './secret-box';

describe('SecretBox', () => {
    const box = new SecretBox(randomBytes(32).toString('base64'));

    it('round-trips and never stores the plaintext', () => {
        const sealed = box.seal('JBSWY3DPEHPK3PXP');
        expect(sealed).toMatch(/^v1\./);
        expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
        expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
        expect(box.seal('x')).not.toBe(box.seal('x')); // random IV
    });

    it('detects tampering and wrong keys', () => {
        const sealed = box.seal('secret');
        const parts = sealed.split('.');
        parts[3] = Buffer.from('other!').toString('base64url');
        expect(() => box.open(parts.join('.'))).toThrow();
        expect(() => new SecretBox(randomBytes(32).toString('base64')).open(sealed)).toThrow();
    });

    it('rejects keys that are not 32 bytes', () => {
        expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    });
});
