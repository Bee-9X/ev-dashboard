import type { DataSourceOptions } from 'typeorm';
import type { AppConfig } from '../config/config';
import { ENTITIES } from './entities';
import { InitialSchema1763740800000 } from './migrations/1763740800000-InitialSchema';

/** Migrations are listed explicitly so the same set runs from ts-node, Jest and the compiled build. */
export const MIGRATIONS = [InitialSchema1763740800000];

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
