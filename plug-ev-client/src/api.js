import config from './config';

const SOAP_URL = config.soapApiUrl || 'http://localhost:3003';
// JSON_URL is no longer needed since backend is unified on port 3003

export async function fetchAllChargers() {
  let allChargers = [];

  // Fetch from unified backend
  try {
    const response = await fetch(`${SOAP_URL}/api/chargers`);
    if (response.ok) {
      const data = await response.json();
      // The backend now returns the ocppVersion which indicates JSON or SOAP
      allChargers = data.map(c => ({ 
          ...c, 
          backend: c.ocppVersion === '1.6 JSON' ? 'JSON' : 'SOAP' 
      }));
    }
  } catch (error) {
    console.log('Backend is unreachable:', error);
  }

  return allChargers;
}

export async function sendRemoteCommand(identity, backend, command, payload = {}) {
  // Always use SOAP_URL because the unified backend on port 3003 handles both internally
  const url = `${SOAP_URL}/api/chargers/${identity}/${command}`;

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

export async function registerCharger(identity, name, district, ocppVersion = '1.5 SOAP', coordinates = null) {
  const url = `${SOAP_URL}/api/chargers/register`;

  const payload = { identity, name, district, ocppVersion };
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
