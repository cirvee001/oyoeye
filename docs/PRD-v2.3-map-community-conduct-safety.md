# OyoEye v2.3 — Live map, community focal persons, conduct feedback, officer safety

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 18 Oct 2026
Builds on PRD-v2, v2.1 (layout) and v2.2 (onboarding & chat). Same rules apply:

- front-end prototype, localStorage, fictional data;
- the HospEase-style shell with the 5-item menu cap;
- every v2 protection stays;
- every new event goes in the audit chain;
- PRD-v2 §5 steps 1–10 and v2.2 steps 11–16 must still pass.

## 1. Why these four

| Feature | The question an official will ask |
| --- | --- |
| Live map | "Show me where it's happening and where our men are." |
| Community focal persons and traditional rulers | "How does this reach the villages? Our Baales and hunters already know who is in the bush." |
| Conduct feedback | "How do we stop officers collecting money from victims?" |
| Officer safety | "What happens when our own officer is attacked?" |

## 2. Live map

### 2.1 Technology

- Add `leaflet` (and `@types/leaflet`). You may add `react-leaflet` if it works with React 19; otherwise wrap Leaflet in a small component of our own.
- **Tiles:** OpenStreetMap standard tiles with the attribution "© OpenStreetMap contributors" visible.
- **Offline fallback:** if tiles fail to load within 4 s, show a plain grey base with LGA labels at their centroids, plus the banner "Map tiles unavailable — showing positions only". The demo must never show a broken map.
- **Coverage shapes:** we have no real LGA boundary polygons. Draw station coverage as translucent circles around each covered LGA centroid, with a radius chosen per LGA size, and label it "Approximate coverage". Real boundaries are out of scope.

### 2.2 Data to plot

- **Stations:** give every station `lat`/`lng`. Seed near its LGA centroid or a known area, e.g. Police Bodija near Bodija and Amotekun Ibadan near Agodi. Admins can set these in the Add / edit station form, with a "click on map to place" picker.
- **Unit and officer positions (simulated GPS):**
  - Every active field officer has a position.
  - Idle officers sit at their station, with a small jitter.
  - En route, the position moves in a straight line from the station toward the incident. Assume 25 km/h in metro LGAs and 40 km/h elsewhere, driven by the demo clock.
  - On scene, the position is at the incident.
  - Store positions as derived values, not new audit events.
- **Incidents:** use the existing `lat`/`lng`.

### 2.3 Where the map appears (no new menu items)

- **Cases page: "List | Map" toggle** next to the search box, for every role that has Cases. The map uses the same tab, filter and search as the list. Clicking a marker opens a small popup: ref · type · status pill · holder · "View case".
- **Overview, Coordinator and Governor:** a large "Security map" card under the stat cards.
- **Case page:** a small map in the details card showing the incident pin. When the case is en route, it also shows the holding officer's position and a dashed line between them.
- **Field officer, case card:** a "Map" button opens a full-screen map with their own position, the incident and the dashed line. The existing "Navigate" (Google Maps link) stays.

### 2.4 Layers (toggle chips above the map, remembered per user)

| Layer | Default | What it shows |
| --- | --- | --- |
| Incidents | on | Pins coloured by status pill colour; SOS and Officer SOS pulse red; priority sets size |
| Hotspots | off | Translucent circles sized by the number of security incidents in the last 7 days within 1.5 km (simple grid clustering; no heatmap plugin) |
| Station coverage | off | Coverage circles + station markers (police blue, Amotekun green, fire red, agency grey) |
| Units | on for operator, duty lead, commander, coordinator | Officer markers: on duty = solid, en route = arrow, on scene = ring |

Time filter chips: Last 24 h · 7 days · 30 days.

### 2.5 Privacy rules on the map

- **Sensitive cases** (GBV, tips, kidnapping) are never plotted at their exact point for anyone except the restricted desk. Others see them snapped to the LGA centroid with a grey "Restricted" marker.
- **LGA chairman:** sees civic pins only. Security appears as a count bubble per LGA, never as points.
- **Governor:** sees all pins, but with no reporter information in the popups.
- **The public transparency page gets no map of security incidents.**
- **Unit positions** are visible only to the control room, commanders (their own unit's officers), and the coordinator.

## 3. Community focal persons and traditional rulers

### 3.1 New role: Community focal person

These are trusted people in a community who already act as the link to security: a Baale's secretary, the hunters' (Ode) group leader, a vigilante coordinator, an Iyaloja or market leader, a farmers' association chair, a herders' association representative, a youth leader.

- **Onboarding:**
  - The station commander (in "My officers" → new **Community** tab) or the LGA chairman invites them.
  - Invite fields: name, phone, community/village, ward, LGA, group type (dropdown above), sponsor (e.g. "Nominated by Baale of Igangan").
  - Activation uses the same SMS code + PIN flow as officers (v2.2 §4.4).
  - Status: Invited → Verified (the commander confirms after activation) → Suspended.
  - The commander and the chairman can suspend a focal person.
- **Menus** (phone-first, bottom tabs): Home · Report · My community · Chat · Inbox.
- **Reporting:** a "Report for my community" form, using the citizen flow with three extra fields:
  - "How do you know?": I saw it · Someone in my community told me · Group members are at the scene.
  - Number of people affected or at risk.
  - Optional "Our group can assist": a yes/no flag for the operator. Hunters often go into the bush; the operator decides, and must **not** dispatch civilians.
- **Credibility:**
  - Reports from verified focal persons show a strong green signal in the credibility card: "Verified community focal person — Ode group, Igangan · 9 of 10 past reports confirmed".
  - They count as corroboration on their own but still need human verification, so they are never auto-dispatched.
- **My community:** the list of cases in their community (their ward and village, plus a 2 km radius).
  - For civic cases: status, shown with the pill.
  - For security cases: status only, in safe words ("A security unit is responding"), no reporter info and no exact location.
  - They get inbox updates for those cases even if they didn't report them.
- **USSD:** on `*615#`, add option 4 "Community focal person". It asks for their PIN, then runs the same report flow, with the report marked as a focal-person report.

### 3.2 Community channel (per station)

- Each police or Amotekun station gets a second chat channel, **"[Station] — Community"**. Its members are the station's officers plus the verified focal persons in its coverage area.
- The v2.2 rules apply, plus:
  - Focal persons can only post text, photo, location and voice.
  - **Case cards are not allowed** in the community channel.
  - Phone masking applies.
- The duty lead monitors it.

### 3.3 Traditional rulers as contacts

- New data: `CommunityLeader { id, title (e.g. "Baale of Igangan", "Olu of …"), name, phone, lgaId, areas[] }`. They are **contacts, not users**.
  - Seed about 8 across the pilot LGAs, with fictional names. **Never use the name of a real reigning Oba or Baale.**
- **Rule (Rules page, new tab "Community notices"):**
  - When the operator verifies a security case at High or Critical in a leader's area, OyoEye sends an SMS like: "OyoEye 615: A security incident has been reported in Igangan. Response units have been dispatched. Please keep calm and report anything you see to 615."
  - The notice includes no type details, names or reporter information.
  - It can be switched on or off per category, with a toggle for "Kidnapping: notify only after coordinator approval".
- Every notice appears in the outbox and on the case timeline as "Community leader notified: Baale of Igangan".

### 3.4 Guard for farmer–herder and ethnic tension

- If a report's text names an ethnic or occupational group as perpetrators (keyword list: Fulani, herders, Hausa, Yoruba, Igbo, "Bororo", etc.), the case gets a flag: **"Names a group — supervisor review before armed dispatch"**.
- The operator can still verify the case, but **pass to an armed unit** needs a second click by the duty lead. Show "Describe actions and people, not ethnicity" as a tip in the operator view.
- This applies to focal-person reports too. Associations from both sides are onboarded, and the platform must not become a tool for one side.

## 4. Conduct feedback and the oversight queue

### 4.1 Citizen questions after closure

- When a case reaches **Closed**, every non-anonymous reporter gets an inbox item and an SMS. Anonymous reporters get these questions on the tracking page with their reference number.
- **"How were you treated?"**
  1. Did anyone ask you for money, a gift or "something for the boys"? **Yes / No**
  2. Were you treated with respect? **Yes / Somewhat / No**
  3. How fast was the response? 1–5 stars (optional)
  4. Anything else? (optional text)
- The same questions can be answered by SMS ("Reply 1 if anyone asked you for money") and on USSD (`*615#` → 3 Track → Rate the response).
- **A "Report misconduct" link is always visible** on the tracking page and in My reports, not only after closure.

### 4.2 Routing of answers

- **Money = Yes, or Respect = No, or a misconduct report** → creates a **Conduct complaint** in the **Oversight queue**.
  - **It is never visible to the unit, the station commander or the officers involved.**
  - The complainant is protected: oversight sees them, the unit never does.
- **All answers** also feed aggregate scores:
  - The commander sees, for their unit only: **"Respectful treatment 86% · Money asked 3% (n=37)"**.
  - The score only shows once at least 5 responses exist, so no single complaint can be traced.
  - The commander never sees individual complaints.
- **Governor and Coordinator Overview:** a new stat card, "Asked for money: 3.1% of closed cases (30 days)". On Reports, a per-unit table of conduct scores (aggregate only).

### 4.3 New role: Oversight panel

- An independent panel, e.g. "Oyo Security Oversight Panel", representing the judiciary, civil society and NBA. Demo persona: **Barr. Funmilayo Adeyemi**.
- **Menu:** Overview · Complaints · Unseal reviews · Audit log.
- **Complaint lifecycle:** New → Under review → Referred (to Police Complaint Response Unit, Amotekun discipline committee, or agency head) → Closed (Substantiated / Not substantiated / Withdrawn).
- **Complaint page** (same case-page layout):
  - the complaint;
  - the linked case timeline, read-only;
  - the officers involved;
  - a contact button to the complainant (sealed by default; break-glass with reason, as in v2).
- **"Unseal reviews":** a table of every break-glass unseal across the platform (who, when, reason), with a "Reviewed / Raise concern" action. This turns break-glass into real oversight.
- The oversight panel **cannot change cases**. It can only review, refer and close complaints.

### 4.4 "Police help is free"

- A thin green banner on **every citizen and focal-person screen**: **"Help from police, Amotekun and 615 is free. Never pay. Report anyone who asks: tap here or dial \*615\*7#."**
- Yoruba (draft, mark for review): "Ìrànlọ́wọ́ ọlọ́pàá, Àmọ̀tẹ́kùn àti 615 jẹ́ ọ̀fẹ́. Má ṣe sanwó."
- Add the footer "Help is free. Never pay." to every outbound citizen SMS.
- On USSD, put it on the first menu screen.

## 5. Officer safety

### 5.1 Officer SOS

- A red **"Officer SOS"** button for every field officer:
  - at the top of My cases;
  - in the header of any case page;
  - in the bottom-tab area of the phone layout.
  - The officer holds it for 2 s, with a progress ring.
- **What it does** (immediately, no triage). This is the one deliberate exception to "no auto-dispatch": the reporter is a verified, signed-in officer, so it's an alert, not an allegation.
  1. Creates a case: category Security, type **Officer in distress**, priority Critical, location = the officer's current position, linked to the case they were on, if any.
  2. Alerts **the 3 nearest on-duty units** (by simulated position, any organisation that can respond to security). Each gets an inbox item, SMS and push: "OFFICER NEEDS HELP — Insp. Grace Olatunji, Bodija market, 1.2 km from you. GO?", with **I'm going / Can't go (reason)**.
  3. Alerts the officer's commander and the duty lead by SMS, and posts an **Urgent** message in the station chat.
  4. Shows on the map as a pulsing red marker, with the responding units' lines toward it.
- **Silent SOS:** a separate option, in the officer's profile menu or by tapping the logo 3 times quickly. It does the same, but the officer's own screen does not change, with no sound or banner. This is for when an officer is held or under threat.
- **Closing:** only the commander or duty lead can close it, by choosing **"Officer safe"** (with a debrief note) or **"Officer injured — hospital"** / **"Officer missing"**, which escalates to the coordinator. The officer can tap "I'm safe now", which notifies everyone but does not close the case.

### 5.2 Lone-officer check-ins

- On "Accept" or "On scene", the officer can tick **"I'm alone on this job"**. Commanders can also set "Lone duty" for an officer in My officers.
- While alone and on scene, a **check-in timer** runs. The default is 15 minutes, configurable in Rules → Service targets → "Lone-worker check-in".
  - When it runs out, the officer gets a full-screen prompt: **"Are you OK?" — I'm OK / I need help**.
  - **I'm OK** resets the timer.
  - **I need help** raises an Officer SOS.
  - **No answer in 3 minutes** auto-raises an Officer SOS of type **"Missed check-in"**, with the last known position.
- The duty lead's Cases list shows an "Alone on scene" flag with the time left on the timer.

### 5.3 Reporting

- Reports gets a new tab, **"Officer safety"**:
  - officer SOS count;
  - time to first responding unit;
  - missed check-ins;
  - outcomes (safe / injured / missing).
- The Governor overview gets "Officer SOS (30 days)".

## 6. Menu changes (still max 5)

| Role | Sidebar / tabs |
| --- | --- |
| Oversight panel (new) | Overview · Complaints · Unseal reviews · Audit log |
| Community focal person (new) | Home · Report · My community · Chat · Inbox (bottom tabs) |
| Unit commander | Unchanged. "My officers" gets tabs Officers · Community |
| LGA chairman | Overview · Cases · Community · Inbox (Community = focal persons + traditional leader contacts in the LGA) |
| All roles with Cases | List / Map toggle inside Cases (no new item) |

Add sign-in demo cards for the oversight panel and two focal persons, in a new "Community" group and in the Oversight group.

## 7. Seed data

- **Station coordinates** for every station, and **positions** for every active officer.
- **4 verified focal persons:**
  - Baba Lasisi Akanbi, Ode (hunters) group leader, Igangan, Ibarapa North. Phone `0803 000 0201`, PIN `1234`.
  - Mrs. Alake Ojo, Iyaloja, Bodija market, Ibadan North.
  - Mr. Rasaki Oyedeji, farmers' association, Moniya, Akinyele.
  - Alhaji Usman Bello, herders' association representative, Iseyin.
- **One invited focal person** waiting for activation, in Ogbomoso North.
- **About 8 traditional-ruler contacts,** with fictional names, in the pilot LGAs, Iseyin and Saki.
- **About 30 extra closed security cases over 30 days** clustered around Moniya, Igangan and Ojoo, so the Hotspots layer shows something.
- **Conduct feedback on about 60% of closed cases:**
  - mostly positive;
  - 3 complaints in the oversight queue, one of which is "asked for money" against a Police Iyaganku case;
  - aggregate scores on each unit.
- **2 past officer SOS cases** (one Officer safe, one Missed check-in → Officer safe) for the Officer safety tab.
- **Oversight persona:** Barr. Funmilayo Adeyemi, staff ID `OY-OVS-001`.

## 8. Demo script additions (steps 17–23)

17. **Map.**
    - The duty lead opens Cases → Map. Show Incidents, then turn on Hotspots (the Moniya and Igangan clusters), then Station coverage.
    - Open Grace's en-route case: her marker moves when you press +15m.
    - The Governor's Overview shows the Security map card.
18. **Focal person report.**
    - Baba Lasisi signs in (phone + PIN, or from his demo card) and uses "Report for my community": "Strange men with guns camping near the farm settlement, two motorcycles", How do you know: "Group members are at the scene", 6 people at risk, our group can assist.
    - The operator sees the credibility signal "Verified community focal person", verifies, and passes to Police Ibarapa.
    - The SMS to the Baale of Igangan appears in the outbox, and the timeline shows "Community leader notified".
19. **Group-naming guard.**
    - A seeded or new report says "Fulani herders attacked our farm".
    - It shows the "Names a group" flag, and passing it to an armed unit asks for the duty lead's confirmation.
20. **Community channel.**
    - Baba Lasisi posts a photo in "Police Ibarapa — Community".
    - An officer replies.
    - Show that the "Share a case" option is not offered in this channel.
21. **Conduct feedback.**
    - Adewale's waste case from step 8 is Closed. He answers "Asked for money: Yes".
    - It appears in Barr. Adeyemi's Complaints queue.
    - Dr. Alabi (Waste head) sees only the aggregate score, with no complaint visible.
    - Barr. Adeyemi refers it to the agency head and reviews a break-glass unseal in Unseal reviews.
    - The "Help is free" banner is visible on every citizen screen.
22. **Officer SOS.**
    - Grace, on a case, holds Officer SOS.
    - The 3 nearest units get "OFFICER NEEDS HELP — GO?". The Amotekun commander answers "I'm going".
    - The map shows the pulsing marker and the responding line.
    - The duty lead closes it as Officer safe.
23. **Missed check-in.**
    - Grace accepts a case, goes on scene and ticks "I'm alone".
    - Press +15m: the "Are you OK?" prompt appears. Don't answer.
    - Press +15m again: a Missed check-in Officer SOS is raised automatically.

## 9. Definition of done

- Everything in §2–§6 is built in the v2.1 shell and style. The map works at 1440 px and 375 px, and the offline fallback works when the network is cut, which you can test by blocking tile requests.
- **Steps 1–23 pass after Reset demo.** Extend demo.mjs, render.mjs and flowui.mjs to cover them. Map rendering can be checked by component output and data, without real tiles.
- **Protections:**
  - sensitive cases are never plotted precisely for anyone but the restricted desk;
  - the chairman sees no security points;
  - conduct complaints are never visible to the unit, its commander or its officers;
  - aggregate scores are hidden below 5 responses;
  - traditional-ruler SMS contain no case type detail or names;
  - focal persons never see reporter info or exact security locations;
  - the oversight panel cannot change cases;
  - all new events are in the audit chain, and it verifies.
- `npx tsc -b` gives 0 errors and `npx vite build` succeeds.
- The README is updated with the new roles, credentials and steps 17–23.
