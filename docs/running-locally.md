# Running PLUG EV locally (without Docker)

Step-by-step commands to run everything on the development PC (Windows), with a charger connecting through ngrok.
For Docker instead, see [../instructions.txt](../instructions.txt).

## What runs where

| # | What | Folder | Command | Address |
|---|---|---|---|---|
| 1 | PostgreSQL (database of the platform) | — | Windows service | `localhost:5432` |
| 2 | Core API (users, stations, chargers, live status) | `plugev-api` | `npm run start:dev` | http://localhost:4000/api/v1, docs at http://localhost:4000/api/docs |
| 3 | Charger gateway (OCPP SOAP and JSON) | `plugev-server` | `npm run dev` | http://localhost:3003 |
| 4 | ngrok tunnel (lets chargers on the internet reach the gateway) | — | `ngrok http 3003 --scheme http` | the `https://….ngrok-free.dev` address it prints, inspector at http://127.0.0.1:4040 |
| 5 | Admin portal (new) | `plugev-admin` | `npm run dev` | http://localhost:3000 |
| 6 | Phase 0 portal with the charger console (optional) | `plugev-portal` | `npm start` on port 3001 | http://localhost:3001 |

Each one runs in its own terminal window and keeps running; stop it with **Ctrl+C**.
Start them in this order: the API needs the database, and the gateway reports to the API.

```
charger / SETEC tablet ──ngrok──▶ gateway :3003 ──events──▶ API :4000 ◀── admin portal :3000
                                      │
                                      └──▶ MongoDB (Atlas) ◀── Phase 0 portal / charger console :3001
```

---

## One-time setup

Do this once per PC (or again after a fresh clone).

### 1. Install the tools

- **Node.js 22.12 or later** (Node 24 recommended): https://nodejs.org. Check with `node -v`.
- **PostgreSQL** (18 is installed on the dev PC): https://www.postgresql.org/download/windows/
- **ngrok**: https://dashboard.ngrok.com/get-started/setup/windows. Then register the auth token from the ngrok
  dashboard (*Your Authtoken* in the left sidebar):
  ```
  ngrok config add-authtoken <your token>
  ```
  ngrok may ask you to attach a bank card; there is no charge for this usage.

### 2. Create the database

In pgAdmin, or in a terminal (type each command on its own line):

```
psql -U postgres
CREATE DATABASE plugev;
\q
```

Forgot the `postgres` password? See *Troubleshooting* at the end.

### 3. Install the packages

```
cd plugev-api
npm install
cd ..\plugev-server
npm install
cd ..\plugev-admin
npm install
cd ..\plugev-portal
npm install --force
```

(`--force` only for the Phase 0 portal: its old packages conflict otherwise.)

### 4. Make the `.env` files

Every app reads its settings from a `.env` file in its folder. Copy the example, then fill it in.
**Never commit `.env` files**; they hold passwords and keys (git already ignores them).

Generate random values with:

```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

The first gives a long random text (secrets, keys); the second a 32-byte base64 key (MFA key).

**`plugev-api\.env`** (copy from `.env.example`):

| Setting | Value |
|---|---|
| `DATABASE_URL` | `postgres://postgres:<postgres password>@localhost:5432/plugev` |
| `JWT_ACCESS_SECRET` | a long random text (first command) |
| `MFA_ENCRYPTION_KEY` | a 32-byte base64 key (second command). Keep it: changing it breaks everyone's two-step verification |
| `GATEWAY_API_KEY` | a long random text: the **gateway key**. The same value goes into the gateway below |
| `PORTAL_URL`, `CORS_ORIGINS` | `http://localhost:3000` (the defaults) |

**`plugev-server\.env`** (copy from `.env.example`):

| Setting | Value |
|---|---|
| `MONGODB_URI` | the MongoDB Atlas connection string (with the current, rotated password) |
| `PLATFORM_API_URL` | `http://localhost:4000/api/v1` |
| `PLATFORM_GATEWAY_KEY` | **the same gateway key** as `GATEWAY_API_KEY` in `plugev-api\.env` |
| `API_KEY` | optional: protects the gateway's own API while the ngrok address is public. If set, put the same value in the Phase 0 portal's `REACT_APP_API_KEY` |
| `CORS_ORIGINS` | `http://localhost:3001` (where the Phase 0 portal runs) |

**`plugev-admin\.env`** (copy from `.env.example`; optional, the defaults work):

| Setting | Value |
|---|---|
| `VITE_API_URL` | `http://localhost:4000/api/v1` |
| `VITE_CONSOLE_URL` | `http://localhost:3001`, so the menu links to the charger console |

**`plugev-portal\.env`** (copy from `.env.example`):

| Setting | Value |
|---|---|
| `REACT_APP_API_URL` | `http://localhost:3003` (the gateway) |
| `REACT_APP_API_KEY` | the gateway's `API_KEY`, if you set one |

A change to any `.env` file only takes effect after **restarting that app**.

### 5. Create the first Super Admin

```
cd plugev-api
npm run seed:super-admin -- --email you@example.com --name "Your Name"
```

It asks for the password. The first sign-in in the admin portal then sets up two-step verification
(Google or Microsoft Authenticator) and shows recovery codes: save them.

---

## Every day: start the project

Open one terminal per step. In each, go to the project folder first:

```
cd "C:\Users\AYESH\Documents\Projects\PlugEV Dashboard\ev-dashboard"
```

### 1. PostgreSQL

It runs as a Windows service and normally starts with Windows. To check, in PowerShell:

```
Get-Service postgresql*
```

If it is *Stopped*: open PowerShell **as Administrator** and run `Start-Service postgresql-x64-18`.

### 2. Core API

```
cd plugev-api
npm run start:dev
```

Ready when it logs `PLUG EV API listening on http://localhost:4000/api/v1`. Database updates (migrations) run
automatically at start-up.
Check: http://localhost:4000/api/docs opens.

### 3. Charger gateway

```
cd plugev-server
npm run dev
```

Ready when it logs:

```
Connected to MongoDB
Platform link on: charger activity is sent to http://localhost:4000/api/v1
HTTP API, OCPP SOAP and OCPP-J (WebSocket) listening on port 3003
```

`Platform link off` means `PLATFORM_API_URL` or `PLATFORM_GATEWAY_KEY` is missing in `plugev-server\.env`.

### 4. ngrok

```
ngrok http 3003 --scheme http
```

It prints the public address, e.g. `http://wen-conductorial-unmellifluously.ngrok-free.dev`. Every request from a
charger appears in this window and in the inspector at http://127.0.0.1:4040.

**The address changes every time ngrok restarts** (unless you reserve a static domain in the ngrok dashboard), and
then the charger must be given the new address (next section).

### 5. Admin portal

```
cd plugev-admin
npm run dev
```

Open http://localhost:3000 and sign in.

### 6. Phase 0 portal with the charger console (optional)

Needed for charging sessions, meter values and remote commands until those move to the admin portal.
It must not use port 3000 (the admin portal):

PowerShell:

```
cd plugev-portal
$env:PORT=3001; npm start
```

Command Prompt (cmd): `set PORT=3001 && npm start`

---

## Connecting a charger

### Charger settings

Use the host ngrok printed (without `https://`), and the charger's ID at the end of the path.

| Charger | OCPP URL |
|---|---|
| OCPP 1.5 / 1.6 **SOAP** (e.g. the SETEC tablet `c1`) | `http://<ngrok host>/ocpp/c1`, port 80 |
| OCPP 1.6 **JSON** | `ws://<ngrok host>/ocpp/<charger ID>` (or `wss://…` on port 443 if the charger supports TLS) |

SOAP note: remote commands go from the gateway **to** the address the charger reports. A charger on a private network
(behind a router, or on mobile data) cannot be reached that way without port forwarding or a VPN. See
[phase-0/setec-site-setup.md](phase-0/setec-site-setup.md).

### Register it in the admin portal

**Stations → a station → Add new terminal**, with:

- **Charger ID**: exactly the ID at the end of the OCPP URL (`c1` for the tablet);
- **Protocol**: the one the charger uses (the tablet: *OCPP 1.5 (SOAP)*);
- its connectors (type and power).

Within seconds of the charger's next message, its page shows **Online**, last message, what it reports about itself,
and connector statuses (refreshed every 15 seconds).

### No charger at hand?

Run a simulated OCPP 1.6 JSON charger (register `SIM-001` in the portal first, protocol *OCPP 1.6 (JSON)*,
two connectors):

```
cd plugev-server
npm run simulate -- --url ws://localhost:3003/ocpp/SIM-001 --connectors 2
```

---

## Checks when something does not show up

| You see | Meaning | Fix |
|---|---|---|
| ngrok shows `502 Bad Gateway` for `POST /ocpp/c1` | ngrok has nothing to deliver to: the gateway is not running | Start the gateway (step 3) |
| Gateway logs `Platform link: cannot reach … (HTTP 404)` | The API runs without `GATEWAY_API_KEY` (or was started before it was added) | Set it in `plugev-api\.env`, restart the API. The gateway keeps the events and sends them once it works |
| Gateway logs `Platform link: cannot reach … (HTTP 401 …)` | The two keys differ | Make `PLATFORM_GATEWAY_KEY` equal to `GATEWAY_API_KEY`, restart both |
| Gateway logs `cannot reach … (fetch failed)` | The API is not running | Start the API (step 2) |
| Gateway logs `charger "c1" is not registered in the admin portal` | No charger with that Charger ID in the portal | Register it, or fix the Charger ID (*Edit charger*) |
| Charger page shows *Online* but no connector status | The charger has not reported a status yet (it only does when one changes) | Plug in or unplug, or wait |
| Charger page warns about the protocol | The charger connects with another protocol than registered | *Edit charger* and pick the one shown in the warning |
| Admin portal says *Cannot reach the PLUG EV server* | The API is not running, or `VITE_API_URL` is wrong | Start the API; check `plugev-admin\.env` |
| `EADDRINUSE` / port already in use | That app is already running in another window | Use the running one, or close it first |
| Invitation or password reset emails never arrive | Emails are written to the API log for now (`MAIL_TRANSPORT=log`) | Copy the link from the API terminal |

### Forgot the PostgreSQL password

1. Open PowerShell **as Administrator**.
2. In `C:\Program Files\PostgreSQL\18\data\pg_hba.conf`, change `scram-sha-256` to `trust` on the `127.0.0.1` and `::1` lines.
3. `Restart-Service postgresql-x64-18`
4. Set a new password, typing each line separately:
   ```
   psql -U postgres
   ALTER USER postgres PASSWORD 'new password';
   \q
   ```
5. Change `trust` back to `scram-sha-256` in `pg_hba.conf`, then `Restart-Service postgresql-x64-18` again.
6. Put the new password in `DATABASE_URL` in `plugev-api\.env`.

---

## Tests

| Folder | Command | Needs |
|---|---|---|
| `plugev-api` | `npm test` | nothing: it starts its own temporary PostgreSQL |
| `plugev-server` | `npm test` | nothing: it uses an in-memory MongoDB |
| `plugev-admin` | `npm test`, `npm run typecheck`, `npm run build` | nothing: a fake API |
