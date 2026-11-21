/**
 * Creates the first Super Admin (there is no other way to get one).
 *
 *   npm run seed:super-admin -- --email admin@plugev.lk --name "Platform Admin"
 *
 * The password is read from SUPER_ADMIN_PASSWORD, or typed in when prompted, so it does not end up in
 * shell history. Safe to re-run: an existing user with that email is given the role instead.
 */
import 'dotenv/config';
import 'reflect-metadata';
import { hash } from '@node-rs/argon2';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { DataSource, IsNull } from 'typeorm';
import { PASSWORD_MAX, PASSWORD_MIN } from '../auth/auth.dto';
import { AuditLogEntity, RoleAssignmentEntity, UserEntity } from '../database/entities';
import { buildDataSourceOptions } from '../database/options';

async function readPassword(): Promise<string> {
    if (process.env.SUPER_ADMIN_PASSWORD) return process.env.SUPER_ADMIN_PASSWORD;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return await rl.question(`Password (${PASSWORD_MIN}-${PASSWORD_MAX} characters): `);
    } finally {
        rl.close();
    }
}

async function main(): Promise<void> {
    const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
    const email = values.email?.trim().toLowerCase();
    const fullName = values.name?.trim() || 'Platform Admin';
    if (!email || !email.includes('@')) throw new Error('Usage: npm run seed:super-admin -- --email <email> [--name "<full name>"]');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (see .env.example)');

    const db = new DataSource(buildDataSourceOptions({
        databaseUrl: process.env.DATABASE_URL, dbSsl: process.env.DB_SSL === 'true', dbRunMigrations: true,
    }));
    await db.initialize();
    try {
        let user = await db.getRepository(UserEntity).findOneBy({ email });
        let passwordHash: string | null = null;
        if (!user) {
            const password = await readPassword();
            if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
                throw new Error(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters`);
            }
            passwordHash = await hash(password);
        }

        await db.transaction(async m => {
            if (!user) {
                user = await m.getRepository(UserEntity).save(m.create(UserEntity, {
                    email, fullName, passwordHash, status: 'active', passwordChangedAt: new Date(),
                }));
            }
            const has = await m.getRepository(RoleAssignmentEntity).existsBy({
                userId: user.id, roleCode: 'SUPER_ADMIN', effectiveTo: IsNull(),
            });
            if (!has) {
                await m.insert(RoleAssignmentEntity, { userId: user.id, roleCode: 'SUPER_ADMIN', effectiveFrom: new Date() });
                await m.save(m.create(AuditLogEntity, {
                    occurredAt: new Date(), actorUserId: null, actorRoles: [], action: 'role.assign',
                    resourceType: 'user', resourceId: user.id, outcome: 'success',
                    details: { role: 'SUPER_ADMIN', via: 'cli:create-super-admin', host: process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? null },
                }));
            }
            console.log(has ? `${email} is already a Super Admin.` : `${email} is now a Super Admin (status: ${user.status}).`);
        });
    } finally {
        await db.destroy();
    }
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
