# OyoEye v2.2 — Onboarding stations & officers, and station group chat

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 16 Oct 2026
Builds on PRD-v2 and PRD-v2.1 (layout). Same rules: front-end prototype, localStorage, fictional data, v2 protections unchanged, the HospEase-style shell and the 5-item menu cap.

## 1. Why

Officials will ask two things the demo cannot answer today:

1. **"How do our stations and officers get onto this?"** Today every unit and person is hard-coded in `src/deployments/oyo.ts`. There is no way to add a station, invite an officer, move an officer to another station or remove someone who has left.
2. **"How do officers talk to each other?"** Today Nigerian police divisions, Amotekun commands and agencies coordinate on **WhatsApp groups**. These have real problems:
   - nothing is audited;
   - transferred or dismissed officers stay in the group;
   - lost phones expose everything;
   - case details and informant names get forwarded freely.

   OyoEye needs its own station group chat that fixes these problems but still feels as easy as WhatsApp.

## 2. Nigerian realities that shape the design

| Reality | Design response |
| --- | --- |
| Police structure is State Command → Area Command → Division (station, led by the DPO) → officers. Amotekun: State HQ → zone → LGA command. Agencies: HQ → zones | Model **Organisation → Station → Staff**. A "station" is any responding unit: police division, Amotekun command, fire station, agency zone office |
| Officers are posted and transferred often | **Transfer officer** is a first-class action: history, open cases and chat membership move with the posting |
| Many officers have basic phones, shared SIMs and no email | Identity = **phone number + service number + 4-digit PIN**. Activation by SMS code. No email or password |
| Commanders know their people; HQ does not have clean staff lists | The **station commander onboards their own officers**. The admin creates stations and their commanders, optionally by spreadsheet import |
| People leave, retire, get dismissed or lose phones | **Deactivate** cuts access at once. Open cases must be reassigned first. "Report lost phone" signs the account out everywhere |
| WhatsApp is the habit | Chat looks and behaves like a WhatsApp group: bubbles, photos, voice notes, read ticks, pinned message |

## 3. Data model additions (`src/platform/types.ts`, `src/store.ts`)

- `Organisation { id, name, kind: 'police'|'amotekun'|'fire'|'agency'|'lga'|'control_room'|'sensitive', ranks: string[] }`. Seed: Nigeria Police Force – Oyo Command, Amotekun Oyo, Fire Service, Waste Authority, Drainage Unit, Road Maintenance, Works Ministry, Power Hazard Desk, LG councils, the 615 Control Room and the restricted desks.
- Existing `Agency` becomes a **Station**: add `organisationId`, `address`, `landmark`, `phone`, `commanderId`, `createdAt`, `status: 'setting_up'|'live'|'suspended'`.
- `Person` gets `serviceNumber`, `rank`, `staffStatus: 'invited'|'active'|'suspended'|'deactivated'`, `invitedBy`, `inviteCode` (demo only), `activatedAt`, `postings: { stationId, from, to? }[]`.
- `ChatMessage { id, channelId, at, authorId, kind: 'text'|'photo'|'voice'|'location'|'case'|'system'|'broadcast', text?, photo?, caseId?, urgent?, pinned?, seenBy: string[] }`.
- `Channel { id, kind: 'station'|'broadcast', stationId?, name, memberIds (derived) }`. **Membership is derived from postings, never edited by hand.** Members are everyone currently posted to the station, plus the control-room duty lead as monitor.
- Everything below writes to the audit chain (onboarding events, chat posts, deletes, pins).

## 4. Onboarding

### 4.1 Who does what

| Step | Who | Screen |
| --- | --- | --- |
| Create organisation and stations | Administrator | Stations & staff |
| Name the station commander | Administrator | Add / edit station |
| Invite officers to a station | Station commander (or admin) | My officers |
| Activate account | The officer, on their phone | Sign-in → "Activate my account" |
| Transfer an officer | Sending commander starts, receiving commander accepts | My officers |
| Suspend or deactivate | Commander (own station) or admin | My officers / Stations & staff |

### 4.2 Admin: "Stations & staff" page (new; replaces nothing)

- **Overview cards:** Stations live · Stations setting up · Active staff · Invites pending.
- **Station list:** a HospEase-style table grouped by organisation. Columns: Station · Organisation · Covers (LGAs) · Commander · Officers (active/invited) · Readiness · Status · View.
- **Readiness** is a 4-item checklist shown as "3/4" with a tooltip:
  1. Commander assigned.
  2. At least 3 active officers.
  3. Duty roster set for today.
  4. One test case completed.

  A station turns **Live** only when all 4 are done. Until then routing skips it and falls back to the covering zone or the control room. This is what a pilot rollout tracks.
- **"Add station" modal:**
  - Organisation, station name, type, LGAs covered (multi-select), address, landmark, station phone.
  - Commander: pick an existing person or invite a new one (name, rank, service number, phone).
  - Saves as *Setting up*.
- **"Import from spreadsheet" modal:**
  - Download a CSV template (`station,organisation,lgas,commander_name,commander_rank,commander_service_no,commander_phone`).
  - Upload a file, or click "Use sample file" in the demo.
  - Preview the rows with any errors flagged.
  - Import.
- **Station page:** details card, members table, readiness checklist, and a link to its chat. Admins can see the member list but **not chat content**, which keeps v1's rule that admins cannot read cases.

### 4.3 Commander: "My officers" page (extend the existing one)

- **Header buttons:** "Invite officer", plus "Invite many" (paste rows: name, rank, service number, phone).
- **"Invite officer" modal:**
  - Full name.
  - Rank (dropdown from the organisation's ranks, e.g. Police: Constable, Corporal, Sergeant, Inspector, ASP, DSP, SP, CSP; Amotekun: Corps Member, Squad Leader, Unit Commander).
  - Service number.
  - Phone (Nigerian format, validated).
  - Role at station: Field officer · Desk officer · Deputy commander.
- **Sending an invite:**
  - Writes an SMS to the outbox: "OyoEye: CSP Rasheed Lawal added you to Police Bodija. Activation code 482913. Open oyoeye.oy.gov.ng or dial *615*9#".
  - The table row shows **Invited**, with actions Resend code and Cancel invite.
- **Table columns:** Name (rank) · Service no. · Phone · Role · Shift · On duty · Open cases · Status pill (Invited / Active / Suspended) · Actions ▾.
- **Actions menu:**
  - Assign case (existing).
  - **Transfer to another station**:
    - Pick the station, a reason (Posting, Redeployment, Temporary duty) and an effective date.
    - The receiving commander gets an inbox item with **Accept / Decline**, the same pattern as case handoff.
    - On accept, the posting history updates, chat membership switches, and the officer is told by SMS.
    - Open cases must be reassigned first. The modal lists them with a "Reassign all to…" picker.
  - **Suspend** (with a reason).
  - **Deactivate** (with a reason, and open cases reassigned first). Deactivation signs the person out, removes them from chat, and keeps their history and audit trail.
  - **Report lost phone**: signs out all sessions, and the next sign-in needs a new SMS code.

### 4.4 Officer activation (on the sign-in page)

- New link on the Staff tab: **"First time? Activate my account"**.
- **Step 1:** phone number + 6-digit code from the SMS. In the demo, show the code in the yellow demo banner, read from the invite.
- **Step 2:** confirm identity. Show name, rank, station and service number with "This is me". If it's wrong: "Not me — tell my commander", which sends a message to the commander's inbox.
- **Step 3:** set a 4-digit PIN, entered twice.
- **Step 4:** a 3-card intro, skippable: "Accept your case fast", "Update as you move", "Pass back if you can't go".
- Lands on My cases.
- A system message posts in the station chat: "Cpl. Bayo Adeleke joined Police Bodija".

### 4.5 Seed data for the demo

- One **invited, not activated** officer at Police Bodija: Cpl. Bayo Adeleke, phone `0803 000 0099`, code `482913`.
- One station **Setting up** (Police Division — Moniya, Akinyele), readiness 1/4.
- One **pending officer transfer** into Amotekun Ibadan, waiting for Comdr. Adegoke.
- Chat history for Police Bodija and Amotekun Ibadan:
  - about 15 messages over 2 days;
  - a pinned shift briefing;
  - two case cards;
  - one photo;
  - one control-room broadcast.

## 5. Station group chat

### 5.1 Channels

- **One channel per station**, created automatically with the station. Members:
  - everyone posted there;
  - the control-room duty lead, as monitor with a "Control room" badge;
  - the security coordinator, read-only, for police and Amotekun stations.
- **Broadcast channel "Control room alerts"**:
  - Only the control room and the coordinator can post.
  - The sender chooses the target: all stations, one organisation, or stations covering selected LGAs. Example: "BOLO: white Toyota Sienna, partial plate KTU-, last seen Ojoo, heading Moniya".
  - Broadcasts appear in every target station's chat as a highlighted banner bubble that must be acknowledged ("Seen ✓" button). The sender sees "Acknowledged by 7 of 11 stations".
- The restricted desks (SGBV, Intel) get their own private channels. **Security case cards never show reporter identity in any channel.**

### 5.2 Chat screen (WhatsApp-like, inside the v2.1 shell)

- **Desktop:** two panes.
  - Left: channel list. Each row has the station name, the last message preview, the time and an unread count. Broadcasts are listed at the top.
  - Right: the conversation.
- **Phone (field officer):** the channel list, then the conversation full screen. A "Chat" tab sits in the bottom bar.
- **Conversation header:** station name, member count ("12 members · 5 on duty") and a "Members" side sheet showing on-duty dots.
- **Pinned bar** at the top: the latest pinned message, e.g. the shift briefing. Commanders and deputies can pin.
- **Bubbles:** own messages on the right in green, others on the left in white, with name and rank above. Time and ticks: ✓ sent, ✓✓ seen by all on-duty members. Tapping shows "Seen by 4: …".
- **Composer:**
  - Text field.
  - 📎 menu: Photo (sample photo in the demo), **Share a case** (picker of the station's open cases → posts a case card), Share my location (posts a schematic pin with the area name).
  - 🎤 hold-to-record voice note (simulated clip with a duration).
  - **Urgent** toggle: a red bubble, sends a push to all on-duty members, and an SMS to the commander.
- **Case card bubble:** ref, type, area, status pill, who holds it, and a "View case" button. The pill updates live as the case moves.
- **Chat from the case page:** a "Discuss in station chat" item in the case page's More ▾ menu posts that case card to the holding station's channel.
- **System messages** (grey, centred): joined, transferred out, deactivated, a case passed to this station, a case escalated in this station.

### 5.3 Safety rules (this is the difference from WhatsApp groups)

1. Membership follows postings automatically. A transferred or deactivated officer loses access immediately.
2. **Phone-number masking.** Anything that looks like a Nigerian phone number in a message is shown masked (`0803 *** **21`) to everyone except the author. The author sees a hint: "Phone numbers are hidden in chat. Use the case page to contact reporters."
3. Reporter identity is never included in case cards. Break-glass details can't be shared to chat.
4. No forwarding outside OyoEye, and no "save to gallery". The prototype shows a "Screenshots are discouraged — messages are audited" note at the top of each channel.
5. Every message is written to the audit chain. Deleting a message replaces it with "Message removed by [name]" and keeps the audit record.
6. Admins see that a channel exists and who its members are, but not its messages.

### 5.4 Notifications

- New messages raise the existing bell count only when the message is urgent, a broadcast, or @mentions you (`@Grace`).
- Normal messages show only as an unread count on the Chat menu item and in the channel list. This stops chat noise from burying case handoffs in the inbox.

## 6. Menu changes (keep the 5-item cap)

| Role | Sidebar (new) |
| --- | --- |
| 615 Operator | Overview · Cases · **Chat** · Inbox · (New 615 call moves to a "+ New 615 call" button on the Cases header) |
| Duty Lead | Overview · Cases · **Chat** · Inbox · Reports (New 615 call button on Cases) |
| Unit Commander / Agency Head | Overview · Cases · My officers · **Chat** · Inbox |
| Field officer (bottom tabs) | My cases · **Chat** · Inbox · Profile |
| Restricted desk | Overview · Cases · **Chat** · Inbox |
| Security Coordinator | Overview · Cases · Reports · **Chat** · Inbox |
| Governor's Office | Overview · Reports · Inbox (no chat) |
| LGA Chairman | Overview · Cases · Inbox (no chat) |
| Administrator | Overview · **Stations & staff** · Rules (tabs: Routing · Service targets) · Duty roster · Audit log |

## 7. Demo script additions (after PRD-v2 §5, steps 11–16)

11. **Admin** opens Stations & staff:
    - Police Division — Moniya shows *Setting up 1/4*.
    - Click "Add station", create "Amotekun — Ido Command" covering Ido, and invite its commander.
    - Show the readiness checklist.
12. **CSP Lawal** (commander) opens My officers:
    - Click "Invite officer": Cpl. Tola Ojo, Corporal, service number, phone.
    - The SMS with the code appears in the outbox.
    - Cpl. Bayo Adeleke shows as *Invited* (seeded).
13. Sign out → **Activate my account** with `0803 000 0099` and code `482913`:
    - Confirm "This is me", set the PIN, see the intro, land on My cases.
    - Police Bodija chat shows "Cpl. Bayo Adeleke joined".
14. **Station chat:**
    - CSP Lawal pins the shift briefing.
    - The operator uses "Discuss in station chat" on the SOS case, and the case card appears.
    - Grace replies with a photo, then types a phone number, and it shows masked.
    - The case card's pill changes live when Grace marks the case resolved.
15. **Broadcast:**
    - The duty lead sends a BOLO to stations covering Akinyele, Ibadan North and Ido.
    - The commander acknowledges it.
    - The duty lead sees "Acknowledged by 1 of 3".
16. **Transfer:**
    - CSP Lawal transfers Grace to Amotekun Ibadan, reassigning her open case to Bayo.
    - Comdr. Adegoke accepts in the inbox.
    - Grace's chat list now shows Amotekun Ibadan, and Police Bodija chat shows "Insp. Grace Olatunji was transferred out".

## 8. Definition of done

- Everything in §4–§6 is built inside the v2.1 shell and visual style. Chat matches the pattern in §5.2 on desktop and at 375 px.
- The PRD-v2 §5 steps 1–10 still pass. The new steps 11–16 pass after Reset demo.
- Protections hold:
  - admins cannot read chat or cases;
  - no reporter identity in any chat message or case card;
  - phone numbers are masked;
  - deactivated or transferred people lose channel access;
  - every onboarding and chat event is in the audit chain, and the chain verifies.
- `npx tsc -b` gives 0 errors and `npx vite build` succeeds. The scratchpad check scripts are extended to cover steps 11–16 and pass.
- The README is updated with the onboarding and chat demo steps and the activation demo credentials.
