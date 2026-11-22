import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for small secrets kept in the database (MFA seeds). Format:
 * "v1.<iv>.<auth tag>.<ciphertext>" (base64url). The key comes from MFA_ENCRYPTION_KEY, which
 * belongs in the secrets manager, so a database dump alone does not reveal MFA seeds.
 */
export class SecretBox {
    private readonly key: Buffer;

    constructor(keyBase64: string) {
        this.key = Buffer.from(keyBase64, 'base64');
        if (this.key.length !== 32) throw new Error('Encryption key must be 32 bytes (base64)');
    }

    seal(plaintext: string): string {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        return ['v1', iv, cipher.getAuthTag(), data].map(p => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
    }

    open(sealed: string): string {
        const [version, iv, tag, data] = sealed.split('.');
        if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unsupported sealed value');
        const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    }
}
