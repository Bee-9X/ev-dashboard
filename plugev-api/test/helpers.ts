import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { Client } from 'pg';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { APP_OPTIONS, configureApp } from '../src/bootstrap';
import { MailService } from '../src/mail/mail.service';

export const PASSWORD = 'correct horse battery staple';

/** Captures outgoing mail so tests can follow invitation and reset links. */
export class CapturedMail {
    sent: { kind: 'invite' | 'reset'; to: string; link: string }[] = [];

    async sendInvite(to: string, _name: string, link: string) { this.sent.push({ kind: 'invite', to, link }); }
    async sendPasswordReset(to: string, link: string) { this.sent.push({ kind: 'reset', to, link }); }

    tokenFor(to: string, kind: 'invite' | 'reset'): string {
        const m = [...this.sent].reverse().find(x => x.to === to && x.kind === kind);
        if (!m) throw new Error(`No ${kind} mail for ${to}`);
        return decodeURIComponent(new URL(m.link).searchParams.get('token')!);
    }
}

export interface TestApp {
    app: NestExpressApplication;
    http: ReturnType<typeof request>;
    db: DataSource;
    mail: CapturedMail;
    close(): Promise<void>;
}

/**
 * Wipes the schema, then boots the real app (migrations run on init).
 * MFA policy is switched off unless `requireMfa` is set, so suites about other features can sign in
 * with a password only; the MFA suite keeps the shipped policy.
 */
export async function createTestApp(opts: { env?: Record<string, string>; controllers?: Type[]; requireMfa?: boolean } = {}): Promise<TestApp> {
    await resetDatabase();
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(opts.env ?? {})) {
        saved[k] = process.env[k];
        process.env[k] = v;
    }
    try {
        const mail = new CapturedMail();
        const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: opts.controllers ?? [] })
            .overrideProvider(MailService).useValue(mail)
            .compile();
        const app = moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS);
        configureApp(app);
        await app.init();
        const db = app.get(DataSource);
        if (!opts.requireMfa) await db.query('UPDATE roles SET mfa_required = false');
        return {
            app,
            http: request(app.getHttpServer()),
            db,
            mail,
            close: () => app.close(),
        };
    } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
}

async function resetDatabase(): Promise<void> {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
        await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    } finally {
        await client.end();
    }
}

/** Inserts an active Super Admin directly, like the CLI does. */
export async function seedSuperAdmin(db: DataSource, email = 'root@plugev.test'): Promise<string> {
    const [{ id }] = await db.query(
        `INSERT INTO users (email, full_name, password_hash, status) VALUES ($1, 'Root', $2, 'active') RETURNING id`,
        [email, await hash(PASSWORD)],
    );
    await db.query(`INSERT INTO user_role_assignments (user_id, role_code) VALUES ($1, 'SUPER_ADMIN')`, [id]);
    return id;
}

export interface Session {
    accessToken: string;
    refreshToken: string;
    userId: string;
}

export async function login(t: TestApp, email: string, password = PASSWORD): Promise<Session> {
    const res = await t.http.post('/api/v1/auth/login').send({ email, password });
    if (res.status !== 200) throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, userId: res.body.user.id };
}

export const bearer = (s: Session | string) => ({ Authorization: `Bearer ${typeof s === 'string' ? s : s.accessToken}` });

/** Invites a user as `by`, accepts the invitation and signs in. */
export async function inviteAndActivate(
    t: TestApp, by: Session, body: { email: string; fullName?: string; role: string; networkId?: string; stationId?: string },
): Promise<Session> {
    const res = await t.http.post('/api/v1/users').set(bearer(by)).send({ fullName: body.email.split('@')[0], ...body });
    if (res.status !== 201) throw new Error(`invite ${body.email} failed: ${res.status} ${JSON.stringify(res.body)}`);
    const accept = await t.http.post('/api/v1/auth/password/reset/confirm')
        .send({ token: t.mail.tokenFor(body.email, 'invite'), newPassword: PASSWORD });
    if (accept.status !== 204) throw new Error(`accept ${body.email} failed: ${accept.status} ${JSON.stringify(accept.body)}`);
    return login(t, body.email);
}
