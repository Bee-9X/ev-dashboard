import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remote commands from the admin portal (spec 5.3, 9.4, AC 11).
 * - charger_commands: every command, what the charger answered, and whether its later messages confirmed the action;
 * - evses.command_url: where a SOAP charger takes commands when the address it reports cannot be reached
 *   (e.g. a charger behind a router with port forwarding); replaces the Phase 0 gateway's endpointOverride;
 * - the charger's configuration as last read with GetConfiguration.
 */
export class ChargerCommands1764200000000 implements MigrationInterface {
    name = 'ChargerCommands1764200000000';

    public async up(q: QueryRunner): Promise<void> {
        await q.query(`
ALTER TABLE evses ADD COLUMN command_url text CHECK (length(command_url) <= 500);

ALTER TABLE evse_live_states
    ADD COLUMN configuration    jsonb,
    ADD COLUMN configuration_at timestamptz;

CREATE TABLE charger_commands (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id       uuid NOT NULL REFERENCES networks (id),
    station_id       uuid NOT NULL REFERENCES stations (id),
    evse_id          uuid NOT NULL REFERENCES evses (id),
    -- the OCPP operation, e.g. RemoteStartTransaction
    action           text NOT NULL CHECK (length(action) <= 60),
    connector_number int,
    -- exactly what is sent to the charger
    payload          jsonb NOT NULL,
    -- queued: recorded, not sent yet; sent: waiting for the charger's answer; accepted / rejected: the charger's answer;
    -- failed: could not be delivered; timed_out: no answer in time
    status           text NOT NULL CHECK (status IN ('queued', 'sent', 'accepted', 'rejected', 'failed', 'timed_out')),
    -- the status the charger answered with, e.g. Accepted, Rejected, Unlocked, Scheduled, NotSupported
    response_status  text CHECK (length(response_status) <= 40),
    response         jsonb,
    error            text CHECK (length(error) <= 1000),
    -- confirmed when the charger's later messages show the action happened (spec 5.3 step 22)
    confirmed_at     timestamptz,
    confirmation     text CHECK (length(confirmation) <= 300),
    session_id       uuid REFERENCES charging_sessions (id),
    requested_by     uuid REFERENCES users (id),
    correlation_id   text CHECK (length(correlation_id) <= 100),
    created_at       timestamptz NOT NULL DEFAULT now(),
    sent_at          timestamptz,
    answered_at      timestamptz,
    expires_at       timestamptz NOT NULL
);
CREATE INDEX charger_commands_evse_idx ON charger_commands (evse_id, created_at DESC);
-- the sweep looks for commands that never got an answer (e.g. the API restarted while waiting)
CREATE INDEX charger_commands_open_idx ON charger_commands (expires_at) WHERE status IN ('queued', 'sent');
`);
    }

    public async down(q: QueryRunner): Promise<void> {
        await q.query(`
DROP TABLE IF EXISTS charger_commands;
ALTER TABLE evse_live_states DROP COLUMN IF EXISTS configuration, DROP COLUMN IF EXISTS configuration_at;
ALTER TABLE evses DROP COLUMN IF EXISTS command_url;
`);
    }
}
