import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The charging module now runs inside the API (ADR-004 revised): what the Phase 0 gateway kept in MongoDB
 * moves to PostgreSQL.
 * - charging_sessions (spec 8.1; OCPP transactions) and meter_values (FR MON 004);
 * - ocpp_messages: every OCPP message for a limited diagnostic period (spec 8.2, 8.4);
 * - where a SOAP charger takes commands (its wsa:From address), and the latest meter readings per connector.
 */
export class ChargingCore1764100000000 implements MigrationInterface {
    name = 'ChargingCore1764100000000';

    public async up(q: QueryRunner): Promise<void> {
        await q.query(`
ALTER TABLE evse_live_states
    ADD COLUMN endpoint text CHECK (length(endpoint) <= 500),
    ADD COLUMN ip       text CHECK (length(ip) <= 64);

-- latest sample per measurand, for live display: { "Energy.Active.Import.Register": { value, unit, at }, ... }
ALTER TABLE connector_live_states ADD COLUMN meter jsonb NOT NULL DEFAULT '{}';

-- OCPP transaction ids are 32-bit integers handed out by the central system
CREATE SEQUENCE ocpp_transaction_id_seq AS integer START 1;

CREATE TABLE charging_sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id          uuid NOT NULL REFERENCES networks (id),
    station_id          uuid NOT NULL REFERENCES stations (id),
    evse_id             uuid NOT NULL REFERENCES evses (id),
    connector_number    int NOT NULL CHECK (connector_number >= 0),
    -- null only for a stop the charger sent without a transaction id we know
    ocpp_transaction_id int,
    id_tag              text CHECK (length(id_tag) <= 50),
    stop_id_tag         text CHECK (length(stop_id_tag) <= 50),
    reservation_id      int,
    started_at          timestamptz,
    stopped_at          timestamptz,
    meter_start_wh      numeric(14, 3),
    meter_stop_wh       numeric(14, 3),
    energy_wh           numeric(14, 3),
    stop_reason         text CHECK (length(stop_reason) <= 50),
    -- active: started, not stopped; completed: stopped; interrupted: a new start on the connector came first;
    -- orphan: a stop for a transaction this platform never started
    status              text NOT NULL CHECK (status IN ('active', 'completed', 'interrupted', 'orphan')),
    notes               text[] NOT NULL DEFAULT '{}',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX charging_sessions_evse_tx_uq ON charging_sessions (evse_id, ocpp_transaction_id) WHERE ocpp_transaction_id IS NOT NULL;
CREATE INDEX charging_sessions_evse_idx ON charging_sessions (evse_id, started_at DESC);
CREATE INDEX charging_sessions_station_idx ON charging_sessions (station_id, started_at DESC);
CREATE INDEX charging_sessions_network_idx ON charging_sessions (network_id, started_at DESC);
CREATE INDEX charging_sessions_active_idx ON charging_sessions (evse_id, connector_number) WHERE status = 'active';

CREATE TABLE meter_values (
    id               bigserial PRIMARY KEY,
    evse_id          uuid NOT NULL REFERENCES evses (id),
    connector_number int,
    session_id       uuid REFERENCES charging_sessions (id),
    measured_at      timestamptz NOT NULL,
    measurand        text NOT NULL,
    phase            text,
    unit             text,
    value            text NOT NULL,
    numeric_value    double precision,
    context          text,
    location         text,
    format           text,
    source           text NOT NULL CHECK (source IN ('MeterValues', 'StopTransaction')),
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meter_values_session_idx ON meter_values (session_id, measured_at);
CREATE INDEX meter_values_evse_idx ON meter_values (evse_id, measured_at DESC);

CREATE TABLE ocpp_messages (
    id         bigserial PRIMARY KEY,
    identity   text NOT NULL,
    -- null when the charger is not registered
    evse_id    uuid REFERENCES evses (id) ON DELETE SET NULL,
    protocol   text,
    direction  text NOT NULL CHECK (direction IN ('in', 'out')),
    kind       text NOT NULL CHECK (kind IN ('CALL', 'CALLRESULT', 'CALLERROR')),
    action     text,
    message_id text,
    payload    jsonb,
    error      jsonb,
    raw        text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ocpp_messages_identity_idx ON ocpp_messages (lower(identity), created_at DESC);
CREATE INDEX ocpp_messages_created_idx ON ocpp_messages (created_at);
`);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query(`
DROP TABLE IF EXISTS ocpp_messages;
DROP TABLE IF EXISTS meter_values;
DROP TABLE IF EXISTS charging_sessions;
DROP SEQUENCE IF EXISTS ocpp_transaction_id_seq;
ALTER TABLE connector_live_states DROP COLUMN IF EXISTS meter;
ALTER TABLE evse_live_states DROP COLUMN IF EXISTS ip, DROP COLUMN IF EXISTS endpoint;
`);
    }
}
