export default async function globalTeardown() {
    const pg = globalThis.__PLUGEV_TEST_PG__;
    if (pg) await pg.stop();
}
