# Draft Product Backlog (Phases 1–6)

Epics per spec phase. Requirement IDs refer to spec §4; acceptance criteria (AC) to §15.2. Estimate after Phase 0 sign-off; the order inside a phase is a suggestion.

## Phase 1 – Foundation
| Epic | Scope | Spec refs |
|---|---|---|
| E1.1 Environments and CI/CD | Repos, protected branches, CI (lint, test, dependency scan), container builds, Dev/QA environments, secrets manager | §14.1, §14.2, ADR-006 |
| E1.2 Database and migrations | PostgreSQL, migration tool, core schema (users, roles, networks, stations, EVSEs, connectors, audit_logs) | §8.1, §8.2, ADR-002 |
| E1.3 Identity | Login, refresh-token rotation, password reset, account status, MFA for admins, login event log | FR AUTH 001–006 |
| E1.4 Authorization | RBAC permissions, tenant/station scope enforcement, deny-by-default, scope derived from token | §2.2, §3, AC 02, AC 03 |
| E1.5 Audit log | Append-only audit records for privileged actions with correlation IDs | §3.2, §11.3 |
| E1.6 API framework | `/api/v1`, OpenAPI, error format, pagination, idempotency keys, correlation IDs | §9.1, §9.3 |
| E1.7 Observability | Structured logs, metrics, health/readiness endpoints, alerting baseline | §13.2 |

## Phase 2 – Administration portal
Plan and progress: [../phase-2/README.md](../phase-2/README.md)

| Epic | Scope | Spec refs |
|---|---|---|
| E2.1 Portal shell | New React+TS app, role-aware navigation, login/MFA screens | ADR-005 |
| E2.2 Networks | Create/suspend/archive networks, assign Network Admins | FR NET 001–005, AC 01 |
| E2.3 Stations | Station CRUD, location, hours, time zone, visibility, Station Admin assignment | FR ST 001–005 |
| E2.4 EVSEs and connectors | Register EVSE with protocol and identity mapping, connectors (1–2 per charger: number, type, power), enable/disable, QR code per connector. Details: [../phase-2/README.md](../phase-2/README.md) | FR EVSE 001–006, AC 04 |
| E2.5 Users and admins | Invite, activate/deactivate, role and scope assignment | App. B "Admin users" |
| E2.6 Dashboards | Network/station/EVSE status with freshness indicators | FR MON 001, 003, 006, §13.1 |

## Phase 3 – Charger integration
| Epic | Scope | Spec refs |
|---|---|---|
| E3.1 Gateway service | Productionize the PoC gateway: TypeScript, broker, canonical events, device authentication | §7, ADR-004, ADR-007 |
| E3.2 OCPP-J adapter | From the PoC, plus security profile (basic auth / TLS), subprotocol checks | §7.5 |
| E3.3 OCPP-S adapter | From the PoC, plus the outcome of the ADR-001 open question | ADR-001 |
| E3.4 Live status | Connector availability service, offline detection, alerts to admins, outage records | FR MON 002–006, §5.4, AC 05 |
| E3.5 Sessions | Session lifecycle, idempotent event processing, reconciliation, meter value storage | FR SES 001–007, AC 06–08 |
| E3.6 Remote commands | Async command API with command ID, permission check, audit, final-state confirmation | §5.3, §9.4, AC 11 |
| E3.7 Live updates | WebSocket/SSE to portal and app, polling fallback | FR MON 005 |

## Phase 4 – Customer app
| Epic | Scope | Spec refs |
|---|---|---|
| E4.1 App foundation | React Native (proposed) app, auth, secure token storage | FR APP 001–002, §10.2 |
| E4.2 Discovery | Map/list, filters, station details, nearby search (PostGIS) | FR APP 003–005, §8.3, AC 09 |
| E4.3 Charging | Scan the connector's QR code (made in E2.4), start/stop with idempotency, live session screen | FR APP 006–007 |
| E4.4 History | Sessions, receipts, support requests | FR APP 008, FR SUP 001 |
| E4.5 Push | Push notifications with consent | FR APP 009, FR NOT 001 |

## Phase 5 – Payments and reporting
| Epic | Scope | Spec refs |
|---|---|---|
| E5.1 Tariffs | Tariff versions, components, cost estimate vs. final | FR TAR 001–005 |
| E5.2 Pricing engine | Final cost from tariff version and validated meter data | §5.2 |
| E5.3 PSP integration | Payment intents, signed idempotent webhooks, refunds with reason | FR PAY 001–007, AC 08 |
| E5.4 Reports | Scoped reports, async exports (CSV/XLSX/PDF), financial reconciliation | FR REP 001–005, §13.3, AC 10 |
| E5.5 Notifications and tickets | Templates, channels, maintenance tickets | FR NOT 001–003, FR SUP 002 |

## Phase 6 – Hardening and launch
| Epic | Scope | Spec refs |
|---|---|---|
| E6.1 Security testing | Pen test, tenant-isolation tests, device impersonation tests | §11.4, §15.1 |
| E6.2 Load testing | Charger connection count, telemetry throughput, dashboard traffic | §12, §15.1 |
| E6.3 Backup/DR | Point-in-time recovery, restore drill, runbooks | §14.3, AC 12 |
| E6.4 UAT and go-live | UAT per role, training, production deployment, handover | §15.1, §16 |
