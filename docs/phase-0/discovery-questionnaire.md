# Phase 0 – Discovery Questionnaire

For the **business owner / product owner**. Each answer closes an open decision from spec §17, §17.1 and §12.1. Where a recommendation exists it is given; replace it if your answer differs. "TBD" items block estimation of Phase 1–6 (spec §16: *"The schedule and cost should be estimated after Phase 0"*).

Owner: ______________  Target date: ______________

## 1. Charger fleet (spec §17 "Charger protocols", §17.1)

| # | Question | Answer |
|---|---|---|
| 1.1 | List every charger brand / model / firmware in use or planned (fill one row per model in the table below) | |
| 1.2 | Which protocol does each speak today (OCPP 1.5 SOAP, 1.6 SOAP, 1.6J, 2.0.1, vendor API)? Can the vendor upgrade SOAP units to OCPP 1.6J firmware? | |
| 1.3 | Do we have vendor protocol documentation and a support contact for each? | |
| 1.4 | Is at least one test unit (or vendor simulator) available per model? (§17.1) | |
| 1.5 | How do chargers connect (SIM, site Wi-Fi, Ethernet)? Is there a fixed public IP or VPN? (Decides whether SOAP commands can reach them; see the PoC test plan) | |
| 1.6 | Which remote commands must work per model (start/stop, reset, unlock, availability)? Is remote start/stop permitted at all for each network? (§17 "Charger control") | |

| Brand | Model | Firmware | Protocol | Connectors (type / kW) | Units | Test unit? |
|---|---|---|---|---|---|---|
| | | | | | | |

## 2. Business model and identity (spec §2, §17)

| # | Question | Recommendation | Answer |
|---|---|---|---|
| 2.1 | Confirm: independent networks under one Super Admin, no roaming in the first release | Yes (spec baseline) | |
| 2.2 | EV users: one platform-wide account, or one account per network? | One platform account with per-network access rules (spec §17) | |
| 2.3 | List the initial networks and their admins | | |
| 2.4 | Rules for assigning Station Admins (who may create them; one admin for many stations?) | | |
| 2.5 | Do Station Admins get remote-command permissions by default? | No; grant per station (spec §3.2) | |
| 2.6 | Are approval workflows needed for high-risk commands (dual approval or a reason entry)? | Reason entry for Hard reset and Unlock; no dual approval at first | |

## 3. Money (spec §4.7, §4.8, §17)

| # | Question | Answer |
|---|---|---|
| 3.1 | Payment service provider (PSP)? Sandbox access available? | |
| 3.2 | Who receives the money: the platform or each network? Who settles with whom? | |
| 3.3 | Pre-authorize then capture, prepaid wallet / top-up, or postpaid? (The current template has a "Top-up" screen.) | |
| 3.4 | Currencies and operating countries; tax rules and invoice format (provide a sample invoice) | |
| 3.5 | Tariff types needed: per kWh / per minute / per session / idle fee / fixed fee? Provide 2–3 real tariff examples | |
| 3.6 | What happens when a tariff changes during an active session? | |
| 3.7 | Refund policy and who may issue refunds | |

## 4. Scale and service levels (spec §12, §12.1, §17)

| # | Question | Answer |
|---|---|---|
| 4.1 | Number of networks / stations per network / EVSEs per station / connectors per EVSE, now and in 2 years | |
| 4.2 | Expected sessions per day; monthly active app users; peak concurrent users | |
| 4.3 | Meter value interval wanted (e.g. 60 s) | |
| 4.4 | Uptime target (spec proposes 99.5 %), support hours, RPO ≤ 15 min / RTO ≤ 4 h acceptable? | |

## 5. Hosting, legal and product (spec §11.2, §17)

| # | Question | Answer |
|---|---|---|
| 5.1 | Cloud provider and region; data residency requirements (must data stay in Sri Lanka?) | |
| 5.2 | Budget range for hosting | |
| 5.3 | Initial UI languages (English / Sinhala / Tamil?) and who provides translations | |
| 5.4 | Branding assets; legal terms and privacy notice owner | |
| 5.5 | Map provider preference (Google Maps, Mapbox, OpenStreetMap) and the station location dataset | |
| 5.6 | Notification channels required at launch: push / SMS / email? SMS provider? | |
| 5.7 | Mobile app: Flutter or React Native? (Recommendation: React Native, so the team reuses its React/TypeScript skills) | |

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Business owner | | | |
| Technical lead | | | |
