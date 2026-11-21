/**
 * OCPP 1.5 / 1.6 SOAP adapter (OCPP-S).
 * Inbound: the charger POSTs SOAP 1.2 envelopes to any path containing "ocpp".
 * Outbound: we POST command envelopes to the address the charger advertised in wsa:From.
 */
const express = require('express');
const { randomUUID } = require('crypto');
const registry = require('../core/registry');
const messageLog = require('../core/messageLog');
const { handleInbound, canonicalAction } = require('../core/handlers');
const { OcppError, CommandError } = require('../util/errors');
const { parseSoap, getCI, escapeXml, buildResponseEnvelope, buildRequestEnvelope, NAMESPACES } = require('../util/xml');
const logger = require('../logger');

const ANONYMOUS = 'http://www.w3.org/2005/08/addressing/anonymous';

function protocolFor(version) {
    return version === '1.5' ? 'ocpp1.5-soap' : 'ocpp1.6-soap';
}

function text(v) {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'object') return v.value !== undefined ? String(v.value) : undefined;
    return String(v);
}

function clientIp(req) {
    const fwd = req.headers['x-forwarded-for'];
    const ip = (fwd ? String(fwd).split(',')[0].trim() : req.socket.remoteAddress) || '';
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function faultEnvelope(code, subcode, reason) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
    <soap:Body>
        <soap:Fault>
            <soap:Code><soap:Value>soap:${code}</soap:Value><soap:Subcode><soap:Value>${escapeXml(subcode)}</soap:Value></soap:Subcode></soap:Code>
            <soap:Reason><soap:Text xml:lang="en">${escapeXml(reason)}</soap:Text></soap:Reason>
        </soap:Fault>
    </soap:Body>
</soap:Envelope>
`;
}

/** "bootNotificationRequest" -> "bootNotificationResponse" (keeps the charger's casing style). */
function responseElementFor(bodyElement) {
    if (/request$/i.test(bodyElement)) {
        const base = bodyElement.slice(0, -7);
        return base + (bodyElement.endsWith('Request') ? 'Response' : 'response');
    }
    return bodyElement + 'Response';
}

function getOrCreateSession(identity, version) {
    let session = registry.get(identity);
    if (!session || !session.protocol.endsWith('soap')) {
        session = registry.set(identity, {
            identity,
            protocol: protocolFor(version),
            version,
            endpoint: null,
            lastSeen: new Date(),
            isConnected: () => true, // HTTP is connectionless; freshness of lastSeen decides
            sendCommand: (action, payload, timeoutMs) => sendSoapCommand(session, action, payload, timeoutMs),
        });
    }
    session.version = version;
    session.protocol = protocolFor(version);
    session.lastSeen = new Date();
    return session;
}

async function sendSoapCommand(session, action, payload, timeoutMs) {
    const { identity, protocol, version } = session;
    if (!session.endpoint) {
        throw new CommandError('Failed',
            'Charger has not advertised a reachable address (wsa:From), so commands cannot be pushed to it');
    }

    const messageId = randomUUID();
    const envelope = buildRequestEnvelope({ version, identity, action, to: session.endpoint, messageId, payload });
    messageLog.record({
        chargerIdentity: identity, protocol, direction: 'out', kind: 'CALL', action, messageId, payload, raw: envelope,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    let body;
    try {
        res = await fetch(session.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': `application/soap+xml; charset=utf-8; action="/${action}"` },
            body: envelope,
            signal: controller.signal,
        });
        body = await res.text();
    } catch (err) {
        const timedOut = err.name === 'AbortError';
        const message = timedOut
            ? `No response from ${session.endpoint} within ${timeoutMs} ms`
            : `Could not reach charger at ${session.endpoint}: ${err.cause?.code || err.message}`;
        messageLog.record({
            chargerIdentity: identity, protocol, direction: 'in', kind: 'CALLERROR', action, messageId,
            error: { code: timedOut ? 'Timeout' : 'Unreachable', description: message },
        });
        throw new CommandError(timedOut ? 'Timeout' : 'Failed', message);
    } finally {
        clearTimeout(timer);
    }

    let parsed = null;
    try {
        if (body) parsed = await parseSoap(body);
    } catch {
        // fall through with parsed = null
    }

    if (parsed?.fault || !res.ok || !parsed) {
        const description = parsed?.fault
            ? `SOAP fault ${parsed.fault.code}: ${parsed.fault.reason}`
            : `Charger answered HTTP ${res.status} with ${parsed ? 'an unexpected body' : 'a body that is not SOAP'}`;
        messageLog.record({
            chargerIdentity: identity, protocol, direction: 'in', kind: 'CALLERROR', action, messageId,
            error: { code: parsed?.fault?.code || `HTTP ${res.status}`, description }, raw: body,
        });
        throw new CommandError('Failed', description, parsed?.fault || undefined);
    }

    messageLog.record({
        chargerIdentity: identity, protocol, direction: 'in', kind: 'CALLRESULT', action, messageId,
        payload: parsed.payload, raw: body,
    });
    return parsed.payload;
}

function createSoapRouter() {
    const router = express.Router();
    const rawBody = express.text({ type: () => true, limit: '2mb' });

    // Some chargers probe the endpoint with GET first; a 404 makes them give up.
    router.get(/ocpp/i, (req, res) => res.status(200).send('OK'));
    router.get('/', (req, res) => res.status(200).send('OCPP SOAP Server'));

    router.post(/ocpp/i, rawBody, async (req, res) => {
        const raw = typeof req.body === 'string' ? req.body : '';
        if (!raw) return res.status(400).send('Empty SOAP request');

        let parsed;
        try {
            parsed = await parseSoap(raw);
        } catch (err) {
            logger.warn(`Unparseable SOAP from ${clientIp(req)} to ${req.url}: ${err.message}`);
            return res.status(400).type('application/soap+xml').send(faultEnvelope('Sender', 'FormationViolation', 'Malformed XML'));
        }
        if (!parsed.bodyElement) {
            return res.status(400).type('application/soap+xml').send(faultEnvelope('Sender', 'FormationViolation', 'No SOAP body content'));
        }

        const header = parsed.header;
        const urlIdentity = decodeURIComponent(req.path.split('/').filter(Boolean).pop() || '');
        const identity = text(getCI(header, 'chargeBoxIdentity')) || urlIdentity || 'Unknown';
        const version = parsed.version || '1.6';
        const namespace = parsed.namespace || NAMESPACES[version].cs;
        const action = canonicalAction(parsed.bodyElement);
        const messageId = text(getCI(header, 'MessageID'));
        const fromAddress = text(getCI(getCI(header, 'From'), 'Address'));
        const endpoint = fromAddress && fromAddress !== ANONYMOUS ? fromAddress : undefined;
        const ip = clientIp(req);

        const session = getOrCreateSession(identity, version);
        if (endpoint) session.endpoint = endpoint;
        const protocol = session.protocol;

        messageLog.record({
            chargerIdentity: identity, protocol, direction: 'in', kind: 'CALL', action, messageId,
            payload: parsed.payload, raw,
        });

        const responseElement = responseElementFor(parsed.bodyElement);
        const incomingWsaAction = text(getCI(header, 'Action'));
        const wsaAction = incomingWsaAction
            ? (incomingWsaAction.endsWith('Response') ? incomingWsaAction : incomingWsaAction + 'Response')
            : `/${responseElement}`;

        const send = (payload, kind = 'CALLRESULT', error) => {
            const xml = buildResponseEnvelope({
                action: wsaAction, relatesTo: messageId, to: fromAddress, namespace, responseElement, payload,
            });
            messageLog.record({
                chargerIdentity: identity, protocol, direction: 'out', kind, action, messageId, payload, error, raw: xml,
            });
            res.set('Content-Type', 'application/soap+xml; charset=utf-8').send(xml);
        };

        try {
            const result = await handleInbound({ identity, protocol, version, ip, endpoint }, action, parsed.payload);
            send(result);
        } catch (err) {
            if (err instanceof OcppError && err.code === 'NotImplemented') {
                // Lenient: answer with an empty response so the charger does not keep retrying.
                logger.warn(`[${identity}] Unhandled SOAP action ${action}; sent empty response`);
                send({}, 'CALLRESULT', { code: 'NotImplemented', description: err.message });
                return;
            }
            const isSecurity = err instanceof OcppError && err.code === 'SecurityError';
            if (!isSecurity) logger.error(`[${identity}] Error handling SOAP ${action}:`, err);
            const xml = faultEnvelope(isSecurity ? 'Sender' : 'Receiver', isSecurity ? 'SecurityError' : 'InternalError',
                isSecurity ? err.message : 'Internal server error');
            messageLog.record({
                chargerIdentity: identity, protocol, direction: 'out', kind: 'CALLERROR', action, messageId,
                error: { code: isSecurity ? 'SecurityError' : 'InternalError', description: err.message }, raw: xml,
            });
            res.status(isSecurity ? 400 : 500).type('application/soap+xml').send(xml);
        }
    });

    return router;
}

module.exports = { createSoapRouter, responseElementFor };
