import { Injectable, Logger } from '@nestjs/common';
import express, { Request, Response, Router } from 'express';
import { randomUUID } from 'node:crypto';
import { ChargingHandlers } from './charging.handlers';
import { ChargerSession, ConnectionRegistry, OcppMessageLog } from './charging.state';
import { CommandError, OcppError, Protocol } from './ocpp/common';
import {
    buildRequestEnvelope, buildResponseEnvelope, faultEnvelope, getCI, NAMESPACES, OcppVersion, parseSoap, Payload,
} from './ocpp/xml';

const ANONYMOUS = 'http://www.w3.org/2005/08/addressing/anonymous';

const protocolFor = (version: OcppVersion): Protocol => (version === '1.5' ? 'ocpp1.5-soap' : 'ocpp1.6-soap');

function text(v: unknown): string | undefined {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'object') {
        const value = (v as { value?: unknown }).value;
        return value !== undefined ? String(value) : undefined;
    }
    return String(v);
}

export function clientIp(req: { headers: Record<string, unknown>; socket: { remoteAddress?: string } }): string {
    const fwd = req.headers['x-forwarded-for'];
    const ip = (fwd ? String(fwd).split(',')[0]!.trim() : req.socket.remoteAddress) || '';
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** "bootNotificationRequest" -> "bootNotificationResponse" (keeps the charger's casing style). */
export function responseElementFor(bodyElement: string): string {
    if (/request$/i.test(bodyElement)) {
        const base = bodyElement.slice(0, -7);
        return base + (bodyElement.endsWith('Request') ? 'Response' : 'response');
    }
    return bodyElement + 'Response';
}

/**
 * OCPP 1.5 / 1.6 SOAP (OCPP-S), ported from the Phase 0 gateway.
 * Inbound: the charger POSTs SOAP 1.2 envelopes to any path containing "ocpp" (e.g. /ocpp/c1).
 * Outbound (commands): we POST envelopes to the address the charger advertised in wsa:From.
 */
@Injectable()
export class SoapAdapter {
    private readonly logger = new Logger('OCPP-SOAP');

    constructor(
        private readonly handlers: ChargingHandlers,
        private readonly registry: ConnectionRegistry,
        private readonly messages: OcppMessageLog,
    ) {}

    router(): Router {
        const router = express.Router();
        const rawBody = express.text({ type: () => true, limit: '2mb' });

        // some chargers probe the address with GET first; a 404 makes them give up
        router.get(/ocpp/i, (_req, res) => {
            res.status(200).send('OK');
        });
        router.post(/ocpp/i, rawBody, (req, res) => {
            void this.handle(req, res);
        });
        return router;
    }

    private session(identity: string, version: OcppVersion): ChargerSession {
        let session = this.registry.get(identity);
        if (!session || session.protocol === 'ocpp1.6-json') {
            const created: ChargerSession = {
                identity,
                protocol: protocolFor(version),
                version,
                lastSeen: new Date(),
                isConnected: () => true, // HTTP is connectionless; how recently it was heard from decides
                sendCommand: (action, payload, timeoutMs) => this.sendCommand(created, action, payload, timeoutMs),
            };
            session = this.registry.set(created);
        }
        session.version = version;
        session.protocol = protocolFor(version);
        session.lastSeen = new Date();
        return session;
    }

    private async handle(req: Request, res: Response): Promise<void> {
        const raw = typeof req.body === 'string' ? req.body : '';
        if (!raw) {
            res.status(400).send('Empty SOAP request');
            return;
        }
        let parsed;
        try {
            parsed = await parseSoap(raw);
        } catch (err) {
            this.logger.warn(`Unparseable SOAP from ${clientIp(req)} to ${req.url}: ${(err as Error).message}`);
            res.status(400).type('application/soap+xml').send(faultEnvelope('Sender', 'FormationViolation', 'Malformed XML'));
            return;
        }
        if (!parsed.bodyElement) {
            res.status(400).type('application/soap+xml').send(faultEnvelope('Sender', 'FormationViolation', 'No SOAP body content'));
            return;
        }

        const header = parsed.header;
        const urlIdentity = decodeURIComponent(req.path.split('/').filter(Boolean).pop() || '');
        const identity = (text(getCI(header, 'chargeBoxIdentity')) || urlIdentity || 'Unknown').slice(0, 100);
        const version: OcppVersion = parsed.version || '1.6';
        const namespace = parsed.namespace || NAMESPACES[version].cs;
        const action = this.handlers.canonicalAction(parsed.bodyElement);
        const messageId = text(getCI(header, 'MessageID'));
        const fromAddress = text(getCI(getCI(header, 'From'), 'Address'));
        const endpoint = fromAddress && fromAddress !== ANONYMOUS ? fromAddress : undefined;

        const session = this.session(identity, version);
        if (endpoint) session.endpoint = endpoint;
        const protocol = session.protocol;

        this.messages.record({ identity, protocol, direction: 'in', kind: 'CALL', action, messageId, payload: parsed.payload, raw });

        const responseElement = responseElementFor(parsed.bodyElement);
        const incomingWsaAction = text(getCI(header, 'Action'));
        const wsaAction = incomingWsaAction
            ? (incomingWsaAction.endsWith('Response') ? incomingWsaAction : incomingWsaAction + 'Response')
            : `/${responseElement}`;

        const send = (payload: Payload, kind: 'CALLRESULT' = 'CALLRESULT', error?: unknown) => {
            const xml = buildResponseEnvelope({ action: wsaAction, relatesTo: messageId, to: fromAddress, namespace, responseElement, payload });
            this.messages.record({ identity, protocol, direction: 'out', kind, action, messageId, payload, error, raw: xml });
            res.set('Content-Type', 'application/soap+xml; charset=utf-8').send(xml);
        };

        try {
            send(await this.handlers.handle({ identity, protocol, version, ip: clientIp(req), endpoint }, action, parsed.payload));
        } catch (err) {
            if (err instanceof OcppError && err.code === 'NotImplemented') {
                // lenient: an empty answer, so the charger does not keep retrying
                this.logger.warn(`[${identity}] Unhandled SOAP action ${action}; sent an empty response`);
                send({}, 'CALLRESULT', { code: 'NotImplemented', description: err.message });
                return;
            }
            const security = err instanceof OcppError && err.code === 'SecurityError';
            if (!security) this.logger.error(`[${identity}] Error handling SOAP ${action}: ${(err as Error).stack ?? err}`);
            const code = security ? 'SecurityError' : 'InternalError';
            const xml = faultEnvelope(security ? 'Sender' : 'Receiver', code, security ? (err as Error).message : 'Internal server error');
            this.messages.record({
                identity, protocol, direction: 'out', kind: 'CALLERROR', action, messageId,
                error: { code, description: (err as Error).message }, raw: xml,
            });
            res.status(security ? 400 : 500).type('application/soap+xml').send(xml);
        }
    }

    /** Pushes a command to a SOAP charger at its advertised address. */
    async sendCommand(session: ChargerSession, action: string, payload: Payload, timeoutMs: number): Promise<Payload> {
        const { identity, protocol, version } = session;
        const endpoint = session.endpoint;
        if (!endpoint) {
            throw new CommandError('Failed', 'The charger has not advertised an address (wsa:From) to send commands to.');
        }
        const messageId = randomUUID();
        const envelope = buildRequestEnvelope({ version, identity, action, to: endpoint, messageId, payload });
        this.messages.record({ identity, protocol, direction: 'out', kind: 'CALL', action, messageId, payload, raw: envelope });

        let res: globalThis.Response;
        let body: string;
        try {
            res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="/${action}"` },
                body: envelope,
                signal: AbortSignal.timeout(timeoutMs),
            });
            body = await res.text();
        } catch (err) {
            const timedOut = (err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError';
            const cause = (err as { cause?: { code?: string } }).cause?.code;
            const message = timedOut
                ? `No response from ${endpoint} within ${timeoutMs} ms`
                : `Could not reach the charger at ${endpoint}: ${cause || (err as Error).message}`;
            this.messages.record({
                identity, protocol, direction: 'in', kind: 'CALLERROR', action, messageId,
                error: { code: timedOut ? 'Timeout' : 'Unreachable', description: message },
            });
            throw new CommandError(timedOut ? 'Timeout' : 'Failed', message);
        }

        const parsed = body ? await parseSoap(body).catch(() => null) : null;
        if (parsed?.fault || !res.ok || !parsed) {
            const description = parsed?.fault
                ? `SOAP fault ${parsed.fault.code}: ${parsed.fault.reason}`
                : `The charger answered HTTP ${res.status} with ${parsed ? 'an unexpected body' : 'a body that is not SOAP'}`;
            this.messages.record({
                identity, protocol, direction: 'in', kind: 'CALLERROR', action, messageId,
                error: { code: parsed?.fault?.code || `HTTP ${res.status}`, description }, raw: body,
            });
            throw new CommandError('Failed', description, parsed?.fault ?? undefined);
        }
        this.messages.record({ identity, protocol, direction: 'in', kind: 'CALLRESULT', action, messageId, payload: parsed.payload, raw: body });
        return parsed.payload;
    }
}
