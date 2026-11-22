# plugev-admin

The PLUG EV admin portal (ADR-005). It signs in against `plugev-api` and keeps the look of the Phase 0
portal with refreshed components.

Built so far:

- **Sign-in:** email and password, then the authenticator code or a recovery code.
- **First sign-in for roles that require MFA (Super Admin, Network Admin):** setup with a QR code,
  then the recovery codes, shown once.
- **Email links:** forgotten password, password reset link (`/reset-password`), invitation link (`/accept-invite`).
- **Dashboard:** your access and account security.
- **My Profile:** details, roles, MFA status, new recovery codes, turning MFA on or off (off only when the role allows it),
  and a password change link.
- **User Management** (Admin Role tab; EV Users comes later):
  - list with search, status filter and paging
  - invite an administrator with a role for a network or station
  - user profile: add or remove roles, suspend, reactivate, deactivate, cancel an invitation, reset MFA
  - every change asks for a reason, which goes to the audit log
  - a Network Admin sees and manages only the Station Admins of their own network; the API enforces the same rules
- **Stations** ("Charging Station Details", as in the old portal):
  - **Charging Networks** tab: networks with their station count; add a network (Super Admin)
  - network page: profile (currency, time zone), update it, suspend / reactivate / archive (Super Admin), its stations, add a station
  - **Chargers Stations** tab: all stations you can see, filtered by network; add a station
  - station page: rename; mark inactive or active (Network Admin or Super Admin: an inactive station takes away its Station Admins' access)
  - station details: address, GPS location, phone, time zone, opening hours, amenities; show in or hide from the app
  - **Charger Terminals** tab: all chargers you can see; add a charger with one or two connectors
  - charger page: details, edit (also when the hardware is replaced), enable/disable, connectors with their QR codes,
    add, edit or disable a connector
  - **Print QR stickers**: one sticker per connector (`/print/chargers/:id`); warns while the links point to a test address
  - a Station Admin sees only their own stations
- The other menu items from the old portal (Accounts, TopUp Accounts, Remote Start, My Recent Activity) are listed as "Soon"
  and move over one by one.

Stack: Vite 7, React 19, TypeScript, React Router 7, Vitest with Testing Library.

## Run locally

Needs Node 22 or later and a running `plugev-api` (see [../plugev-api/README.md](../plugev-api/README.md)).

```bash
npm install
cp .env.example .env        # optional: defaults to the API at http://localhost:4000/api/v1
npm run dev                 # http://localhost:3000
```

Port 3000 is the API's default `PORTAL_URL` and `CORS_ORIGINS`, so the links in emails open this app.
The Phase 0 portal (`plugev-portal`) also defaults to 3000. To run both, start the old one on another
port (`set PORT=3001 && npm start` on Windows) and set `VITE_CONSOLE_URL` to show it in the menu.

First sign-in:

1. Create a Super Admin in `plugev-api`:
   ```bash
   npm run seed:super-admin -- --email you@example.com --name "Your Name"
   ```
2. Sign in at http://localhost:3000. The portal asks you to set up MFA: scan the QR code with
   Google Authenticator or Microsoft Authenticator, enter the code, and save the recovery codes.

Emails are logged by the API (`MAIL_TRANSPORT=log`). To follow an invitation or reset link, copy it from the API log.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm test` | Unit and screen tests (Vitest, jsdom) against a fake API |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serves `dist/` with the same Content Security Policy as the Docker image |

## Settings

Read at build time and visible in the browser, so never put secrets here.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000/api/v1` | plugev-api as the browser reaches it |
| `VITE_CONSOLE_URL` | (none) | Phase 0 charger console. When set, it appears in the menu |

The Docker image (nginx, non-root, port 8080) takes these as build arguments. It also reads `API_ORIGIN` at
start-up for its Content Security Policy.

## How sign-in is kept

- **Access token** (15 minutes): kept in memory only.
- **Refresh token:** kept in `localStorage`, so a reload or a second tab stays signed in. The API rotates it
  on every use and signs out every session if an old one is reused, so:
  - refreshes are serialised across tabs with the Web Locks API;
  - each refresh reads the newest token first.
- **Sign-out:** revokes the refresh token on the server, and other open tabs sign out too.
- **Retries:** only a rejected access token is retried, after one refresh. A wrong MFA code is never sent twice.
