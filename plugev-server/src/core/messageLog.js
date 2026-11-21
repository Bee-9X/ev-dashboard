const OcppMessage = require('../models/OcppMessage');
const logger = require('../logger');

const MAX_RAW = 20000;

/** Persist one OCPP message. Never throws: logging must not break charger traffic. */
function record(entry) {
    const raw = typeof entry.raw === 'string' && entry.raw.length > MAX_RAW
        ? entry.raw.slice(0, MAX_RAW) + '…[truncated]'
        : entry.raw;

    logger.info(
        `[${entry.chargerIdentity}] ${entry.direction === 'in' ? '<-' : '->'} ${entry.kind} ${entry.action || ''}` +
        (entry.error ? ` ERROR ${JSON.stringify(entry.error)}` : ''),
    );
    logger.debug(raw || JSON.stringify(entry.payload));

    return OcppMessage.create({ ...entry, raw }).catch(err => {
        logger.warn(`Could not store OCPP message for ${entry.chargerIdentity}: ${err.message}`);
    });
}

module.exports = { record };
