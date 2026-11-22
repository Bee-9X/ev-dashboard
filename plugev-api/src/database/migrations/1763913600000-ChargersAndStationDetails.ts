import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 (E2.3, E2.4):
 * - station details: address, GPS, phone, local time zone, operating hours, amenities and public visibility
 *   (FR ST 001, 004, 005);
 * - EVSEs (chargers) and their connectors (FR EVSE 001, 002, 004, 006; spec 8.1).
 *
 * Nothing is ever deleted: chargers and connectors are disabled instead, so history stays intact (FR EVSE 006).
 * A charger keeps the network of its station; the composite foreign key makes a mismatch impossible.
 */
export class ChargersAndStationDetails1763913600000 implements MigrationInterface {
    name = 'ChargersAndStationDetails1763913600000';

    public async up(q: QueryRunner): Promise<void> {
        await q.query(`
ALTER TABLE stations
    ADD COLUMN address         text CHECK (length(address) <= 500),
    ADD COLUMN phone           text CHECK (length(phone) <= 30),
    ADD COLUMN latitude        numeric(9, 6) CHECK (latitude BETWEEN -90 AND 90),
    ADD COLUMN longitude       numeric(9, 6) CHECK (longitude BETWEEN -180 AND 180),
    ADD COLUMN time_zone       text,
    ADD COLUMN operating_hours jsonb,
    ADD COLUMN amenities       text[] NOT NULL DEFAULT '{}',
    ADD COLUMN public_visible  boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT stations_coordinates_chk CHECK ((latitude IS NULL) = (longitude IS NULL)),
    -- the app needs a location to show a station
    ADD CONSTRAINT stations_public_location_chk CHECK (NOT public_visible OR latitude IS NOT NULL);
CREATE UNIQUE INDEX stations_id_network_uq ON stations (id, network_id);

CREATE TABLE evses (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id        uuid NOT NULL,
    station_id        uuid NOT NULL,
    public_code       text NOT NULL CHECK (public_code ~ '^[A-Z0-9]{4,12}$'),
    name              text CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    protocol          text NOT NULL CHECK (protocol IN ('OCPP_1_6_J', 'OCPP_1_6_S', 'OCPP_1_5_S')),
    protocol_identity text NOT NULL CHECK (protocol_identity ~ '^[A-Za-z0-9._:-]{1,48}$'),
    vendor            text NOT NULL CHECK (length(btrim(vendor)) BETWEEN 1 AND 100),
    model             text NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 100),
    serial_number     text CHECK (length(serial_number) <= 100),
    firmware_version  text CHECK (length(firmware_version) <= 100),
    max_power_kw      numeric(7, 2) CHECK (max_power_kw > 0 AND max_power_kw <= 2000),
    status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (station_id, network_id) REFERENCES stations (id, network_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX evses_public_code_uq ON evses (public_code);
-- the gateway finds a charger by the identity it connects with (FR EVSE 004)
CREATE UNIQUE INDEX evses_protocol_identity_uq ON evses (lower(protocol_identity));
CREATE INDEX evses_station_idx ON evses (station_id);
CREATE INDEX evses_network_idx ON evses (network_id);

CREATE TABLE connectors (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    evse_id          uuid NOT NULL REFERENCES evses (id) ON DELETE RESTRICT,
    connector_number int NOT NULL CHECK (connector_number BETWEEN 1 AND 9),
    connector_type   text NOT NULL CHECK (connector_type IN ('CCS2', 'CCS1', 'CHADEMO', 'TYPE2', 'TYPE1', 'GBT')),
    current_type     text NOT NULL CHECK (current_type IN ('AC', 'DC')),
    max_power_kw     numeric(7, 2) NOT NULL CHECK (max_power_kw > 0 AND max_power_kw <= 1000),
    format           text NOT NULL CHECK (format IN ('cable', 'socket')),
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT connectors_current_chk CHECK (
        (connector_type IN ('CCS2', 'CCS1', 'CHADEMO') AND current_type = 'DC')
        OR (connector_type IN ('TYPE2', 'TYPE1') AND current_type = 'AC')
        OR connector_type = 'GBT'),
    -- DC plugs always come on a cable; only AC chargers have sockets
    CONSTRAINT connectors_socket_chk CHECK (format = 'cable' OR current_type = 'AC')
);
CREATE UNIQUE INDEX connectors_evse_number_uq ON connectors (evse_id, connector_number);
`);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query(`
DROP TABLE IF EXISTS connectors;
DROP TABLE IF EXISTS evses;
DROP INDEX IF EXISTS stations_id_network_uq;
ALTER TABLE stations
    DROP CONSTRAINT IF EXISTS stations_public_location_chk,
    DROP CONSTRAINT IF EXISTS stations_coordinates_chk,
    DROP COLUMN IF EXISTS public_visible,
    DROP COLUMN IF EXISTS amenities,
    DROP COLUMN IF EXISTS operating_hours,
    DROP COLUMN IF EXISTS time_zone,
    DROP COLUMN IF EXISTS longitude,
    DROP COLUMN IF EXISTS latitude,
    DROP COLUMN IF EXISTS phone,
    DROP COLUMN IF EXISTS address;
`);
    }
}
