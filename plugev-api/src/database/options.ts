import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/config';
import { ENTITIES } from './entities';
import { InitialSchema1763740800000 } from './migrations/1763740800000-InitialSchema';
import { Mfa1763827200000 } from './migrations/1763827200000-Mfa';
import { ChargersAndStationDetails1763913600000 } from './migrations/1763913600000-ChargersAndStationDetails';
import { ChargerLiveState1764000000000 } from './migrations/1764000000000-ChargerLiveState';
import { ChargingCore1764100000000 } from './migrations/1764100000000-ChargingCore';
import { ChargerCommands1764200000000 } from './migrations/1764200000000-ChargerCommands';
import { ChargerSecurity1764300000000 } from './migrations/1764300000000-ChargerSecurity';

/** Migrations are listed explicitly so the same set runs from ts-node, Jest and the compiled build. */
export const MIGRATIONS = [InitialSchema1763740800000, Mfa1763827200000, ChargersAndStationDetails1763913600000,
    ChargerLiveState1764000000000,
    ChargingCore1764100000000,
    ChargerCommands1764200000000,
    ChargerSecurity1764300000000,
];

export function buildDataSourceOptions(config: Pick<AppConfig, 'databaseUrl' | 'dbSsl' | 'dbRunMigrations'> & { nodeEnv?: string }): DataSourceOptions {
    return {
        type: 'postgres',
        url: config.databaseUrl,
        ssl: config.dbSsl ? { rejectUnauthorized: true } : false,
        entities: ENTITIES,
        migrations: MIGRATIONS,
        migrationsRun: config.dbRunMigrations,
        migrationsTransactionMode: 'each',
        synchronize: false,
        logging: config.nodeEnv === 'test' ? false : ['error', 'warn', 'migration'],
    };
}
