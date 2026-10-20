# OyoEye v2 — prototype

Citizen reporting, response and accountability for Oyo State, security first.
**A citizen asks for help, the case moves from person to person, everyone sees its
status, and nobody can quietly drop it.**

This is a front-end prototype. All logic runs in the browser on fictional data
(7 days of seeded history, stored in `localStorage`). Nothing is sent anywhere.
Spec: [`docs/PRD-v2.md`](docs/PRD-v2.md), layout addendum [`docs/PRD-v2.1-layout.md`](docs/PRD-v2.1-layout.md),
onboarding & chat addendum [`docs/PRD-v2.2-onboarding-chat.md`](docs/PRD-v2.2-onboarding-chat.md), and the
map / community / conduct / officer-safety addendum [`docs/PRD-v2.3-map-community-conduct-safety.md`](docs/PRD-v2.3-map-community-conduct-safety.md).

**Live map (v2.3).** Leaflet with OpenStreetMap tiles ("© OpenStreetMap contributors"), loaded only
in the browser. If no tile arrives within 4 s it switches to a plain grey base with LGA labels and
the banner "Map tiles unavailable — showing positions only". Station coverage is drawn as
approximate circles around LGA centroids (no real boundaries). Officer positions are simulated
from the demo clock.

**Layout (v2.1).** Every staff role gets the same simple shell: a white sidebar with at most
5 items (Overview · Cases · Chat · Inbox, plus My officers / Reports where the role needs
them; New 615 call is a button on the Cases header), a white top bar (page title, search by reference/area/LGA, on-duty switch,
bell, avatar menu) and grey pages with white cards. Every staff page is an **Overview**
(4 stat cards, one chart, "Needs your action"), the **Cases** list (status tabs with
counts, table, View), the **Case page** (header with one primary button + Pass case +
More, stepper, details, reporter/credibility, evidence, day-grouped timeline) or a
simple settings/table page. Field officers and citizens keep a phone layout with a
bottom tab bar.

## Run

```bash
npm install
npm run dev          # http://localhost:5190
```

Other scripts: `npm run typecheck` (`tsc -b`), `npm run build` (type-check + Vite build), `npm run preview`.

The app opens on the **sign-in screen**. The **Demo controls** pill (bottom right)
has the demo clock (+15m / +1h / +6h), **Switch account**, the WhatsApp/SMS
outbox, the USSD simulator and **Reset demo** (reseeds everything). Presenter
shortcut: **Ctrl+Shift+S** opens *Switch account* from any page.

## Demo accounts

Staff PIN for everyone: **1234**. Citizen OTP: **123456** (shown on screen).
Each card on the sign-in screen signs in with one click.

| Role | Name | Sign in with | Lands on |
| --- | --- | --- | --- |
| Citizen | Adewale Ogunleye | phone **0803 000 0001** + OTP 123456 | Home: Report / My reports / SOS |
| 615 Operator | Yetunde Bakare | **OY-615-001** | Cases (Pending review) |
| Control-room Duty Lead | Olumide Akande | **OY-615-002** | Cases (+ Reports) |
| Unit Commander (Police) | CSP Rasheed Lawal | **OY-POL-014** | Cases (To accept) · My officers |
| Unit Commander (Amotekun) | Comdr. Idowu Adegoke | **OY-AMO-007** | Cases (To accept) · My officers |
| Field Officer | Insp. Grace Olatunji | **OY-POL-102** | My cases (phone layout) |
| Agency Head (Waste) | Dr. Morenike Alabi | **OY-WST-001** | Cases · My officers |
| Agency Field Officer (Waste) | Tunde Afolabi | **OY-WST-031** | My cases (phone layout) |
| Restricted Desk (SGBV) | Aisha Bello | **OY-SGB-003** | Cases (Pending review) |
| Security Coordinator | Col. (rtd) Babatunde Oke | **OY-SEC-001** | Overview · Reports |
| Governor's Office | Governor's Office | **OY-GOV-001** | Overview · Reports |
| LGA Chairman | Hon. Folasade Adebisi | **OY-LGA-011** | Overview (Ibadan North) |
| Administrator | Chidi Okafor | **OY-ADM-001** | Overview · Stations & staff · Rules · Duty roster · Audit log (cannot open cases or read chat) |
| Oversight panel | Barr. Funmilayo Adeyemi | **OY-OVS-001** | Overview · Complaints · Unseal reviews · Audit log (cannot change cases) |
| Community focal person | Baba Lasisi Akanbi (Ode hunters, Igangan) | phone **0803 000 0201** + PIN **1234** (Citizen tab) | Home · Report · My community · Chat · Inbox |
| Community focal person | Mrs. Alake Ojo (Iyaloja, Bodija market) | phone **0803 000 0202** + PIN **1234** | Home · Report · My community · Chat · Inbox |

Other seeded focal persons: Mr. Rasaki Oyedeji (farmers, Moniya, 0803 000 0203), Alhaji Usman
Bello (herders, Iseyin, 0803 000 0204), both PIN 1234. Mr. Tunji Alade (youth leader, Takie,
Ogbomoso North) is invited but not active: activate with **0803 000 0205** and code **735102**.
Traditional rulers are contacts only (8, fictional names) — they receive SMS notices, never sign in.

**Citizens (v2.4).** Adewale has accepted Rule Book v1 and is **Trusted**. **Bose Akinwale**
(phone **0803 000 0111**, OTP **123456**) is **Restricted** — two duty-lead-confirmed hoaxes — with
an appeal waiting for the oversight panel and one pending report that needs a call-back. Any
unknown number (e.g. **0803 000 0500**, OTP 123456) creates a new citizen and runs the full
onboarding. The **Rule book** is always at `#/rules` (sidebar, phone tabs, the "Help is free"
strip, the sign-in footer and `*615#` → 5). Demo controls → **Publish Rule Book update** bumps the
version so signed-in citizens see "The Rule Book was updated" once.

Any other Nigerian mobile number works for citizens: it creates a new account
(first name only).

**Officer activation (demo).** Cpl. Bayo Adeleke is invited to Police Bodija but not yet
active: Staff tab → **First time? Activate my account** → phone **0803 000 0099**, code
**482913** (the yellow banner shows it) → *This is me* → choose any 4-digit PIN → intro →
My cases. Afterwards he signs in with Staff ID **OY-POL-131** and that PIN. Officers you
invite yourself get their code by SMS (see the outbox under Demo controls).

## Demo script (≈10 minutes)

Press **Reset demo** first. Every step shows up in the receiver's inbox (bell) and
on the case timeline.

1. **Anonymous SOS.** On the sign-in screen press **Report an emergency now — no
   sign-in**. Choose *Security*, set *Ibadan North → Agbowo*, and **hold the SOS
   button for 3 seconds**. Note the reference. Footer → **Track a report** with it:
   *Pending review*.
2. **615 Operator (OY-615-001).** The SOS is the first row on *Cases → Pending review*.
   Press **View**: the Credibility card sits next to the Reporter card. **Verify & pass to unit** → *Police
   Bodija* (reason "Covers this area" is preselected). Status goes *Verified* →
   *Assigned* with **Handoff pending → Police Bodija**.
3. **Unit Commander (OY-POL-014).** Bell → the handoff (or *Cases → To accept*). Open
   it, **Accept for unit**, then **Assign officer** → *Insp. Grace Olatunji* (the
   "Pass case" modal shows a green success banner).
4. **Field Officer (OY-POL-102)**, phone layout: **Accept** → **En route** →
   **On scene** → **Add update** "Two suspects fled toward Bodija market" →
   **Request backup** (Duty Lead's bell lights up) → **Mark resolved** with
   outcome *Persons dispersed — area patrolled*.
5. **Commander** → **Sign off & close** → *Closed*. Track the reference again: full
   stepper with times; it says "A security unit", never a name. The reporter's
   identity was never stored.
6. **Escalation.** As Grace, *My cases* has a seeded armed-persons case at Samonda
   that she has not accepted. Do not accept; press **+15m** → it escalates to the
   Commander (L2) and the Control-room Duty Lead (L3); both get inbox entries.
7. **Handoff with decline.** As the Commander, open the seeded *Sango* armed case
   (*Cases → Accepted*; no officer yet) → **Pass case** → *Unit / agency* → *Amotekun Ibadan*, reason
   "Outside our area". Switch to **Comdr. Adegoke (OY-AMO-007)** → **Decline**
   "Needs armed response — firearms reported". It returns to Police Bodija; the
   reason is on the timeline and in the Commander's inbox.
8. **Civic loop.** Sign in as **Adewale** (0803 000 0001, code 123456) → *Report a
   problem* → leave the category or pick *Not sure*, type "Panti ti po ju ni
   Mokola", **Use sample photo** → *Ibadan North → Mokola* → *Standard* → Send.
   It is classified **Waste → Waste Authority** and passed to Tunde. As **Tunde
   (OY-WST-031)**: **Accept** → **Start work** → **Mark resolved** without a photo
   (refused) → add a photo (*Use sample photo*) → resolve. As Adewale: bell / *My
   reports* → **Is it fixed? → No** → *Reopened*, escalated. Tunde **Accept** →
   **Start work** → resolve with a new photo → Adewale **Yes, fixed** → *Closed*.
9. **USSD.** Demo controls → **USSD *615# simulator**. Dial `*615#` → `1`
   Emergency → `2` Kidnapping → `9` (more) → `9` → `3` Ibarapa North → `1` Ayete →
   `1` Send. It appears on the operator's *Cases* list as **USSD**, confidential, and no SMS
   is sent back (check the outbox).
10. **Governor's Office (OY-GOV-001)**: *Overview* — open cases, critical open,
    median arrival today, % acknowledged on time, cases by status and escalated cases;
    *Reports* has the security picture, unit performance and morning brief.

### Onboarding and chat (steps 11–16, PRD v2.2)

11. **Administrator (OY-ADM-001)** → *Stations & staff*. *Police Division — Moniya* shows
    **Setting up 1/4**. **Add station** → *Amotekun Corps*, "Amotekun — Ido Command", tick
    *Ido*, invite a commander (name, rank, service number, phone). Open the station to see
    the readiness checklist; routing skips it until 4/4. **Import from spreadsheet** →
    *Use sample file* previews 4 rows with one bad row flagged.
12. **CSP Lawal** → *My officers* → **Invite officer**: "Tola Ojo", *Corporal*, a service
    number and a phone. The SMS with the activation code appears in the outbox. Cpl. Bayo
    Adeleke is listed as *Invited* (seeded).
13. Sign out → Staff tab → **First time? Activate my account** with **0803 000 0099** and
    **482913** → *This is me* → PIN → intro → My cases. The Police Bodija chat shows
    "Cpl. Bayo Adeleke joined Police Bodija".
14. **Station chat.** CSP Lawal → *Chat* → tap today's shift briefing → **Pin**. The operator
    opens a case held by Police Bodija → *More ▾* → **Discuss in station chat** (use the
    step-6 Samonda case: the step-1 SOS is already closed by step 5) → the case card appears.
    Grace replies with 📎 → *Photo*, then types a phone number: everyone else sees it masked
    (`0803 *** **67`). When Grace marks the case resolved, the card's pill changes live.
15. **Broadcast.** Duty lead → *Chat* → *Control room alerts* → **New broadcast** → *Stations
    covering LGAs* → Akinyele, Ibadan North, Ido → send the BOLO. CSP Lawal presses **Seen ✓**
    in his chat; the duty lead sees "Acknowledged by 1 of 3 stations".
16. **Transfer.** CSP Lawal → *My officers* → Grace → *Actions ▾* → **Transfer to another
    station** → *Amotekun Ibadan*. If she holds open cases the modal lists them: use
    *Reassign all to…* Cpl. Bayo Adeleke first. Comdr. Adegoke accepts in his inbox (or on
    *My officers*). Grace's chat list now shows Amotekun Ibadan, and the Police Bodija chat
    says "Insp. Grace Olatunji was transferred out".

Chat safety rules: membership follows postings (transferred, suspended or deactivated people
lose access at once); phone numbers are masked for everyone but the author; case cards never
show the reporter; every message is in the audit chain without its text, and removing a
message leaves "Message removed by …"; administrators see who is in a chat but never its
messages. Normal messages only raise the Chat unread count; urgent messages, broadcasts and
@mentions also raise the bell.

### Map, community, conduct and officer safety (steps 17–23, PRD v2.3)

17. **Map.** Duty lead → *Cases* → **Map** (next to the search box). Incidents are on; turn on
    **Hotspots** (Moniya, Ojoo and Igangan clusters — choose *30 days*) and **Station coverage**.
    For Grace's en-route marker: as Comdr. Adegoke, *Cases → Accepted* → the Iroko case → *Assign
    officer* → Grace; as Grace, *Accept* → *En route*; as the duty lead press **+15m** and watch
    her marker move. The Governor's Overview has the **Security map** card.
18. **Focal person report.** Sign in as **Baba Lasisi** (card, or Citizen tab: 0803 000 0201 + PIN
    1234) → *Report for my community* → "Strange men with guns camping near the farm settlement,
    two motorcycles" → *Ibarapa North → Igangan* → How do you know: *Group members are at the
    scene*, 6 at risk, *Our group can assist*. The operator sees "Verified community focal person —
    Ode (hunters) group, Igangan · 9 of 10 past reports confirmed", verifies and passes to **Police
    Ibarapa**. The outbox has the SMS to the Baale of Igangan; the timeline says "Community leader
    notified". (Kidnapping notices wait for the coordinator's approval — Rules → Community notices.)
19. **Group-naming guard.** The seeded pending report "Fulani herders attacked our farm…" (Ado-Awaye,
    Iseyin) shows **Names a group — supervisor review before armed dispatch** and the tip
    "Describe actions and people, not ethnicity". When the operator passes it to a police or
    Amotekun unit it waits; the duty lead must press **Confirm armed dispatch**.
20. **Community channel.** Baba Lasisi → *Chat* → *Police Ibarapa — Community* → 📎 *Photo*. An
    Ibarapa officer replies. The 📎 menu has no "Share a case" in community channels.
21. **Conduct feedback.** Adewale's waste case from step 8 is Closed: his inbox / tracking page asks
    "How were you treated?" → answer *Yes* to money. It appears in **Barr. Adeyemi**'s *Complaints*.
    Dr. Alabi's Overview only shows the aggregate ("Respectful treatment …% · Money asked …%
    (n=…)") — never the complaint. Barr. Adeyemi → the complaint → *Start review* → *Refer* →
    *Agency head*, then *Unseal reviews* → *Reviewed* on the seeded break-glass. The green "Help is
    free. Never pay." banner is on every citizen and focal-person screen.
22. **Officer SOS.** As Grace, hold **Officer SOS** for 2 s (My cases, the case header, or the red
    button in the bottom bar). The 3 nearest units get "OFFICER NEEDS HELP — … GO?"; as Comdr.
    Adegoke press **I'm going** (inbox). The map shows the pulsing marker and the responding line.
    The duty lead opens the case → **Officer safe** with a debrief note. *Silent SOS*: avatar menu →
    Silent SOS, or tap the logo 3 times quickly — the officer's screen does not change.
23. **Missed check-in.** Grace, on her Iroko case from step 17 (or any case Comdr. Adegoke assigns
    via *My officers → Assign case*), goes **On scene** and taps **I'm alone on this job**.
    Press **+15m**: the full-screen "Are you OK?" appears. Don't answer; press **+15m** again: a
    *Missed check-in* Officer SOS is raised automatically. The duty lead's list shows "Alone on
    scene · Nm" while the timer runs.

### Citizen dashboard and the Rule Book (steps 24–28, PRD v2.4)

24. **Desktop citizen dashboard.** Sign in as Adewale on a laptop: sidebar (Home · Report · My
    reports · Rule book · Inbox), the SOS card next to "Other ways to get help", 4 stat cards, My
    reports with compact steppers and inline **Is it fixed?** / **Rate response**, the **Trusted**
    standing card, the Rule Book card and "In your area this week" (public figures only). Narrow the
    window below 1024 px (try 375 px): the phone layout with bottom tabs no wider than 640 px.
25. **New citizen onboarding.** Sign out → Citizen tab → **0803 000 0500**, code 123456, first name
    "Kunle" → 4 onboarding cards → the 8 rules → **I understand and agree** → Home with the **New**
    standing. The audit log shows "Accepted Rule Book v1". (The red "In danger now? SOS" button is
    on every onboarding screen — onboarding never blocks SOS.)
26. **Anonymous summary.** Signed out → "Report a problem anonymously": the 3-rule summary, then
    the report flow (once per browser session). Then "Report an emergency now" → hold SOS: no rules
    screen, straight through.
27. **Hoax handling.** Operator → a pending report → *More ▾* → **Reject** → **Deliberate false alarm
    / hoax** with a reason of at least 20 characters. The duty lead opens it → **Confirm hoax** (or
    "Not a hoax — no penalty"). The reporter's standing card now says **Under review**, why, until
    when, and offers **Appeal**. The other reasons (No trace found, Duplicate, Not a matter for
    OyoEye, Genuine mistake) never count.
28. **Restricted reporter and appeal.** Operator → Bose's pending report: the credibility card says
    "⛔ Restricted reporter — call back before verifying (2 hoaxes in 12 months)" and **Verify & pass**
    first asks **Have you called back?** (Yes / Couldn't reach). Barr. Adeyemi → *Complaints* → the
    "Standing appeal" → **Uphold appeal**: the hoax marks are removed (audited) and Bose's standing
    recalculates. Bose's SOS is always answered, whatever her standing.

Seeded on reset: a pending SOS (Olodo), the step-6 armed case passed to Grace, the
step-7 Sango case, a handoff waiting at Police Mapo, an unclassified report waiting
for review, Adewale's drainage case *Resolved* and waiting for him to confirm, and
hundreds of closed cases across all 33 LGAs.

## The case lifecycle

One plain-language status everywhere: **Pending review → Verified → Assigned →
Accepted → In progress → Resolved → Closed**, plus *Reopened*, *Rejected* and
*Referred*. Flags (not statuses): Escalated L2–L5, Overdue, Uncorroborated, SOS,
Backup requested, Handoff pending.

- **Handoffs** ("Pass case") need the receiver to **Accept** or **Decline (reason)**.
  The accept clock starts at handoff; if nobody accepts it escalates and the sender
  is told. Declines return the case to the sender with the reason.
- **Security** cases are never dispatched automatically: an operator verifies and
  passes them. A commander signs off the resolution.
- **Civic** cases are routed automatically to the responsible agency's on-duty
  officer, need a photo to be resolved, and close when the citizen confirms (or
  auto-close after 72 h as *Closed — unconfirmed*). A reopen needs a new photo.

## What is real vs simulated

| Real logic (in `src/platform` + `src/store.ts`) | Simulated |
| --- | --- |
| Routing matrix (most specific rule wins, coverage-based targets) | AI triage (keyword rules; English, Yoruba, Pidgin) |
| Handoffs with accept/decline, SLA clocks, escalation ladder | OTP, SMS, WhatsApp, push (written to an outbox) |
| Duty roster: on-duty people first, then the next role up | Maps (schematic SVG) and GPS |
| Duplicate merging; corroboration by distinct reporters | Voice notes, USSD, 615 telephony |
| Evidence before resolve; citizen confirmation and reopen | Database (`localStorage`) |
| Role-based access, sealed/anonymous identities, break-glass | |
| Hash-chained, append-only audit log | |

## Layout

- `src/platform/` — state-agnostic engine: `types`, `engine` (routing, SLA,
  escalation, duty, duplicates, access), `triage`, `analytics`
- `src/deployments/oyo.ts` — Oyo config: 33 LGAs, police divisions, Amotekun zones,
  the 615 control room, civic agencies, staff IDs, routing matrix and SLAs
- `src/store.ts` — state and every action (each writes to the audit chain),
  handoffs, per-user inbox, sign-in, duty roster
- `src/seed.ts` — builds history by running the real actions at past times
- `src/i18n.ts` — status labels/colours and EN/YO strings (Yoruba is a draft
  translation and must be reviewed)
- `src/roles.ts` — role shapes, the per-role sidebar menus (max 5) and landing pages
- `src/views/` — SignIn (+ Activate), Overview, Cases (work list), Chat (station group chat), Stations (admin stations & staff, rules), CaseView (header actions, stepper,
  details, Pass case modal, timeline), Officers, Reports, Inbox, Profile, Citizen (home,
  report, SOS, tracking), Field, Ussd, Intake, Dashboards (report tab content), Admin

## Security design choices

- No security report is dispatched automatically; a person verifies every one.
  "A report is an allegation, not proof" is shown at review.
- Corroboration counts **distinct** reporters (same phone twice is one reporter;
  anonymous reports count as distinct only by channel).
- No SMS/WhatsApp to confidential reporters or on sensitive types (GBV,
  kidnapping, tips) unless they opted in; messages never name the case type.
- Anonymous reports store no contact. Confidential identities are sealed and
  visible only through logged, time-limited break-glass. Field units never see
  reporter identities.
- SGBV and intelligence tips go to the restricted desk. Chairmen see security as
  counts only. The public portal shows statewide totals only.
- Administrators configure the platform but cannot open cases.

## Before this goes anywhere near production

A real backend (Postgres with row-level security per jurisdiction and role), MFA
and named accounts, encryption at rest, server-side audit anchoring, WhatsApp
Business API and SMS aggregator contracts, 615 CAD/telephony integration, NDPA 2023
compliance and a DPIA, hosting in Nigeria, penetration testing, a reviewed Yoruba
translation, and written agreements with the police and Amotekun on dispatch and
data sharing.
