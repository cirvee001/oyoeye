# OyoEye v2.8 — Operational map: patrol vehicles, checkpoints, stations

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 28 Oct 2026

Builds on PRD v2 → v2.6 (v2.6 committed as `7614ef7`). Earlier rules still hold:

- front-end prototype with fictional data and simulated positions;
- the shell has at most 5 menu items per role;
- every protection stays;
- every event is audited;
- demo steps 1–28 must still pass.

## 1. Why

The v2.3 map shows incidents, hotspots, coverage circles and officers as dots. Officials expect a **control-room operational picture**: where the **patrol cars** are and what they're doing, where the **checkpoints** are, which **stations** have people and vehicles available, and which vehicle is nearest to a new emergency.

It also makes the funding case visible. "**Ibarapa: 3 vehicles, 2 out of service (no fuel, repair)**" on a map is the strongest argument an official can take to the Security Trust Fund.

## 2. New things on the map

### 2.1 Patrol vehicles (new data: `Vehicle`)

`Vehicle { id, callSign, stationId, kind, plate?, crewIds[], status, statusReason?, routeId?, caseId?, lastPosition, heading, history[] }`

- **`kind`:** `patrol_car` (Toyota Hilux / Sienna style), `motorcycle`, `armoured` (APC), `fire_truck`, `ambulance` (only where a station owns one), or `utility` (agency works van).
- **Call signs** are readable, e.g. `BDJ-P1` (Police Bodija patrol 1), `AMO-IB-2` (Amotekun Ibadan 2), `FIRE-IB-1`.
- **Statuses:**

  | Status | Colour | Meaning |
  | --- | --- | --- |
  | Available | green | At station or idle, crewed, can respond |
  | Patrolling | blue | Moving along its patrol route |
  | Responding | amber | Heading to a case |
  | On scene | purple | At the case location |
  | Out of service | grey | `statusReason`: No fuel · Under repair · No crew · Accident |

- **Simulated movement** is derived from the demo clock and never audited per tick:
  - **Patrolling:** loops along its patrol route (§2.4) at 30 km/h metro / 45 km/h rural.
  - **Responding:** a straight line toward the case at 40 / 60 km/h. Show the ETA.
  - **On scene:** at the case location.
  - **Available:** parked at the station.
  - **Out of service:** parked at the station, greyed.
- **Breadcrumb trail:** the last 15 minutes of positions as a fading dotted line, shown when a vehicle is selected.
- **Crew link:** officers in a vehicle's crew move with it and are not drawn separately. Officers on foot stay as the v2.3 officer markers.
- **Status changes:** commanders can set Out of service with a reason, Back in service, and change the crew, from My officers → a new **Vehicles** tab, or from the vehicle popup.
  - These changes are audited.
  - Out-of-service changes post a system message in the station chat ("BDJ-P2 out of service — no fuel").
- **Case-driven status:** when an officer in a crew presses **En route**, their vehicle becomes Responding to that case. **On scene** makes it On scene. **Resolved** sends it back to Available, or to Patrolling if it has a route.

### 2.2 Checkpoints (new data: `Checkpoint`)

`Checkpoint { id, name, stationId, kind, lat, lng, road, activeFrom, activeTo?, staffIds[], createdBy, status }`

- **`kind`:**
  - `permanent`: e.g. Ojoo–Moniya road, Iwo Road interchange.
  - `temporary`: stop-and-search, set up for hours.
  - `joint`: Police + Amotekun.
  - `community`: a registered vigilante or hunters' post, shown only to staff.
- **Status:** Active (solid) · Scheduled (outline) · Closed (hidden unless "Show closed").
- **Adding a checkpoint:** commanders and the duty lead can **add a temporary checkpoint from the map**:
  1. Right-click on desktop or long-press on mobile, then choose "Add checkpoint here".
  2. Fill in name, road, kind, start and duration (2 h / 4 h / 8 h / until closed), and staff from the station.
  3. Closing it is one click.
  - Both actions are audited and post a system message in the station chat.
- **Popup:** name, road, kind, station, staff on post (rank + name), active since, and "Cases within 1 km in the last 7 days: 3".
- **Conduct link.** Checkpoints are where extortion complaints often come from. If a conduct complaint (v2.3) names a location within 300 m of a checkpoint, the oversight panel's complaint page shows "Near checkpoint: Ojoo–Moniya road". **The checkpoint popup never shows complaints**, keeping the v2.3 rule that units never see complaints.

### 2.3 Stations (richer markers)

- **Icon:** a building-style marker per organisation, keeping the v2.5 letters P / A / F / G and colours.
- **Popup:**
  - station name;
  - readiness n/4;
  - commander;
  - **officers on duty / total**;
  - **vehicles available / total**, with a mini row of vehicle chips coloured by status;
  - open cases;
  - "View station" (admin, coordinator) or "My officers" (own commander).
- **Readiness warning:** a station with **no available vehicle** shows a small amber warning badge on its marker. With **no on-duty officers** the badge is red.

### 2.4 Patrol routes / beats (new data: `PatrolRoute`)

`PatrolRoute { id, stationId, name, points: [lat,lng][] }`

- 5–10 waypoints each, approximately along real main roads, labelled "Approximate route". Seed **about 2 routes per pilot station**, e.g. "Bodija – Sango – UI loop", "Ojoo – Moniya highway", "Igangan – Tapa road".
- Drawn as dashed lines in the station's colour when the Patrol routes layer is on.
- Commanders can assign a vehicle to a route in the Vehicles tab.

### 2.5 Hospitals and fire stations (reference places)

- Seed **about 8 hospitals** (general, teaching and state hospitals by area name only, e.g. "State Hospital, Saki" or "Teaching hospital, Ibadan"). Mark them as reference points with fictional or generic names.
- Fire stations are already stations. Show them in this layer too.
- **Why:** this supports v2.3 Officer SOS ("Officer injured — hospital"), and responders can see the nearest emergency care.

## 3. Map interface upgrades

### 3.1 Layer panel (replaces the chip row)

A collapsible panel at the top-right, with grouped toggles and counts:

- **Incidents:** Cases (n) · Hotspots · SOS only.
- **Resources:** Stations (n) · Patrol vehicles (n) · Officers on foot (n) · Checkpoints (n active) · Patrol routes · Station coverage.
- **Places:** Hospitals · LGA names.
- **Base map:** Standard (OSM) · **Dark** (CARTO Dark Matter, with the attribution "© OpenStreetMap contributors © CARTO") · Light (CARTO Positron).
  - Dark is the default for operator, duty lead and coordinator, because it's easier on the eyes and looks like a control room.
  - If tiles fail, the v2.3 offline fallback applies to any base.

The selection is remembered per user (as in v2.5).

### 3.2 Resources side panel (desktop ≥ 1024 px)

A collapsible left panel on the full map view (Cases → Map, and Overview map cards expanded):

- **Summary line:** "Vehicles: 14 available · 6 patrolling · 4 responding · 2 on scene · 5 out of service". Each part is clickable and filters the map.
- **Vehicle list:** call sign · station · status pill · current case ref or route · ETA if responding. Clicking a row **flies to** and selects the vehicle.
- **Checkpoint list** (active ones): name · station · staff count.
- **Search:** "Find call sign, checkpoint or station".

On phones the panel becomes a bottom sheet.

### 3.3 Selection and detail

Clicking any marker opens a popup **and** highlights related things:

- **A vehicle:** its crew, its case (line to it), its route, and its breadcrumb.
- **A case:** the vehicles and officers assigned to it, with lines.
- **A station:** its coverage, vehicles, checkpoints and routes; everything else dims.

Esc or clicking empty map clears the selection.

### 3.4 Clustering and scale

- When zoomed out, incident pins in the same area cluster into a count bubble coloured by the worst priority inside. Click it to zoom in. Use simple grid clustering, no plugin.
- Vehicles and checkpoints don't cluster, but shrink to small dots below zoom 9.
- Add a scale bar and a "Last updated 2:15 pm WAT" stamp (it follows the demo clock).

### 3.5 Control-room wall view

- A **"Wall view"** button on the map (operator, duty lead, coordinator).
- It opens the map full screen, with the side panel and a slim **live ticker** at the bottom: the latest 5 key events ("2:14 pm · SOS · Agbowo · Pending review").
- It refreshes with the demo clock. Esc exits.
- It's meant for the projector in the meeting and the 615 room's wall screen.

## 4. Dispatch from the map

- **Nearest vehicles in the Pass case modal.** When the operator or duty lead opens **Verify & pass** or **Pass case** for a case with a location, the modal shows **"Nearest available vehicles"**: the top 3 by straight-line distance, with call sign, station, status, distance and ETA.
  - Choosing one passes the case to that vehicle's station, pre-selects its crew lead as the officer, and marks the vehicle as Responding once the pass is accepted.
  - Choosing a unit only works as before.
- **From the map:** with a case selected, the popup of an available vehicle shows **"Pass this case to BDJ-P1"**. It opens the same modal, pre-filled.
- **Officer SOS (v2.3):** "the 3 nearest units" now uses **vehicles** where available. Fall back to officers on foot.
- Out-of-service vehicles are never suggested. Show "(2 nearer vehicles out of service)" in grey under the list, because that gap is the funding argument.

## 5. Who sees what (extends v2.3 §2.5)

| Layer | Operator / duty lead / coordinator | Commander | Field officer | Governor | Chairman | Focal / citizen / public |
| --- | --- | --- | --- | --- | --- | --- |
| Vehicles | all | own station's, plus any responding to their cases | own vehicle, plus vehicles responding to their own case | **counts per station only** | none | none |
| Checkpoints | all | own + joint | own station's | counts per LGA | none | **never** |
| Patrol routes | all | own | own | none | none | never |
| Stations | all | all | all | all | own LGA | the public portal keeps its current rules |
| Hospitals | all | all | all | all | all | none in this round |

Checkpoint and patrol locations are security-sensitive, so they never appear in public, citizen or focal views, in any export, or in SMS.

## 6. Seed data

For each pilot station (Police Bodija, Iyaganku, Iwo Road, Mapo, Ibarapa, Oke-Ogun; Amotekun Ibadan, Ibarapa, Oke-Ogun; Fire Ibadan):

- **Vehicles: 2–4 each, about 28 in total.** Mix of patrol cars and motorcycles; 1 armoured vehicle at Police Iyaganku; fire trucks at fire stations.
  - About 18% (5 vehicles) are **Out of service**, with reasons spread across No fuel / Under repair / No crew.
  - **Police Ibarapa has 2 of 3 out of service**, for the funding story.
- **Patrol routes:** about 14.
- **Checkpoints:** about 10 permanent and joint ones on main roads (Ojoo–Moniya, Iwo Road interchange, Ibadan–Oyo road, Igangan junction, Saki entry, Iseyin–Okeho road…), plus 2 temporary ones active now.
- **Hospitals:** about 8.
- **Crews:** each vehicle has 2–3 officers from its station.
  - Grace (`pat1`) crews **BDJ-P1**, and after the step-16 transfer **AMO-IB-2**. Her crew assignment must follow her transfer.
- Existing seeded cases with en-route officers get their vehicle set to **Responding**, so movement shows immediately.

## 7. Demo script additions (steps 29–32)

29. **Operational map.**
    - The duty lead opens Cases → Map, switches to **Dark** base and turns on Patrol vehicles, Checkpoints and Patrol routes.
    - The resources panel shows "… 5 out of service". Click Police Ibarapa: 2 of 3 vehicles are out of service, and the station marker shows the amber warning.
    - Press **+15m**: patrolling vehicles move along their routes.
30. **Dispatch from the map.**
    - Raise a new SOS (citizen, Agbowo).
    - The operator opens **Verify & pass**: "Nearest available vehicles: BDJ-P1 · 1.1 km · 3 min".
    - Choose it. After CSP Lawal (or the crew lead) accepts, BDJ-P1 turns **Responding** and drives toward the SOS on +15m. Its breadcrumb is visible.
31. **Temporary checkpoint.**
    - CSP Lawal right-clicks on the Bodija–Sango road and adds a 4 h stop-and-search checkpoint with two officers.
    - It appears on the map and in Police Bodija chat ("Checkpoint set up: …").
    - Close it.
32. **Wall view.**
    - The coordinator opens **Wall view** on the projector: full-screen dark map, resources panel and the live ticker.
    - Raise an Officer SOS as Grace: the nearest *vehicles* get "OFFICER NEEDS HELP — GO?", and the ticker and map update.

## 8. Definition of done

- §2–§5 built in the existing shell and style; the map is usable at 1440 px, 1024 px and 375 px (bottom sheet).
- Positions and ETAs follow the demo clock: vehicles move on +15m, and responding vehicles arrive in roughly the expected time.
- **Privacy (§5) is enforced in the data the map receives, not just hidden in the interface.** Checks must confirm:
  - citizen, focal, chairman and public map data contain no vehicles, checkpoints or routes;
  - the Governor gets counts only.
- Out-of-service vehicles are never suggested for dispatch.
- Officer SOS uses the nearest vehicles.
- Checkpoint and vehicle status changes are audited, and the audit chain verifies.
- Steps 1–32 pass after Reset demo. Extend demo.mjs, render.mjs and flowui.mjs for steps 29–32 and §8, and run them in the system time zone and with `--tz=America/New_York`.
- `npx tsc -b` = 0 errors; `npx vite build` succeeds. No new runtime dependencies (Leaflet only).
- README updated: new layers, Dark base, Wall view, steps 29–32.

## 9. Not in this round

- Real GPS or vehicle trackers.
- Real road routing: movement is straight-line or follows a route polyline.
- Satellite imagery.
- History replay.
