// Values come from plugev-portal/.env (see .env.example). CRA only exposes REACT_APP_* variables.
// Note: anything here is shipped to the browser, so the API key is a Phase 0 stop-gap,
// not real authentication (that arrives with user login + RBAC in Phase 1).
const config = {
    apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:3003',
    apiKey: process.env.REACT_APP_API_KEY || '',
};

export default config;
