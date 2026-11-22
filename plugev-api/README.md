# plugev-api – PLUG EV core API

Phase 1 foundation of the platform described in the technical specification:

- **Identity**: login, refresh-token rotation, logout, password reset, invitations, account status, lockout, login event log (FR AUTH 001, 002, 004, 005, 006).
- **MFA** (FR AUTH 003): authenticator-app codes (TOTP), recovery codes, MFA required per role.
- **Authorization**: RBAC with network and station scope, resolved on the server and deny by default (spec 2.2, 3).
- **Audit**: append-only audit log, enforced by the database (spec 3.2, 11.3).
- **API standards**: `/api/v1`, OpenAPI, one error format, correlation IDs, pagination (spec 9).
- **Ops**: health and readiness probes, structured JSON logs (spec 13.2).

Networks and stations exist only so tenants and station scope can be tested. Full station, EVSE and connector management is Phase 2.

Stack (ADR-002, ADR-003): Node 24, NestJS 11, TypeScript, PostgreSQL, TypeORM migrations, Argon2id, pino.

## Run locally

Requirements: Node 22.12+ and PostgreSQL 13+ (PostgreSQL 18 is already installed on the dev PC).

```bash
cd plugev-api
npm install
cp .env.example .env
```

1. Create a database, e.g. in pgAdmin or `psql`: `CREATE DATABASE plugev;`
2. In `.env`:
   - set `DATABASE_URL`;
   - set `JWT_ACCESS_SECRET` (generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`);
   - set `MFA_ENCRYPTION_KEY` (generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
3. Create the first Super Admin. The command asks for the password, so it is not saved in shell history:
   ```bash
   npm run seed:super-admin -- --email you@example.com --name "Your Name"
   ```
4. Start the API:
   ```bash
   npm run start:dev
   ```
   - API: http://localhost:4000/api/v1
   - Interactive docs: http://localhost:4000/api/docs

Migrations run automatically at startup (`DB_RUN_MIGRATIONS=true`). They can also be run by hand with `npm run migration:run` / `migration:revert`.

## Try it

```bash
# sign in
curl -s -X POST localhost:4000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"..."}'
# use the accessToken
curl -s localhost:4000/api/v1/users/me -H "authorization: Bearer <accessToken>"
```

Or use the **Authorize** button in the docs page.

Typical first steps as Super Admin:
1. `POST /networks`
2. `POST /stations`
3. `POST /users` to invite a Network Admin.

## Email

No email provider is chosen yet, so `MAIL_TRANSPORT=log` (the default) writes each email to the API log instead of sending it: subject, recipient and the full text, **links included**. To complete an invitation or password reset during development, copy the link from the log line `Email not sent (MAIL_TRANSPORT=log)`.

When a provider is chosen, set `MAIL_TRANSPORT=smtp` and the `SMTP_*` settings (see `.env.example`); no code change is needed:

| Provider | SMTP_HOST (example) | Port |
|---|---|---|
| Amazon SES | `email-smtp.ap-south-1.amazonaws.com` | 587 |
| Azure Communication Services | `smtp.azurecomm.net` | 587 |
| SendGrid | `smtp.sendgrid.net` | 587 |
| Microsoft 365 | `smtp.office365.com` | 587 |

How sending behaves:
- **Startup check:** the API checks the SMTP login at startup and logs the result.
- **Failures:** a failed delivery is logged but does not fail the request.
- **Production warning:** the log transport prints a warning at startup in production, because reset links in logs are sensitive.

## MFA

Super Admin and Network Admin **must** use MFA. Station Admins can turn it on themselves. A Super Admin can change which roles require it (`PATCH /roles/{code}`).

Sign-in with MFA is two steps:

| Login response `status` | Next call |
|---|---|
| `authenticated` | Done: tokens are in the response |
| `mfa_required` | `POST /auth/mfa/verify` with `mfaToken` and a 6-digit `code` (or one `recoveryCode`) |
| `mfa_enrollment_required` | The role requires MFA and none is set up: `POST /auth/mfa/enroll` (returns a secret and an `otpauth://` URL to show as a QR code), then `POST /auth/mfa/enroll/confirm` with a code. The response holds the tokens and **10 recovery codes, shown once** |

The `mfaToken` is valid for 5 minutes and only at these endpoints.

Other MFA behaviour:
- **First sign-in:** the first Super Admin is asked to set up MFA. Have an authenticator app ready (Google or Microsoft Authenticator, Authy, 1Password, ...).
- **Code reuse:** each code works once.
- **Lockout:** wrong codes count towards the same 5-attempt lockout as wrong passwords.
- **Stored secrets:** encrypted with `MFA_ENCRYPTION_KEY`. Losing or changing that key means everyone must set up MFA again.
- **Self-service:** `GET/POST/DELETE /users/me/mfa…` to check status, set up, regenerate recovery codes, or turn MFA off when no role requires it.
- **Lost phone:** another administrator calls `POST /users/{id}/mfa/reset` with a reason. This ends the user's sessions, and they set MFA up again at the next sign-in.

## Docker

`plugev-api/Dockerfile` builds a small production image:
- the compiled app and production packages only;
- runs as a non-root user;
- has a health check;
- takes its configuration from environment variables only, so the same image runs on Azure or AWS.

To run the whole platform locally (API, gateway, portal, PostgreSQL, MongoDB), see `docker-compose.yml` at the repository root. Create the first Super Admin in the container with:

```bash
docker compose exec -it api node dist/cli/create-super-admin.js --email you@example.com --name "Your Name"
```

## Tests

```bash
npm test
```

- 99 tests: unit tests, plus end-to-end tests against a real PostgreSQL.
- Locally a throwaway PostgreSQL is downloaded and started automatically (embedded-postgres). No setup is needed and your own database is not touched.
- Set `TEST_DATABASE_URL` to use an existing empty database instead; CI does this.

## Roles

| Role | Scope | Can |
|---|---|---|
| SUPER_ADMIN | Platform | Everything. Created only with the CLI command or by another Super Admin. |
| NETWORK_ADMIN | One network | Edit own network; create stations; invite and manage Station Admins in the network; read users and audit log of the network. Cannot suspend networks. |
| STATION_ADMIN | Assigned stations | Read and update assigned stations. Remote commands only if delegated later. |
| EV_USER | Own account | Customer app, Phase 4. |

The permission catalogue is in `src/access/permissions.ts`; the database copy is seeded by migration.

Rules enforced by the code:
- Scope always comes from the signed-in user's role assignments. Ids that the client sends are checked against it.
- A resource outside the caller's scope answers **404**, not 403, so other tenants' ids cannot be probed.
- Changes take effect on the next request:
  - suspending a user;
  - removing a role;
  - suspending a network (it cuts off that network's admins).
- The platform always keeps at least one active Super Admin, and nobody can change their own status or remove their own Super Admin role.

## Error format

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Request validation failed", "correlationId": "…", "details": [{ "field": "email", "issues": ["email must be an email"] }] } }
```

Every response carries `X-Correlation-Id`. Clients may send their own; it is used in logs, audit rows and errors.

## Layout

```
src/
  access/     permission catalogue, AccessContext (scope), global AccessGuard, decorators
  auth/       login, tokens (JWT access + rotating refresh), MFA (TOTP, recovery codes), password reset/invite, login events
  users/      invite, roles, status
  networks/   networks + minimal stations
  audit/      append-only audit service and query endpoint
  common/     error format, correlation id, validation, pagination
  database/   entities, migrations, data source
  cli/        create-super-admin
test/         end-to-end tests (auth, rbac, platform)
```
