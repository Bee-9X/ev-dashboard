# Phase 0 – Architecture Decisions (proposed)

Each record is **Proposed** until approved at Phase 0 sign-off. The spec's technology table (§6.3) is a set of recommendations, so these records choose among its options and note where the spec needs an amendment.

---

## ADR-001 – Support OCPP-S (1.5/1.6 SOAP) as a first-class adapter

**Context.** Spec §7.2 lists OCPP 1.6J, 2.0.1 and 2.1 as candidates. The chargers on hand speak **OCPP 1.5/1.6 SOAP**, which the spec does not mention. SOAP differs structurally: the charger POSTs to us, and we must POST commands *to the charger's own address*. That fails behind NAT or mobile networks.

**Decision (proposed).**
1. Amend spec §7.2 to add "OCPP 1.5/1.6 SOAP: existing fleet; supported."
2. Keep a SOAP adapter behind the same adapter interface as OCPP-J (as the PoC already does).
3. Per model, decide between "full control" and "monitoring only" from PoC test-plan results (command endpoint reachability).
4. Ask the vendor whether OCPP 1.6J firmware exists, and prefer it for new installations.

**Open question.** Do SOAP chargers' command endpoints reach the server? See the PoC test plan's "SOAP-specific check".

---

## ADR-002 – PostgreSQL as the system of record (replace MongoDB)

**Context.** The spec data model (§8) is relational: tenant scoping by `network_id` on every row, foreign keys (§8.2), decimal money (§8.2), immutable financial/audit records, and geospatial nearest-station queries (§8.3). The PoC uses MongoDB Atlas.

**Options.** (a) Keep MongoDB. (b) PostgreSQL + PostGIS, plus TimescaleDB for meter values. (c) PostgreSQL now, time-series storage later.

**Decision (proposed).** (c): **PostgreSQL** (managed) with versioned migrations from Phase 1. Meter values go in a plain partitioned table at first; add TimescaleDB when volume demands it (§12.1 inputs decide). MongoDB stays only for the Phase 0 PoC.

**Consequence.** PoC data is not migrated, except the charger registry, which can be re-entered or exported.

---

## ADR-003 – Backend: Node.js + TypeScript + NestJS, as a modular monolith

**Context.** Spec §6.2 recommends a modular monolith for business domains plus a separately deployable charger connectivity service. §6.3 lists Spring Boot, .NET or Node/NestJS. The team's existing skills are JavaScript/React.

**Decision (proposed).**
- **NestJS (TypeScript)** for the core API, with modules matching the spec domains: identity, networks, stations, EVSEs, sessions, tariffs, payments, notifications, reports, audit.
- REST under `/api/v1` with OpenAPI (§9.1).
- Authorization is enforced in one place: RBAC plus tenant/station scope derived from the token, never from client input (§2.2).

---

## ADR-004 – Charger gateway as a separate service; Node.js first

**Context.** §6.3 suggests Java, .NET or Go for the gateway because of long-lived connections. The PoC gateway is Node.js and already handles both protocols.

**Decision (proposed).**
- Evolve `plugev-server` into the **gateway service** (TypeScript, same adapter split as the PoC).
- It owns charger connections and protocol translation only, and publishes canonical events (§7.4) to a **message broker (RabbitMQ)**.
- The core consumes those events and sends commands back through the broker, with correlation IDs (§5.3).
- Node handles thousands of WebSocket connections per instance. Revisit Go only if §12.1 capacity numbers require it.

---

## ADR-005 – New admin portal in React + TypeScript (retire the template)

**Context.** The current portal is a third-party admin template:
- React Router 5 and reactstrap 8, which need `npm install --force`.
- Six chart libraries and jQuery.
- Most pages show fake data.
- A hard-coded login.

The spec needs role-aware navigation, tenant scoping and many new screens.

**Decision (proposed).**
- Start a **new React + TypeScript app** in Phase 2 (Vite, React Router 6+, one component library, one chart library).
- Typed API client generated from the OpenAPI spec.
- Port the useful pieces: the Sri Lanka district map and the charger console layout.
- The old client stays as the Phase 0 test tool until the new portal replaces it.

---

## ADR-006 – Hosting, secrets and environments

**Context.** The PoC runs on a laptop behind ngrok (URL changes on restart, no TLS for chargers using `http://`). Credentials were committed to git.

**Decision (proposed).**
- Phase 1 sets up Dev / QA / Staging / Prod (§14.1) on the chosen cloud.
- Managed PostgreSQL; secrets in the provider's secret manager.
- TLS everywhere; `wss://` for OCPP-J where the charger supports it.
- A **stable DNS name** for chargers, e.g. `ocpp.plugev.lk`, so reconfiguring chargers is never needed again.
- CI runs tests and dependency scanning on every PR (§14.2).

---

## ADR-007 – Canonical charger event model

**Context.** Spec §6.4 and §7.4: business services must not depend on protocol message formats.

**Decision (proposed).**
- Adopt the §7.4 event list as the contract between gateway and core: DeviceConnected/Disconnected, HeartbeatReceived, ConnectorStatusChanged, MeterValueReceived, AuthorizationRequested/Result, ChargingStarted/Stopped, RemoteCommandRequested/Result, DeviceFault*, FirmwareStatusChanged, ConfigurationChanged.
- Raw protocol status is preserved alongside the normalized status (Appendix A). For example, OCPP 1.5 `Occupied` maps to normalized "occupied", and the raw value is kept.
- The PoC's `src/core/handlers.js` is the starting point.
