import { loadConfig } from './config';

const base = {
    DATABASE_URL: 'postgres://u:p@localhost/db',
    JWT_ACCESS_SECRET: 'x'.repeat(32),
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

describe('loadConfig', () => {
    it('applies defaults', () => {
        const c = loadConfig(base);
        expect(c).toMatchObject({ port: 4000, accessTokenTtlSec: 900, refreshTokenTtlDays: 30, dbRunMigrations: true, corsOrigins: ['http://localhost:3000'] });
    });

    it('treats empty values as unset', () => {
        expect(loadConfig({ ...base, PORT: '', DB_SSL: '' }).port).toBe(4000);
    });

    it('fails fast with every problem listed', () => {
        expect(() => loadConfig({ JWT_ACCESS_SECRET: 'short', PORT: 'abc' })).toThrow(
            /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET must be at least 32 characters/,
        );
    });

    it('mail: log by default; SMTP needs a host', () => {
        expect(loadConfig(base).mail).toMatchObject({ transport: 'log', from: 'PLUG EV <no-reply@plugev.local>' });
        expect(() => loadConfig({ ...base, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST is required/);
        const c = loadConfig({ ...base, MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'email-smtp.ap-south-1.amazonaws.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p' });
        expect(c.mail.smtp).toEqual({ host: 'email-smtp.ap-south-1.amazonaws.com', port: 587, secure: false, requireTls: true, user: 'u', password: 'p' });
    });

    it('parses lists and booleans', () => {
        const c = loadConfig({ ...base, CORS_ORIGINS: 'https://a.lk, https://b.lk', TRUST_PROXY: 'true', PORTAL_URL: 'https://portal.lk/' });
        expect(c.corsOrigins).toEqual(['https://a.lk', 'https://b.lk']);
        expect(c.trustProxy).toBe(true);
        expect(c.portalUrl).toBe('https://portal.lk');
    });
});
