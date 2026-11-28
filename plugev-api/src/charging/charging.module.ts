import { Module } from '@nestjs/common';
import { GatewayModule } from '../gateway/gateway.module';
import { ChargingHandlers } from './charging.handlers';
import { ChargingServer } from './charging.server';
import { ChargerDirectory, ConnectionRegistry, LiveState, OcppMessageLog } from './charging.state';
import { JsonAdapter } from './json.adapter';
import { SoapAdapter } from './soap.adapter';

/**
 * Charger connections inside the API (ADR-004, revised): OCPP 1.5/1.6 SOAP and OCPP 1.6J on their own port.
 * Replaces the Phase 0 gateway (plugev-server) and its MongoDB.
 */
@Module({
    imports: [GatewayModule],
    providers: [ChargerDirectory, ConnectionRegistry, LiveState, OcppMessageLog, ChargingHandlers, SoapAdapter, JsonAdapter, ChargingServer],
    exports: [ConnectionRegistry, ChargingServer],
})
export class ChargingModule {}
