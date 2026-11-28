/**
 * SOAP 1.2 envelopes for OCPP 1.5 / 1.6 SOAP (OCPP-S), ported from the Phase 0 gateway.
 * Payloads are handled as plain objects with OCPP-J field names; SOAP values arrive as strings.
 */
import { randomUUID } from 'node:crypto';
import { Parser, processors } from 'xml2js';

const SOAP12_NS = 'http://www.w3.org/2003/05/soap-envelope';
const WSA_NS = 'http://www.w3.org/2005/08/addressing';

export type OcppVersion = '1.5' | '1.6';
export type Payload = Record<string, unknown>;

/** OCPP-S namespaces. "cs" = messages handled by the central system (us), "cp" = handled by the charge point. */
export const NAMESPACES: Record<OcppVersion, { cs: string; cp: string }> = {
    '1.5': { cs: 'urn://Ocpp/Cs/2012/06/', cp: 'urn://Ocpp/Cp/2012/06/' },
    '1.6': { cs: 'urn://Ocpp/Cs/2015/10/', cp: 'urn://Ocpp/Cp/2015/10/' },
};

const parser = new Parser({
    explicitArray: false,
    ignoreAttrs: false,
    tagNameProcessors: [processors.stripPrefix],
});

export function escapeXml(s: unknown): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Turns xml2js output into plain JSON-like data:
 *  - namespace declarations and prefixed attributes are dropped;
 *  - an element with only text becomes a string;
 *  - an element with attributes and text becomes { ...attrs, value: text }.
 */
export function simplify(node: unknown): unknown {
    if (node === null || node === undefined) return node;
    if (Array.isArray(node)) return node.map(simplify);
    if (typeof node !== 'object') return node;
    const n = node as Record<string, unknown>;

    const attrs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries((n.$ as Record<string, unknown>) || {})) {
        if (k === 'xmlns' || k.includes(':')) continue;
        attrs[k] = v;
    }
    const childKeys = Object.keys(n).filter(k => k !== '$' && k !== '_');
    const hasText = typeof n._ === 'string';

    if (childKeys.length === 0 && Object.keys(attrs).length === 0) return hasText ? n._ : '';

    const out: Record<string, unknown> = { ...attrs };
    if (hasText) out.value = n._;
    for (const k of childKeys) out[k] = simplify(n[k]);
    return out;
}

/** Case-insensitive property lookup: chargers differ in element casing. */
export function getCI(obj: unknown, name: string): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    const lower = name.toLowerCase();
    const key = Object.keys(obj).find(k => k.toLowerCase() === lower);
    return key === undefined ? undefined : (obj as Record<string, unknown>)[key];
}

function detectVersion(rawXml: string): { version: OcppVersion | null; namespace: string | null } {
    const m = rawXml.match(/urn:\/\/Ocpp\/C[sp]\/(\d{4})\/(\d{2})\/?/i);
    if (!m) return { version: null, namespace: null };
    const version = m[1] === '2012' ? '1.5' : m[1] === '2015' ? '1.6' : null;
    return { version, namespace: m[0] };
}

export interface ParsedSoap {
    version: OcppVersion | null;
    namespace: string | null;
    header: Record<string, unknown>;
    /** Local name of the first element in soap:Body, e.g. "bootNotificationRequest". */
    bodyElement: string | null;
    payload: Payload;
    fault: { code: string; reason: string } | null;
}

export async function parseSoap(rawXml: string): Promise<ParsedSoap> {
    const parsed: unknown = await parser.parseStringPromise(rawXml);
    const envelope = getCI(parsed, 'Envelope') || parsed;
    const header = simplify(getCI(envelope, 'Header') || {}) || {};
    const bodyRaw = (getCI(envelope, 'Body') || {}) as Record<string, unknown>;
    const bodyKeys = typeof bodyRaw === 'object' ? Object.keys(bodyRaw).filter(k => k !== '$') : [];
    const bodyElement = bodyKeys[0] || null;
    const payload = simplify(bodyElement ? bodyRaw[bodyElement] : undefined);
    const { version, namespace } = detectVersion(rawXml);

    let fault: ParsedSoap['fault'] = null;
    if (bodyElement && bodyElement.toLowerCase() === 'fault') {
        const reason = getCI(payload, 'Reason');
        const code = getCI(payload, 'Code');
        const codeValue = (code && (getCI(code, 'Value') || code)) || 'Unknown';
        let reasonValue = (reason && (getCI(reason, 'Text') || reason)) || 'Unknown';
        if (typeof reasonValue === 'object') {
            reasonValue = (reasonValue as { value?: unknown }).value ?? JSON.stringify(reasonValue);
        }
        fault = { code: String(codeValue), reason: String(reasonValue) };
    }

    return {
        version,
        namespace,
        header: typeof header === 'object' ? (header as Record<string, unknown>) : {},
        bodyElement,
        payload: payload && typeof payload === 'object' ? (payload as Payload) : {},
        fault,
    };
}

/** Serialises a plain object to XML child elements, keeping key order (SOAP schema sequences are ordered). */
export function toXml(obj: Payload | undefined): string {
    let out = '';
    for (const [k, v] of Object.entries(obj || {})) {
        if (v === undefined || v === null) continue;
        for (const item of Array.isArray(v) ? v : [v]) out += element(k, item);
    }
    return out;
}

function element(name: string, v: unknown): string {
    if (v instanceof Date) v = v.toISOString();
    if (typeof v === 'object' && v !== null) return `<${name}>${toXml(v as Payload)}</${name}>`;
    return `<${name}>${escapeXml(v)}</${name}>`;
}

/** Response envelope for a request the charger sent us. */
export function buildResponseEnvelope(o: {
    action: string;
    relatesTo?: string;
    to?: string;
    namespace: string;
    responseElement: string;
    payload: Payload;
}): string {
    const toHeader = o.to ? `\n        <wsa:To>${escapeXml(o.to)}</wsa:To>` : '';
    const relates = o.relatesTo ? `\n        <wsa:RelatesTo>${escapeXml(o.relatesTo)}</wsa:RelatesTo>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${SOAP12_NS}" xmlns:wsa="${WSA_NS}">
    <soap:Header>
        <wsa:Action>${escapeXml(o.action)}</wsa:Action>
        <wsa:MessageID>urn:uuid:${randomUUID()}</wsa:MessageID>${relates}${toHeader}
    </soap:Header>
    <soap:Body>
        <${o.responseElement} xmlns="${escapeXml(o.namespace)}">${toXml(o.payload)}</${o.responseElement}>
    </soap:Body>
</soap:Envelope>
`;
}

/** Request envelope for a command we send to the charger. */
export function buildRequestEnvelope(o: {
    version: OcppVersion;
    identity: string;
    action: string;
    to: string;
    messageId: string;
    payload: Payload;
}): string {
    const ns = NAMESPACES[o.version].cp;
    const requestElement = o.action.charAt(0).toLowerCase() + o.action.slice(1) + 'Request';
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${SOAP12_NS}" xmlns:wsa="${WSA_NS}" xmlns:cp="${ns}">
    <soap:Header>
        <cp:chargeBoxIdentity>${escapeXml(o.identity)}</cp:chargeBoxIdentity>
        <wsa:Action>/${o.action}</wsa:Action>
        <wsa:MessageID>urn:uuid:${o.messageId}</wsa:MessageID>
        <wsa:ReplyTo><wsa:Address>http://www.w3.org/2005/08/addressing/anonymous</wsa:Address></wsa:ReplyTo>
        <wsa:To>${escapeXml(o.to)}</wsa:To>
    </soap:Header>
    <soap:Body>
        <${requestElement} xmlns="${ns}">${toXml(o.payload)}</${requestElement}>
    </soap:Body>
</soap:Envelope>
`;
}

export function faultEnvelope(code: 'Sender' | 'Receiver', subcode: string, reason: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${SOAP12_NS}">
    <soap:Body>
        <soap:Fault>
            <soap:Code><soap:Value>soap:${code}</soap:Value><soap:Subcode><soap:Value>${escapeXml(subcode)}</soap:Value></soap:Subcode></soap:Code>
            <soap:Reason><soap:Text xml:lang="en">${escapeXml(reason)}</soap:Text></soap:Reason>
        </soap:Fault>
    </soap:Body>
</soap:Envelope>
`;
}
