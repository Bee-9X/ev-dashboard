import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform(v => v === 'true');
const int = z.coerce.number().int();

const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: int.positive().default(4000),
    DATABASE_URL: z.string({ error: 'DATABASE_URL is required' }).min(1),
    DB_SSL: bool.default(false),
    DB_RUN_MIGRATIONS: bool.default(true),
    JWT_ACCESS_SECRET: z.string({ error: 'JWT_ACCESS_SECRET is required' })
        .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_SEC: int.min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: int.min(1).max(90).default(30),
    LOGIN_MAX_FAILED_ATTEMPTS: int.min(3).max(20).default(5),
    LOGIN_LOCK_MINUTES: int.min(1).max(1440).default(15),
    PASSWORD_RESET_TTL_MIN: int.min(5).max(1440).default(30),
    INVITE_TTL_HOURS: int.min(1).max(720).default(72),
    AUTH_RATE_LIMIT_PER_MIN: int.min(1).max(100000).default(10),
    MFA_ENCRYPTION_KEY: z.string({ error: 'MFA_ENCRYPTION_KEY is required' })
        .refine(v => Buffer.from(v, 'base64').length === 32, 'MFA_ENCRYPTION_KEY must be 32 random bytes, base64 encoded'),
    MFA_ISSUER: z.string().min(1).max(50).default('PLUG EV'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    PORTAL_URL: z.url().default('http://localhost:3000'),
    // Start of the links in the connectors' QR codes, e.g. https://plugev.lk/c. Printed on stickers: keep it stable.
    QR_LINK_BASE: z.url().optional(),
    // Shared key the charger gateway sends with its events (X-Gateway-Key). Unset: the gateway link is off.
    GATEWAY_API_KEY: z.string().min(32, 'GATEWAY_API_KEY must be at least 32 characters').optional(),
    // A charger counts as offline when the gateway has not reported it for this long (e.g. the gateway itself stopped).
    CHARGER_OFFLINE_AFTER_SEC: int.min(30).max(86400).default(300),
    TRUST_PROXY: bool.default(false),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
    MAIL_FROM: z.string().min(3).max(200).default('PLUG EV <no-reply@plugev.local>'),
    SMTP_HOST: z.string().max(255).optional(),
    SMTP_PORT: int.min(1).max(65535).default(587),
    SMTP_SECURE: bool.default(false),
    SMTP_REQUIRE_TLS: bool.default(true),
    SMTP_USER: z.string().max(255).optional(),
    SMTP_PASSWORD: z.string().max(1000).optional(),
}).superRefine((e, ctx) => {
    if (e.MAIL_TRANSPORT === 'smtp' && !e.SMTP_HOST) {
        ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'SMTP_HOST is required when MAIL_TRANSPORT=smtp' });
    }
});

export interface AppConfig {
    nodeEnv: 'development' | 'test' | 'production';
    port: number;
    databaseUrl: string;
    dbSsl: boolean;
    dbRunMigrations: boolean;
    jwtAccessSecret: string;
    accessTokenTtlSec: number;
    refreshTokenTtlDays: number;
    loginMaxFailedAttempts: number;
    loginLockMinutes: number;
    passwordResetTtlMin: number;
    inviteTtlHours: number;
    authRateLimitPerMin: number;
    mfaEncryptionKey: string;
    mfaIssuer: string;
    corsOrigins: string[];
    portalUrl: string;
    /** QR links are `${qrLinkBase}/<code>`; defaults to PORTAL_URL + /c. */
    qrLinkBase: string;
    gatewayApiKey: string | null;
    chargerOfflineAfterSec: number;
    trustProxy: boolean;
    logLevel: string;
    mail: {
        transport: 'log' | 'smtp';
        from: string;
        smtp: { host: string; port: number; secure: boolean; requireTls: boolean; user?: string; password?: string };
    };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Parses and validates environment variables. Fails fast with a readable list of problems. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    // Treat empty values ("KEY=") as unset so defaults apply.
    const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
    const result = schema.safeParse(cleaned);
    if (!result.success) {
        const problems = result.error.issues.map(i => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
        throw new Error(`Invalid configuration:\n${problems}`);
    }
    const e = result.data;
    return {
        nodeEnv: e.NODE_ENV,
        port: e.PORT,
        databaseUrl: e.DATABASE_URL,
        dbSsl: e.DB_SSL,
        dbRunMigrations: e.DB_RUN_MIGRATIONS,
        jwtAccessSecret: e.JWT_ACCESS_SECRET,
        accessTokenTtlSec: e.ACCESS_TOKEN_TTL_SEC,
        refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
        loginMaxFailedAttempts: e.LOGIN_MAX_FAILED_ATTEMPTS,
        loginLockMinutes: e.LOGIN_LOCK_MINUTES,
        passwordResetTtlMin: e.PASSWORD_RESET_TTL_MIN,
        inviteTtlHours: e.INVITE_TTL_HOURS,
        authRateLimitPerMin: e.AUTH_RATE_LIMIT_PER_MIN,
        mfaEncryptionKey: e.MFA_ENCRYPTION_KEY,
        mfaIssuer: e.MFA_ISSUER,
        corsOrigins: e.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean),
        portalUrl: e.PORTAL_URL.replace(/\/+$/, ''),
        gatewayApiKey: e.GATEWAY_API_KEY ?? null,
        chargerOfflineAfterSec: e.CHARGER_OFFLINE_AFTER_SEC,
        qrLinkBase: (e.QR_LINK_BASE ?? `${e.PORTAL_URL.replace(/\/+$/, '')}/c`).replace(/\/+$/, ''),
        trustProxy: e.TRUST_PROXY,
        logLevel: e.LOG_LEVEL,
        mail: {
            transport: e.MAIL_TRANSPORT,
            from: e.MAIL_FROM,
            smtp: {
                host: e.SMTP_HOST ?? '',
                port: e.SMTP_PORT,
                secure: e.SMTP_SECURE,
                requireTls: e.SMTP_REQUIRE_TLS,
                user: e.SMTP_USER,
                password: e.SMTP_PASSWORD,
            },
        },
    };
}
