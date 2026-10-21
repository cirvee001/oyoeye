# OyoEye v2 — Product Requirements (demo-ready prototype)

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 16 Oct 2026

## 1. Why v2

OyoEye v1 proves the engine (routing, SLA clocks, escalation, audit, reporter protection). It is not yet something we can put in front of government officials. Officials need to see one thing clearly: **a citizen asks for help, the case moves from person to person, everyone sees its status, and nobody can quietly drop it.**

v2 is still a front-end prototype (browser + localStorage, fictional data). No backend. The goal is a polished, easy, end-to-end demo that a Commissioner, the Governor's security adviser or a police commander understands in 5 minutes without explanation.

### Problems in v1 this PRD fixes

| Problem | Effect in a demo |
| --- | --- |
| "Viewing as" dropdown with 14 personas and 11 roles | Looks like a developer tool; officials get lost |
| Internal status words (`triage`, `awaiting_verification`, `in_progress`) | Nobody knows where a case stands |
| Handoffs are silent: assign/transfer happen with no accept/decline by the receiver | "Passing a case" is not visible; cannot show accountability |
| Field officer cannot hand a case back or ask for a transfer | Real-world flow broken |
| Alerts only in a global "outbox" | Users don't see their own notifications |
| Corroboration counts the same phone twice; SMS sent to protected reporters; keyword triage matches word prefixes; unclassified reports default to Security; escalation ignores who is on duty | Credibility and safety gaps (see validation report appendix A1–A5) |

### Nigeria design principles (non-negotiable)

1. **Low data, low literacy, low trust.** Big buttons, few words, icons + text, Yoruba toggle on citizen screens. Every citizen screen works on a 360 px phone.
2. **Reporting must not require an account.** Anonymous reporting is always one tap away. Signing in only adds tracking and updates.
3. **Not everyone has a smartphone.** Show the USSD (`*615#`) and 615 voice-call paths in the demo, not just the app.
4. **Responders are few.** The system must make clear who holds each case *right now* and escalate when they sit on it.
5. **A report is an allegation, not proof.** Security cases always pass through a human in the 615 control room. Never auto-dispatch.
6. **Protect the reporter.** Confidential/sensitive reporters get no SMS unless they opt in; identities are never shown to field units.

## 2. Users and sign-in

Replace the persona dropdown with a **Sign-in screen** (`#/signin`), the app's landing page when no one is signed in.

### Sign-in screen layout

- Top: OyoEye logo, "See it. Report it. Act on it.", Oyo State.
- Big red button: **"Report an emergency now — no sign-in"** → anonymous report flow.
- Two tabs:
  - **Citizen**: phone number field → "Send code" → 6-digit OTP field. Demo: show the OTP on screen in a yellow "Demo code: 123456" banner. Any Nigerian-format number works; the known demo citizen is `0803 000 0001` (Adewale Ogunleye). Unknown numbers create a new citizen account (ask for first name only).
  - **Staff**: Staff ID + 4-digit PIN. Below it, a **"Demo accounts"** grid of cards (one per role, see table), each card shows name, role, agency, and a "Sign in" button that fills and submits. PIN for all demo staff: `1234`.
- Footer links: "Track a report" (by reference number, no sign-in) and "Public dashboard".

### Roles in the demo (sign-in cards, in this order)

| Card | Persona (existing id) | Lands on | What they do |
| --- | --- | --- | --- |
| Citizen | Adewale Ogunleye (`cit1`) | Home: Report / My reports | Report, track, confirm fix, reopen |
| 615 Operator | Yetunde Bakare (`disp1`) | Control room board | Review security reports, verify, pass to a unit |
| Control-room Duty Lead | Olumide Akande (`duty1`) | Control room board + escalations | Handles escalations, reassigns, closes invalid |
| Unit Commander (Police) | CSP Rasheed Lawal (`cmdr1`) | Unit queue | Accepts for the unit, assigns officers, transfers |
| Unit Commander (Amotekun) | Comdr. Idowu Adegoke (`crp1`) | Unit queue | Same, for the security corps |
| Field Officer | Insp. Grace Olatunji (`pat1`) | My cases (phone layout) | Accept, en route, on scene, update, resolve, hand back |
| Agency Head (Waste) | Dr. Morenike Alabi (`wst-head`) | Agency queue | Civic case owner |
| Agency Field Officer (Waste) | Tunde Afolabi (`wst-off1`) | My cases | Civic field work with photo evidence |
| Restricted Desk (SGBV) | Aisha Bello (`sens1`) | Restricted cases | Survivor-centred cases, break-glass |
| Security Coordinator | Col. (rtd) Babatunde Oke (`coord1`) | Security picture | Oversight, patterns, escalation level 4 |
| Governor's Office | `exec1` | State overview | Executive dashboard |
| LGA Chairman | Hon. Folasade Adebisi (`chr1`) | My LGA | Civic counts for the LGA; security as counts only |
| Administrator | Chidi Okafor (`adm1`) | Admin | Routing, SLAs, users/duty roster, audit. Cannot open cases |

Give each staff persona a Staff ID (e.g. `OY-615-001`, `OY-POL-014`, `OY-AMO-007`). Store `signedInId` in state; `persona()` returns the signed-in person.

**Header when signed in:** name, role, agency, an **on-duty toggle** (staff), a **bell** with unread count (notifications inbox), and **Sign out**. Keep the demo clock (+15m / +1h / +6h) and **Reset demo** but move them into a small collapsible "Demo controls" pill in the bottom-right so they don't dominate.

**Quick switch for presenters:** a keyboard shortcut (`Ctrl+Shift+S`) or the Demo controls pill opens "Switch account" (the same demo cards) so the presenter can jump roles without signing out.

## 3. The case lifecycle (the heart of v2)

### 3.1 Status model shown to users

Every case shows ONE plain-language status, the same everywhere (citizen, staff, dashboards). Map internal statuses to these labels; add new internal statuses where needed.

| # | Status (label) | Colour | Meaning | Who moves it forward |
| --- | --- | --- | --- | --- |
| 1 | **Pending review** | grey | Received; waiting for the 615 control room (security) or central review (unclear civic) | Operator |
| 2 | **Verified** | blue | Operator checked it (call-back, corroboration or judgement) and confirmed it is real | Operator |
| 3 | **Assigned** | blue | Passed to a unit/agency or an officer; waiting for them to accept | Receiver accepts |
| 4 | **Accepted** | indigo | Receiver took ownership | Officer |
| 5 | **In progress** | amber | En route / on scene / work started (sub-step shown: "En route", "On scene", "Working") | Officer |
| 6 | **Resolved** | green-light | Responder says it is done, with evidence; waiting for citizen confirmation (civic) or supervisor sign-off (security) | Citizen / Commander |
| 7 | **Closed** | green | Confirmed and closed ("settled"). Final | — |

Side states (shown as a status with its own colour):

- **Reopened** (red) — citizen said "not fixed" or commander rejected the resolution. Returns to the same unit, escalation +1.
- **Rejected** (grey, struck) — invalid / hoax / duplicate, with reason. Final.
- **Referred** (purple) — security case handed to investigation (CID / State CID). Final for the platform.

Flags (badges, not statuses): **Escalated L2–L5**, **Overdue**, **Uncorroborated**, **SOS**, **Backup requested**, **Handoff pending**.

Security path: Pending review → Verified → Assigned → Accepted → In progress → Resolved → **Closed by commander sign-off** (security cases do not ask the citizen "is it fixed"; they ask "Are you safe now? / Thank you" optionally).
Civic path: Pending review (only if low-confidence; otherwise auto) → Assigned → Accepted → In progress → Resolved → **Closed when citizen confirms** (or auto-close after 72 h with "Closed — unconfirmed").

### 3.2 Status stepper component

A horizontal **stepper** on every case page and citizen tracking page: 7 dots with labels, completed steps filled, current step pulsing, each with the timestamp and the person/unit ("Accepted · 10:42 · Insp. Grace Olatunji"). On mobile it becomes a vertical timeline. Side states show as a red/grey/purple marker on the line where they happened.

### 3.3 Handoffs ("pass case")

A handoff is a first-class event. One button **"Pass case"** on the case page opens a sheet:

1. **To whom** — picker grouped by: units/agencies (with coverage LGA and number of open cases), people in my unit (with on-duty dot and open-case count), "Back to control room".
2. **Why** — required reason (chips + free text): "Outside our area", "Needs armed response", "Needs fire service", "Officer off duty", "Wrong category", "Other".
3. **Urgency note** (optional).

Rules:

| Who | Can pass to |
| --- | --- |
| 615 Operator / Duty Lead | Any unit or agency; restricted desk |
| Unit Commander / Agency Head | Officers in own unit; another unit/agency (transfer); back to control room |
| Field Officer | Back to own commander ("Hand back"), with reason. Cannot pass sideways |
| Restricted desk | Police/SGBV partners, only with reporter identity kept sealed |

After a handoff the case shows **"Handoff pending → [receiver]"**. The receiver gets a notification with **Accept** / **Decline (reason)** buttons. The ack clock starts at handoff. If not accepted in the SLA window → escalates (existing ladder) and the sender is told. Declines go back to the sender with the reason. Every handoff, accept and decline is written to the audit chain and shown on the case timeline as "Passed from A to B — reason".

### 3.4 Actions by role (what buttons appear)

Show only the actions the current user can take, as large primary buttons on the case page ("Next step" area), never a long list.

| Status | Operator | Commander | Field officer | Citizen |
| --- | --- | --- | --- | --- |
| Pending review | **Verify & pass to unit** · Call back reporter · Ask reporter a question · Merge duplicate · Reject (reason) | — | — | Cancel my report |
| Assigned (to unit) | Reassign | **Accept for unit** · Assign officer · Decline · Transfer | — | — |
| Assigned (to officer) | — | Reassign | **Accept** · Decline (reason) | — |
| Accepted | — | Reassign | **En route** / **Start work** · Hand back | — |
| In progress | Send backup | Send backup | **On scene** · Add update/photo · Request backup · **Mark resolved** (needs evidence + outcome) | — |
| Resolved | — | **Sign off & close** (security) · Reject resolution (→ Reopened) | — | **Yes, fixed** / **No** / **Partly** (civic) |
| Reopened | — | Assign / Accept | Accept | — |

### 3.5 Case page layout (staff)

- Top bar: reference, status pill, flags, severity, category icon, LGA/area, time since report.
- Stepper (3.2).
- Left column: **Next step** card (role actions, 3.4) → **Timeline** (every event: reports, updates, handoffs, escalations, evidence, messages; newest at top; filter: All / Handoffs / Updates / Messages).
- Right column: map pin (schematic is fine), "Who has it now" card (unit, officer, since when, ack/arrive/resolve clocks with green/amber/red), credibility signals (security), reporter card (masked/sealed rules unchanged), evidence gallery.

### 3.6 Citizen experience

- **Home**: two huge tiles — "Report a problem" and "My reports"; a red SOS tile; language toggle EN / YO.
- **Report flow (3 steps max)**: (1) What happened — category tiles with icons (Security, Fire, Flooding, Roads, Waste, Infrastructure, "Not sure") + free text + optional photo/voice note (voice simulated: record button that attaches a placeholder clip); (2) Where — "Use my location" + LGA/area pickers + landmark ("near what?"); (3) Who are you — Standard / Confidential / Anonymous, explained in one line each. Submit → confirmation screen with big reference number, "Save this number", and what happens next.
- **SOS**: press-and-hold 3 s (progress ring) or press then confirm. Then "Help is being arranged. Stay safe. If you can, move away." Shows live status.
- **My reports**: cards with status pill + stepper (compact). Tapping opens the tracking page.
- **Tracking page** (`#/track/REF`, works without sign-in): stepper, plain-language updates, "Who has it" in safe terms ("A security unit" for security, the agency name for civic), and the confirm-fix buttons when Resolved (civic).

### 3.7 Notifications inbox

Per-user inbox (bell in header) replacing the global outbox for normal users. Each item: icon, text, case ref, time, unread dot, and inline **Accept/Decline** for handoffs. Keep the global "WhatsApp / SMS outbox" page under Demo controls so the presenter can show what would be sent by SMS/WhatsApp.

### 3.8 USSD and 615 call simulator (shows reach beyond smartphones)

- **USSD simulator** (`#/ussd`, reachable from sign-in footer and Demo controls): a feature-phone frame. `*615#` → 1 Emergency now, 2 Report a problem, 3 Track report. Numeric menus: type → LGA (paged list) → area → confirm → "Ref OY-SEC-… Help is coming. Do not reply." Creates a real case with channel `ussd`.
- **615 call intake** (existing `Intake.tsx`) stays for the operator; tidy it into the same 3-step form.

### 3.9 Dashboards (keep, simplify)

- Governor / Coordinator **State overview**: 4 KPI tiles (open cases, critical open, median arrival time today, % acknowledged on time), a cases-by-status bar (using the 7 statuses), LGA table with red/amber/green, top escalations. Use existing analytics.
- Unit / agency queue: tabs by status (Assigned to us, Accepted, In progress, Resolved awaiting sign-off, Reopened, Closed) with counts; "Handoff pending" filter.
- Keep Security picture, Transparency portal, Audit log, Routing, SLA pages, restyled.

### 3.10 Admin: duty roster

New admin page **Duty roster**: list of staff per unit with on-duty toggle and shift (Morning 06–14, Afternoon 14–22, Night 22–06). Escalation and auto-assignment pick **on-duty** people first, then fall back to the next role up. Staff can also toggle their own on-duty status in the header.

## 4. Fixes carried from the validation report

| Id | Fix | File |
| --- | --- | --- |
| A1 | Corroboration counts only distinct reporters (distinct `personId` or phone; anonymous reports count as distinct only if channel differs). Severity bump at 5 *distinct* reporters | `src/store.ts` (`submitAt`) |
| A2 | No outbound SMS/WhatsApp to reporters on confidential identities or sensitive subcategories (gbv, kidnapping, tip) unless `reporter.optInUpdates` is true (new checkbox in report flow). Wording never names the case type | `src/store.ts` (`notifyReporters`) |
| A3 | Triage: whole-word matching; exclude place names from the deployment gazetteer (LGA and area names) before matching | `src/platform/triage.ts` |
| A4 | No-keyword reports without a category go to an "Unclassified" review (central command), not Security — unless SOS | `src/platform/triage.ts`, `src/store.ts` |
| A5 | Escalation contact and `pickOfficer` prefer on-duty people (3.10) | `src/platform/engine.ts` |
| — | Fix `vite.config.ts` type error (`process` undefined): use `import.meta`-free config or declare `process` | `vite.config.ts` |

## 5. Demo script the build must support (acceptance test)

The presenter must be able to run this end to end, without touching the clock except where stated, and every step must be visible in the receiver's inbox and the case timeline:

1. **Anonymous SOS.** From sign-in, press "Report an emergency now", choose Security, hold SOS in Agbowo, Ibadan North. Get a reference. Open "Track a report" with it → *Pending review*.
2. **615 Operator** (Yetunde) signs in. The SOS is top of the board, pulsing. She opens it, sees credibility signals, presses **Verify & pass to unit** → picks Police Bodija. Status → *Verified* then *Assigned*, "Handoff pending → Police Bodija".
3. **Unit Commander** (CSP Lawal) sees it in inbox, **Accept for unit**, **Assign officer** → Insp. Grace Olatunji.
4. **Field Officer** (Grace), phone layout: **Accept** → **En route** → **On scene** → adds update "Two suspects fled toward Bodija market" → **Request backup** (Duty Lead notified) → **Mark resolved** with outcome "Persons dispersed — area patrolled".
5. **Commander** signs off → *Closed*. Track page for the reference shows the full stepper with times; reporter identity never appeared anywhere.
6. **Escalation demo.** Another seeded armed-persons case assigned to Grace: switch to Grace, do not accept, press **+15m** → escalates to Commander, then Duty Lead; inbox entries appear for each.
7. **Handoff with decline.** Commander passes a case to Amotekun Ibadan; Comdr. Adegoke **Declines** ("Needs armed response — firearms reported"); it returns to sender with reason visible on the timeline.
8. **Civic loop.** Citizen Adewale signs in with phone + OTP, reports "Panti ti po ju ni Mokola" with photo, no category → classified Waste → Waste Authority. Waste officer Tunde accepts, starts work, tries to resolve without photo (refused), adds photo, resolves. Adewale gets "Is it fixed?" → **No** → *Reopened*, escalated. Tunde fixes again → Adewale **Yes** → *Closed*.
9. **USSD.** Open the USSD simulator, dial `*615#`, report "Kidnapping" in Ibarapa North. It lands in the operator board as channel USSD, confidential, no SMS sent back.
10. **Governor's Office**: State overview shows all of the above in counts and times.

## 6. UX and visual requirements

- Clean, calm, government-grade: white surfaces, Oyo green accent (`#0B6E4F`) with red reserved for SOS/critical. System font stack, 16 px base, 44 px minimum tap targets.
- Every status uses the same pill component and colour across the app.
- Empty states say what to do next ("No cases waiting. New reports appear here and in your inbox.").
- Toasts for every action ("Passed to Police Bodija. They have 10 min to accept.").
- Confirm dialogs only for irreversible actions (Reject, Close).
- Responsive: citizen and field-officer views mobile-first; operator/commander views desktop-first but usable at 768 px.
- Yoruba toggle covers at minimum: citizen home, report flow labels, statuses, SOS screen. (Short, simple translations; mark as "draft translation" in a comment.)
- No new runtime dependencies unless essential; React 19 + Vite + plain CSS as today.

## 7. Out of scope for v2

Real backend, real OTP/SMS/WhatsApp, real maps or GPS, real AI, telephony. Keep the "Prototype · fictional data" badge visible.

## 8. Definition of done

- `npx tsc -b` passes with zero errors; `npx vite build` succeeds.
- Demo script (section 5) works end to end after **Reset demo**.
- Seed data (`src/seed.ts`) regenerated to use the new statuses and includes: 1 pending SOS, 1 armed case assigned but not accepted (for step 6), 1 case with a pending handoff, 1 civic case Resolved awaiting citizen, several Closed cases across LGAs for dashboards.
- No regressions to v1 protections: no auto-dispatch of security; admins cannot open cases; sealed identities stay sealed; audit chain verifies.
- README updated: how to run, demo accounts table, demo script.
