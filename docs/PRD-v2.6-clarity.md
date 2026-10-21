# OyoEye v2.6 — Clarity and consistency (no new features)

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 21 Oct 2026

This builds on PRD v2 → v2.5. No new features: this round makes what exists easier to read and use. Every earlier rule still holds:

- front-end prototype;
- HospEase-style shell, at most 5 menu items per role;
- all protections stay;
- every event is audited;
- demo steps 1–28 still pass.

## 1. One set of words

### 1.1 One verb for moving a case: **Pass**

**Today:** "Pass case", "Transfer", "Reassign", "Assign officer" and "Hand back" all mean "give this case to someone else".

**Change:** the button is always **"Pass case"**. The modal's "Pass to" options carry the sub-label:

| Old wording | New option label in the Pass case modal | Timeline / inbox wording |
| --- | --- | --- |
| Transfer to another unit | **Pass to another unit or agency** | "Passed from Police Bodija to Amotekun Ibadan" |
| Assign officer / Reassign | **Pass to an officer** | "Passed to Insp. Grace Olatunji" |
| Hand back (officer) | **Pass back to my commander** | "Passed back to CSP Rasheed Lawal" |
| Back to control room | **Pass back to the control room** | "Passed back to the 615 control room" |
| Verify & pass to unit (operator) | Primary button stays **"Verify & pass"**, then the same modal | "Verified and passed to Police Bodija" |

- "Assign case" on My officers becomes **"Pass a case to [name]"**.
- Toasts: "Passed to Police Bodija. They have 10 min to accept."
- **Officer transfers** (posting a person to another station) are a different thing, so they keep the word **"Transfer"**, used only on My officers and Stations. Never use "transfer" for cases again.
- Internal action and function names in `store.ts` don't need renaming. This is user-facing copy only.

### 1.2 Untangle "verified"

| Concept | Old words | New words (use only these) |
| --- | --- | --- |
| Control room has checked a case is real (status) | Verified | **Verified** (status pill only) |
| More than one independent person reported it | Corroborated / Uncorroborated | **"Reported by 3 people"** / **"Single report"** (badge and credibility line) |
| A registered community contact | Verified community focal person | **"Registered focal person"**. Their status values become Invited → **Registered** → Suspended |
| Staff account activated | Active | **Active** (unchanged) |

Search all copy, credibility signals, badges, the audit text shown in UI, the README and seed text, and replace accordingly.

### 1.3 Explain the statuses once, in plain words

- Next to every stepper, add a small **"What do these mean?"** link. It opens a popover listing all 7 steps and the 3 side states, one plain line each. Citizens get EN/YO; staff get EN.
  - **Pending review:** the 615 control room has your report and is checking it.
  - **Verified:** the control room checked it and it's real.
  - **Assigned:** passed to a unit or officer, who must accept it.
  - **Accepted:** someone has taken responsibility.
  - **In progress:** responders are on the way, on scene, or working on it.
  - **Resolved:** the responder says it's done. Waiting for a final check (your confirmation, or the commander's sign-off).
  - **Closed:** confirmed and finished. Nothing more to do.
  - **Reopened:** it wasn't fixed, so it went back for more work.
  - **Rejected:** not taken forward (with the reason).
  - **Referred:** handed to investigators.
- Tapping or hovering a step in the stepper shows its one-line meaning.
- On the citizen side, the Resolved pill gets a call-to-action sub-line where they need to act: **"Resolved — please confirm"**.
- Add one line to Rule Book onboarding card 3: "*Resolved* means the team says it's done; *Closed* means it's confirmed."

## 2. Nigerian formats

Put one set of helpers in `src/ui.tsx` (or a new `src/format.ts`) and use them everywhere. **No ad-hoc `toLocaleString` calls.**

- **Time zone:** always `Africa/Lagos` (WAT), via `Intl.DateTimeFormat(..., { timeZone: 'Africa/Lagos' })`, so a presenter's laptop set to another time zone still shows Oyo time.
- **Time:** 12-hour, lowercase am/pm, e.g. **"2:15 pm"**.
- **Date:** **"20/10/2026"**. In headings and long dates, "Mon 20 Oct 2026".
- **Date + time:** "20/10/2026, 2:15 pm".
- **Relative times** stay in lists ("12 min ago", "yesterday"), with the full date and time on hover or long-press.
- **"WAT" suffix** shown on: case header times, SLA due times ("Arrive by 2:35 pm WAT"), the audit log, printed pages (Rule Book, reports) and timestamps inside SMS. Not on every relative time.
- **Phone numbers:**
  - **Accepted input:** `0803 000 0001`, `08030000001`, `803 000 0001`, `+234 803 000 0001`, `+2348030000001` and `2348030000001`. Spaces, dashes and brackets are allowed.
  - **One `normalisePhone()`:** use it at every input and every comparison: sign-in, activation, invite, focal invite, rate limit, reporter standing, USSD and 615 intake.
  - **Display format:** always `0803 000 0001`.
  - **Phone masking in chat** must catch the `+234` and `234` forms too.
  - **Validation message:** "Enter a Nigerian mobile number, e.g. 0803 000 0001".
- **Numbers:** thousands separator "1,234". Percentages have no decimals unless under 10% ("3.1%").

## 3. Clickable number cards

- Every stat card on **every Overview** (all roles) and on the **citizen dashboard** becomes a link to the matching filtered list. Add a hover state, pointer cursor, focus ring and a small "View →".
- **Filters live in the URL,** e.g. `#/cases?tab=pending`, `#/cases?flag=overdue`, `#/cases?lga=ibn&status=open`, so Back works and links can be shared. The Cases page reads and writes these.
- **Mapping examples.** Apply the same principle to every card.

  | Card | Opens |
  | --- | --- |
  | Pending review | Cases → Pending review tab |
  | Assigned, not accepted | Cases → Assigned tab, flag "Handoff pending" |
  | Overdue | Cases → filter Overdue |
  | Resolved, needs sign-off | Cases → Resolved tab |
  | Critical open | Cases → priority Critical, open |
  | Median arrival today | Reports → Unit performance |
  | Asked for money % | Reports → Conduct |
  | On duty now (admin) | Duty roster filtered On duty |
  | Officer SOS (30 days) | Reports → Officer safety |
  | Complaints (oversight) | Complaints filtered by that state |
  | Citizen "Waiting for you" | My reports filtered to the reports waiting for them |

- If a card's number is 0, it still links, and the list shows its empty state.

## 4. A calmer inbox

**Today:** around 230 seeded items, one row per message, all mixed together.

**Change:**

- **Two sections:**
  1. **Needs your action** (pinned at top), ordered **SOS / Officer SOS → officer-help requests → handoffs to accept → everything else that needs a decision** (hoax confirmations, kidnap notice approvals, officer transfers to accept, appeals, the citizen's "Is it fixed?" and "Rate the response"). Each row has its inline buttons, as today.
  2. **Updates:** **one row per case**, showing the latest update, "3 updates", and the case status pill. Expand to see the updates. Items not tied to a case (chat @mentions, onboarding, rule book notices) are grouped by type ("Chat mentions · 2").
- **Filter chips:** All · Needs action · Unread.
- **"Mark all read"** for the Updates section and **"Mark all as read"** overall. Action items can't be marked read until they're acted on or expire.
- **Opening a case marks all its updates as read.**
- **The bell dropdown matches the page:**
  - Action items first, up to 6.
  - Then "N other updates".
  - "View all".
  - The count badge shows **action items + unread case groups**, not raw messages.
- **Seed:** mark seeded items older than 2 hours as read, so each role starts with a believable inbox: about 3–8 action items and fewer than 15 unread groups.

## 5. Shorter case timelines

- The timeline opens on **"Key steps"** by default, with a toggle **Key steps | Everything (N more)**.
- **Key steps include:**
  - report(s) received;
  - verified / rejected;
  - every pass, accept and decline;
  - en route, on scene, updates and photos;
  - backup requested;
  - escalations;
  - resolved, closed, reopened;
  - citizen confirmations;
  - officer SOS events;
  - community leader notified;
  - break-glass (for roles that can see it).
- **Hidden under "Everything":**
  - AI triage suggestions;
  - routing suggestions;
  - notifications/SMS sent;
  - "Viewed restricted case" logs;
  - alert mutes;
  - clock and system housekeeping.
- **In both views,** runs of 3 or more consecutive system entries of the same kind are collapsed into one row: "4 messages sent · show".
- The existing filter chips (All / Handoffs / Updates / Messages) stay and apply within the chosen view.

## 6. Live handoff countdown

- While a pass is waiting for acceptance, show the time left, live (it updates at least every 15 s and follows the demo clock):
  - **Receiver's inbox item:** "Pass from 615 control room · **8 min left to accept**" next to Accept / Decline.
  - **Case header:** a banner under the title, "Waiting for Police Bodija to accept · **8 min left**". On the receiver's view it says "**You have 8 min left to accept**", with the Accept button.
  - **Cases list, "With" column:** "Police Bodija · ⏳ 8 min".
  - **Sender's view:** the same banner, "Waiting for them to accept · 8 min left".
- **Colours:** normal until 25% of the window is left, then **amber**. After expiry it turns **red**: "**Overdue by 3 min — escalated to CSP Rasheed Lawal**" (the existing escalation, now shown in words).
- The same countdown applies to **officer transfers awaiting acceptance** and to **officer-help requests** ("Officer needs help · answer now").

## 7. Demo script

No new steps. Update the README wording to the new terms (Pass, Reported by N people, Registered focal person) and the new formats. Point out:

- the countdown in steps 2–3 and 6;
- clickable Overview cards in step 10 (Governor) and step 24 (citizen);
- the calmer inbox in step 3;
- "Key steps" on any seeded case.

## 8. Definition of done

- All copy follows §1. Add a check that fails if the rendered UI contains the old terms: "Transfer" on a case (allowed only on My officers and Stations), "Reassign", "Hand back", "Corroborated", "Uncorroborated", "Verified community focal person".
- Every date, time and phone number displayed goes through the §2 helpers. Checks:
  - rendered times match `\d{1,2}:\d{2} (am|pm)`;
  - all six phone input forms normalise to the same number, and sign-in works with each;
  - chat masking catches the `+234` form;
  - WAT shows on case headers and SLA due times;
  - output is correct with the process time zone set to UTC and to America/New_York.
- Every Overview and dashboard card is a link, and the URL filter it opens produces the same count as the card (check this for every card of every role).
- Inbox:
  - action items come first, in the §4 order;
  - case updates are grouped;
  - "Mark all read" works;
  - opening a case marks its group read;
  - seeded starting counts are within §4 limits;
  - the bell count matches the page.
- Timeline: "Key steps" is the default and hides the §5 system entries; "Everything" shows all; collapsing works.
- Countdown: the remaining time is correct against the demo clock; the amber and red thresholds work; the overdue text names the escalation contact.
- Steps 1–28 pass after Reset demo. Extend demo.mjs, render.mjs and flowui.mjs to cover §8.
- `npx tsc -b` = 0 errors; `npx vite build` succeeds.
