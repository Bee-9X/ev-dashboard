/**
 * OCPP 1.6J adapter (WebSocket + JSON-RPC style frames).
 * CALL = [2, id, action, payload], CALLRESULT = [3, id, payload], CALLERROR = [4, id, code, description, details]
 */
const { WebSocketServer, WebSocket } = require('ws');
const { randomUUID } = require('crypto');
const Charger = require('../models/Charger');
const config = require('../config');
const registry = require('../core/registry');
const chargerService = require('../core/chargerService');
const messageLog = require('../core/messageLog');
const { handleInbound } = require('../core/handlers');
const { OcppError, CommandError } = require('../util/errors');
const logger = require('../logger');

const PROTOCOL = 'ocpp1.6-json';
const PING_INTERVAL_MS = 30000;

function identityFromUrl(url) {
    const path = (url || '').split('?')[0];
    const last = path.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
}

function clientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    const ip = (fwd ? String(fwd).split(',')[0].trim() : req.socket.remoteAddress) || '';
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function createJsonGateway() {
    const wss = new WebSocketServer({
        noServer: true,
        // Echo "ocpp1.6" when offered. Chargers that offer no subprotocol are still accepted.
        handleProtocols: protocols => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
    });

    /** Attach to an http.Server 'upgrade' event. */
    async function handleUpgrade(req, socket, head) {
        const identity = identityFromUrl(req.url);
        if (!identity) {
            socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
            socket.destroy();
            return;
        }
        if (!config.allowUnregistered) {
            const known = await Charger.exists({ identity, registered: { $ne: false } }).catch(() => null);
            if (!known) {
                logger.warn(`[${identity}] Refused WebSocket from unregistered charger`);
                socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
                socket.destroy();
                return;
            }
        }
        wss.handleUpgrade(req, socket, head, ws => onConnection(ws, req, identity));
    }

    function onConnection(ws, req, identity) {
        const ip = clientIp(req);
        logger.info(`[${identity}] WebSocket connected from ${ip} (subprotocol: ${ws.protocol || 'none'})`);

        const previous = registry.get(identity);
        if (previous && previous.ws && previous.ws !== ws) {
            logger.warn(`[${identity}] New connection replaces an existing one`);
            previous.ws.close(1000, 'Replaced by new connection');
        }

        const pending = new Map(); // messageId -> { resolve, reject, timer, action }
        let queue = Promise.resolve(); // OCPP allows only one outstanding CALL per direction
        const ctx = { identity, protocol: PROTOCOL, version: '1.6', ip };

        const session = registry.set(identity, {
            identity,
            protocol: PROTOCOL,
            version: '1.6',
            ws,
            lastSeen: new Date(),
            isConnected: () => ws.readyState === WebSocket.OPEN,
            sendCommand(action, payload, timeoutMs) {
                const run = () => sendCall(action, payload, timeoutMs);
                const p = queue.then(run, run);
                queue = p.catch(() => {});
                return p;
            },
        });

        chargerService.touch(identity, ctx).catch(err => logger.error(`[${identity}] touch failed: ${err.message}`));

        function sendCall(action, payload, timeoutMs) {
            return new Promise((resolve, reject) => {
                if (ws.readyState !== WebSocket.OPEN) {
                    reject(new CommandError('Failed', 'WebSocket is not open'));
                    return;
                }
                const messageId = randomUUID();
                const timer = setTimeout(() => {
                    pending.delete(messageId);
                    reject(new CommandError('Timeout', `No response to ${action} within ${timeoutMs} ms`));
                }, timeoutMs);
                pending.set(messageId, { resolve, reject, timer, action });
                const frame = JSON.stringify([2, messageId, action, payload]);
                ws.send(frame);
                messageLog.record({
                    chargerIdentity: identity, protocol: PROTOCOL, direction: 'out', kind: 'CALL',
                    action, messageId, payload, raw: frame,
                });
            });
        }

        function reply(frame, entry) {
            const raw = JSON.stringify(frame);
            if (ws.readyState === WebSocket.OPEN) ws.send(raw);
            messageLog.record({ chargerIdentity: identity, protocol: PROTOCOL, direction: 'out', raw, ...entry });
        }

        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
            session.lastSeen = new Date();
            chargerService.touch(identity, ctx).catch(() => {});
        });

        ws.on('message', async (data) => {
            const raw = data.toString();
            session.lastSeen = new Date();

            let msg;
            try {
                msg = JSON.parse(raw);
            } catch {
                logger.warn(`[${identity}] Ignoring non-JSON frame: ${raw.slice(0, 200)}`);
                return;
            }
            if (!Array.isArray(msg) || typeof msg[1] !== 'string') {
                logger.warn(`[${identity}] Ignoring malformed frame: ${raw.slice(0, 200)}`);
                return;
            }

            const [type, messageId] = msg;

            if (type === 2) {
                const action = msg[2];
                const payload = msg[3] || {};
                messageLog.record({
                    chargerIdentity: identity, protocol: PROTOCOL, direction: 'in', kind: 'CALL',
                    action, messageId, payload, raw,
                });
                try {
                    const result = await handleInbound(ctx, action, payload);
                    reply([3, messageId, result], { kind: 'CALLRESULT', action, messageId, payload: result });
                } catch (err) {
                    const code = err instanceof OcppError ? err.code : 'InternalError';
                    const description = err instanceof OcppError ? err.message : 'Internal server error';
                    if (!(err instanceof OcppError)) logger.error(`[${identity}] Error handling ${action}:`, err);
                    reply([4, messageId, code, description, {}], {
                        kind: 'CALLERROR', action, messageId, error: { code, description },
                    });
                }
                return;
            }

            if (type === 3 || type === 4) {
                const entry = pending.get(messageId);
                const action = entry ? entry.action : undefined;
                if (type === 3) {
                    messageLog.record({
                        chargerIdentity: identity, protocol: PROTOCOL, direction: 'in', kind: 'CALLRESULT',
                        action, messageId, payload: msg[2], raw,
                    });
                } else {
                    messageLog.record({
                        chargerIdentity: identity, protocol: PROTOCOL, direction: 'in', kind: 'CALLERROR',
                        action, messageId, error: { code: msg[2], description: msg[3], details: msg[4] }, raw,
                    });
                }
                if (!entry) {
                    logger.warn(`[${identity}] Response for unknown or expired message ${messageId}`);
                    return;
                }
                pending.delete(messageId);
                clearTimeout(entry.timer);
                if (type === 3) entry.resolve(msg[2] || {});
                else entry.reject(new CommandError('Failed', `Charger returned CallError ${msg[2]}: ${msg[3] || ''}`.trim(), { code: msg[2], description: msg[3], details: msg[4] }));
                return;
            }

            logger.warn(`[${identity}] Unknown message type ${type}`);
        });

        ws.on('close', (code, reason) => {
            for (const [, entry] of pending) {
                clearTimeout(entry.timer);
                entry.reject(new CommandError('Failed', 'Connection closed before the charger answered'));
            }
            pending.clear();
            if (registry.get(identity) === session) {
                registry.remove(identity, session);
                chargerService.markOffline(identity, `websocket closed (${code}${reason?.length ? ` ${reason}` : ''})`)
                    .catch(err => logger.error(`[${identity}] markOffline failed: ${err.message}`));
            }
        });

        ws.on('error', err => logger.warn(`[${identity}] WebSocket error: ${err.message}`));
    }

    // Detect dead TCP connections that never send a close frame.
    const pingTimer = setInterval(() => {
        for (const ws of wss.clients) {
            if (ws.isAlive === false) {
                ws.terminate();
                continue;
            }
            ws.isAlive = false;
            ws.ping();
        }
    }, PING_INTERVAL_MS);
    pingTimer.unref();

    function close() {
        clearInterval(pingTimer);
        for (const ws of wss.clients) ws.terminate();
        wss.close();
    }

    return { wss, handleUpgrade, close };
}

module.exports = { createJsonGateway, identityFromUrl };
