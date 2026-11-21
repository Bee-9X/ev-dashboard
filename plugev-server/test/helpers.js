// Shared test bootstrap. Each test file runs in its own process, so env set here applies per file.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.MONGODB_URI = '';

const { MongoMemoryServer } = require('mongodb-memory-server');

async function startStack() {
    const mongo = await MongoMemoryServer.create();
    const { start } = require('../src/server');
    const app = await start({ port: 0, legacyWsPort: null, mongoUri: mongo.getUri() });
    const base = `http://localhost:${app.port}`;
    return {
        base,
        wsBase: `ws://localhost:${app.port}`,
        async stop() {
            await app.stop();
            await mongo.stop();
        },
    };
}

async function waitFor(fn, { timeout = 8000, interval = 100, message = 'condition' } = {}) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
        try {
            last = await fn();
            if (last) return last;
        } catch (err) {
            last = err;
        }
        await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`Timed out waiting for ${message}; last value: ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

async function api(base, method, path, body, headers = {}) {
    const res = await fetch(base + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
}

module.exports = { startStack, waitFor, api };
