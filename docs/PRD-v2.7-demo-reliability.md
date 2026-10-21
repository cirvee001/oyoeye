# OyoEye v2.7 — Demo reliability (no new features)

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 21 Oct 2026

This builds on PRD v2 → v2.6. No new product features: this round makes the demo fast, stable and easy to present on an ordinary venue laptop over weak Wi-Fi. Every earlier rule still holds: protections, the audit chain, the 5-item menus, and demo steps 1–28.

## Measured today (20 Oct 2026, v2.5)

| Problem | Number |
| --- | --- |
| Seeding on first load / Reset demo | about 4.1 s, with a blank screen, in Node; likely longer on a venue laptop |
| Saved state | about 2.3 MB JSON: incidents 959 KB (425 cases), audit 1,031 KB (4,879 entries), people 85 KB, outbox 64 KB, inbox 58 KB |
| Browser limit | about 5 MB per site for localStorage; saving fails silently when full |
| Save cost | the whole 2.3 MB is stringified on every action (300 ms debounce) |
| Main JS chunk | 719 KB, everything for every role (Leaflet is already split, 149 KB) |
| Checks | demo.mjs, render.mjs and flowui.mjs (500+ checks) live only in a temporary folder outside the repo |

## 1. Instant start: snapshot plus loading screen

- **Ship a pre-built seed snapshot.** Add a script `npm run snapshot` that runs the existing seed in Node (the same way the check scripts load the store) and writes `public/seed-snapshot.json`. Commit the generated file.
- **Times stay current.** All seeded times are stored relative to the moment the snapshot was taken (`snapshotAt`). On load, shift every timestamp by `now − snapshotAt` in one pass.
- **The audit chain still verifies.** Hashes include `at`, so after the shift, **rebuild the seeded part of the hash chain** in the same pass. It's the seed's genesis, so this is legitimate. Entries added during the demo chain on normally. "Verify audit chain" must still pass.
- **The app loads the snapshot** (fetch, or a lazy JSON import as its own chunk) instead of running the seed on first load and on Reset demo. The seed code stays available for `npm run snapshot` and the tests, but it must not be in the browser bundle.
- **Loading screen:** while the snapshot loads and shifts, show a simple full-screen loader (logo, "Preparing OyoEye…", a progress bar) instead of a blank page. Target: **first usable screen < 1.5 s** on a mid-range laptop. The loader must appear within 100 ms.
- **Reset demo** shows the same loader and finishes in under 1 s.

## 2. Stay inside browser storage

- **Trim the sample history** while keeping every demo step and dashboard meaningful. Target saved state of **≤ 1.2 MB** right after Reset:
  - keep 30 days for hotspots and conduct, but fewer routine closed civic cases;
  - stop storing duplicate long strings (e.g. repeated alert text in the outbox and inbox; store template keys plus parameters, as v2.5 started);
  - cap the outbox at 300 messages and the inbox at 150 items per person, dropping the oldest read items first. Never drop action items or audit entries.
  - Check the dashboards still look plausible: no empty charts, the hotspots still show the Moniya / Igangan / Ojoo clusters.
- **Photos out of localStorage:** store photo data in **IndexedDB** (a small wrapper, no library), keyed by id. The state keeps only the id.
  - Fallback: if IndexedDB is unavailable, keep a downscaled (480 px, quality 0.55) data URL in state, as today.
  - Reset demo clears the IndexedDB store too.
- **Storage meter** in Demo controls: "Storage used: 1.1 MB of ~5 MB".
  - At **70%** it turns amber, with a hint.
  - At **90%** it turns red, and a one-time toast appears with **Reset demo** and **Remove demo photos** buttons.
- **If a save ever fails,** show a visible red chip in the top bar, "Not saved — storage full", with the same buttons. **Never fail silently.**

## 3. Faster saving

- **Split state across localStorage keys by collection:** `oyoeye:v2.7:incidents`, `:people`, `:chat`, `:inbox`, `:outbox`, `:feedback` and so on, plus a small `:meta` key. Only the collections that changed are rewritten.
- **The audit log is append-only.** Store it in chunks of 500 entries (`:audit:0`, `:audit:1`, …); only the last chunk is rewritten.
- **Save when the browser is idle:** `requestIdleCallback`, falling back to `setTimeout`, with a 1 s maximum delay. Always flush on `pagehide` / `visibilitychange`.
- **Target:** a typical action (accept, pass, chat message) costs **under 20 ms of saving** on the main thread. Measure it in the checks by timing serialise + write for a typical action.
- **Migration:** if an old single-key v2.6 state exists, ignore it and load the snapshot. The bumped storage key already does this.

## 4. Pause the demo clock

- Demo controls get **Pause clock / Resume clock**.
- While paused:
  - time doesn't move, so no escalations, check-ins or countdowns advance on their own;
  - **+15m / +1h / +6h still work**;
  - a small **"⏸ Clock paused"** chip shows in the top bar, and clicking it resumes.
- The paused state survives a page refresh.
- README tip: "Pause the clock before you start presenting; use +15m to move time on cue."

## 5. "Jump to step" presenter mode

- In Demo controls, the existing **Switch account** sheet gets a second tab, **Demo steps**: the 28 steps listed with number, short title and the person they use.
- **Choosing a step:**
  1. **Prepares the state:**
     - **Jumping forward** automatically performs the actions of any steps that were skipped, using the same code paths the checks use. A toast says "Steps 2–5 done for you".
     - **Jumping backward** asks "This resets the demo and replays steps 1–N. Continue?", then resets (snapshot) and replays.
  2. **Signs in as that step's person.**
  3. **Opens the right page,** with the right case open where relevant.
- **Presenter chip:** a small collapsible chip shows at the bottom-left, "Step 6 of 28 · Escalation · **Next →**".
  - Expanded, it shows a one-line talking point and what to click (e.g. "Don't accept. Press +15m: it escalates to the commander, then the duty lead.").
  - Next and Previous move through the steps.
  - The chip is hidden unless presenter mode is on, and is not shown in print.
- **One step list, shared:** the step definitions (title, person, route, talking point, prepare actions) live in **one file** used by both presenter mode and the tests, e.g. `src/demo/steps.ts`. That way the demo and the checks can never drift apart.

## 6. Smaller download per person

- **Split by route group** with `React.lazy` + `Suspense` (using the §1 loader as the fallback):
  - **Sign-in / public:** sign-in, activate, track, rule book, emergency, USSD.
  - **Citizen and focal:** dashboard, report flow, my reports, community.
  - **Staff work:** cases, case page, inbox, officers, field.
  - **Oversight and reports:** overview charts, reports, oversight, safety.
  - **Admin:** stations, rules, duty roster, audit log.
  - **Chat.**
  - **Map** (Leaflet, already separate).
- **Targets:** the JS needed to show the sign-in page is **≤ 250 KB** (before gzip). No single route group is over 300 KB, except the map's Leaflet vendor chunk. Report the chunk table in the final summary.
- **Preload the next likely chunk** after sign-in: staff → cases; citizen → dashboard.
- Drop or lazy-load anything only used by the seed or tests from the browser bundle.

## 7. Checks live in the repo

- **Move the checks into `tests/`** and remove every hard-coded temp-folder path; the repo root is resolved from the script location:
  - demo.mjs → `tests/demo.mjs`
  - render.mjs → `tests/render.mjs`
  - flowui.mjs → `tests/flowui.mjs`
  - the size probe → `tests/size.mjs`
- **New npm scripts:**
  - `npm test` runs all checks in sequence and exits non-zero on any failure.
  - `npm run test:tz` runs them with `TZ=UTC` and `TZ=America/New_York` (works on Windows: set the env var inside Node, not in shell syntax).
  - `npm run snapshot` regenerates `public/seed-snapshot.json`.
- **New checks for this round:**
  - snapshot load time and correctness (state equals a fresh seed after the time shift; the audit chain verifies);
  - saved size ≤ 1.2 MB after Reset;
  - per-action save cost;
  - only changed keys rewritten;
  - storage meter thresholds;
  - visible error on a failed save (simulate a quota error);
  - pause/resume (nothing advances while paused, +15m still works);
  - every Jump-to-step target reachable from Reset, plus backward jumps;
  - sign-in chunk ≤ 250 KB (read the build manifest).
- **README "Testing" section:** how to run the checks and what they cover.

## 8. Definition of done

- Everything in §1–§7 is built.
- The demo starts and resets with a visible loader. Saved state is ≤ 1.2 MB after Reset. A failed save is visible, never silent. The clock can be paused.
- Presenter mode can jump to any of the 28 steps from a fresh Reset, and step by step with Next.
- `npm test` passes from a clean clone. `npx tsc -b` = 0 errors. `npx vite build` succeeds and shows the split chunks. Steps 1–28 still pass.
- The final report includes the before/after table: load time, saved size, save cost per action, sign-in JS size, main chunk size.
