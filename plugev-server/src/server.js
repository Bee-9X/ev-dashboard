const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const logger = require('./logger');
const chargerService = require('./core/chargerService');
const platformLink = require('./core/platformLink');
const { createApiRouter } = require('./api/routes');
const { createSoapRouter } = require('./adapters/ocppSoap');
const { createJsonGateway } = require('./adapters/ocppJson');

function buildApp() {
    const app = express();
    app.disable('x-powered-by');

    app.use('/api', cors({ origin: config.corsOrigins }), createApiRouter());
    app.use(createSoapRouter());

    // Anything else: log it and answer 200 so a misconfigured charger does not give up silently.
    app.post(/.*/, express.text({ type: () => true, limit: '1mb' }), (req, res) => {
        logger.warn(`Unmatched POST ${req.url} from ${req.socket.remoteAddress}: ${String(req.body || '').slice(0, 200)}`);
        res.status(200).send('OK');
    });

    return app;
}

/**
 * Start everything. Returns handles so tests can stop it again.
 * opts.port / opts.legacyWsPort override config (0 = random free port for tests; null = disabled).
 */
async function start(opts = {}) {
    const port = opts.port ?? config.port;
    const legacyWsPort = opts.legacyWsPort !== undefined ? opts.legacyWsPort : config.legacyWsPort;
    const mongoUri = opts.mongoUri ?? config.mongoUri;

    if (!mongoUri) {
        throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
    }
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');
    await Promise.all(Object.values(mongoose.models).map(m => m.syncIndexes()));
    await chargerService.resetConnectionStates();
    logger.info(platformLink.enabled()
        ? `Platform link on: charger activity is sent to ${config.platformApiUrl}`
        : 'Platform link off (set PLATFORM_API_URL and PLATFORM_GATEWAY_KEY to show chargers live in the admin portal)');

    const app = buildApp();
    const server = http.createServer(app);
    const gateway = createJsonGateway();
    server.on('upgrade', (req, socket, head) => gateway.handleUpgrade(req, socket, head));
    server.on('clientError', (err, socket) => socket.destroy());

    await new Promise(resolve => server.listen(port, resolve));
    const actualPort = server.address().port;
    logger.info(`HTTP API, OCPP SOAP and OCPP-J (WebSocket) listening on port ${actualPort}`);
    logger.info(`  SOAP charger URL:      http://<public-host>/ocpp/<chargeBoxIdentity>`);
    logger.info(`  OCPP-J charger URL:    ws://<public-host>/ocpp/<chargeBoxIdentity>`);

    let legacyServer = null;
    if (legacyWsPort !== null && legacyWsPort !== 0 && legacyWsPort !== undefined) {
        legacyServer = http.createServer((req, res) => res.writeHead(426).end('Upgrade Required'));
        legacyServer.on('upgrade', (req, socket, head) => gateway.handleUpgrade(req, socket, head));
        await new Promise(resolve => legacyServer.listen(legacyWsPort, resolve));
        logger.info(`Legacy OCPP-J WebSocket port ${legacyWsPort} also open`);
    }

    const sweeper = setInterval(() => {
        chargerService.sweepStale().catch(err => logger.error(`Offline sweep failed: ${err.message}`));
    }, Math.max(5000, Math.min(15000, (config.offlineAfterSec * 1000) / 3)));
    sweeper.unref();

    async function stop() {
        clearInterval(sweeper);
        await platformLink.drain().catch(() => undefined);
        gateway.close();
        await new Promise(resolve => server.close(resolve));
        if (legacyServer) await new Promise(resolve => legacyServer.close(resolve));
        await mongoose.disconnect();
    }

    return { server, port: actualPort, stop };
}

module.exports = { start, buildApp };
