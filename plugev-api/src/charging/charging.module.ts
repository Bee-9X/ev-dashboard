import { Module } from '@nestjs/common';
import { ChargerGate } from './charger-gate';
import { ChargerCommander } from './charging.commands';
import { CommandConfirmations } from './charging.confirmations';
import { ChargingHandlers } from './charging.handlers';
import { ChargingServer } from './charging.server';
import { ChargerDirectory, ConnectionRegistry, LiveState, OcppMessageLog } from './charging.state';
import { JsonAdapter } from './json.adapter';
import { LiveStateEvents } from './live-events';
import { SoapAdapter } from './soap.adapter';

/**
 * Charger connections inside the API (ADR-004, revised): OCPP 1.5/1.6 SOAP and OCPP 1.6J on their own port.
 */
@Module({
    providers: [
        ChargerDirectory, ConnectionRegistry, LiveState, OcppMessageLog, ChargingHandlers, SoapAdapter, JsonAdapter, ChargingServer,
        ChargerCommander, CommandConfirmations, LiveStateEvents, ChargerGate,
    ],
    exports: [ConnectionRegistry, ChargingServer, ChargerCommander],
})
export class ChargingModule {}
