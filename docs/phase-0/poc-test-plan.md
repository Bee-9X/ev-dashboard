# Phase 0 – Charger Proof-of-Concept Test Plan

Spec §7.6: *"Conduct a proof of concept covering connection, status, authorization, start/stop, meter values, faults, reconnect and session reconciliation."*

Run this plan **once per charger model and firmware version** you intend to support. The portal's *Phase 0 checklist* tab fills most of the "Result" column automatically from the charger's actual behaviour. Download the JSON report and keep it with this document as evidence.

## Before you start

- [ ] Backend running, tunnel up, charger configured with the URL from `plugev-server/commands.txt`.
- [ ] Charger registered in the portal (or `ALLOW_UNREGISTERED=true`).
- [ ] An EV or EV simulator/test load is available for real charging tests.
- [ ] An RFID card is available (for the Authorize test).
- [ ] The vendor has confirmed it is safe to trigger a fault (emergency stop or similar) on this unit.

## Charger under test

| Field | Value |
|---|---|
| Manufacturer / model | |
| Firmware | (auto: shown on the portal after boot) |
| Protocol and version | (auto: `protocol` field) |
| Connectors (number / type / max kW) | |
| Network path (SIM / Wi-Fi / Ethernet; NAT?) | |
| Command endpoint advertised (SOAP only) | (auto: "Command endpoint" row) |
| Tester / date | |

## Test cases

| # | Checklist id | Test | Steps | Pass when | Result |
|---|---|---|---|---|---|
| 1 | `connect` | Connection and boot | Power-cycle the charger | BootNotification accepted; vendor, model, serial and firmware appear in the portal | |
| 2 | `heartbeat` | Heartbeat | Wait 2 × heartbeat interval | "Last heartbeat" keeps updating; charger stays Online | |
| 3 | `status` | Status reporting | Plug in and unplug a cable | Connector goes Available → Preparing/Occupied → Available within ~10 s (spec §12 target 5–10 s) | |
| 4 | `authorize` | Local authorization | Tap the RFID card | Authorize appears in the message log. With `ID_TAG_ALLOWLIST` set, an unknown card is refused | |
| 5 | `remote-start` | Remote start | *Start charging* on a plugged-in connector | Command **Accepted**; StartTransaction follows; connector shows Charging | |
| 6 | `meter-values` | Meter values | Charge for at least 5 min | Energy/Power update in the connector table; list the measurands in the report | |
| 7 | `remote-stop` | Remote stop | *Stop charging* | Command **Accepted**; StopTransaction follows; session **Completed** with an energy value | |
| 8 | `session` | Local start/stop | Start with RFID, stop with RFID or by unplugging | Session recorded with the correct idTag, meter start/stop and stop reason | |
| 9 | `reconciliation` | Session reconciliation | Compare the portal kWh with the charger display / meter | Difference within the meter's stated accuracy; no Orphan or Interrupted sessions | |
| 10 | `reconnect` | Connection loss | Disconnect the charger's network for longer than `OFFLINE_AFTER_SEC` (90 s), then restore it | Charger goes Offline then Online; outage duration recorded; any queued messages arrive | |
| 11 | `reconnect` | Loss **during** charging | Repeat test 10 while charging | Session continues or ends cleanly; no duplicate sessions; meter values that were queued offline arrive | |
| 12 | `faults` | Fault reporting | Trigger a safe fault (vendor-approved) | Faulted status or an error code shown; it clears after recovery | |
| 13 | `reset` | Reset | *Soft reset*, then *Hard reset* | Accepted; charger reboots and sends a new BootNotification | |
| 14 | `unlock` | Unlock connector | *Unlock connector* with a cable locked in | Unlocked (or NotSupported, which is a finding to record) | |
| 15 | `availability` | Change availability | Set the connector inoperative, then operative | Accepted; status Unavailable → Available; remote start refused while inoperative | |
| 16 | `get-config` | Read configuration | *Read configuration* | Configuration tab lists the keys. Attach the list to the vendor documentation | |
| 17 | `change-config` | Change configuration | Change `HeartbeatInterval` to 60, then back to 30 | Accepted; heartbeat rate changes | |
| 18 | `trigger` | Trigger message (1.6 only) | Trigger StatusNotification | Accepted; a StatusNotification arrives | |
| 19 | — | Server restart | Restart the backend while the charger is idle | Charger reconnects on its own (OCPP-J) or on its next heartbeat (SOAP) | |
| 20 | — | Duplicate messages | Kill the tunnel mid-StartTransaction (best effort) | No duplicate session; the retried message reuses the same transaction | |

Result values: **Pass** / **Fail** / **Not supported by charger** / **Not tested**. For Fail or Not supported, describe what happened and attach message-log screenshots or the raw messages (`GET /api/chargers/:id/messages?raw=true`).

## SOAP-specific check

OCPP-S needs the **server to reach the charger** to send commands (tests 5, 7, 13–18). The charger advertises its address in `wsa:From`, shown as *Command endpoint*.

- If the endpoint is a private address (10.x, 172.16–31.x, 192.168.x) or a mobile carrier IP, commands will fail with "Could not reach charger". Record which applies:
  - [ ] Endpoint reachable as-is
  - [ ] Reachable via VPN / port forwarding / vendor proxy (describe). For port forwarding, set the public URL as the **command endpoint override** in the console. Site steps: [setec-site-setup.md](setec-site-setup.md)
  - [ ] Not reachable → this model is **monitoring-only** unless the vendor provides OCPP-J firmware

This finding decides ADR-001's open question.

## Summary per model (fill after testing)

| Model / firmware | Protocol | Tests passed | Not supported | Blocking issues | Recommended for production? |
|---|---|---|---|---|---|
| | | | | | |
