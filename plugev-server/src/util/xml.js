const xml2js = require('xml2js');
const { randomUUID } = require('crypto');

const SOAP12_NS = 'http://www.w3.org/2003/05/soap-envelope';
const WSA_NS = 'http://www.w3.org/2005/08/addressing';

// OCPP-S namespaces. "Cs" = messages handled by the central system (us), "Cp" = handled by the charge point.
const NAMESPACES = {
    '1.5': { cs: 'urn://Ocpp/Cs/2012/06/', cp: 'urn://Ocpp/Cp/2012/06/' },
    '1.6': { cs: 'urn://Ocpp/Cs/2015/10/', cp: 'urn://Ocpp/Cp/2015/10/' },
};

const parser = new xml2js.Parser({
    explicitArray: false,
    ignoreAttrs: false,
    tagNameProcessors: [xml2js.processors.stripPrefix],
});

function escapeXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Turn xml2js output into plain JSON-like data:
 *  - namespace declarations and prefixed attributes are dropped
 *  - an element with only text becomes a string
 *  - an element with attributes and text becomes { ...attrs, value: text }
 */
function simplify(node) {
    if (node === null || node === undefined) return node;
    if (Array.isArray(node)) return node.map(simplify);
    if (typeof node !== 'object') return node;

    const attrs = {};
    for (const [k, v] of Object.entries(node.$ || {})) {
        if (k === 'xmlns' || k.includes(':')) continue;
        attrs[k] = v;
    }
    const childKeys = Object.keys(node).filter(k => k !== '$' && k !== '_');
    const hasText = typeof node._ === 'string';

    if (childKeys.length === 0 && Object.keys(attrs).length === 0) return hasText ? node._ : '';

    const out = { ...attrs };
    if (hasText) out.value = node._;
    for (const k of childKeys) out[k] = simplify(node[k]);
    return out;
}

function findKey(obj, name) {
    if (!obj || typeof obj !== 'object') return undefined;
    const lower = name.toLowerCase();
    return Object.keys(obj).find(k => k.toLowerCase() === lower);
}

function getCI(obj, name) {
    const k = findKey(obj, name);
    return k === undefined ? undefined : obj[k];
}

function detectVersion(rawXml) {
    const m = rawXml.match(/urn:\/\/Ocpp\/C[sp]\/(\d{4})\/(\d{2})\/?/i);
    if (!m) return { version: null, namespace: null };
    const version = m[1] === '2012' ? '1.5' : m[1] === '2015' ? '1.6' : null;
    return { version, namespace: m[0] };
}

/**
 * Parse a SOAP envelope.
 * Returns { version, namespace, header, bodyElement, payload, fault }.
 * bodyElement is the local name of the first element in soap:Body (e.g. "bootNotificationRequest").
 */
async function parseSoap(rawXml) {
    const parsed = await parser.parseStringPromise(rawXml);
    const envelope = getCI(parsed, 'Envelope') || parsed;
    const header = simplify(getCI(envelope, 'Header') || {}) || {};
    const bodyRaw = getCI(envelope, 'Body') || {};
    const bodyKeys = Object.keys(bodyRaw).filter(k => k !== '$');
    const bodyElement = bodyKeys[0] || null;
    const payloadRaw = bodyElement ? bodyRaw[bodyElement] : undefined;
    const payload = simplify(payloadRaw);
    const { version, namespace } = detectVersion(rawXml);

    let fault = null;
    if (bodyElement && bodyElement.toLowerCase() === 'fault') {
        const reason = getCI(payload, 'Reason');
        const code = getCI(payload, 'Code');
        fault = {
            code: (code && (getCI(code, 'Value') || code)) || 'Unknown',
            reason: (reason && (getCI(reason, 'Text') || reason)) || 'Unknown',
        };
        if (typeof fault.reason === 'object') fault.reason = fault.reason.value || JSON.stringify(fault.reason);
    }

    return {
        version,
        namespace,
        header: typeof header === 'object' ? header : {},
        bodyElement,
        payload: payload && typeof payload === 'object' ? payload : {},
        fault,
    };
}

/** Serialise a plain object to XML child elements, preserving key order (schema sequence order matters). */
function toXml(obj) {
    let out = '';
    for (const [k, v] of Object.entries(obj || {})) {
        if (v === undefined || v === null) continue;
        const items = Array.isArray(v) ? v : [v];
        for (const item of items) out += element(k, item);
    }
    return out;
}

function element(name, v) {
    if (v instanceof Date) v = v.toISOString();
    if (typeof v === 'object') return `<${name}>${toXml(v)}</${name}>`;
    return `<${name}>${escapeXml(v)}</${name}>`;
}

/** Response envelope for a request the charger sent us. */
function buildResponseEnvelope({ action, relatesTo, to, namespace, responseElement, payload }) {
    const toHeader = to ? `\n        <wsa:To>${escapeXml(to)}</wsa:To>` : '';
    const relates = relatesTo ? `\n        <wsa:RelatesTo>${escapeXml(relatesTo)}</wsa:RelatesTo>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${SOAP12_NS}" xmlns:wsa="${WSA_NS}">
    <soap:Header>
        <wsa:Action>${escapeXml(action)}</wsa:Action>
        <wsa:MessageID>urn:uuid:${randomUUID()}</wsa:MessageID>${relates}${toHeader}
    </soap:Header>
    <soap:Body>
        <${responseElement} xmlns="${escapeXml(namespace)}">${toXml(payload)}</${responseElement}>
    </soap:Body>
</soap:Envelope>
`;
}

/** Request envelope for a command we send to the charger. */
function buildRequestEnvelope({ version, identity, action, to, messageId, payload }) {
    const ns = NAMESPACES[version].cp;
    const requestElement = action.charAt(0).toLowerCase() + action.slice(1) + 'Request';
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${SOAP12_NS}" xmlns:wsa="${WSA_NS}" xmlns:cp="${ns}">
    <soap:Header>
        <cp:chargeBoxIdentity>${escapeXml(identity)}</cp:chargeBoxIdentity>
        <wsa:Action>/${action}</wsa:Action>
        <wsa:MessageID>urn:uuid:${messageId}</wsa:MessageID>
        <wsa:ReplyTo><wsa:Address>http://www.w3.org/2005/08/addressing/anonymous</wsa:Address></wsa:ReplyTo>
        <wsa:To>${escapeXml(to)}</wsa:To>
    </soap:Header>
    <soap:Body>
        <${requestElement} xmlns="${ns}">${toXml(payload)}</${requestElement}>
    </soap:Body>
</soap:Envelope>
`;
}

module.exports = {
    NAMESPACES,
    escapeXml,
    simplify,
    getCI,
    parseSoap,
    toXml,
    buildResponseEnvelope,
    buildRequestEnvelope,
};
