import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Live charger state reported by the gateway (FR EVSE 003, FR MON 002/003; spec 8.1 device_connections):
 * whether the charger is connected, when it was last heard from, what it reported at boot,
 * and the last status of each connector. Configuration (evses, connectors) stays separate.
 */
export class ChargerLiveState1764000000000 implements MigrationInterface {
    name = 'ChargerLiveState1764000000000';

    public async up(q: QueryRunner): Promise<void> {
        await q.query(`
CREATE TABLE evse_live_states (
    evse_id            uuid PRIMARY KEY REFERENCES evses (id) ON DELETE CASCADE,
    connection_state   text NOT NULL CHECK (connection_state IN ('online', 'offline')),
    -- as the gateway saw it, e.g. ocpp1.5-soap
    protocol           text CHECK (length(protocol) <= 30),
    last_seen_at       timestamptz,
    connected_at       timestamptz,
    disconnected_at    timestamptz,
    disconnect_reason  text CHECK (length(disconnect_reason) <= 200),
    last_boot_at       timestamptz,
    reported_vendor    text CHECK (length(reported_vendor) <= 100),
    reported_model     text CHECK (length(reported_model) <= 100),
    reported_serial    text CHECK (length(reported_serial) <= 100),
    reported_firmware  text CHECK (length(reported_firmware) <= 100),
    updated_at         timestamptz NOT NULL DEFAULT now()
);

-- keyed by the number the charger reports, so a status for a connector not registered (yet) is kept too;
-- number 0 is the charger as a whole
CREATE TABLE connector_live_states (
    evse_id           uuid NOT NULL REFERENCES evses (id) ON DELETE CASCADE,
    connector_number  int NOT NULL CHECK (connector_number BETWEEN 0 AND 99),
    status            text NOT NULL CHECK (length(status) BETWEEN 1 AND 40),
    error_code        text CHECK (length(error_code) <= 60),
    info              text CHECK (length(info) <= 200),
    vendor_error_code text CHECK (length(vendor_error_code) <= 100),
    status_at         timestamptz NOT NULL,
    updated_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (evse_id, connector_number)
);
`);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query(`
DROP TABLE IF EXISTS connector_live_states;
DROP TABLE IF EXISTS evse_live_states;
`);
    }
}
