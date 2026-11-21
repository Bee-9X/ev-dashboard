import config from './config';

const API_URL = config.apiUrl;

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers['x-api-key'] = config.apiKey;

  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data;
}

export async function fetchAllChargers() {
  try {
    return await request('GET', '/chargers');
  } catch (error) {
    console.log('Backend is unreachable:', error);
    return [];
  }
}

/** Update editable charger fields: name, district, coordinates, endpointOverride ('' clears it). */
export function updateCharger(identity, fields) {
  return request('PATCH', `/chargers/${encodeURIComponent(identity)}`, fields);
}

export function fetchCharger(identity) {
  return request('GET', `/chargers/${encodeURIComponent(identity)}`);
}

/**
 * Send a management command (RemoteStartTransaction, Reset, ...).
 * Resolves with the stored command: { commandId, action, state, response, error, ... }.
 * state is the real outcome: Accepted / Rejected / Failed / Timeout / Offline / Unsupported / ...
 */
export function sendCommand(identity, action, payload = {}) {
  return request('POST', `/chargers/${encodeURIComponent(identity)}/commands/${action}`, payload);
}

/** Older start/stop shortcut used by the dashboard table. `command` is 'start' or 'stop'. */
export function sendRemoteCommand(identity, backend, command, payload = {}) {
  return request('POST', `/chargers/${encodeURIComponent(identity)}/${command}`, payload);
}

export function fetchTransactions(identity, limit = 20) {
  return request('GET', `/chargers/${encodeURIComponent(identity)}/transactions?limit=${limit}`);
}

export function fetchMessages(identity, limit = 100) {
  return request('GET', `/chargers/${encodeURIComponent(identity)}/messages?limit=${limit}`);
}

export function fetchCommands(identity, limit = 20) {
  return request('GET', `/chargers/${encodeURIComponent(identity)}/commands?limit=${limit}`);
}

export function fetchReport(identity) {
  return request('GET', `/chargers/${encodeURIComponent(identity)}/report`);
}

export async function registerCharger(identity, name, district, ocppVersion = '1.5 SOAP', coordinates = null) {
  const payload = { identity, name, district, ocppVersion };
  if (coordinates) payload.coordinates = coordinates;
  return request('POST', '/chargers/register', payload);
}
