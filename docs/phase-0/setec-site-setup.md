# SETEC Charger – Site Setup for the PoC Test

**For:** the person at the charger site who manages the SETEC charger and the site router.
**Goal:** connect the real SETEC charger to the PLUG EV test server so we can verify monitoring **and** remote control (start, stop, reset).
**Time needed on site:** about 1 hour, including one real charging session with a vehicle.

---

## Why the router needs a change

The SETEC charger uses **OCPP 1.5 SOAP**. It works in two directions:

| Direction | What it carries | Works without router changes? |
|---|---|---|
| Charger → server | Status, sessions, meter readings | **Yes.** The charger connects out to the internet. |
| Server → charger | Remote start/stop, reset, unlock, settings | **No.** The server must connect *in* to the charger, which sits on the private site Wi-Fi. |

So the site needs **one** of the two options below. Option A is preferred.

---

## Before you start

Write down the charger's **current** settings so they can be restored after the test:

| Setting | Current value |
|---|---|
| OCPP / central system URL | |
| Charge box identity (ID) | |
| Charger's local IP address on site Wi-Fi | |
| Port the charger listens on for commands (the tablet used **8765**) | |
| Is the charger connected to another management system right now? | Yes / No |

If the charger is connected to another management system, pointing it to our server **disconnects it from that system** for the duration of the test.

Also check: the charger's local IP should be **fixed** (a DHCP reservation in the router), so it does not change after a restart.

---

## Option A – Site VPN (preferred)

The test server and the site join the same private network. The server then reaches the charger's local address directly. Nothing is opened to the internet.

1. Add a VPN device on the site network. Either:
   - a router that supports WireGuard or Tailscale (many current routers do), or
   - a small always-on device on the site Wi-Fi (for example a Raspberry Pi) running Tailscale as a "subnet router".
2. Share the site's local network range (for example `192.168.0.0/24`) through the VPN.
3. The PLUG EV developer joins the server to the same VPN.
4. **Important:** the site's network range must not be `192.168.1.x`, because the developer's network already uses it. If it is, tell the developer before setting up the VPN.

With this option the charger keeps its normal settings apart from the server URL (see "Point the charger to the test server").

---

## Option B – Port forwarding

The router forwards one public port to the charger.

1. Find the site's **public IP**. It is shown on the router status page or at any "what is my IP" website.
   - If the internet provider changes it from time to time, turn on **dynamic DNS** in the router (for example a `something.ddns.net` name) and use that name instead.
2. In the router, add a port forward:
   - External port: for example `8765` (TCP)
   - Internal IP: the charger's local IP
   - Internal port: the charger's command port (for example `8765`)
3. If the router supports it, allow that port **only from the PLUG EV server's IP address**. The developer will give you this address. Without that limit, anyone on the internet can reach the charger's command port.
4. Send the developer the public address, for example `http://203.0.113.10:8765` or `http://plugev-site.ddns.net:8765`. The developer enters it in the portal as the charger's **command endpoint override**.

---

## Point the charger to the test server

On the charger (or the SETEC tablet/screen that configures it):

| Setting | Value |
|---|---|
| OCPP version | 1.5 (SOAP) |
| Central system URL | `http://<server address from the developer>/ocpp/<charge box identity>` |
| Charge box identity | Use a different identity from the test tablet (the tablet uses `c1`), for example `setec-site-01` |

Then restart the charger, or wait for its next connection attempt.

---

## Test on the day

The developer watches the server while you do these steps.

| # | Step | Expected result | OK? |
|---|---|---|---|
| 1 | Restart the charger | The portal shows it online with vendor and model | |
| 2 | — | Connector status (for example Available) appears within a minute | |
| 3 | Developer sends "Get configuration" | Charger settings appear in the portal. If it fails, check the VPN or port forward | |
| 4 | Plug in a vehicle | Connector status changes (for example Occupied / Preparing) | |
| 5 | Developer sends Remote start | Charging starts; energy and power readings update in the portal | |
| 6 | Developer sends Remote stop | Charging stops; a completed session with total energy appears | |
| 7 | Start and stop a session with the charger's own card or button | The session is recorded in the portal | |
| 8 | Unplug the vehicle | Connector status returns to Available | |
| 9 | Disconnect the charger's network for 2–3 minutes, then reconnect | Portal shows it offline, then online again, with the outage recorded | |
| 10 | Developer sends Soft reset (no vehicle connected) | Charger restarts and reconnects | |

The full checklist is in [poc-test-plan.md](poc-test-plan.md).

---

## After the test

- To go back to the previous management system, restore the **OCPP / central system URL** and **identity** you wrote down at the start.
- If you used port forwarding and the charger will not stay on PLUG EV, **remove the port forward**.
