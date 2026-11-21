const { start } = require('./src/server');
const logger = require('./src/logger');

start().then(({ stop }) => {
    const shutdown = signal => {
        logger.info(`${signal} received, shutting down`);
        stop().then(() => process.exit(0), () => process.exit(1));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}).catch(err => {
    logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
});
