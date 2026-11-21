import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 1 foundation schema (spec 8.1, 8.2): tenants (networks, stations), identity, RBAC with scope,
 * tokens, login events and an append-only audit log.
 *
 * Role and permission rows are written as literals on purpose: a migration must produce the same
 * result forever. Later permission changes go in new migrations.
 */
export class InitialSchema1763740800000 implements MigrationInterface {
    name = 'InitialSchema1763740800000';

    public async up(q: QueryRunner): Promise<void> {
        await q.query(`
CREATE TABLE networks (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
    default_currency char(3) NOT NULL CHECK (default_currency ~ '^[A-Z]{3}$'),
    time_zone        text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX networks_name_uq ON networks (lower(name));

CREATE TABLE stations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id uuid NOT NULL REFERENCES networks (id) ON DELETE RESTRICT,
    name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stations_network_idx ON stations (network_id);
CREATE UNIQUE INDEX stations_network_name_uq ON stations (network_id, lower(name));

CREATE TABLE users (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email               text NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
    phone               text,
    full_name           text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 200),
    password_hash       text,
    status              text NOT NULL CHECK (status IN ('invited', 'active', 'suspended', 'deactivated')),
    failed_login_count  integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until        timestamptz,
    last_login_at       timestamptz,
    password_changed_at timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (email);

CREATE TABLE roles (
    code        text PRIMARY KEY,
    name        text NOT NULL,
    scope_type  text NOT NULL CHECK (scope_type IN ('platform', 'network', 'station', 'self')),
    description text NOT NULL
);

CREATE TABLE permissions (
    code        text PRIMARY KEY,
    description text NOT NULL
);

CREATE TABLE role_permissions (
    role_code       text NOT NULL REFERENCES roles (code) ON DELETE CASCADE,
    permission_code text NOT NULL REFERENCES permissions (code) ON DELETE CASCADE,
    PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE user_role_assignments (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    role_code      text NOT NULL REFERENCES roles (code),
    network_id     uuid REFERENCES networks (id) ON DELETE RESTRICT,
    station_id     uuid REFERENCES stations (id) ON DELETE RESTRICT,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_to   timestamptz,
    created_by     uuid REFERENCES users (id),
    created_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (network_id IS NULL OR station_id IS NULL),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX ura_user_idx ON user_role_assignments (user_id);
CREATE INDEX ura_network_idx ON user_role_assignments (network_id) WHERE network_id IS NOT NULL;
CREATE INDEX ura_station_idx ON user_role_assignments (station_id) WHERE station_id IS NOT NULL;
CREATE UNIQUE INDEX ura_active_uq ON user_role_assignments (
    user_id, role_code,
    coalesce(network_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(station_id, '00000000-0000-0000-0000-000000000000'::uuid)
) WHERE effective_to IS NULL;

-- The role's scope type decides which scope column must be set.
CREATE FUNCTION check_assignment_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    scope text;
BEGIN
    SELECT scope_type INTO scope FROM roles WHERE code = NEW.role_code;
    IF scope IN ('platform', 'self') AND (NEW.network_id IS NOT NULL OR NEW.station_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Role % cannot be scoped to a network or station', NEW.role_code USING ERRCODE = 'check_violation';
    ELSIF scope = 'network' AND NEW.network_id IS NULL THEN
        RAISE EXCEPTION 'Role % requires network_id', NEW.role_code USING ERRCODE = 'check_violation';
    ELSIF scope = 'station' AND NEW.station_id IS NULL THEN
        RAISE EXCEPTION 'Role % requires station_id', NEW.role_code USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER user_role_assignments_scope
    BEFORE INSERT OR UPDATE ON user_role_assignments
    FOR EACH ROW EXECUTE FUNCTION check_assignment_scope();

CREATE TABLE refresh_tokens (
    id             uuid PRIMARY KEY,
    user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    family_id      uuid NOT NULL,
    token_hash     text NOT NULL,
    expires_at     timestamptz NOT NULL,
    revoked_at     timestamptz,
    revoked_reason text,
    replaced_by    uuid,
    created_ip     text,
    user_agent     text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE auth_tokens (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose    text NOT NULL CHECK (purpose IN ('password_reset', 'invite')),
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON auth_tokens (user_id, purpose);

-- Security event log (FR AUTH 005). No FK so records survive any user change.
CREATE TABLE login_events (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid,
    email          text,
    event_type     text NOT NULL,
    reason         text,
    ip             text,
    user_agent     text,
    correlation_id text,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_events_user_idx ON login_events (user_id, created_at DESC);
CREATE INDEX login_events_created_idx ON login_events (created_at DESC);

-- Audit trail of privileged actions (spec 3.2, 11.3).
CREATE TABLE audit_logs (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    occurred_at    timestamptz NOT NULL DEFAULT now(),
    actor_user_id  uuid,
    actor_roles    text[] NOT NULL DEFAULT '{}',
    network_id     uuid,
    station_id     uuid,
    action         text NOT NULL,
    resource_type  text NOT NULL,
    resource_id    text,
    outcome        text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
    correlation_id text,
    ip             text,
    details        jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_logs_occurred_idx ON audit_logs (occurred_at DESC);
CREATE INDEX audit_logs_network_idx ON audit_logs (network_id, occurred_at DESC);
CREATE INDEX audit_logs_resource_idx ON audit_logs (resource_type, resource_id);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, occurred_at DESC);

-- Append-only: the database itself refuses changes, whatever the application does.
CREATE FUNCTION prevent_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_modification();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION prevent_modification();
CREATE TRIGGER login_events_append_only BEFORE UPDATE OR DELETE ON login_events
    FOR EACH ROW EXECUTE FUNCTION prevent_modification();
CREATE TRIGGER login_events_no_truncate BEFORE TRUNCATE ON login_events
    FOR EACH STATEMENT EXECUTE FUNCTION prevent_modification();
`);

        await q.query(`
INSERT INTO permissions (code, description) VALUES
    ('platform.configure', 'Change platform wide configuration'),
    ('network.create', 'Create charging networks'),
    ('network.read', 'View networks in scope'),
    ('network.update', 'Edit network details'),
    ('network.suspend', 'Suspend, reactivate or archive networks'),
    ('station.create', 'Create stations'),
    ('station.read', 'View stations in scope'),
    ('station.update', 'Edit station details'),
    ('evse.read', 'View EVSEs and connectors'),
    ('evse.create', 'Register EVSEs'),
    ('evse.update', 'Edit EVSEs and connectors'),
    ('evse.remote_start', 'Remote start a charging session'),
    ('evse.remote_stop', 'Remote stop a charging session'),
    ('evse.reset', 'Reset a charger'),
    ('evse.unlock', 'Unlock a connector'),
    ('tariff.manage', 'Create and change tariffs'),
    ('session.read', 'View charging sessions'),
    ('transaction.read', 'View transactions'),
    ('transaction.refund', 'Refund transactions'),
    ('report.export', 'Export reports'),
    ('user.read', 'View users in scope'),
    ('user.create', 'Invite users'),
    ('user.update_status', 'Suspend, deactivate or reactivate users'),
    ('role.assign', 'Assign and remove roles'),
    ('audit.read', 'View audit logs in scope');

INSERT INTO roles (code, name, scope_type, description) VALUES
    ('SUPER_ADMIN', 'Super Admin', 'platform', 'Platform operator. All networks; privileged actions are audited.'),
    ('NETWORK_ADMIN', 'Network Admin', 'network', 'Manages one network: stations, EVSEs, tariffs, Station Admins, sessions and reports.'),
    ('STATION_ADMIN', 'Station Admin', 'station', 'Monitors assigned stations. Remote commands only when explicitly delegated.'),
    ('EV_USER', 'EV User', 'self', 'Customer account. Access limited to own profile, sessions and transactions.');

INSERT INTO role_permissions (role_code, permission_code) VALUES
    ('SUPER_ADMIN', 'platform.configure'),
    ('SUPER_ADMIN', 'network.create'),
    ('SUPER_ADMIN', 'network.read'),
    ('SUPER_ADMIN', 'network.update'),
    ('SUPER_ADMIN', 'network.suspend'),
    ('SUPER_ADMIN', 'station.create'),
    ('SUPER_ADMIN', 'station.read'),
    ('SUPER_ADMIN', 'station.update'),
    ('SUPER_ADMIN', 'evse.read'),
    ('SUPER_ADMIN', 'evse.create'),
    ('SUPER_ADMIN', 'evse.update'),
    ('SUPER_ADMIN', 'evse.remote_start'),
    ('SUPER_ADMIN', 'evse.remote_stop'),
    ('SUPER_ADMIN', 'evse.reset'),
    ('SUPER_ADMIN', 'evse.unlock'),
    ('SUPER_ADMIN', 'tariff.manage'),
    ('SUPER_ADMIN', 'session.read'),
    ('SUPER_ADMIN', 'transaction.read'),
    ('SUPER_ADMIN', 'transaction.refund'),
    ('SUPER_ADMIN', 'report.export'),
    ('SUPER_ADMIN', 'user.read'),
    ('SUPER_ADMIN', 'user.create'),
    ('SUPER_ADMIN', 'user.update_status'),
    ('SUPER_ADMIN', 'role.assign'),
    ('SUPER_ADMIN', 'audit.read'),
    ('NETWORK_ADMIN', 'network.read'),
    ('NETWORK_ADMIN', 'network.update'),
    ('NETWORK_ADMIN', 'station.create'),
    ('NETWORK_ADMIN', 'station.read'),
    ('NETWORK_ADMIN', 'station.update'),
    ('NETWORK_ADMIN', 'evse.read'),
    ('NETWORK_ADMIN', 'evse.create'),
    ('NETWORK_ADMIN', 'evse.update'),
    ('NETWORK_ADMIN', 'evse.remote_start'),
    ('NETWORK_ADMIN', 'evse.remote_stop'),
    ('NETWORK_ADMIN', 'evse.reset'),
    ('NETWORK_ADMIN', 'evse.unlock'),
    ('NETWORK_ADMIN', 'tariff.manage'),
    ('NETWORK_ADMIN', 'session.read'),
    ('NETWORK_ADMIN', 'transaction.read'),
    ('NETWORK_ADMIN', 'report.export'),
    ('NETWORK_ADMIN', 'user.read'),
    ('NETWORK_ADMIN', 'user.create'),
    ('NETWORK_ADMIN', 'user.update_status'),
    ('NETWORK_ADMIN', 'role.assign'),
    ('NETWORK_ADMIN', 'audit.read'),
    ('STATION_ADMIN', 'station.read'),
    ('STATION_ADMIN', 'station.update'),
    ('STATION_ADMIN', 'evse.read'),
    ('STATION_ADMIN', 'session.read'),
    ('STATION_ADMIN', 'transaction.read');
`);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query(`
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS login_events;
DROP FUNCTION IF EXISTS prevent_modification();
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS user_role_assignments;
DROP FUNCTION IF EXISTS check_assignment_scope();
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS stations;
DROP TABLE IF EXISTS networks;
`);
    }
}
