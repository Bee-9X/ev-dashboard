import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Charger connection security (spec 7.5, 11.4 "charger impersonation"; backlog E3.2).
 * Per charger: a password (OCPP-J security profile 1/2: HTTP Basic authentication, user name = Charger ID) and/or the
 * addresses it may connect from (for OCPP SOAP chargers, which cannot send a password). Kept apart from `evses` so the
 * password hash never ends up in a charger's API view. The last refused connection is kept to help with set-up.
 */
export class ChargerSecurity1764300000000 implements MigrationInterface {
    name = 'ChargerSecurity1764300000000';

    public async up(q: QueryRunner): Promise<void> {
        await q.query(`
CREATE TABLE charger_security (
    evse_id             uuid PRIMARY KEY REFERENCES evses (id) ON DELETE CASCADE,
    -- SHA-256 of salt + ':' + password, hex; both null when the charger has no password
    password_hash       text CHECK (length(password_hash) = 64),
    password_salt       text CHECK (length(password_salt) = 32),
    password_set_at     timestamptz,
    CHECK ((password_hash IS NULL) = (password_salt IS NULL)),
    -- IPv4/IPv6 addresses or CIDR ranges; empty = from anywhere
    allowed_addresses   text[] NOT NULL DEFAULT '{}' CHECK (cardinality(allowed_addresses) <= 20),
    last_refused_at     timestamptz,
    last_refused_ip     text CHECK (length(last_refused_ip) <= 60),
    last_refused_reason text CHECK (last_refused_reason IN ('address_not_allowed', 'password_missing', 'password_wrong', 'not_secured')),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
`);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query('DROP TABLE IF EXISTS charger_security;');
    }
}
