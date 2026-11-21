# Phase 0 – Discovery & Validation

Reference: *PLUG EV Multi-Network Monitoring & Management Platform – Technical Specification v1.0*, §16 (Delivery Plan), §7.6 (Protocol selection gate), §17 (Open decisions).

Phase 0 decides **what** gets built and confirms the chargers can support it **before** Phase 1 begins. The code in this repo is the Phase 0 proof of concept (PoC). It is not the production platform.

## Exit deliverables (spec §16)

| Deliverable | Where | Status |
|---|---|---|
| Integration proof-of-concept | `plugev-server/` (gateway) + Charger Station page in `plugev-portal/` | ✅ Built and tested with a simulator. **Needs a run against each real charger model** |
| PoC test plan and results | [poc-test-plan.md](poc-test-plan.md) | 🟡 Plan ready. Results to be filled per charger |
| SETEC site setup guide (for the client) | [setec-site-setup.md](setec-site-setup.md) | 🟡 Ready. Site test date not set |
| Discovery inputs and open decisions | [discovery-questionnaire.md](discovery-questionnaire.md) | ⏳ Waiting on the business owner |
| Architecture decisions | [architecture-decisions.md](architecture-decisions.md) | 🟡 ADR-002 accepted (PostgreSQL); NestJS in use; others proposed |
| Product backlog (Phase 1–6) | [backlog.md](backlog.md) | 🟡 Draft. Refine once decisions are approved |
| Approved scope | Spec v1.0 + amendments from the questionnaire and ADRs | ⏳ Sign-off pending |

Phase 0 is complete when every row is ✅ and the business owner has signed off on scope.

## Immediate action: leaked database credential

Before this phase, `plugev-server/index.js` contained the MongoDB Atlas username and password and was pushed to GitHub. The code now reads `MONGODB_URI` from `plugev-server/.env` (git-ignored), but **the old password is still in git history**. Required steps:

1. In MongoDB Atlas → Database Access, **change the password** of the database user that was in the old code (or delete that user and create a new one).
2. Put the new connection string in `plugev-server/.env`.
3. Optional: rewrite history (`git filter-repo`) if the repository is or will become public. Rotating the password is the actual fix; rewriting history is extra cleanup.

## What the PoC does

**Gateway (`plugev-server`)**: one Node process, one port (default 3003):

- **OCPP 1.5 SOAP, OCPP 1.6 SOAP and OCPP 1.6J (WebSocket)** on the same port, so one ngrok tunnel covers every charger. Port 3002 still accepts WebSockets for chargers already configured with it.
- **Protocol-neutral core.** SOAP and JSON adapters translate messages into shared handlers, following the adapter pattern in spec §7.1/§7.3.
- **Correct state.**
  - Status is tracked per connector.
  - Heartbeats no longer overwrite the status.
  - A charger is marked offline when silent for `OFFLINE_AFTER_SEC` or when its socket drops.
  - Online/offline transitions are recorded with outage duration.
- **Real sessions.**
  - Unique transaction IDs.
  - Duplicate StartTransaction messages are de-duplicated.
  - Interrupted and orphan sessions are recorded.
  - Energy is computed from meter readings.
  - Meter values (1.5 and 1.6 formats) are stored per sample.
- **Real commands.** Each command has a correlation ID, a persisted record and a timeout, and returns the charger's actual answer. Supported: RemoteStart/Stop, Reset, ChangeAvailability, UnlockConnector, Get/ChangeConfiguration, ClearCache, TriggerMessage (1.6 only). The old "simulated success" fallback is gone.
- **Evidence.**
  - Every OCPP message in both directions is stored (`MESSAGE_RETENTION_DAYS`, default 30).
  - `GET /api/chargers/:id/report` builds the §7.6 checklist from what the charger actually did.
- **Stop-gap security.** Optional API key, CORS limited to the portal, optional rejection of unregistered chargers, optional idTag allow-list.

**Portal**: the *Charger Station Information* page is now the test console:

- Details and per-connector status with live energy and power.
- Every supported command, with confirmation prompts for disruptive ones.
- Command history with real outcomes.
- Sessions, OCPP message log, configuration, and the Phase 0 checklist with a "Download report" button.

## Running it

```bash
# backend
cd plugev-server
cp .env.example .env        # set MONGODB_URI (and API_KEY if the tunnel is public)
npm install
npm run dev

# frontend
cd plugev-portal
cp .env.example .env        # REACT_APP_API_KEY must match API_KEY
npm install --force
npm start

# expose to chargers
ngrok http 3003 --scheme http
```

Charger URLs are in `plugev-server/commands.txt`. To try everything without hardware:

```bash
cd plugev-server
npm run simulate -- --url ws://localhost:3003/ocpp/SIM-001 --connectors 2
```

Tests: `cd plugev-server && npm test` (33 tests: SOAP 1.5/1.6, OCPP-J, security; uses an in-memory MongoDB).

## Known limits of the PoC (handled in Phase 1+, not now)

- No user accounts, roles, tenants or audit log. The portal login is still the template's hard-coded check.
- The API key ships inside the browser bundle, so it only stops casual access to the ngrok URL.
- No firmware update, diagnostics upload, reservations or local authorization lists (§7.3 does not require them for the PoC).
- No live push to the browser; the portal polls every 5 s (spec FR MON 005 allows polling as a fallback).
- MongoDB, not PostgreSQL. See ADR-002.
