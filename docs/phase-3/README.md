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
| 1 | **Charging module in the API** (E3.1–E3.4): OCPP 1.5/1.6 SOAP and 1.6J ported from the Phase 0 gateway to TypeScript; only chargers registered in the portal are served; live status, charging sessions, meter values and the OCPP message log go to PostgreSQL | ✅ (branch `phase-3-charging-module`) |
| 2 | **Sessions on screen** (E3.5): session lists per charger, station and network; live energy and power while charging | Next |
| 3 | **Remote commands from the portal** (E3.6): start, stop, reset, unlock, availability, configuration; permission checks and audit; the charger's actual answer | Planned |
| 4 | **Retire the Phase 0 stack**: `plugev-server`, the old portal with its charger console, and MongoDB (and the Atlas account) | After step 3 |

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
