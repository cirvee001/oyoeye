# OyoEye — prototype

Citizen intelligence, response and accountability for Oyo State, security first.
**Report → Route → Respond → Verify → Account → Learn.**

This is a working front-end prototype. All logic runs in the browser on fictional
data (7 days of seeded history, stored in `localStorage`). Nothing is sent anywhere.

## Run

```bash
cd ~/Downloads/oyo/oyoeye
~/.local/node/bin/node node_modules/vite/bin/vite.js --port 5190
```

Open http://localhost:5190. Use **Viewing as** (bottom left) to switch role, the
**+15m / +1h / +6h** buttons to move the demo clock, and **Reset** to reseed.

Type-check: `~/.local/node/bin/node node_modules/typescript/bin/tsc -b`

## Five-minute demo (security)

1. **Yetunde Bakare — 615 operator.** Live board: SOS robbery in Olodo, gunshots at
   Ojoo, a 615 call about a clash in Sabo. Pick one, read the assistant's
   suggestion and the credibility signals, then dispatch a unit. The unit gets
   WhatsApp and SMS alerts (see *WhatsApp / SMS outbox*). The reporter's
   identity is never sent.
2. **Insp. Grace Olatunji — patrol lead.** An armed-persons case at Agbowo waits
   for ACCEPT. Press **+15m** without accepting: it escalates to the unit
   commander, then to the control-room duty lead.
3. **Aisha Bello — restricted desk.** A domestic-violence report was routed
   here automatically and never reached a patrol unit. *Break glass* reveals the
   reporter for 30 minutes, logs it, and alerts the coordinator.
4. **Col. Oke — security coordinator / Governor's Office.** *Security picture*
   shows pattern alerts (repeated sightings around Moniya), unit arrival
   performance and the hour-of-day profile. Patterns are about places and
   times, never people.
5. **Chidi Okafor — administrator.** Can edit the routing matrix and service
   targets, and verify the audit hash chain. Cannot open case content.

Civic flow: as **Adewale Ogunleye** (citizen), report "Panti ti po ju ni Mokola…"
without picking a category. It's classified as Waste and routed to the Waste
Authority. Then, as **Dr. Alabi**, accept it and try to close it without a photo
(refused). *My reports* has a drainage case waiting for you to confirm. Answer
**No** and it reopens and escalates.

## What is real vs simulated

| Real logic (in `src/platform`) | Simulated |
| --- | --- |
| Routing matrix (most specific rule wins, coverage-based targets such as `@police`) | AI triage (keyword rules in `triage.ts`; English, Yoruba, Pidgin) |
| SLA clocks: acknowledge (from assignment), arrive, resolve | WhatsApp, SMS and push (written to an outbox) |
| Escalation ladder capped by severity | Maps (schematic SVG, not survey boundaries) |
| Duplicate merging into master incidents | Voice notes, USSD, 615 telephony |
| Evidence required before closing; citizen verification and reopen | Sign-in (persona switcher) |
| Role-based access, sealed and anonymous identities, break-glass | Database (`localStorage`) |
| Hash-chained, append-only audit log | |

## Layout

- `src/platform/` — state-agnostic engine: `types`, `engine` (routing, SLA,
  escalation, duplicates, access), `triage`, `analytics`
- `src/deployments/oyo.ts` — Oyo config: 33 LGAs, police divisions, security-corps
  zones, the 615 control room, civic agencies, the routing matrix and SLAs.
  Another state is another file like this one.
- `src/store.ts` — state and every action (each one writes to the audit chain)
- `src/seed.ts` — builds history by running the real actions at past times
- `src/views/` — one file per area (ControlRoom, CaseView, Citizen, Field, Queue,
  Dashboards, Admin, Intake, Restricted)

## Security design choices in the prototype

- No security report is dispatched automatically. A person triages every one,
  and SOS goes to the top of the queue with SMS to the duty lead.
- "A report is an allegation, not proof" is shown at triage. Single reports are
  marked *uncorroborated* until independent reports arrive.
- Credibility signals (corroboration, reporter history, rate limits, call-back
  possible) inform the operator. They never decide.
- Anonymous reports store no contact at all. Confidential identities are sealed
  and visible only through break-glass. The audit trail says "Protected
  reporter", never a name.
- SGBV and intelligence tips go to a restricted desk. Chairmen see security as
  counts per area only. The public portal shows statewide totals only.
- Administrators configure the platform but cannot read cases.

## Before this goes anywhere near production

A real backend (Postgres with row-level security per jurisdiction and role),
MFA and named accounts, encryption at rest, server-side audit anchoring,
WhatsApp Business API and SMS aggregator contracts, 615 CAD/telephony
integration, NDPA 2023 compliance and a DPIA, hosting in Nigeria, penetration
testing, and a written agreement with the police and the state security corps
on dispatch and data sharing.
