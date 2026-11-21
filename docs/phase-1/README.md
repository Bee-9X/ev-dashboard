# Phase 1 – Foundation

Reference: spec §16 (Phase 1 "Foundation"), backlog epics E1.1–E1.7 in [../phase-0/backlog.md](../phase-0/backlog.md).

Phase 1 started on 2026-11-21, alongside the remaining Phase 0 items (the real-charger test at the SETEC site, and sign-off). The two do not depend on each other: Phase 1 builds identity, access control and the API base, and none of that depends on charger results.

## Decisions taken

| Decision | Status |
|---|---|
| PostgreSQL as the system of record (ADR-002) | **Accepted** 2026-11-21 |
| New backend in this repository: `plugev-api/` | **Accepted** 2026-11-21 |
| NestJS + TypeScript (ADR-003) | Used as proposed (NestJS 11; see ADR-003 note) |
| Hosting provider (ADR-006) | **Open**. Phase 1 runs locally, with CI on GitHub Actions |

## Progress

| Epic | Scope | Status |
|---|---|---|
| E1.1 Environments and CI/CD | GitHub Actions: tests and dependency audit for all three apps on every PR | 🟡 CI done. Environments wait for the hosting decision |
| E1.2 Database and migrations | PostgreSQL schema: networks, stations, users, roles, permissions, assignments, tokens, login events, audit; versioned migrations | ✅ |
| E1.3 Identity | Login, refresh rotation with reuse detection, logout, reset, invitations, lockout, account status, login events | ✅, except **MFA (FR AUTH 003)**, next increment |
| E1.4 Authorization | RBAC, network/station scope from the token's user, deny by default, 404 outside scope | ✅ |
| E1.5 Audit log | Append-only, enforced by database triggers; actor, roles, scope, correlation id, outcome | ✅ |
| E1.6 API framework | `/api/v1`, OpenAPI at `/api/docs`, error format, correlation ids, pagination, validation | ✅. Idempotency keys come with the first endpoints that need them (sessions, payments) |
| E1.7 Observability | JSON logs with correlation ids, liveness/readiness | 🟡 Metrics, tracing and alerting wait for hosting |

## Next increments

1. **MFA for administrators** (FR AUTH 003): TOTP enrolment, verification at login, recovery codes, configurable as mandatory for privileged roles.
2. **Portal login against `plugev-api`**: replace the template's hard-coded login. This starts the new portal (ADR-005).
3. **Hosting decision** (ADR-006), then Dev/QA environments, a secrets manager and deployment from CI.
4. Connect the gateway (`plugev-server`) to the core: charger registry in PostgreSQL, canonical events (ADR-004/007). This begins Phase 3 work.

## How to run

See [plugev-api/README.md](../../plugev-api/README.md).
