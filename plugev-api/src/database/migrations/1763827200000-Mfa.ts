import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MFA (FR AUTH 003): TOTP per user, recovery codes, and a per-role "MFA required" policy.
 * Super Admin and Network Admin require MFA by default; a Super Admin can change the policy.
 */
export class Mfa1763827200000 implements MigrationInterface {
    name = 'Mfa1763827200000';

    public async up(q: QueryRunner): Promise<void> {
        await q.query(`
ALTER TABLE roles ADD COLUMN mfa_required boolean NOT NULL DEFAULT false;
UPDATE roles SET mfa_required = true WHERE code IN ('SUPER_ADMIN', 'NETWORK_ADMIN');

ALTER TABLE users
    ADD COLUMN mfa_enabled                  boolean NOT NULL DEFAULT false,
    ADD COLUMN mfa_secret_encrypted         text,
    ADD COLUMN mfa_pending_secret_encrypted text,
    ADD COLUMN mfa_last_used_step           bigint,
    ADD COLUMN mfa_enabled_at               timestamptz,
    ADD CONSTRAINT users_mfa_secret_chk CHECK (NOT mfa_enabled OR mfa_secret_encrypted IS NOT NULL);

CREATE TABLE mfa_recovery_codes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash  text NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_codes_user_idx ON mfa_recovery_codes (user_id);
`);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query(`
DROP TABLE IF EXISTS mfa_recovery_codes;
ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_mfa_secret_chk,
    DROP COLUMN IF EXISTS mfa_enabled_at,
    DROP COLUMN IF EXISTS mfa_last_used_step,
    DROP COLUMN IF EXISTS mfa_pending_secret_encrypted,
    DROP COLUMN IF EXISTS mfa_secret_encrypted,
    DROP COLUMN IF EXISTS mfa_enabled;
ALTER TABLE roles DROP COLUMN IF EXISTS mfa_required;
`);
    }
}
