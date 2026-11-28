# Phase 3 – Charger integration

Reference: spec §5, §7 and §16 (Phase 3), backlog epics E3.1–E3.7 in [../phase-0/backlog.md](../phase-0/backlog.md).

## Decision: chargers connect to the API itself

On 2026-11-27 the product owner chose to drop the separate gateway service: one app to run instead of two, and one
database instead of two. `plugev-api` now contains a **charging module** that speaks OCPP to chargers directly
(ADR-004, revised, in [../phase-0/architecture-decisions.md](../phase-0/architecture-decisions.md)).

```
charger / SETEC tablet ──ngrok──▶ API charger port :3003 ─┐
                                                          ├─ plugev-api ── PostgreSQL
admin portal :3000 ─────────────▶ API :4000 ──────────────┘
```

- Chargers use the same addresses as before (`http://<host>/ocpp/<Charger ID>` for SOAP, `ws://…` for OCPP-J), on
  the same port (3003), so ngrok and the charger settings do not change.
- The admin API (4000) is a different port and is never exposed to chargers.
- MongoDB is no longer used.

## Plan

| Step | What | Status |
|---|---|---|
| 1 | **Charging module in the API** (E3.1–E3.4): OCPP 1.5/1.6 SOAP and 1.6J ported from the Phase 0 gateway to TypeScript; only chargers registered in the portal are served; live status, charging sessions, meter values and the OCPP message log go to PostgreSQL | ✅ (PR #7) |
| 2 | **Sessions on screen** (E3.5): session lists per charger, station and network; live energy and power while charging | ✅ (branch `phase-3-sessions`) |
| 3 | **Remote commands from the portal** (E3.6): start, stop, reset, unlock, availability, configuration; permission checks and audit; the charger's actual answer | Next |
| 4 | **Retire the Phase 0 stack**: `plugev-server`, the old portal with its charger console, and MongoDB (and the Atlas account) | After step 3 |

## Step 2 in detail: sessions on screen

**API** (spec 9.2, FR SES 001–003, 007, FR MON 004):

| Endpoint | What |
|---|---|
| `GET /api/v1/sessions` | Newest first, paged. Filters: `networkId`, `stationId`, `evseId`, `status` (`active`, `completed`, `interrupted`, `orphan`), `from` / `to` (start time, or the stop time when no start was recorded) |
| `GET /api/v1/sessions/:id` | One session with all its meter readings (up to 5000) |
| `GET /api/v1/evses/:id` | Each connector now has `activeSession`: the session charging on it, with energy so far, power and battery level |

- Permission `session.read`, with the same scope as everything else: Network Admins see their network, Station Admins
  their stations, and a session outside your scope answers 404.
- While a session charges, `live` gives the energy so far (latest energy meter reading minus the meter start), the power,
  and the battery level when the charger reports it. kWh and kW readings are converted; when a charger reports only
  per-phase power, the phases are added up.
- Meter readings sent without a transaction id (allowed in OCPP, common with 1.5 chargers) are now linked to the session
  running on that connector (AC 07).

**Admin portal:**

- **Stations → Charging Sessions** tab: all sessions you can see, filtered by network, station and status.
- Charger, station and network pages: their latest sessions.
- A connector that is charging shows **Charging now**: duration, energy, power and battery, refreshed every 15 seconds.
- Session page (`/stations/sessions/:id`): what, where and when, how it ended, the meter start and stop, and every
  meter reading grouped by time.

Session statuses on screen: *Charging* (active), *Completed*, *Interrupted* (the charger started a new session on the
connector before reporting this one's stop) and *Unmatched stop* (a stop for a session the platform never saw start).
Costs (FR SES 003 "cost breakdown") come with tariffs in Phase 5.

## Step 1 in detail

What the charging module does, compared with the Phase 0 gateway:

| | Phase 0 gateway | Charging module |
|---|---|---|
| Runs as | a separate app (`plugev-server`) | part of `plugev-api` (own port, 3003) |
| Data | MongoDB (Atlas) | PostgreSQL: `charging_sessions`, `meter_values`, `ocpp_messages`, live state tables |
| Which chargers it serves | any charger, unless `ALLOW_UNREGISTERED=false` | only chargers registered in the admin portal; others get BootNotification *Rejected* (SOAP) or a refused connection (OCPP-J) |
| Live status in the portal | through an HTTP event link and a shared key | written directly |
| Disabled charger or connector | not known | charging is refused (`Blocked`), the connection stays up so its status remains visible (FR EVSE 006) |
| OCPP message log | 30 days in MongoDB | 30 days in PostgreSQL (`OCPP_MESSAGE_RETENTION_DAYS`) |
| Remote commands | from the Phase 0 charger console | not yet: step 3. The adapters already contain the sending side (ported, not yet wired to the portal) |

Ported behaviour, with the Phase 0 tests carried over: OCPP 1.5 response formats and WS-Addressing headers for SOAP,
resent StartTransaction gets the same transaction id, a stop for an unknown transaction is kept as an orphan session,
a new start on a connector closes a forgotten session as *interrupted*, meter values in the 1.5 and 1.6 shapes,
OCPP-J subprotocol, one connection per charger, dead connection detection.

### Settings (`plugev-api/.env`)

| Setting | Default | Meaning |
|---|---|---|
| `OCPP_ENABLED` | `true` | Charger port on or off |
| `OCPP_PORT` | `3003` | The port chargers (and ngrok) connect to |
| `OCPP_HEARTBEAT_INTERVAL_SEC` | `30` | Heartbeat interval given to chargers at boot |
| `CHARGER_OFFLINE_AFTER_SEC` | `120` | A charger without a message for this long is shown offline (OCPP-J chargers with an open connection stay online) |
| `OCPP_ID_TAG_ALLOWLIST` | (empty) | Comma separated idTags allowed to charge; empty = all, until EV user accounts exist (Phase 4) |
| `OCPP_MESSAGE_RETENTION_DAYS` | `30` | How long the OCPP message log is kept |

### Moving over from the gateway

1. Stop `plugev-server` (the old gateway): the API needs port 3003. If both run, the API logs
   *Port 3003 is already in use … Is plugev-server (the old gateway) still running?* and chargers cannot reach it.
2. Restart the API. It logs `Chargers connect on port 3003`.
3. ngrok and the charger settings stay as they are.
4. `GATEWAY_API_KEY` in `plugev-api/.env` is no longer needed (it was for the external gateway).

Until step 3, remote commands are not available. For a test that needs them, stop the API's charger port
(`OCPP_ENABLED=false`, restart the API) and start the old gateway again with its platform link, as before.
