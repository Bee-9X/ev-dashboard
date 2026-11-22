/**
 * Link to the PLUG EV platform (plugev-api): forwards what chargers do as canonical events (ADR-004/007),
 * so the admin portal shows live status. Off unless PLATFORM_API_URL and PLATFORM_GATEWAY_KEY are set.
 *
 * OCPP handling never waits for the platform: events go into a bounded in-memory queue that is sent in
 * batches, and retried with back-off while the platform is unreachable. The platform applies events in an
 * order-safe way, so a retried batch does no harm.
 */
const { randomUUID } = require('crypto');
const config = require('../config');
const logger = require('../logger');

const MAX_QUEUE = 5000;
const BATCH = 100;
const FLUSH_DELAY_MS = 500;
const MAX_BACKOFF_MS = 60000;
// "seen" is sent at most this often per charger; connects, boots and statuses always go at once
const SEEN_EVERY_MS = 20000;

const queue = [];
const lastSeenSent = new Map();
const warnedUnknown = new Set();
let timer = null;
let flushing = false;
let failures = 0;
let dropped = 0;

function enabled() {
    return Boolean(config.platformApiUrl && config.platformGatewayKey);
}

function emit(type, identity, data = {}) {
    if (!enabled() || !identity) return;
    if (queue.length >= MAX_QUEUE) {
        queue.shift();
        if (dropped++ % 500 === 0) logger.warn(`Platform link: queue full, dropping oldest events (${dropped} so far)`);
    }
    const event = { id: randomUUID(), type, identity, at: new Date().toISOString() };
    for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null && v !== '') event[k] = v;
    queue.push(event);
    schedule(FLUSH_DELAY_MS);
}

/** Any message from a charger. Throttled; a status or boot already counts as seen on the platform. */
function seen(identity, protocol) {
    const now = Date.now();
    if (now - (lastSeenSent.get(identity) || 0) < SEEN_EVERY_MS) return;
    lastSeenSent.set(identity, now);
    emit('seen', identity, { protocol });
}

function schedule(ms) {
    if (timer || flushing) return;
    timer = setTimeout(() => {
        timer = null;
        flush().catch(err => logger.error(`Platform link flush failed: ${err.message}`));
    }, ms);
    timer.unref?.();
}

async function flush() {
    if (flushing || queue.length === 0 || !enabled()) return;
    flushing = true;
    const batch = queue.slice(0, BATCH);
    let retryIn = 0;
    try {
        const res = await fetch(`${config.platformApiUrl.replace(/\/+$/, '')}/gateway/events`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-gateway-key': config.platformGatewayKey },
            body: JSON.stringify({ events: batch }),
            signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
            queue.splice(0, batch.length);
            if (failures > 0) logger.info('Platform link: reachable again');
            failures = 0;
            const body = await res.json().catch(() => ({}));
            for (const id of body.unknownIdentities || []) {
                if (warnedUnknown.has(id)) continue;
                warnedUnknown.add(id);
                logger.warn(`Platform link: charger "${id}" is not registered in the admin portal; its status is not shown there`);
            }
        } else if (res.status === 400 || res.status === 413) {
            // the platform will never accept this batch; keep the link moving
            queue.splice(0, batch.length);
            logger.error(`Platform link: platform refused ${batch.length} events (${res.status}): ${(await res.text()).slice(0, 300)}`);
        } else {
            retryIn = backoff(`HTTP ${res.status}${res.status === 401 ? ' (check PLATFORM_GATEWAY_KEY)' : ''}`);
        }
    } catch (err) {
        retryIn = backoff(err.name === 'TimeoutError' ? 'timeout' : err.message);
    } finally {
        flushing = false;
    }
    if (queue.length) schedule(retryIn || 0);
}

function backoff(reason) {
    failures++;
    if (failures === 1 || failures % 20 === 0) {
        logger.warn(`Platform link: cannot reach ${config.platformApiUrl} (${reason}); ${queue.length} events waiting`);
    }
    return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures - 1, 6));
}

/** Sends what is queued (used on shutdown and in tests). */
async function drain() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    await flush();
}

function stats() {
    return { enabled: enabled(), queued: queue.length, failures, dropped };
}

/** Tests only. */
function reset() {
    queue.length = 0;
    lastSeenSent.clear();
    warnedUnknown.clear();
    if (timer) clearTimeout(timer);
    timer = null;
    failures = 0;
    dropped = 0;
}

module.exports = { enabled, emit, seen, flush, drain, stats, reset };
