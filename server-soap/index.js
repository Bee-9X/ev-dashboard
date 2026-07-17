const express = require('express');
const cors = require('cors');
const xml2js = require('xml2js');
const { v4: uuidv4 } = require('uuid');
const net = require('net');
const http = require('http');
const mongoose = require('mongoose');
const Charger = require('./models/Charger');

const app = express();
const PORT = 3003; // Using port 3003 to not conflict with WebSocket server on 3002

app.use(cors());

// Middleware to parse JSON for our standard APIs
app.use(express.json());

// Middleware to parse raw XML in the body for OCPP requests
// We ensure this only runs if it's an OCPP path or if there isn't JSON already
app.use(express.text({ type: '*/*' }));

// Log EVERY incoming request - helps debug which path the charger is using
app.use((req, res, next) => {
    console.log(`\n>>> INCOMING ${req.method} ${req.url}`);
    console.log(`    Headers:`, req.headers);

    // Silence noisy logs
    // if (req.method === 'GET' && req.url.includes('/api/chargers')) return next();
    // if (req.method === 'POST' && req.url.includes('/ocpp') && req.body && typeof req.body === 'string' && req.body.includes('BootNotification')) return next();

    next();
});

// Store connected chargers
// Map<chargerIdentity, { status: string, lastHeartbeat: Date, info: object }>
const chargers = new Map();

// Parser configuration
const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: false });

// --- HTTP API for Frontend ---

app.get('/api/chargers', async (req, res) => {
    try {
        // Fetch all registered chargers from DB
        const dbChargers = await Charger.find({});
        
        // Merge with live SOAP status from memory Map
        const result = dbChargers.map(dbCharger => {
            const liveData = chargers.get(dbCharger.identity);
            return {
                identity: dbCharger.identity,
                name: dbCharger.name,
                district: dbCharger.district,
                coordinates: dbCharger.coordinates,
                status: liveData ? (liveData.status || 'Connected') : 'Offline',
                lastHeartbeat: liveData ? liveData.lastHeartbeat : null,
                info: liveData ? liveData.info : {}
            };
        });

        // Also append any live chargers that are NOT yet registered in the DB
        for (const [id, data] of chargers.entries()) {
            if (!result.find(c => c.identity === id)) {
                result.push({
                    identity: id,
                    name: 'Unregistered Charger',
                    district: 'Unknown',
                    coordinates: null,
                    status: data.status || 'Connected',
                    lastHeartbeat: data.lastHeartbeat,
                    info: data.info
                });
            }
        }

        res.json(result);
    } catch (err) {
        console.error('Error fetching chargers:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/chargers/register', async (req, res) => {
    try {
        const { identity, name, district, coordinates } = req.body;
        
        if (!identity || !name || !district) {
            return res.status(400).json({ error: 'identity, name, and district are required.' });
        }

        const newCharger = new Charger({ identity, name, district, coordinates });
        await newCharger.save();
        
        res.status(201).json({ message: 'Charger registered successfully', charger: newCharger });
    } catch (err) {
        console.error('Error registering charger:', err);
        if (err.code === 11000) {
            return res.status(409).json({ error: 'Charger with this identity already exists.' });
        }
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/chargers/:id/start', async (req, res) => {
    const { id } = req.params;
    const charger = chargers.get(id);

    if (!charger) {
        return res.status(404).json({ error: 'Charger not found' });
    }

    const idTag = req.body?.idTag || 'CLIENT_USER';
    const targetUrl = charger.endpoint || `http://${charger.ip}:80/ocpp`;
    const namespace = charger.isOcpp15 ? 'urn://Ocpp/Cp/2012/06/' : 'urn://Ocpp/Cp/2015/10/';

    console.log(`[SOAP API] Sending RemoteStartTransaction to ${id} at ${targetUrl}...`);

    const action = 'RemoteStartTransaction';
    const messageId = uuidv4();
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:ns="${namespace}">
    <soap:Header>
        <wsa:Action>/${action}</wsa:Action>
        <wsa:MessageID>urn:uuid:${messageId}</wsa:MessageID>
        <wsa:To>${targetUrl}</wsa:To>
    </soap:Header>
    <soap:Body>
        <ns:remoteStartTransactionRequest>
            <connectorId>1</connectorId>
            <idTag>${idTag}</idTag>
        </ns:remoteStartTransactionRequest>
    </soap:Body>
</soap:Envelope>`;

    let success = false;
    let simulated = false;
    let responseMsg = '';

    try {
        if (!targetUrl.includes('http')) {
            throw new Error('No valid charger endpoint URL recorded');
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const fetchResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/soap+xml; charset=utf-8',
            },
            body: soapEnvelope,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (fetchResponse.ok) {
            success = true;
            responseMsg = 'RemoteStartTransaction successfully sent to charger.';
        } else {
            throw new Error(`Charger returned status ${fetchResponse.status}`);
        }
    } catch (err) {
        console.log(`[SOAP API] Failed to reach charger at ${charger.ip}: ${err.message}. Simulating instead.`);
        success = true;
        simulated = true;
        responseMsg = `RemoteStartTransaction simulated (device unreachable: ${err.message})`;
        charger.status = 'Charging';
    }

    res.json({ success, simulated, message: responseMsg });
});

app.post('/api/chargers/:id/stop', async (req, res) => {
    const { id } = req.params;
    const charger = chargers.get(id);

    if (!charger) {
        return res.status(404).json({ error: 'Charger not found' });
    }

    const transactionId = req.body.transactionId || 1;
    const targetUrl = charger.endpoint || `http://${charger.ip}:80/ocpp`;
    const namespace = charger.isOcpp15 ? 'urn://Ocpp/Cp/2012/06/' : 'urn://Ocpp/Cp/2015/10/';

    console.log(`[SOAP API] Sending RemoteStopTransaction to ${id} at ${targetUrl}...`);

    const action = 'RemoteStopTransaction';
    const messageId = uuidv4();
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing" xmlns:ns="${namespace}">
    <soap:Header>
        <wsa:Action>/${action}</wsa:Action>
        <wsa:MessageID>urn:uuid:${messageId}</wsa:MessageID>
        <wsa:To>${targetUrl}</wsa:To>
    </soap:Header>
    <soap:Body>
        <ns:remoteStopTransactionRequest>
            <transactionId>${transactionId}</transactionId>
        </ns:remoteStopTransactionRequest>
    </soap:Body>
</soap:Envelope>`;

    let success = false;
    let simulated = false;
    let responseMsg = '';

    try {
        if (!targetUrl.includes('http')) {
            throw new Error('No valid charger endpoint URL recorded');
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const fetchResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/soap+xml; charset=utf-8',
            },
            body: soapEnvelope,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (fetchResponse.ok) {
            success = true;
            responseMsg = 'RemoteStopTransaction successfully sent to charger.';
        } else {
            throw new Error(`Charger returned status ${fetchResponse.status}`);
        }
    } catch (err) {
        console.log(`[SOAP API] Failed to reach charger at ${charger.ip}: ${err.message}. Simulating instead.`);
        success = true;
        simulated = true;
        responseMsg = `RemoteStopTransaction simulated (device unreachable: ${err.message})`;
        charger.status = 'Available';
    }

    res.json({ success, simulated, message: responseMsg });
});

// --- OCPP 1.6S Server Route ---
// Some chargers send a GET to the endpoint as a discovery/ping first.
// If we return 404, the charger gives up. Return 200 to let it proceed.
app.get(/.*ocpp.*/, (req, res) => {
    console.log(`>>> Charger discovery GET to ${req.url} - responding 200`);
    res.status(200).send('OK');
});

// Handle all other GETs (root, etc.) gracefully
app.get('/', (req, res) => res.status(200).send('OCPP SOAP Server'));

// Accepts /ocpp, /ocpp/ChargePointId, or /webServices/ocpp/ChargePointId
app.post(/.*ocpp.*/, async (req, res) => {
    try {
        if (!req.body || typeof req.body !== 'string' || req.body.length === 0) {
           return res.status(400).send('Empty SOAP request');
        }

        const result = await parser.parseStringPromise(req.body);
        
        // Extract SOAP Envelope
        const envelope = getObjectByCaseInsensitiveKey(result, 'Envelope') || result;
        const header = getObjectByCaseInsensitiveKey(envelope, 'Header') || {};
        const body = getObjectByCaseInsensitiveKey(envelope, 'Body') || {};
        // Find the identity:
        // 1. Try chargeBoxIdentity in SOAP Header (standard OCPP-S)
        // 2. Fall back to URL path last segment (e.g. /ocpp/c1 → 'c1')
        const urlPathIdentity = req.url.split('/').filter(Boolean).pop();
        let identity = extractIdentityFromHeader(header) || urlPathIdentity || 'Unknown';
        
        // Find the action element
        const bodyKeys = Object.keys(body).filter(k => k !== '$'); // Exclude attributes
        if (bodyKeys.length === 0) {
            return res.status(400).send('No SOAP body content');
        }
        
        const actionTag = bodyKeys[0]; // e.g., 'BootNotification' or 'ns:BootNotification'
        const actionNameParts = actionTag.split(':');
        const action = actionNameParts[actionNameParts.length - 1]; // e.g., 'BootNotification'
        
        const payload = body[actionTag];
        
        // Skip logging BootNotification to avoid terminal clutter
        // if (!action.toLowerCase().includes('bootnotification')) {
            console.log('--- RAW XML ---');
            console.log(req.body);
            console.log('---------------');
            console.log('--- PARSED HEADER ---');
            console.log(JSON.stringify(header, null, 2));
            console.log('---------------------');
            console.log(`[${identity}] Received action: ${action}`);
            console.log(`[${identity}] Payload:`, JSON.stringify(payload, null, 2));
        // }

        // Update basic charger tracking
        const ipRaw = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        // Clean up IPv6 mapped IPv4 address representation
        const ip = ipRaw && ipRaw.startsWith('::ffff:') ? ipRaw.substring(7) : ipRaw;
        
        if (!chargers.has(identity)) {
            chargers.set(identity, { status: 'Connected', lastHeartbeat: new Date(), ip: ip, info: {} });
        } else {
            const existing = chargers.get(identity);
            existing.lastHeartbeat = new Date();
            existing.ip = ip;
        }
        const charger = chargers.get(identity);

        let responseXml = '';
        const messageIdObj = getObjectByCaseInsensitiveKey(header, 'MessageID');
        let messageId = messageIdObj ? (typeof messageIdObj === 'object' ? (messageIdObj._ || messageIdObj) : messageIdObj) : uuidv4();
        // Remove 'urn:uuid:' prefix if it exists so we don't prepend it twice in RelatesTo
        if (typeof messageId === 'string' && messageId.startsWith('urn:uuid:')) {
            messageId = messageId.substring(9);
        }

        let wsaToHeader = '';
        const fromObj = getObjectByCaseInsensitiveKey(header, 'From');
        if (fromObj) {
            const addressObj = getObjectByCaseInsensitiveKey(fromObj, 'Address');
            const address = addressObj ? (typeof addressObj === 'object' ? (addressObj._ || addressObj) : addressObj) : '';
            if (address && typeof address === 'string') {
                wsaToHeader = `\n        <wsa:To>${address}</wsa:To>`;
            }
        }
        
        // Normalize action name (strip "Request" suffix and convert to lower case for routing)
        const baseAction = action.replace(/request$/i, '').toLowerCase();
        
        // Determine response tag name matching request action name casing/suffix
        let responseTag = '';
        if (action.toLowerCase().endsWith('request')) {
            const base = action.slice(0, -7);
            const endsWithCapitalRequest = action.endsWith('Request');
            responseTag = base + (endsWithCapitalRequest ? 'Response' : 'response');
        } else {
            responseTag = action + 'Response';
        }
        
        // Parse the namespace from the incoming XML envelope (moved up)
        const incomingNamespace = req.body.match(/xmlns:ns="([^"]+)"/)?.[1] || req.body.match(/xmlns="([^"]+)"/)?.[1] || 'urn://Ocpp/Cs/2015/10/';
        const isOcpp15 = incomingNamespace.includes('2012/06');
        
        charger.isOcpp15 = isOcpp15;
        const fromObjForEndpoint = getObjectByCaseInsensitiveKey(header, 'From');
        if (fromObjForEndpoint) {
            const addressObj = getObjectByCaseInsensitiveKey(fromObjForEndpoint, 'Address');
            const address = addressObj ? (typeof addressObj === 'object' ? (addressObj._ || addressObj) : addressObj) : '';
            if (address && typeof address === 'string') {
                charger.endpoint = address;
            }
        }

        switch (baseAction) {
            case 'bootnotification':
                const vendorObj = getObjectByCaseInsensitiveKey(payload, 'chargePointVendor') || 'Unknown';
                const modelObj = getObjectByCaseInsensitiveKey(payload, 'chargePointModel') || 'Unknown';
                const serialObj = getObjectByCaseInsensitiveKey(payload, 'chargeBoxSerialNumber') || 'Unknown';
                
                charger.info = {
                    chargePointVendor: typeof vendorObj === 'object' ? vendorObj._ || vendorObj : vendorObj,
                    chargePointModel: typeof modelObj === 'object' ? modelObj._ || modelObj : modelObj,
                    chargeBoxSerialNumber: typeof serialObj === 'object' ? serialObj._ || serialObj : serialObj,
                };
                
                if (isOcpp15) {
                    responseXml = `
                        <${responseTag} xmlns="urn://Ocpp/Cp/2015/10/">
                            <status>Accepted</status>
                            <currentTime>${new Date().toISOString()}</currentTime>
                            <heartbeatInterval>30</heartbeatInterval>
                        </${responseTag}>
                    `;
                } else {
                    responseXml = `
                        <${responseTag} xmlns="urn://Ocpp/Cp/2015/10/">
                            <currentTime>${new Date().toISOString()}</currentTime>
                            <interval>30</interval>
                            <status>Accepted</status>
                        </${responseTag}>
                    `;
                }
                break;
                
            case 'heartbeat':
                charger.lastHeartbeat = new Date();
                charger.status = 'Available';
                responseXml = `
                    <${responseTag} xmlns="urn://Ocpp/Cp/2015/10/">
                        <currentTime>${new Date().toISOString()}</currentTime>
                    </${responseTag}>
                `;
                break;
                
            case 'statusnotification':
                const rawStatus = getObjectByCaseInsensitiveKey(payload, 'status') || 'Available';
                charger.status = typeof rawStatus === 'object' ? rawStatus._ || rawStatus : rawStatus;
                responseXml = `<${responseTag} xmlns="urn://Ocpp/Cp/2015/10/"></${responseTag}>`;
                break;
                
            case 'authorize':
                responseXml = `
                    <${responseTag} xmlns="urn://Ocpp/Cp/2015/10/">
                        <idTagInfo>
                            <status>Accepted</status>
                        </idTagInfo>
                    </${responseTag}>
                `;
                break;
                
            case 'starttransaction':
                responseXml = `
                    <${responseTag} xmlns="urn://Ocpp/Cp/2015/10/">
                        <transactionId>1</transactionId>
                        <idTagInfo>
                            <status>Accepted</status>
                        </idTagInfo>
                    </${responseTag}>
                `;
                break;
                
            case 'stoptransaction':
                responseXml = `
                    <${responseTag} xmlns="urn://Ocpp/Cp/2015/10/">
                        <idTagInfo>
                            <status>Accepted</status>
                        </idTagInfo>
                    </${responseTag}>
                `;
                break;
                
            default:
                console.log(`[${identity}] Warning: Unhandled Action ${action}`);
                responseXml = `<${responseTag} xmlns="urn://Ocpp/Cp/2015/10/"></${responseTag}>`;
                break;
        }

        // (namespace parsing moved up)

        // Get the Action from the header to construct response wsa:Action with correct casing
        const headerActionRaw = getObjectByCaseInsensitiveKey(header, 'Action');
        const incomingAction = typeof headerActionRaw === 'object' ? (headerActionRaw._ || headerActionRaw) : headerActionRaw;
        
        let responseWsaAction = '';
        if (typeof incomingAction === 'string' && incomingAction) {
            responseWsaAction = incomingAction.endsWith('Response') ? incomingAction : incomingAction + 'Response';
        } else {
            responseWsaAction = `/${responseTag}`;
        }

        // Construct final SOAP Envelope response
        const finalXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <soap:Header>
        <wsa:Action>${responseWsaAction}</wsa:Action>
        <wsa:MessageID>urn:uuid:${uuidv4()}</wsa:MessageID>
        <wsa:RelatesTo>urn:uuid:${typeof messageId === 'object' ? messageId._ || '' : messageId}</wsa:RelatesTo>${wsaToHeader}
    </soap:Header>
    <soap:Body>
        ${responseXml.trim().replace(/urn:\/\/Ocpp\/Cp\/2015\/10\//g, incomingNamespace)}
    </soap:Body>
</soap:Envelope>
`;
        console.log(`[${identity}] Sending Response:\n`, finalXml);
        res.set('Content-Type', 'application/soap+xml; charset=utf-8');
        res.send(finalXml);

    } catch (e) {
        console.error(`Error parsing XML: ${e.message}`);
        res.status(500).send('Internal Server Error');
    }
});

// Helper to reliably find namespaced elements like soap:Envelope
function getObjectByCaseInsensitiveKey(obj, searchKey) {
    if (!obj || typeof obj !== 'object') return null;
    const keys = Object.keys(obj);
    const matchedKey = keys.find(k => k.toLowerCase().endsWith(searchKey.toLowerCase()));
    return matchedKey ? obj[matchedKey] : null;
}

// Extract ChargeBoxIdentity from soap:Header
function extractIdentityFromHeader(headerObj) {
    if (!headerObj || typeof headerObj !== 'object') return null;
    
    // Look for chargeBoxIdentity which is standard in OCPP 1.6S headers
    const identityKey = Object.keys(headerObj).find(k => k.toLowerCase().includes('chargeboxidentity'));
    if (identityKey) {
        const val = headerObj[identityKey];
        return typeof val === 'object' ? val._ || val : val;
    }
    return null;
}

// Catch-all: log any POST that didn't match the /ocpp/ route
// Express 5 requires regex instead of '*' for wildcards
app.post(/.*/, (req, res) => {
    console.log(`\n!!! UNMATCHED POST to: ${req.url}`);
    console.log(`    Body preview: ${String(req.body).substring(0, 200)}`);
    // Return 200 to prevent the charger from giving up
    res.status(200).send('OK');
});

// --- Hybrid Server Setup ---
// We use a single server to handle both HTTP and potentially log raw TCP issues
const server = http.createServer(app);

server.on('connection', (socket) => {
    // This logs every time a device physically connects to the port
    console.log(`[TCP] New connection from ${socket.remoteAddress}`);
    
    socket.on('error', (err) => {
        if (err.code !== 'ECONNRESET') {
            console.error('[TCP Error]', err.message);
        }
    });
});

mongoose.connect('mongodb+srv://nipunyesh_db_user:qdlNLzjgQvhij71W@clusterev.gn0kxjt.mongodb.net/?appName=ClusterEV')
    .then(() => console.log('Connected to MongoDB via Mongoose'))
    .catch(err => console.error('MongoDB connection error:', err));

server.listen(PORT, () => {
    console.log(`SOAP Server (HTTP + TCP Debug) running on port ${PORT}`);
    console.log(`OCPP URL should be: http://wen-conductorial-unmellifluously.ngrok-free.dev/ocpp/c1`);
});
