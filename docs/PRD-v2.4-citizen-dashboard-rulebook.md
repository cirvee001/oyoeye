# OyoEye v2.4 — Citizen dashboard and the OyoEye Rule Book

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 20 Oct 2026

Builds on PRD v2 → v2.3. The same rules apply:

- front-end prototype, fictional data;
- the HospEase-style shell, with at most 5 menu items;
- all protections stay;
- every new event goes in the audit chain;
- demo steps 1–23 must still pass.

## 1. Problems

1. **The citizen home is a phone screen stretched across a desktop.** On a laptop, the screen is mostly empty grey, with a bottom tab bar 1,900 px wide (see screenshot, 20 Oct). Officials will see the citizen side on a projector, so it must look like a real product, not a mock-up.
2. **Citizens are never told the rules.** Hoax and nuisance calls are the biggest operational threat: Lagos 112/767 received over 15 million calls in 11 months of 2025 for about 11,000 real emergencies. Citizens need clear, friendly rules at onboarding, which they can reread at any time. The message is: fake alarms take officers away from real emergencies and lower your standing; honest mistakes are fine.

## 2. Citizen dashboard

### 2.1 Responsive shell

- **≥ 1024 px:** citizens get the same shell as staff: white sidebar, top bar, grey page, white cards.
  - Sidebar items: **Home · Report · My reports · Rule book · Inbox**.
  - The "Help is free. Never pay." banner sits as a thin strip under the top bar, as it does now.
- **< 1024 px:** keep the phone layout with bottom tabs **Home · Report · My reports · Rules · Inbox**.
  - The tab bar is never wider than the content: max-width 640 px, centred.
- **Community focal persons** get the same treatment. Desktop sidebar: Home · Report · My community · Chat · Inbox; the Rule book is reached from Home and the avatar menu.

### 2.2 Home = dashboard (citizen)

Desktop grid (12 columns, 24 px gaps), top to bottom:

1. **Greeting row:** "Hello, Adewale" on the left. On the right: a **Reporter standing badge** (§3.5), the EN/YO toggle and the avatar.
2. **Row A:**
   - **SOS card** (8 columns): the red card as it is today, press and hold.
   - **"Other ways to get help" card** (4 columns): three lines with icons. 📱 This app · ☎ Call **615** (free) · #️⃣ Dial **\*615#** on any phone.
3. **Row B: 4 stat cards** (HospEase style: icon in a tinted circle, label, big number):
   - My open reports
   - In progress
   - **Waiting for you**: needs your confirmation or feedback. Amber when above 0, and clicking it goes to the right report.
   - Closed
4. **Row C:**
   - **"My reports" card** (8 columns): the latest 5 reports as rows, each with ref · type icon + title · area · reported time · status pill · compact 7-dot stepper. Inline actions where relevant: **Confirm fix** (Yes / No / Partly), **Rate response** (conduct questions, v2.3 §4). "View all" goes to My reports.
   - Right column (4 columns), stacked:
     - **Reporter standing card** (§3.5).
     - **Rule book card:** "OyoEye Rule Book — 8 short rules" with a progress bar if unread, and **Read again**.
     - **"In your area this week" card:** public aggregate figures only, for the citizen's LGA.
       - Civic: "Waste: 4 fixed · Roads: 1 under repair · Flooding: 2 open".
       - Security: a single count, "Security reports: 3 (all being handled)".
       - **No security points, places or details** (same rule as the transparency portal).
5. **Empty state** for new users: "You haven't reported anything yet. When you do, you'll follow it here step by step." with a "Report a problem" button.

**Phone layout:** the same content, stacked: greeting → SOS → 2×2 stat cards → My reports (cards instead of rows) → standing → Rule book → In your area → Other ways to get help.

## 3. OyoEye Rule Book

### 3.1 Where it appears

1. **Onboarding (first time):**
   - After a new citizen signs in for the first time (OTP), and after a focal person activates, a full-screen **onboarding** runs before Home.
   - It has 4 short screens, then the rules, then **"I understand and agree"**.
   - It must be completed once. It can't be skipped on the first visit, but it is short and shows a progress bar.
2. **Anonymous reporting:** an anonymous reporter has no account, so they see a **one-screen summary** before their first report in a browser session. It shows the 3 key rules and an "I understand" button, with a link to the full rule book. Remember it in sessionStorage. **SOS is never blocked by this screen**: SOS always goes straight through.
3. **Always available:**
   - "Rule book" in the citizen menu (`#/rules`).
   - A link in the "Help is free" banner area.
   - A link on the sign-in page footer.
   - A link in the USSD menu: `*615#` → 5 "Rules" reads them in 4 short SMS-length screens.
4. **When it changes:** if the rule book version increases, signed-in citizens see "The Rule Book was updated — see what's new" once.

Store `rulebookAcceptedVersion` and `rulebookAcceptedAt` on the person, and audit "Accepted Rule Book v1".

### 3.2 Onboarding screens (illustrated cards, one idea each, EN + YO draft)

| # | Title | Body (keep it this short) |
| --- | --- | --- |
| 1 | Welcome to OyoEye | See it. Report it. We act on it. OyoEye connects you to the 615 control room, Police, Amotekun and state agencies. |
| 2 | Two ways to ask for help | **SOS** for danger happening now: press and hold. **Report a problem** for anything else: roads, waste, flooding, suspicious activity. No smartphone? Dial \*615# or call 615. |
| 3 | Follow your report | Every report gets a number. You'll see each step: Pending → Verified → Assigned → In progress → Resolved → Closed. We'll tell you when it moves. |
| 4 | You are protected | Choose Standard, Confidential or Anonymous. Officers in the field never see who reported. Help is free: never pay anyone. |
| 5 | The Rule Book | Next: 8 short rules that keep OyoEye working for everyone → |

### 3.3 The rules (v1)

The tone is friendly and firm, never threatening. Each rule has an icon, a bold one-line rule, and one or two sentences of why.

1. **Tell the truth, as you saw it.** Say what you saw or heard, not what you guess. "Three men with cutlasses near the mosque" helps more than "criminals everywhere".
2. **SOS is for danger happening now.** Use SOS when someone is in danger right now. For everything else, use Report a problem. It still reaches the right people.
3. **Fake alarms put real lives at risk.** Every false alarm sends officers away from someone who really needs them.
   - Reporting something on purpose that you know is false lowers your reporter standing. Your future reports may then need a call-back before help is sent.
   - Deliberate hoaxes can be prosecuted.
   - *Honest mistakes are fine: if you reported in good faith and it turned out to be nothing, that doesn't count against you.*
4. **Your safety comes first.** Don't follow, confront or film attackers. Move to a safe place, then report.
5. **No jungle justice.** Never beat, burn or "deal with" a suspect yourself, and don't gather a crowd. Hand them over, report, and let responders act. Mob action is a crime and gets innocent people killed.
6. **Describe actions, not tribes.** Say what people did and what they look like, not their ethnic group or religion. "Two men on a motorcycle with guns", not "Fulani people" or "Igbo boys". This keeps responses fair and keeps our communities together.
7. **Help is free. Never pay.** Police, Amotekun and 615 help is free. If anyone asks you for money or "something for the boys", report it. Your complaint goes to an independent panel, not to the officer's unit.
8. **Respect privacy.** Don't post victims' photos or names on WhatsApp or social media. Share them only through OyoEye, where they are protected. Confirm honestly when we ask "Is it fixed?".

Closing line: **"OyoEye works when we all use it honestly. Thank you for keeping Oyo safe."** Then the **"I understand and agree"** button.

Yoruba: provide a draft translation of every title and rule in `src/i18n.ts`, marked `// DRAFT — needs native-speaker review`.

### 3.4 Rule book page (`#/rules`, always available)

- A HospEase-style white card.
- Each rule is a numbered row with its icon and an expand/collapse "Why".
- "Last accepted: 20 Oct 2026, v1".
- Buttons: **Replay onboarding** and **Print / share** (opens the print dialog).
- An EN/YO toggle that follows the global one.

### 3.5 Reporter standing (makes rule 3 real and transparent)

This is the existing reporter-history credibility signal, made visible to the citizen and tied to clear rules.

- **Levels:**

  | Level | When | What it means for the citizen |
  | --- | --- | --- |
  | **New** | Fewer than 2 closed reports | Normal handling |
  | **Trusted** | 2+ confirmed reports and no deliberate false alarms in 12 months | Shown to the operator as a positive signal |
  | **Good** | Default otherwise | Normal handling |
  | **Under review** | 1 deliberate false alarm in 12 months | Operator sees a warning; normal handling continues |
  | **Restricted** | 2+ deliberate false alarms in 12 months | New non-SOS reports need an operator call-back before verification. **SOS is still always answered.** |

- **What counts:** only cases **Rejected** with the new reason **"Deliberate false alarm / hoax"**. Rename and split the existing Reject reasons:
  - *No trace found* — no penalty.
  - *Duplicate* — no penalty.
  - *Not a matter for OyoEye* — no penalty.
  - *Genuine mistake* — no penalty.
  - *Deliberate false alarm / hoax* — penalty. The operator must type a reason of at least 20 characters, and the duty lead must confirm before it counts.
- **The citizen sees their standing:** a badge on Home and a card that explains it: "Trusted — 5 of 5 reports confirmed. Thank you." For Under review / Restricted, the card says why, how long it lasts (12 months from the last hoax), and offers **Appeal**.
- **Appeal:** opens a short form whose result goes to the **Oversight panel** queue (v2.3 §4.3) as a new complaint type "Standing appeal". If oversight upholds the appeal, the hoax mark is removed (audited) and the standing is recalculated.
- **Anonymous reporters** have no standing. Operators already see "Anonymous — no call-back possible".
- **Phone-level guard:** for 615 calls and USSD, standing attaches to the phone number when no account exists. This reuses the existing rate-limit signal.
- **Operator view:** the credibility card shows the level with its icon. Restricted shows "Call back before verifying (2 hoaxes in 12 months)", and the Verify button asks "Have you called back?" with Yes / Couldn't reach.

## 4. Seed data

- Adewale (`cit1`) has accepted Rule Book v1 and his standing is **Trusted**.
- One seeded citizen is **Restricted** (2 hoaxes): Bose Akinwale, phone `0803 000 0111`, OTP 123456. Her appeal is waiting in the oversight queue. She has one pending non-SOS report, so the operator sees "Call back before verifying".
- A brand-new number (any unknown number, e.g. `0803 000 0500`) triggers the full onboarding.
- About 5 past cases Rejected as "Deliberate false alarm / hoax", the others under the no-penalty reasons.

## 5. Demo script additions (steps 24–28)

24. **Desktop citizen dashboard.** Sign in as Adewale on a laptop:
    - the sidebar, the SOS card with other ways to get help, 4 stat cards;
    - My reports with steppers and an inline Confirm / Rate;
    - the Trusted standing card and the "In your area this week" card.

    Narrow the window to 375 px: the phone layout and its bottom tabs.
25. **New citizen onboarding.** Sign out and sign in with `0803 000 0500`, OTP 123456, first name "Kunle":
    - 4 onboarding cards, then the 8 rules, then "I understand and agree", then Home with the New standing;
    - the audit log shows "Accepted Rule Book v1".
26. **Anonymous summary.** Signed out, choose "Report a problem" (not SOS):
    - the 3-rule summary appears, then the report flow.

    Then hold SOS: no rules screen, straight through.
27. **Hoax handling.**
    - The operator rejects a pending report as "Deliberate false alarm / hoax", with a reason.
    - The duty lead confirms.
    - The reporter's standing card changes to Under review, with the reason and Appeal.
28. **Restricted reporter and appeal.**
    - The operator opens Bose's report: "Call back before verifying" shows, and Verify asks "Have you called back?".
    - Barr. Adeyemi upholds Bose's appeal in oversight.
    - Bose's standing recalculates.

## 6. Definition of done

- At ≥ 1024 px, the citizen and focal-person screens use the sidebar shell, and Home is the dashboard in §2.2. At < 1024 px it's the phone layout, with a tab bar no wider than 640 px.
- Onboarding plus the rule book work as in §3, with EN/YO, the anonymous summary, the USSD Rules option and versioning.
- SOS is **never** blocked by onboarding, rules or standing. Check this in the scripts.
- Standing only counts duty-lead-confirmed "Deliberate false alarm / hoax" rejections in the last 12 months. Appeals go to oversight.
- Steps 1–28 pass after Reset demo. Extend demo.mjs, render.mjs and flowui.mjs to cover them.
- `npx tsc -b` gives 0 errors and `npx vite build` succeeds. The README is updated with the new credentials and steps.
