# Phase 2 – Administration portal

Reference: spec §16 (Phase 2), backlog epics E2.1–E2.6 in [../phase-0/backlog.md](../phase-0/backlog.md).

Status: **in progress** (branch `phase-2-chargers`). Parts of Phase 2 were started early, during Phase 1, in the new admin portal (`plugev-admin`):

| Epic | Already done | Still open |
|---|---|---|
| E2.1 Portal shell | Sign-in, MFA, menu in the old portal's look | Remaining menu items |
| E2.2 Networks | Add, edit, suspend, reactivate, archive; Network Admins via User Management | Contact, address and bank details (with Accounts) |
| E2.3 Stations | Add, rename, active/inactive; Station Admins via User Management; address, GPS location, phone, local time zone, opening hours, amenities; shown in or hidden from the app | Map search for the app (PostGIS, spec 8.3) comes with the app |
| E2.4 Chargers and connectors | Register chargers with their connectors; edit, move, enable/disable; QR code per connector and a printable sticker sheet | Live state (online, last seen, faults: FR EVSE 003) comes from the gateway in Phase 3; device configuration (FR EVSE 005) too |
| E2.5 Users and admins | Done in Phase 1 | — |
| E2.6 Dashboards | — | Status per network, station and charger |

## Live charger status (start of Phase 3)

The gateway (`plugev-server`) now reports what chargers do to the platform (backlog E3.4, canonical events per
ADR-004/007). The charger page shows:

- online or offline, when it was last heard from, since when, and why it went offline;
- what the charger reports at boot (make, model, serial number, firmware; the firmware is stored on the charger);
- the status of the charger and of each connector (Available, Occupied, Charging, Faulted and so on), refreshed every
  15 seconds; while offline, only as the last known status;
- warnings when the charger connects with a different protocol than registered, reports another serial number, or
  reports a connector that is not registered.

The terminals tables show each charger's connection. Sessions, meter values and remote commands through the platform
come next (E3.5, E3.6); until then the charger console stays in use for those.

To turn the link on, set the same key in both apps (at least 32 characters):

| App | Setting |
|---|---|
| `plugev-api/.env` | `GATEWAY_API_KEY=<key>` |
| `plugev-server/.env` | `PLATFORM_API_URL=http://localhost:4000/api/v1` and `PLATFORM_GATEWAY_KEY=<key>` |

Restart both. The gateway logs `Platform link on`, and warns once for each charger that is not registered in the
admin portal.

## How the pieces fit

```
PLUG EV platform
 └─ Charging network     a business that owns chargers (one tenant)
     └─ Charging station    one site with an address, e.g. Kottawa Kinro
         └─ Charger            one machine; talks to the gateway over OCPP
             └─ Connector         one plug (or socket) that goes into the car: 1 or 2 per charger
```

Names for the charger level:

| Where | Name |
|---|---|
| Spec | **EVSE** |
| Old portal | **Charger terminal** |
| OCPP 1.6 | **Charge point** |

All three mean the same machine. The portal tab keeps the old name, **Charger Terminals**.

## E2.4 Chargers and connectors

Built as planned below. API: `GET/POST /evses`, `GET/PATCH /evses/{id}`, `GET/POST /evses/{id}/connectors`,
`PATCH /evses/{id}/connectors/{connectorId}` (spec 9.2). Portal: the **Charger Terminals** tab, the chargers on each
station page, a page per charger, and **Print QR stickers**.

### Charger (EVSE)

- Belongs to one station.
- **OCPP identity:** the ID the charger uses when it connects to the gateway, such as `KTW-01`. It is unique across the platform.
- **Protocol:** OCPP-J (1.6J) or OCPP-S, the same split as in the Phase 0 PoC.
- **Device details:**
  - make, model, serial number and firmware, reported by the charger at boot where possible
  - maximum power
- **Status:** enabled or disabled. Disabled means the platform refuses to start sessions on it.
- **Connectors:** 1 or 2.

### Connector: the plug that goes into the car

| Field | Notes |
|---|---|
| Number | **1 or 2**, as the charger numbers them in OCPP. Number 0 in OCPP means the whole charger, so it is never a connector |
| Type | CCS2, CHAdeMO, Type 2 or GB/T. The car's port must match it |
| Current | AC or DC |
| Maximum power | In kW |
| Cable | Attached cable, or a socket where the driver brings their own cable (common on AC chargers) |
| Enabled | Can be switched off on its own, for example a broken plug |
| QR code | Its public code, see below |

Each connector has its own status (Available, Preparing, Charging, Faulted and so on) and its own charging sessions. One can be busy while the other is free. Two connectors often share the charger's power, or only one can charge at a time; the connector status reports this, so the app can show "unavailable while connector 1 is charging". Live status comes in Phase 3 (E3.4). Phase 2 stores the configuration.

### Portal screens

- **Charger Terminals tab** (the "Soon" tab on the Stations page): all chargers in scope, with their station, connectors and status.
- **Station page:** the station's chargers, and *Add charger*.
- **Charger page:**
  - its details
  - its connectors, with *Add / edit connector*
  - *Enable / disable*
  - *Print QR codes*
- Who can do what, following the existing roles:
  - **Network Admin and Super Admin:** add and change chargers and connectors.
  - **Station Admin:** read only; remote commands only if delegated (Phase 3).

## QR codes: scan to start charging (Phase 4)

How it will work: the driver scans the QR code on the charger with the app, then starts charging (backlog E4.3).

1. **Scan.** The code tells the app which charger and which connector the driver is standing at. It is a label, not a key.
2. **Check.** The platform checks:
   - the driver is signed in and can pay (wallet balance or card, Phase 5)
   - the network, station, charger and connector are all active
   - the connector is free, and the cable is plugged in
3. **Confirm.** The app shows the station, the connector type and power, and the price. The driver taps *Start*.
4. **Start.** The platform sends the OCPP remote-start command for **that connector number** with the driver's ID. It is the same command as the portal's Remote Start.
5. **Charge and stop.** The session is recorded against the connector, and so counts for its charger, station and network. The driver stops in the app, or the car finishes, or they unplug.

The codes are made in **Phase 2**, when a charger is registered, so they can be printed and stuck on before the app exists. The scanning itself is **Phase 4**.

### What was built

- **One QR code per connector.** The code is the charger's six-character public code plus the connector number,
  for example `K7M3QX-1`. The public code is random, avoids look-alike characters (no 0/O, 1/I), and never changes.
- **The link** is `QR_LINK_BASE` + `/` + code, for example `https://<domain>/c/K7M3QX-1`. Until `QR_LINK_BASE` is set,
  it defaults to the portal address + `/c`. The sticker page warns when the links point to a test address.
- **Replacing a charger:** edit its Charger ID (OCPP identity) and serial number. The stickers stay valid.
- **The sticker:** PLUG EV logo, "Scan to charge", the QR code, "Connector 1 · CCS2 · DC 60 kW", the code in large
  letters for typing in, and the station name. Two stickers per row on A4.

Nothing in the app reads the link yet; that is Phase 4.

### Decisions to make before printing any stickers

Codes are printed on chargers and are hard to change later.

1. **One code per connector (proposed) or one per charger.**
   - Per connector: the scan identifies the exact plug, which saves a step and avoids starting the wrong one.
   - Per charger: half the stickers, but the app must ask "which connector?".
2. **What the code contains (proposed):** a short web link with a stable public code, for example `https://<domain>/c/KTW01-1`.
   - A normal phone camera opens the app, or a page with "get the app" when the app is not installed.
   - It never contains database IDs or the charger's OCPP connection details.
   - The platform looks the code up, so when a charger is replaced the same sticker is pointed at the new one.
   - Open: which domain to use. It must stay the same for years.
3. **Plugging in after tapping Start:** allow a short window, about 60 seconds, to plug in after tapping *Start*, if the chargers support it. Check this on the SETEC charger.
4. **Sticker format:**
   - size, material for outdoor use, and the printed text next to the code ("Connector 1 · CCS2 · 60 kW")
   - a short code printed under the QR for manual entry when the camera fails

## Questions for the client

- Charger makes and models, and how many connectors and of which types (the discovery questionnaire §4.1 asks this).
- One QR code per connector or per charger, and the domain for the links.
- Who prints and fits the stickers.
