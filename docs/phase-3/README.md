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
- MongoDB is no longer used; the Phase 0 apps were removed in step 4.

## Plan

| Step | What | Status |
|---|---|---|
| 1 | **Charging module in the API** (E3.1–E3.4): OCPP 1.5/1.6 SOAP and 1.6J ported from the Phase 0 gateway to TypeScript; only chargers registered in the portal are served; live status, charging sessions, meter values and the OCPP message log go to PostgreSQL | ✅ (PR #7) |
| 2 | **Sessions on screen** (E3.5): session lists per charger, station and network; live energy and power while charging | ✅ (PR #8) |
| 3 | **Remote commands from the portal** (E3.6): start, stop, reset, unlock, availability, configuration; permission checks and audit; the charger's actual answer | ✅ (PR #9) |
| 4 | **Retire the Phase 0 stack**: `plugev-server`, the old portal with its charger console, and MongoDB (and the Atlas account) | ✅ (PR #10); closing the Atlas account is the product owner's step |
| 5 | **Charger security** (E3.2): a password per charger (OCPP-J, HTTP Basic), allowed addresses (SOAP), refusals shown in the portal | ✅ (branch `phase-3-charger-security`) |
| 6 | **Live updates** (E3.7): changes pushed to the portal instead of re-reading | Next |
| 7 | **Alerts and outages** (E3.4): admins told when a charger goes offline or reports a fault; outages recorded | Planned |

## Step 3 in detail: remote commands

Spec 5.3, 9.4 and AC 11. Every command goes through the same steps:

1. **Checks** (5.3 step 18):
   - the role's permission for that command;
   - the caller's scope: another network's charger is *not found*;
   - the charger's state: no start on a disabled charger or connector, in a network that is not active, or on a
     connector that is already charging; no stop when nothing is charging; nothing in an archived network.
2. **Recorded and audited** (step 19): a `charger_commands` row and an `evse.command` audit entry, in one transaction.
   The API answers **202** at once with the command id and status `queued` (9.4).
3. **Sent** (step 20) in the background:
   - OCPP-J: over the charger's WebSocket;
   - SOAP: as an HTTP request to the charger's command address. That is the *Command address* set in the portal, or
     else the address the charger reports in its messages, which is kept in the database and so survives an API restart.
4. **The charger's answer** (step 21):
   - `accepted`: Accepted, Unlocked, Scheduled or RebootRequired;
   - `rejected`;
   - `failed`: not connected, or unreachable;
   - `timed_out`, also for commands still waiting when the API restarted.
5. **Confirmed** (step 22) by the charger's later messages:
   - a remote start: the new session, with the same card, on that connector;
   - a stop: the StopTransaction;
   - a reset: the next BootNotification;
   - availability: the status the connector reports;
   - an unlock: the answer *Unlocked*.

   `confirmation.state` is `waiting` meanwhile, and `not_confirmed` once the time for it has passed (5 minutes; 10 for
   a reset).

| Endpoint (`/api/v1/evses/:id/...`) | Permission | OCPP |
|---|---|---|
| `POST commands/remote-start` `{ connectorNumber?, idTag? }` | `evse.remote_start` | RemoteStartTransaction |
| `POST commands/remote-stop` `{ connectorNumber }` | `evse.remote_stop` | RemoteStopTransaction (the connector's running session) |
| `POST commands/reset` `{ type: Soft or Hard }` | `evse.reset` | Reset |
| `POST commands/unlock` `{ connectorNumber }` | `evse.unlock` | UnlockConnector |
| `POST commands/availability` `{ connectorNumber (0 = charger), available }` | `evse.update` | ChangeAvailability |
| `POST commands/get-configuration` `{ keys? }`, `GET configuration` | `evse.update` | GetConfiguration |
| `POST commands/change-configuration` `{ key, value }` | `evse.update` | ChangeConfiguration |
| `POST commands/trigger-message` `{ message, connectorNumber? }` | `evse.update` | TriggerMessage (OCPP 1.6 only) |
| `GET commands`, `GET commands/:commandId` | `evse.read` | |

- **Who may send them:** Network Admins and Super Admins. Station Admins see the commands sent to their chargers but
  cannot send any; the spec allows that "only when explicitly delegated".
- **The card for a remote start:** `OCPP_REMOTE_ID_TAG` (default `PLUGEV-ADMIN`) unless another is typed in. That
  card is always accepted, unless the charger or connector is disabled.
- **Command address:** `PATCH /evses/:id` takes `commandUrl` (SOAP only). It replaces the Phase 0 gateway's *endpoint
  override*.

**Admin portal (charger page):**
- buttons on each connector card;
- *Remote Control*: the resets, the charger's availability, and the last 10 commands with the charger's answer and the
  confirmation, refreshed every 2 seconds while one is pending;
- *Configuration*: read the settings, then change one;
- *Command address* in *Edit charger*, for SOAP chargers.

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
| Remote commands | from the Phase 0 charger console | from the admin portal (step 3) |

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
| `OCPP_REMOTE_ID_TAG` | `PLUGEV-ADMIN` | The card (idTag) a remote start from the portal uses unless another is typed in; always accepted |
| `OCPP_COMMAND_TIMEOUT_MS` | `30000` | How long to wait for an OCPP 1.6 (JSON) charger to answer a command |
| `OCPP_SOAP_COMMAND_TIMEOUT_MS` | `15000` | The same for SOAP chargers |

## Step 5 in detail: charger security

Spec 7.5 (*per device credentials …; validate device identity and connection authorization before accepting messages;
restrict inbound connections to approved endpoints; rotate credentials and revoke compromised devices*) and 11.4
(*charger impersonation*). Before this step, any client that knew a Charger ID and the ngrok address could connect as
that charger, send it false data, take over its WebSocket, or (SOAP) change where its commands were sent.

**What a charger can be given** (charger page → *Connection security*, Network Admins and Super Admins; Station Admins
see it):

- **A password.** OCPP 1.6 security profile 1 (profile 2 over `wss://`): HTTP Basic authentication, user name = the
  Charger ID. The platform makes one (24 random letters and digits) and shows it once, or takes the charger's fixed
  password (16–40 characters). Stored as a salted SHA-256 hash in `charger_security`, apart from `evses`, so it is
  never in a charger's API view. Works for SOAP chargers too, if they can send one.
- **Allowed addresses.** IPv4/IPv6 addresses or CIDR ranges, at most 20. Meant for SOAP chargers such as the SETEC
  tablet, which cannot send a password. The site needs a fixed public IP.

**How a connection is checked** (`ChargerGate`), before any message is handled: registered → from an allowed address,
if it has a list → the right password, if it has one → otherwise accepted only while `OCPP_ALLOW_UNSECURED_CHARGERS`
is on. OCPP-J chargers are checked when the WebSocket opens (refused with 401 or 403), SOAP chargers on every request
(SOAP fault *SecurityError*, 401 or 403). A refused SOAP request changes nothing: not the address commands go to, not
the live state.

**The charger's address.** `X-Forwarded-For` is believed only for the proxies we run (`OCPP_TRUSTED_PROXIES`; 1 for
ngrok). The address used is the one our outermost proxy added, so a charger cannot pass itself off as another address
by sending the header itself. Before this step the API took the first entry, which the client controls.

**Rotation and revocation.** Replacing a password ends the old one at once and closes the charger's open connection;
changing the allowed addresses closes it too, so it is checked again. Removing the password and the addresses
(with unsecured chargers refused) locks a charger out. Every change is audited (`evse.password_set`,
`evse.password_replace`, `evse.password_remove`, `evse.allowed_addresses_change`), never with the password.

**Refusals** are logged and kept on the charger (*Last refused*: when, from where, why), at most once a minute per
reason and address, so a charger retrying every few seconds fills neither the log nor the database.

**Settings:**

| Setting | Default | Meaning |
|---|---|---|
| `OCPP_TRUSTED_PROXIES` | `0` | Proxies in front of the charger port that add `X-Forwarded-For`. `1` with ngrok (as in `.env.example`) |
| `OCPP_ALLOW_UNSECURED_CHARGERS` | `true`, `false` with `NODE_ENV=production` | Accept chargers with neither a password nor allowed addresses. Docker Compose sets `false` |

**Not covered yet:** the platform does not check that an OCPP-J charger with a password came over TLS, since TLS ends
at ngrok or the load balancer. Profile 3 (client certificates) and setting the password on the charger remotely
(`ChangeConfiguration AuthorizationKey`, OCPP 1.6 security extension) wait for chargers that support them.

## Step 4 in detail: the Phase 0 stack removed

- **Deleted:** `plugev-server` (the Phase 0 gateway with MongoDB) and `plugev-portal` (the old template portal with
  the charger console), with their CI jobs, Docker images and the `legacy` compose profile.
- **The gateway link in the API:** `POST /gateway/events`, its key guard and `GATEWAY_API_KEY` are gone. The service
  behind it, which writes live charger state from order-safe events, moved into the charging module
  (`LiveStateEvents`), with its tests.
- **The admin portal:** the "Charger console" link and `VITE_CONSOLE_URL` are gone.
- **Kept:** the Phase 0 documents in [../phase-0/](../phase-0/) (decisions, test plan, SETEC site guide). The code is
  in git history before this step.
- **For the product owner:** shut down the MongoDB Atlas cluster and close the account. Nothing uses it any more,
  and that also settles the leaked password from Phase 0.
- **Leftover settings:** a `GATEWAY_API_KEY` left in a `.env` file is ignored.
