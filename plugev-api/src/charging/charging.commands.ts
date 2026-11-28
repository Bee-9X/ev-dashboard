import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { APP_CONFIG, AppConfig } from '../config/config';
import type { EvseProtocol } from '../database/entities';
import { ChargerSession, ConnectionRegistry } from './charging.state';
import { CommandError } from './ocpp/common';
import type { OcppVersion, Payload } from './ocpp/xml';
import { SoapAdapter } from './soap.adapter';

export { CONFIRM_WITHIN_SEC } from './charging.confirmations';

/** The charger a command goes to, as registered in the portal. */
export interface CommandTarget {
    id: string;
    protocolIdentity: string;
    protocol: EvseProtocol;
    /** SOAP only: overrides the address the charger reports. */
    commandUrl: string | null;
}

/** Delivers commands to chargers over whichever protocol they use (spec 5.3 step 20). */
@Injectable()
export class ChargerCommander {
    constructor(
        private readonly registry: ConnectionRegistry,
        private readonly soap: SoapAdapter,
        private readonly db: DataSource,
        @Inject(APP_CONFIG) private readonly config: AppConfig,
    ) {}

    /** Resolves with the charger's answer; throws CommandError when it cannot be delivered or no answer comes. */
    async send(target: CommandTarget, action: string, payload: Payload): Promise<Payload> {
        const session = this.registry.get(target.protocolIdentity);

        if (target.protocol === 'OCPP_1_6_J') {
            if (!session || session.protocol !== 'ocpp1.6-json' || !session.isConnected()) {
                throw new CommandError('Failed', 'The charger is not connected. Commands reach an OCPP 1.6 (JSON) charger only while it is connected.');
            }
            return session.sendCommand(action, payload, this.config.ocpp.commandTimeoutMs);
        }

        // SOAP: every command is an HTTP request to the charger. Its address is known from its messages (and kept in
        // the database across restarts), unless the portal overrides it.
        let endpoint = target.commandUrl ?? (session?.protocol !== 'ocpp1.6-json' ? session?.endpoint : undefined);
        if (!endpoint) {
            const [row] = await this.db.query('SELECT endpoint FROM evse_live_states WHERE evse_id = $1', [target.id]);
            endpoint = row?.endpoint ?? undefined;
        }
        if (!endpoint) {
            throw new CommandError('Failed',
                'The charger has not reported an address for commands yet (it does with its next message), and no command address is set for it.');
        }
        // the version the charger actually speaks, if it has been heard from since the API started
        const version: OcppVersion = session && session.protocol !== 'ocpp1.6-json'
            ? session.version
            : target.protocol === 'OCPP_1_5_S' ? '1.5' : '1.6';
        const transient: ChargerSession = {
            identity: target.protocolIdentity,
            protocol: version === '1.5' ? 'ocpp1.5-soap' : 'ocpp1.6-soap',
            version,
            lastSeen: session?.lastSeen ?? new Date(0),
            endpoint,
            isConnected: () => true,
            sendCommand: () => Promise.reject(new Error('not used')),
        };
        return this.soap.sendCommand(transient, action, payload, this.config.ocpp.soapCommandTimeoutMs);
    }
}
