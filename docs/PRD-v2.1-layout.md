# OyoEye v2.1 — Layout simplification (addendum to PRD-v2)

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 16 Oct 2026

## 1. Why

v2 works end to end, but the screens still look complicated: up to 9 sidebar links per role, a dense two-column case page, many badges and panels at once. Officials should understand any screen in 5 seconds.

The reference is **HospEase**, a multi-role hospital management system in daily use in Nigerian hospitals (source in the workspace at `C:\Users\HomePC\Documents\Codes\hosp`). Staff there pass patients to each other (front desk → nurse → doctor → lab/pharmacy) and the UI is easy because **every role gets the same simple shell and the same three screen types**. We copy that pattern, not its code.

**Scope:** layout, navigation and visual style only. Keep all v2 logic in `src/store.ts` and `src/platform/*` (statuses, handoffs, inbox, escalation, protections). Do not change behaviour except where this doc says so.

## 2. What to take from HospEase (study these files)

| Pattern | HospEase file to look at |
| --- | --- |
| App shell: white sidebar + white top bar + grey page with white cards | `src/layout/DashboardLayout.tsx`, `src/components/Dashboard/Sidebar.tsx`, `src/components/Dashboard/TopNav.tsx` |
| Short per-role menu (5–7 items, icon + label) | `src/config/sidebarRoutes.tsx` (see `nurse`, `doctor`, `front-desk-manager`) |
| Overview = 4 stat cards + chart + "Recent" table | `src/components/Nurse/overview/NurseDash.tsx` |
| Work list = one card: title + count badge, search, status tabs with count chips, table, "View" | `src/components/Nurse/Appointment/NurseAppointment.tsx`, `src/components/ReusablepatientD/Tabs.tsx`, `src/Shared/Table.tsx` |
| Soft status pills | `src/Shared/UsersColumn.tsx` (`statusStyles`) |
| Detail page = back link, top action button, label/value info card, action card, timeline | `src/components/Nurse/Appointment/NurseAppointmentDetails.tsx`, `src/Shared/MedicalTimeline.tsx` |
| Handoff = centred modal: read-only summary, "Staff member / Department" radio, select, submit, green success banner | `src/Shared/TransferAppointmentModal.tsx`, `src/components/Nurse/Appointment/TransferToDoc.tsx` |
| Bell dropdown | `src/components/Dashboard/Notification.tsx`, `TopNav.tsx` |

Do **not** import Tailwind, MUI or antd. Recreate the look in `src/styles.css`. You may add `lucide-react` (same icon set as HospEase) if install works; otherwise use small inline SVG icons.

## 3. The shell (every signed-in staff role)

```
┌──────────────┬──────────────────────────────────────────────────────────┐
│  [logo]      │ Page title        [ Search ref, area, LGA… ]   ●On duty 🔔3 (AB) Aisha Bello ▾ │  ← top bar, white, 60px
│  OyoEye      ├──────────────────────────────────────────────────────────┤
│              │                                                          │
│ ▣ Overview   │   grey page (#F2F4F5), 24px padding                      │
│ ▤ Cases   12 │   ┌──────────┐┌──────────┐┌──────────┐┌──────────┐       │
│ ✉ Inbox    3 │   │ stat card││ stat card││ stat card││ stat card│       │
│ ☎ New call   │   └──────────┘└──────────┘└──────────┘└──────────┘       │
│ ▦ Reports    │   ┌──────────────────────────────────────────────┐       │
│              │   │ white card                                   │       │
│              │   └──────────────────────────────────────────────┘       │
│ ⎋ Sign out   │                                                          │
└──────────────┴──────────────────────────────────────────────────────────┘
```

- **Sidebar**: white, 240px (collapses to a 72px icon rail under 1100px; slide-in drawer with a hamburger under 768px). Logo at top. Items = icon + label + optional count chip. Active item = **solid green pill with white text** (`--primary: #0B6E4F`, like HospEase's `bg-primary text-white`). Inactive = grey text `#667185`, hover light grey. **Sign out** pinned at the bottom. No section headings, no public links.
- **Top bar**: white, 60px, subtle shadow. Left: page title. Centre: one search box ("Search by reference, area or LGA") that jumps to a case by ref or filters the Cases list. Right: on-duty switch (staff), bell with red count (dropdown like HospEase: list, unread tint, inline Accept/Decline for handoffs, "View all"), avatar circle with initials + name + role; avatar menu has Profile and Sign out.
- **Page**: grey background, content in white cards (`border-radius: 12px; box-shadow: 0 1px 3px rgba(16,24,40,.08)`), 24px gaps. Max content width 1280px.
- **Demo controls** pill stays bottom-right, collapsed by default, unchanged.
- **Font**: system stack; title 20px/600, card title 16px/600, body 14px, table header 11px uppercase grey bold (HospEase table style).

### Menus per role (max 5 items; this replaces all current nav)

| Role | Sidebar items (in order) | Landing |
| --- | --- | --- |
| 615 Operator | Overview · Cases · New 615 call · Inbox | Cases (tab Pending review) |
| Control-room Duty Lead | Overview · Cases · New 615 call · Inbox · Reports | Cases |
| Unit Commander (Police / Amotekun) | Overview · Cases · My officers · Inbox | Cases |
| Agency Head (civic) | Overview · Cases · My officers · Inbox | Cases |
| Restricted Desk | Overview · Cases · Inbox | Cases |
| Security Coordinator | Overview · Cases · Reports · Inbox | Overview |
| Governor's Office | Overview · Reports · Inbox | Overview |
| LGA Chairman | Overview · Cases · Inbox | Overview |
| Administrator | Overview · Routing · Service targets · Duty roster · Audit log | Overview |

"Reports" = one page with tabs: Security picture · Unit performance · Morning brief (reuse existing views as tab content). "My officers" = the duty roster filtered to the user's unit, with on-duty toggle, open cases per officer and an "Assign case" shortcut. Transparency portal and Track a report are reachable from the sign-in page footer only.

**Field officer and citizen stay phone-first** (bottom tab bar: Field = My cases · Inbox · Profile; Citizen = Home · Report · My reports · Inbox) but use the same visual language: white cards on grey, green primary buttons, the same status pills.

## 4. Three screen types (every staff page is one of these)

### 4.1 Overview

- Row of **4 stat cards** (icon in a soft-tinted circle, grey label, big bold number, optional small "+3 today" line). Per role:
  - Operator: Pending review · Assigned, not accepted · In progress · Closed today
  - Commander/Agency head: Waiting for us to accept · In progress · Resolved, needs sign-off · Overdue
  - Coordinator/Governor: Open cases · Critical open · Median arrival today · Acknowledged on time %
  - Chairman: Open in my LGA · Resolved this week · Overdue · Reopened
  - Admin: Active staff · On duty now · Routing rules · Audit chain ✓/✗
- One **chart card** (cases by status bar, or cases by hour) — reuse the existing chart.
- One **"Needs your action"** table card (top 5 cases waiting on this user, same table as 4.2, with "View all" → Cases).

### 4.2 Cases (the work list) — the main screen

One white card, exactly like HospEase `NurseAppointment`:

1. Header row: "Cases" + purple-ish count badge · search input · filter button (opens LGA / category / severity dropdowns).
2. **Status tabs** with count chips, underline style (green underline on active). Tabs per role:
   - Operator / Duty lead: Pending review · Assigned · In progress · Resolved · Closed · All
   - Commander / Agency head: To accept · Accepted · In progress · Resolved · Reopened · Closed
   - Restricted desk: Pending review · Open · Closed
   - Coordinator / Chairman: Open · Overdue · Closed
3. **Table** (HospEase `Table.tsx` style: grey header row, 11px uppercase labels, row dividers, hover). Columns: **Ref** (mono) · **What** (category icon + type) · **Where** (area, LGA) · **Reported** (relative time) · **With** (unit or officer now holding it) · **Status** (pill) · **Priority** (dot + word, red only for critical) · **View** button. Max one extra badge per row (SOS or Overdue or Handoff pending — the most urgent one).
4. Pagination footer (10 per page) like HospEase.
5. Clicking a row or **View** opens the case page.

The Control-room "board" becomes this table (sorted: SOS first, then critical, then oldest). Remove the separate board layout.

### 4.3 Case page (detail)

Single column, max 960px, in this order:

1. **Back link** "← Cases".
2. **Header card**: ref + category icon + title (first sentence of report) · status pill · priority. Right side: the **one primary next-step button** for this user (e.g. "Verify & pass to unit", "Accept", "En route", "Mark resolved", "Sign off & close") and a secondary **"Pass case"** button. Other actions go in a "More ▾" menu (Ask reporter, Merge, Reject, Request backup, Add update). Under the header: the existing stepper (keep it; it's good).
3. **Case details card**: HospEase `InfoRow` grid of label/value pairs (4 per row on desktop, 2 on phone): Reported · Channel · LGA · Area / landmark · Category · Severity · Reports (count, corroborated?) · With (unit / officer) · Since · Ack due · Arrive due · Resolve due (clocks shown as green/amber/red text).
4. **Reporter card** (masked / sealed / anonymous rules unchanged) and **Credibility card** (security only) side by side on desktop, stacked on phone. Each is a short list, not chips.
5. **Evidence card**: thumbnails + notes; "Add photo / update" button inside.
6. **Timeline card**: HospEase `MedicalTimeline` style — grouped by day ("Today", "Yesterday", date), each entry = time · bold actor · plain sentence · small icon. Filter chips (All / Handoffs / Updates / Messages) stay.

Remove the map panel from the case page (or show a small static pin inside the details card). No right-hand column.

### 4.4 "Pass case" modal (handoff)

Centred modal (max 640px, dark backdrop), like HospEase `TransferAppointmentModal`:

1. Title "Pass case OY-SEC-…" + close ×.
2. Read-only summary fields in grey boxes: Ref · Type · Area, LGA · Current holder.
3. **"Pass to"** radio: **Unit / agency** · **Person in my unit** · **Back to control room** (only the options this role may use).
4. One **select** (units show "Police Bodija — covers Ibadan North, Akinyele · 4 open"; people show "● on duty · 2 open").
5. **Reason** chips + optional note textarea.
6. Full-width green **"Pass case"** button. On success, replace the form with a **green success banner** ("Passed to Police Bodija. They have 10 min to accept.") and a "Done" button.

The receiver's Accept / Decline appears in three places: bell dropdown, Inbox page, and as the primary button on the case page header.

## 5. Status pills (single component, used everywhere)

Soft background + strong text, rounded-full, 12px/600, like HospEase `statusStyles`:

| Status | Background | Text |
| --- | --- | --- |
| Pending review | `#FFF4D6` | `#B58A00` |
| Verified | `#E0ECFF` | `#1D4ED8` |
| Assigned | `#E0ECFF` | `#1D4ED8` |
| Accepted | `#E7E5FF` | `#4338CA` |
| In progress | `#FFE8D1` | `#B45309` |
| Resolved | `#DCFCE7` | `#15803D` |
| Closed | `#CFFFE9` | `#0B6E4F` |
| Reopened | `#FBE1E1` | `#D92D20` |
| Rejected | `#F2F4F7` | `#667085` |
| Referred | `#F3E8FF` | `#7E22CE` |

Priority: small dot + word (Critical red, High orange, Normal grey, Low light grey). Red is used only for SOS, critical and Reopened.

## 6. Sign-in page

Keep the content (emergency button, Citizen/Staff tabs, demo cards) but lay it out like HospEase `src/_Auth/Signin.tsx`: two panels on desktop — left a green panel with logo, tagline and the red "Report an emergency now" button; right a white form panel. Demo account cards become a compact list (avatar initials · name · role · "Sign in →"), grouped: Citizens · Control room · Responders · Oversight · Admin.

## 7. Definition of done

- Every staff page is one of: Overview, Cases list, Case page, or a simple settings/table page — inside the shell in section 3.
- No staff role has more than 5 sidebar items; no case page has a second column of panels.
- The PRD-v2 section 5 demo script still works unchanged, end to end, after Reset demo.
- `npx tsc -b` = 0 errors; `npx vite build` succeeds.
- Re-run the existing check scripts (see build notes) and fix or update them so they pass.
- Usable at 1440px, 1024px, 768px and 375px widths.
