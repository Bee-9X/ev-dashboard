/** DataSource for the TypeORM CLI (npm run migration:run / migration:revert). */
import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './options';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');

export default new DataSource(buildDataSourceOptions({
    databaseUrl: url,
    dbSsl: process.env.DB_SSL === 'true',
    dbRunMigrations: false,
}));
