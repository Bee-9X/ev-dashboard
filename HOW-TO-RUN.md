# How to run PLUG EV

The one place for running the project: first-time setup, daily start, ngrok, connecting a charger, Docker, tests
and troubleshooting. All commands are for the Windows dev PC (PowerShell unless noted).

## What's in the repository

| Folder | What | Status |
|---|---|---|
| `plugev-api` | Core API (users, roles, networks, stations, chargers) **and the charging module chargers connect to** (OCPP 1.5/1.6 SOAP and 1.6J, port 3003). NestJS + PostgreSQL | current |
| `plugev-admin` | Admin portal. React + TypeScript | current |
| `plugev-server` | Phase 0 charger gateway (MongoDB) | replaced by the API's charging module; removed in Phase 3 step 4 |
| `plugev-portal` | Phase 0 portal (old template + charger console) | replaced by `plugev-admin`; removed in Phase 3 step 4 |

**MongoDB is not needed** any more. Only the old gateway uses it.

## What runs where

| # | What | Folder | Command | Address |
|---|---|---|---|---|
| 1 | PostgreSQL | — | Windows service | `localhost:5432` |
| 2 | API + charger port | `plugev-api` | `npm run start:dev` | http://localhost:4000/api/v1 (docs: http://localhost:4000/api/docs); chargers: port **3003** |
| 3 | ngrok (lets chargers on the internet reach port 3003) | — | `ngrok http 3003 --scheme http` | the `….ngrok-free.dev` address it prints; inspector http://127.0.0.1:4040 |
| 4 | Admin portal | `plugev-admin` | `npm run dev` | http://localhost:3000 |

```
charger / SETEC tablet ──ngrok──▶ API charger port :3003 ─┐
                                                          ├─ plugev-api ── PostgreSQL
admin portal :3000 ─────────────▶ API :4000 ──────────────┘
```

Each one runs in its own terminal and keeps running; stop it with **Ctrl+C**. Start them in this order.

---

## A. One-time setup

Once per PC, or again after a fresh clone.

### 1. Install the tools

- **Node.js 22.12 or later** (24 recommended): https://nodejs.org. Check with `node -v`.
- **PostgreSQL** (18 on the dev PC): https://www.postgresql.org/download/windows/
- **ngrok**: https://dashboard.ngrok.com/get-started/setup/windows, then register your auth token (ngrok dashboard →
  *Your Authtoken*):
  ```
  ngrok config add-authtoken <your token>
  ```

### 2. Create the database

```
psql -U postgres
CREATE DATABASE plugev;
\q
```

(Type each line separately. Or use pgAdmin. Forgot the password? See [Troubleshooting](#forgot-the-postgresql-password).)

### 3. Install the packages

```
cd "C:\Users\AYESH\Documents\Projects\PlugEV Dashboard\ev-dashboard"
cd plugev-api
npm install
cd ..\plugev-admin
npm install
```

### 4. Make the `.env` files

Each app reads its settings from `.env` in its folder. Copy `.env.example` to `.env`, then fill it in.
**Never commit `.env` files** (git ignores them). A change only takes effect after restarting that app.

Random values:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The first gives a long secret; the second a 32-byte base64 key.

**`plugev-api\.env`**

| Setting | Value |
|---|---|
| `DATABASE_URL` | `postgres://postgres:<postgres password>@localhost:5432/plugev` |
| `JWT_ACCESS_SECRET` | a long secret (first command) |
| `MFA_ENCRYPTION_KEY` | a 32-byte key (second command). **Keep it**: changing it breaks everyone's two-step verification |
| `PORTAL_URL`, `CORS_ORIGINS` | `http://localhost:3000` (default) |
| `OCPP_PORT` | `3003` (default): the port chargers and ngrok use |
| `GATEWAY_API_KEY` | leave empty (only for the old gateway) |

Charger settings, all with working defaults:

| Setting | Default | Meaning |
|---|---|---|
| `OCPP_ENABLED` | `true` | Charger port on or off |
| `OCPP_PORT` | `3003` | The port chargers (and ngrok) connect to |
| `OCPP_HEARTBEAT_INTERVAL_SEC` | `30` | Heartbeat interval given to chargers at boot |
| `CHARGER_OFFLINE_AFTER_SEC` | `120` | No message for this long → shown offline |
| `OCPP_ID_TAG_ALLOWLIST` | (empty) | Comma separated idTags allowed to charge; empty = all |
| `OCPP_MESSAGE_RETENTION_DAYS` | `30` | How long the OCPP message log is kept |

Email: `MAIL_TRANSPORT=log` (default) writes emails, links included, to the API terminal instead of sending them.

**`plugev-admin\.env`** (optional, the defaults work)

| Setting | Value |
|---|---|
| `VITE_API_URL` | `http://localhost:4000/api/v1` |
| `VITE_CONSOLE_URL` | leave empty |

### 5. Create the first Super Admin

```
cd plugev-api
npm run seed:super-admin -- --email you@example.com --name "Your Name"
```

It asks for the password. The first sign-in then sets up two-step verification (Google or Microsoft Authenticator)
and shows recovery codes once: save them.

---

## B. Every day: start the project

### The quickest way: in VS Code

Open the project folder in VS Code and press **Ctrl+Shift+B** (or *Terminal → Run Task… → PLUG EV: start*).

1. **PLUG EV: checks** runs first: Node, `plugev-api\.env`, packages, PostgreSQL, free ports. If something is wrong,
   it says what and nothing else starts.
2. Then each app gets its own VS Code terminal: **PLUG EV: API**, **PLUG EV: ngrok**, **PLUG EV: admin portal**.
3. **PLUG EV: status** waits until they're up, opens http://localhost:3000 and prints the charger address
   `http://<ngrok host>/ocpp/c1` (also copied to the clipboard).

Stop: *Terminal → Run Task… → **PLUG EV: stop***. The tasks are in `.vscode/tasks.json`.

### Or: one script, Windows Terminal tabs

Double-click **`start-dev.cmd`** in the project folder (or run `.\start-dev.cmd` in a terminal). It:

1. checks Node, `plugev-api\.env` and the packages (runs `npm install` the first time);
2. checks PostgreSQL is running (and starts it if it can);
3. checks ports 4000, 3003 and 3000 are free, and tells you what holds them if not (e.g. the old gateway);
4. opens one Windows Terminal window with a tab each for the **API**, **ngrok** and the **admin portal**;
5. waits until they're up, opens http://localhost:3000, and prints the charger address
   `http://<ngrok host>/ocpp/c1`, already copied to the clipboard for the tablet.

Stop everything with **`stop-dev.cmd`**. The tabs stay open so you can still read the logs; close the window after.
PostgreSQL keeps running.

Options: `.\start-dev.cmd -NoNgrok` (no charger from outside), `-NoBrowser`, `-ChargerId SIM-001` (the ID in the
printed address), `-NoWindowsTerminal` (separate PowerShell windows instead of tabs). The scripts are in `scripts\`.

### By hand

Open one terminal per step, each starting in the project folder:

```
cd "C:\Users\AYESH\Documents\Projects\PlugEV Dashboard\ev-dashboard"
```

**Make sure the old gateway (`plugev-server`) is not running**: it uses port 3003 too.

### 1. PostgreSQL

Normally starts with Windows. Check:

```
Get-Service postgresql*
```

If *Stopped*: PowerShell **as Administrator** → `Start-Service postgresql-x64-18`.

### 2. API

```
cd plugev-api
npm run start:dev
```

Ready when it logs both:

```
Chargers connect on port 3003: SOAP http://<host>/ocpp/<Charger ID>, OCPP-J ws://<host>/ocpp/<Charger ID>
PLUG EV API listening on http://localhost:4000/api/v1 (docs: /api/docs)
```

Database migrations run automatically at start-up. Every charger message is printed here, e.g.
`[c1] <- CALL Heartbeat`.

### 3. ngrok

```
ngrok http 3003 --scheme http
```

It prints the public address, e.g. `http://wen-conductorial-unmellifluously.ngrok-free.dev`. Every charger request
shows in this window and at http://127.0.0.1:4040.

- `--scheme http` gives a plain `http://` address, which SOAP chargers like the SETEC tablet need (port 80).
- **The address changes each time ngrok restarts** (unless you reserve a static domain in the ngrok dashboard).
  Then the charger needs the new address (section C).

### 4. Admin portal

```
cd plugev-admin
npm run dev
```

Open http://localhost:3000 and sign in.

---

## C. Connecting a charger

### 1. Register it in the admin portal

Only registered chargers are served: an unregistered one gets *Rejected* at boot (SOAP) or its connection refused
(OCPP-J).

**Stations → a station → Add new terminal**:

- **Charger ID**: exactly the ID at the end of the OCPP URL (`c1` for the tablet)
- **Protocol**: what the charger speaks (the tablet: *OCPP 1.5 (SOAP)*)
- its connectors (type and power)

### 2. Charger settings

Use the host ngrok printed (without `http://`):

| Charger | OCPP URL |
|---|---|
| OCPP 1.5 / 1.6 **SOAP** (e.g. SETEC tablet `c1`) | `http://<ngrok host>/ocpp/c1`, port 80 |
| OCPP 1.6 **JSON** | `ws://<ngrok host>/ocpp/<Charger ID>` (or `wss://…` on port 443 if the charger supports TLS) |

Within seconds of the charger's next message its page shows **Online**, the last message, what it reports about
itself and the connector statuses (refreshed every 15 seconds).

SOAP note: commands from the platform go **to** the address the charger reports. A charger behind a router or on
mobile data can't be reached without port forwarding or a VPN. See
[docs/phase-0/setec-site-setup.md](docs/phase-0/setec-site-setup.md).

### No charger at hand? Use the simulator

Register `SIM-001` first (protocol *OCPP 1.6 (JSON)*, two connectors), then:

```
cd plugev-api
npm run simulate -- --url ws://localhost:3003/ocpp/SIM-001 --connectors 2
```

Options: `--power 7400` (W), `--meter-interval 10` (s). Stop it with Ctrl+C: the charger shows Offline.

**To see a charging session**, add `--charge 1`: after start-up a "car" plugs into connector 1 and charges, sending
meter readings every 10 seconds. Ctrl+C unplugs it first, so the session ends as *Completed*.

```
npm run simulate -- --url ws://localhost:3003/ocpp/SIM-001 --connectors 2 --charge 1
```

---

## D. Testing the charging module (Phase 3 step 1)

What to check on branch `phase-3-charging-module`, with the old gateway and MongoDB **not** running:

| # | Do | Expect |
|---|---|---|
| 1 | Start the API | logs `Chargers connect on port 3003` |
| 2 | Start ngrok; keep c1 pointed at `http://<ngrok host>/ocpp/c1` | c1's page: **Online**, firmware and model, last message |
| 3 | Start the simulator for `SIM-001` | **Online**, both connectors *Available* |
| 4 | Stop the simulator | **Offline** shortly after |
| 5 | Point a charger at an unregistered ID, e.g. `/ocpp/nobody` | API logs *no charger with this Charger ID is registered*; SOAP boot is *Rejected* |
| 6 | Disable a charger in the portal, then let it boot or start | charging refused; it stays online and its status keeps updating |

**Charging sessions** show under *Stations → Charging Sessions*, on each charger, station and network page, and on a
connector while it charges (*Charging now*). There's no remote start from the portal yet (step 3), and the tablet can't
simulate charging, so make one with the simulator's `--charge 1` option (section C). To look at the stored data
directly:

```
psql -U postgres -d plugev
SELECT status, connector_number, started_at, stopped_at, energy_wh FROM charging_sessions ORDER BY created_at DESC LIMIT 10;
SELECT identity, direction, kind, action, created_at FROM ocpp_messages ORDER BY id DESC LIMIT 20;
\q
```

---

## E. Running with Docker instead

Needs Docker Desktop. Runs PostgreSQL, the API (with the charger port) and the admin portal.

1. In the project folder, copy `compose.env.example` to `.env` and fill in `POSTGRES_PASSWORD`,
   `JWT_ACCESS_SECRET` and `MFA_ENCRYPTION_KEY` (commands in A.4).
2. Start:
   ```
   docker compose up -d --build
   ```
3. Create the first Super Admin:
   ```
   docker compose exec -it api node dist/cli/create-super-admin.js --email you@example.com --name "Your Name"
   ```
4. ngrok, same as without Docker: `ngrok http 3003 --scheme http`

| What | Address |
|---|---|
| Admin portal | http://localhost:8080 |
| API docs | http://localhost:4000/api/docs |
| Chargers | `http://localhost:3003/ocpp/<Charger ID>` (through ngrok from outside) |

Email links: `docker compose logs api`. Stop: `docker compose down` (the data is kept in a Docker volume).

Docker and the local setup both use ports 4000 and 3003, so run one or the other, not both.

---

## F. Tests

| Folder | Command | Needs |
|---|---|---|
| `plugev-api` | `npm test` | nothing: it starts its own temporary PostgreSQL; your database isn't touched |
| `plugev-api` | `npm run build` | — |
| `plugev-admin` | `npm test`, `npm run typecheck`, `npm run build` | nothing: a fake API |

---

## G. Troubleshooting

| You see | Meaning | Fix |
|---|---|---|
| ngrok shows `502 Bad Gateway` for `POST /ocpp/c1` | Nothing is listening on 3003 | Start the API; check it logged `Chargers connect on port 3003` |
| API logs `Port 3003 is already in use` | Another program has the charger port, usually the old gateway | Close `plugev-server`, restart the API |
| API logs `no charger with this Charger ID is registered` | That Charger ID isn't in the portal | Register it, or fix the ID (*Edit charger*) |
| Charger *Online* but no connector status | It hasn't reported a status yet (only does when one changes) | Plug in or unplug, or wait |
| Charger page warns about the protocol | It connects with a different protocol than registered | *Edit charger*, pick the one in the warning |
| c1 stopped connecting after a restart | ngrok gave a new address | Put the new address in the tablet |
| Portal says *Cannot reach the PLUG EV server* | API not running, or `VITE_API_URL` wrong | Start the API; check `plugev-admin\.env` |
| `EADDRINUSE` / port already in use, or `start-dev` says a port is in use | That app already runs in another window (or in Docker) | `stop-dev.cmd`, or close that window |
| Invitation or reset email never arrives | Emails are only logged (`MAIL_TRANSPORT=log`) | Copy the link from the API terminal |

### Forgot the PostgreSQL password

1. PowerShell **as Administrator**.
2. In `C:\Program Files\PostgreSQL\18\data\pg_hba.conf`, change `scram-sha-256` to `trust` on the `127.0.0.1` and
   `::1` lines.
3. `Restart-Service postgresql-x64-18`
4. Set a new password (one line at a time):
   ```
   psql -U postgres
   ALTER USER postgres PASSWORD 'new password';
   \q
   ```
5. Change `trust` back to `scram-sha-256`, then `Restart-Service postgresql-x64-18` again.
6. Put the new password in `DATABASE_URL` in `plugev-api\.env`.

---

## H. Old gateway (only if you need remote commands before step 3)

Remote start/stop, reset and the other commands still come from the Phase 0 charger console until step 3 of
[docs/phase-3/README.md](docs/phase-3/README.md). For a test that needs them:

1. In `plugev-api\.env` set `OCPP_ENABLED=false` and a `GATEWAY_API_KEY` (32+ characters), then restart the API
   (this frees port 3003).
2. In `plugev-server\.env`: `MONGODB_URI`, `PLATFORM_API_URL=http://localhost:4000/api/v1`, and
   `PLATFORM_GATEWAY_KEY` = the API's `GATEWAY_API_KEY`. Then `cd plugev-server`, `npm install`, `npm run dev`.
3. Old portal with the console: `REACT_APP_API_URL=http://localhost:3003` in `plugev-portal\.env`, then
   `cd plugev-portal`, `npm install --force`, `$env:PORT=3001; npm start`.

With Docker: `docker compose --profile legacy up -d --build` (gateway on 3013, old portal on 8081).

Undo afterwards: stop both, remove `OCPP_ENABLED=false`, restart the API.

---

More detail: API features and endpoints in [plugev-api/README.md](plugev-api/README.md), portal features in
[plugev-admin/README.md](plugev-admin/README.md), status and plans in `docs/phase-0` … `docs/phase-3`.
