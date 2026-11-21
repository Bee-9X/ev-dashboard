const config = require('../config');

/**
 * Live sessions of chargers talking to this process.
 * session = {
 *   identity, protocol, version,
 *   lastSeen: Date,
 *   isConnected(): boolean,
 *   sendCommand(action, payload, timeoutMs): Promise<responsePayload>,
 *   ...adapter specific fields (ws, endpoint)
 * }
 */
const sessions = new Map();

function get(identity) {
    return sessions.get(identity);
}

function set(identity, session) {
    sessions.set(identity, session);
    return session;
}

function remove(identity, session) {
    // Only remove if it is still the same session (a newer connection may have replaced it).
    if (!session || sessions.get(identity) === session) sessions.delete(identity);
}

function isOnline(identity, now = Date.now()) {
    const s = sessions.get(identity);
    if (!s) return false;
    if (!s.isConnected()) return false;
    return now - s.lastSeen.getTime() < config.offlineAfterSec * 1000;
}

function all() {
    return [...sessions.values()];
}

module.exports = { get, set, remove, isOnline, all };
