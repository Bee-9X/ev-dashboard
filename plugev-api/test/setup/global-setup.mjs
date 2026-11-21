/**
 * Starts a throwaway PostgreSQL for the test run unless TEST_DATABASE_URL is already set (CI provides one).
 * Each test file then resets the schema, so files never see each other's data.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

export default async function globalSetup() {
    if (process.env.TEST_DATABASE_URL) return;
    const port = await freePort();
    const pg = new EmbeddedPostgres({
        databaseDir: mkdtempSync(join(tmpdir(), 'plugev-api-pg-')),
        user: 'postgres',
        password: 'postgres',
        port,
        persistent: false,
        onLog: () => {},
        onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('plugev_test');
    process.env.TEST_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/plugev_test`;
    globalThis.__PLUGEV_TEST_PG__ = pg;
}
