import { Injectable, Logger } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { ChargingHandlers } from './charging.handlers';
import { ChargerDirectory, ChargerSession, ConnectionRegistry, LiveState, OcppMessageLog } from './charging.state';
import { CommandError, OcppError } from './ocpp/common';
import type { Payload } from './ocpp/xml';
import { clientIp } from './soap.adapter';

const PROTOCOL = 'ocpp1.6-json' as const;
const PING_INTERVAL_MS = 30000;

export function identityFromUrl(url: string | undefined): string | null {
    const path = (url || '').split('?')[0]!;
    const last = path.split('/').filter(Boolean).pop();
    if (!last) return null;
    try {
        return decodeURIComponent(last);
    } catch {
        return null;
    }
}

type AliveSocket = WebSocket & { isAlive?: boolean };

/**
 * OCPP 1.6J over WebSocket, ported from the Phase 0 gateway.
 * Frames: CALL [2, id, action, payload], CALLRESULT [3, id, payload], CALLERROR [4, id, code, description, details].
 */
@Injectable()
export class JsonAdapter {
    private readonly logger = new Logger('OCPP-J');
    private wss: WebSocketServer | null = null;
    private pingTimer: NodeJS.Timeout | null = null;

    constructor(
        private readonly handlers: ChargingHandlers,
        private readonly registry: ConnectionRegistry,
        private readonly directory: ChargerDirectory,
        private readonly live: LiveState,
        private readonly messages: OcppMessageLog,
    ) {}

    start(): void {
        this.wss = new WebSocketServer({
            noServer: true,
            // echo "ocpp1.6" when offered; chargers that offer no subprotocol are still accepted
            handleProtocols: protocols => (protocols.has('ocpp1.6') ? 'ocpp1.6' : false),
        });
        // detect dead TCP connections that never send a close frame
        this.pingTimer = setInterval(() => {
            for (const ws of this.wss?.clients ?? []) {
                const s = ws as AliveSocket;
                if (s.isAlive === false) {
                    s.terminate();
                    continue;
                }
                s.isAlive = false;
                s.ping();
            }
        }, PING_INTERVAL_MS);
        this.pingTimer.unref();
    }

    stop(): void {
        if (this.pingTimer) clearInterval(this.pingTimer);
        for (const ws of this.wss?.clients ?? []) ws.terminate();
        this.wss?.close();
        this.wss = null;
    }

    /** For the HTTP server's 'upgrade' event. Only chargers registered in the portal may connect. */
    async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
        const identity = identityFromUrl(req.url);
        const refuse = (status: string) => {
            socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
            socket.destroy();
        };
        if (!identity || !this.wss) return refuse('400 Bad Request');
        const charger = await this.directory.find(identity).catch(() => null);
        if (!charger) {
            this.logger.warn(`[${identity}] Refused WebSocket: no charger with this Charger ID is registered in the admin portal`);
            return refuse('404 Not Found');
        }
        this.wss.handleUpgrade(req, socket, head, ws => this.onConnection(ws, req, identity));
    }

    private onConnection(ws: AliveSocket, req: IncomingMessage, identity: string): void {
        const ip = clientIp(req as never);
        this.logger.log(`[${identity}] WebSocket connected from ${ip} (subprotocol: ${ws.protocol || 'none'})`);

        const previous = this.registry.get(identity) as (ChargerSession & { ws?: WebSocket }) | undefined;
        if (previous?.ws && previous.ws !== ws) {
            this.logger.warn(`[${identity}] New connection replaces an existing one`);
            previous.ws.close(1000, 'Replaced by new connection');
        }

        const pending = new Map<string, { resolve: (p: Payload) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; action: string }>();
        let queue: Promise<unknown> = Promise.resolve(); // OCPP allows one outstanding CALL per direction
        const ctx = { identity, protocol: PROTOCOL, version: '1.6' as const, ip };

        const sendCall = (action: string, payload: Payload, timeoutMs: number) => new Promise<Payload>((resolve, reject) => {
            if (ws.readyState !== WebSocket.OPEN) {
                reject(new CommandError('Failed', 'The WebSocket is not open'));
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
            this.messages.record({ identity, protocol: PROTOCOL, direction: 'out', kind: 'CALL', action, messageId, payload, raw: frame });
        });

        const session: ChargerSession & { ws: WebSocket } = this.registry.set({
            identity,
            protocol: PROTOCOL,
            version: '1.6',
            ws,
            lastSeen: new Date(),
            isConnected: () => ws.readyState === WebSocket.OPEN,
            sendCommand: (action, payload, timeoutMs) => {
                const run = () => sendCall(action, payload, timeoutMs);
                const p = queue.then(run, run);
                queue = p.catch(() => undefined);
                return p;
            },
        } as ChargerSession & { ws: WebSocket }) as ChargerSession & { ws: WebSocket };

        const touch = () => {
            session.lastSeen = new Date();
            this.directory.find(identity)
                .then(c => c && this.live.seen(c, PROTOCOL, { ip }))
                .catch(err => this.logger.warn(`[${identity}] Could not record activity: ${(err as Error).message}`));
        };
        this.directory.find(identity)
            .then(c => c && this.live.connected(c, PROTOCOL))
            .catch(err => this.logger.warn(`[${identity}] Could not record the connection: ${(err as Error).message}`));

        const reply = (frame: unknown[], entry: { kind: 'CALLRESULT' | 'CALLERROR'; action: string; messageId: string; payload?: unknown; error?: unknown }) => {
            const raw = JSON.stringify(frame);
            if (ws.readyState === WebSocket.OPEN) ws.send(raw);
            this.messages.record({ identity, protocol: PROTOCOL, direction: 'out', raw, ...entry });
        };

        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
            touch();
        });

        ws.on('message', async data => {
            const raw = data.toString();
            session.lastSeen = new Date();
            let msg: unknown;
            try {
                msg = JSON.parse(raw);
            } catch {
                this.logger.warn(`[${identity}] Ignoring a frame that is not JSON: ${raw.slice(0, 200)}`);
                return;
            }
            if (!Array.isArray(msg) || typeof msg[1] !== 'string') {
                this.logger.warn(`[${identity}] Ignoring a malformed frame: ${raw.slice(0, 200)}`);
                return;
            }
            const [type, messageId] = msg as [number, string, ...unknown[]];

            if (type === 2) {
                const action = String(msg[2]);
                const payload = (msg[3] || {}) as Payload;
                this.messages.record({ identity, protocol: PROTOCOL, direction: 'in', kind: 'CALL', action, messageId, payload, raw });
                try {
                    const result = await this.handlers.handle(ctx, action, payload);
                    reply([3, messageId, result], { kind: 'CALLRESULT', action, messageId, payload: result });
                } catch (err) {
                    const known = err instanceof OcppError;
                    const code = known ? err.code : 'InternalError';
                    const description = known ? err.message : 'Internal server error';
                    if (!known) this.logger.error(`[${identity}] Error handling ${action}: ${(err as Error).stack ?? err}`);
                    reply([4, messageId, code, description, {}], { kind: 'CALLERROR', action, messageId, error: { code, description } });
                }
                return;
            }

            if (type === 3 || type === 4) {
                const entry = pending.get(messageId);
                const action = entry?.action;
                if (type === 3) {
                    this.messages.record({ identity, protocol: PROTOCOL, direction: 'in', kind: 'CALLRESULT', action, messageId, payload: msg[2], raw });
                } else {
                    this.messages.record({
                        identity, protocol: PROTOCOL, direction: 'in', kind: 'CALLERROR', action, messageId,
                        error: { code: msg[2], description: msg[3], details: msg[4] }, raw,
                    });
                }
                if (!entry) {
                    this.logger.warn(`[${identity}] Response for an unknown or expired message ${messageId}`);
                    return;
                }
                pending.delete(messageId);
                clearTimeout(entry.timer);
                if (type === 3) entry.resolve((msg[2] || {}) as Payload);
                else entry.reject(new CommandError('Failed', `The charger returned CallError ${msg[2]}: ${msg[3] ?? ''}`.trim(), { code: msg[2], description: msg[3], details: msg[4] }));
                return;
            }
            this.logger.warn(`[${identity}] Unknown message type ${type}`);
        });

        ws.on('close', (code, reason) => {
            for (const [, entry] of pending) {
                clearTimeout(entry.timer);
                entry.reject(new CommandError('Failed', 'The connection closed before the charger answered'));
            }
            pending.clear();
            if (this.registry.get(identity) === session) {
                this.registry.remove(identity, session);
                const why = `websocket closed (${code}${reason?.length ? ` ${reason.toString()}` : ''})`;
                this.logger.log(`[${identity}] Offline: ${why}`);
                this.directory.find(identity)
                    .then(c => c && this.live.disconnected(c, why))
                    .catch(err => this.logger.warn(`[${identity}] Could not record the disconnect: ${(err as Error).message}`));
            }
        });
        ws.on('error', err => this.logger.warn(`[${identity}] WebSocket error: ${err.message}`));
    }
}
