require('dotenv').config({ quiet: true });

function int(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
    return n;
}

function list(name) {
    return (process.env[name] || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

const config = {
    port: int('PORT', 3003),
    // Legacy standalone WebSocket port for chargers still configured with ws://host:3002/...
    // Set to 0 to disable. OCPP-J is also accepted on PORT (same port as SOAP and the API).
    legacyWsPort: int('LEGACY_WS_PORT', 3002),
    mongoUri: process.env.MONGODB_URI || '',

    // Portal API protection (Phase 0 stop-gap until real auth in Phase 1)
    apiKey: process.env.API_KEY || '',
    corsOrigins: list('CORS_ORIGINS').length ? list('CORS_ORIGINS') : ['http://localhost:3000'],

    // OCPP behaviour
    heartbeatIntervalSec: int('HEARTBEAT_INTERVAL_SEC', 30),
    // A charger is considered offline when nothing was heard for this long.
    offlineAfterSec: int('OFFLINE_AFTER_SEC', 90),
    commandTimeoutMs: int('COMMAND_TIMEOUT_MS', 30000),
    soapCommandTimeoutMs: int('SOAP_COMMAND_TIMEOUT_MS', 15000),
    // If false, chargers that are not registered in the portal get BootNotification "Rejected"
    // and OCPP-J connections from them are refused.
    allowUnregistered: (process.env.ALLOW_UNREGISTERED || 'true').toLowerCase() === 'true',
    // Optional comma separated idTag allow-list. Empty = accept every idTag (discovery mode).
    idTagAllowList: list('ID_TAG_ALLOWLIST'),

    // Raw OCPP message retention (diagnostics, spec §8.2/§8.4)
    messageRetentionDays: int('MESSAGE_RETENTION_DAYS', 30),
    logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
};

module.exports = config;
