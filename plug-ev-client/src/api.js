import config from './config';

const SOAP_URL = config.soapApiUrl || 'http://localhost:3003';
const JSON_URL = config.jsonApiUrl || 'http://localhost:3002';

export async function fetchAllChargers() {
  let allChargers = [];

  // Fetch from SOAP backend
  try {
    const responseSoap = await fetch(`${SOAP_URL}/api/chargers`);
    if (responseSoap.ok) {
      const soapData = await responseSoap.json();
      allChargers = [...allChargers, ...soapData.map(c => ({ ...c, backend: 'SOAP' }))];
    }
  } catch (error) {
    console.log('SOAP backend is unreachable:', error);
  }

  // Fetch from JSON (WebSocket) backend
  try {
    const responseJson = await fetch(`${JSON_URL}/api/chargers`);
    if (responseJson.ok) {
      const jsonData = await responseJson.json();
      allChargers = [...allChargers, ...jsonData.map(c => ({ ...c, backend: 'JSON' }))];
    }
  } catch (error) {
    console.log('JSON backend is unreachable:', error);
  }

  return allChargers;
}

export async function sendRemoteCommand(identity, backend, command, payload = {}) {
  const baseUrl = backend === 'SOAP' ? SOAP_URL : JSON_URL;
  const url = `${baseUrl}/api/chargers/${identity}/${command}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to send ${command} command: status ${response.status}`);
  }

  return await response.json();
}

export async function registerCharger(identity, name, district, coordinates = null) {
  const url = `${SOAP_URL}/api/chargers/register`;

  const payload = { identity, name, district };
  if (coordinates) {
    payload.coordinates = coordinates;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to register charger: status ${response.status}`);
  }

  return await response.json();
}
