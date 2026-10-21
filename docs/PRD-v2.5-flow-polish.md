# OyoEye v2.5 — Making existing flows better (no new features)

**Owner:** Product · **Builder:** Frontend · **Branch:** `v2-prototype` · **Date:** 20 Oct 2026

Builds on PRD v2 → v2.4. This round adds **no new features**; it improves six flows that already exist. All earlier rules still hold:

- front-end prototype;
- HospEase-style shell with at most 5 menu items;
- every protection stays;
- every event is audited;
- demo steps 1–28 must still pass.

## 1. Control-room alert sound and flash

**Today:** a new SOS or Officer SOS only shows as a row in the list. An operator looking away, or on another tab, misses it.

**Change:**

- **Who hears it:**
  - 615 Operator and Duty Lead: every new **SOS**, **Officer SOS** and new **Critical** case reaching *Pending review*.
  - Unit commanders: an **Officer SOS** involving their unit or one of their officers, and a handoff of a Critical case to their unit.
  - Field officers: an incoming "OFFICER NEEDS HELP — GO?" request.
- **Sound:** generate it with the Web Audio API, with no audio files.
  - SOS / Officer SOS: a distinct urgent two-tone chime.
  - Critical: a single softer chime.
  - **It repeats every 30 s until someone opens the case** (an operator opening it stops it for every operator) or the case leaves *Pending review*.
- **Visual:**
  - The new row flashes (a red left border pulse plus a tinted background) for 10 s, then stays tinted until opened.
  - Show a toast: "SOS — Agbowo, Ibadan North · Open".
  - The browser tab title becomes "(1) SOS — OyoEye" while anything is unopened.
- **Controls:** a speaker icon in the top bar for these roles.
  - **On** by default, with **Mute for 15 min** and **Unmute**; the mute is remembered per user.
  - Browsers block sound until the user has clicked something. Sign-in counts as that click. If sound is still blocked, show a small "Click to enable alert sound" chip next to the speaker.
- `prefers-reduced-motion`: there's no pulsing, only the tint, and the sound still plays.
- **Audit:** "Alert muted 15 min" by user.

## 2. Report location: "Use my location" first, pin on the map

**Today:** citizens pick an LGA and an area from dropdowns: 33 LGAs, many areas, slow and error-prone.

**Change** (citizen report flow, focal-person report, citizen SOS screen, and the operator's 615 call intake):

1. **Where** step opens with a large **"Use my location"** button, already highlighted.
   - It uses `navigator.geolocation` and shows "Finding you…".
   - The result appears on the **v2.3 map**, as a **draggable pin**, with "Move the pin if it's not exactly right".
2. **Auto-fill:** the LGA and area are filled from the nearest area to the pin, using the deployment's centroids. They are shown as editable chips: "Agbowo · Ibadan North ✎".
3. **Landmark** ("Near what? e.g. *opposite Agbowo shopping complex*") sits directly under the map, prominent. It's **required for non-SOS reports**, with an "I don't know" link.
4. **Fallbacks:**
   - **Location denied or unavailable:** "We couldn't get your location — choose your area", then the LGA/area pickers (as today) plus the map to tap a point.
   - **Outside Oyo State bounds:** "You seem to be outside Oyo State. Choose the place you're reporting about", then the pickers. Never silently file a case outside Oyo.
5. **Demo-safe location.** Demo controls get **"Simulate my location"**:
   - Off · Agbowo, Ibadan North (**default on**) · Igangan, Ibarapa North · Moniya, Akinyele · Ogbomoso.
   - When on, "Use my location" returns that point (with a 1 s fake delay), so the presenter's real location (Lagos, Abuja…) never ends up in the demo.
6. **SOS screen:** location is captured automatically in the background as soon as the screen opens, so the hold isn't delayed. If none arrives within 5 s, the SOS still sends with "Location unknown — operator will call", and the area picker is offered as an optional step afterwards.
7. **615 intake (operator):** the same map with a pin. The operator types the caller's landmark and drops the pin; the auto-filled LGA and area are shown as chips.

## 3. One SOS hold time

**Today:** citizen SOS is a 3 s hold and Officer SOS a 2 s hold.

**Change:**

- **Both are 2 s.** Same ring animation, same haptic (`navigator.vibrate(50)` at start and `[100,50,100]` on send, where supported).
- The **"press, then confirm"** alternative stays for both, for users who can't hold.
- Update all copy that mentions "3 seconds", the onboarding cards, the Rule Book and the README.

## 4. Map: legend, role-based starting view, shapes as well as colours

**Today:** no legend, the map always opens on the whole state, and markers differ mostly by colour.

**Change:**

- **Legend:** a collapsible card in the bottom-left of every map, listing only the layers that are on.
  - Status colours with the pill names.
  - Marker shapes.
  - Station types.
  - "Restricted (approximate location)".
  - Hotspot meaning.
  - On phones it's a "Legend" button that opens a sheet.
- **Starting view by role** (a "Whole state" button is always there to zoom out):

  | Role | Opens on |
  | --- | --- |
  | Unit commander / agency head | Their station's coverage area |
  | Field officer | Their own position, about 3 km |
  | LGA chairman | Their LGA |
  | Focal person | Their community, about 2 km |
  | Operator, duty lead, coordinator, Governor | All of Oyo |
  | Case page mini-map | The incident, about 1.5 km |

  The last view is remembered per user per page, and "Reset view" returns to the default.
- **Shapes plus colours** (for colour-blind users and grey projectors):
  - Incidents = circle; SOS = circle with a ring; Officer SOS = triangle; Restricted = grey square.
  - Stations = pin with a letter (P Police, A Amotekun, F Fire, G Agency).
  - Officers: on duty = small dot; en route = arrow pointing toward the incident; on scene = dot inside a ring.
  - Priority = size.
  - Keep the colours as they are; shapes are added, not replacing anything.

## 5. Yoruba: remember the choice and cover every citizen touchpoint

**Today:** the EN/YO toggle covers only some screens and resets.

**Change:**

- **Remember the choice:**
  - Signed-in citizen or focal person: store `language` on the person.
  - Guests (anonymous / signed out): remember it on the device (localStorage, wrapped in try/catch).
  - The toggle is in the same place on every citizen screen and on the sign-in page.
- **Cover everything a citizen or focal person sees:**
  - sign-in, onboarding, Rule Book, dashboard, report flow (labels, help text, errors), SOS screen, tracking page, My reports, inbox items, conduct questions, standing card, appeal form, "Help is free" banner, toasts and empty states;
  - **status explanations**, e.g. "Verified — the 615 control room has checked your report".
- **SMS and inbox messages to citizens are sent in their chosen language.** Store the template keys, and render both languages from `src/i18n.ts`.
- **USSD:** the first screen offers "1 English 2 Yorùbá" and the session follows the choice.
- **Staff screens stay English.**
- Every Yoruba string stays marked `// DRAFT — needs native-speaker review`. Add a "Missing translations" count to Demo controls; it should be 0.

## 6. Accessibility pass

- **Tap targets:**
  - At least 48×48 px on field-officer, citizen and focal-person phone screens: Accept, En route, On scene, Resolve, the SOS buttons, bottom tabs, chat send and attach.
  - Spacing of at least 8 px between adjacent buttons.
- **Keyboard:** a visible focus ring (2 px, offset, primary colour) on every interactive element. Modals and sheets trap focus and close on Esc. Menus can be used with the arrow keys.
- **Screen readers:**
  - `aria-label` on every icon-only button: bell, speaker, attach, mic, layer chips, map controls, avatar.
  - `aria-live="polite"` for toasts, and `assertive` for the SOS alerts.
  - Status pills and priority dots include their text for screen readers.
- **Contrast:** check every status pill, the "Help is free" banner and the grey secondary text against WCAG AA (4.5:1 for text). Adjust the shades that fail, keeping the look.
- **Motion:** `prefers-reduced-motion` turns off pulses, the moving officer animation (it jumps instead) and slide-ins.
- **Forms:** every input has a visible label. Errors are shown in text next to the field, not only as red borders.

## 7. Demo script changes

Update the README steps where these improvements show:

- **Step 1 (citizen SOS):** a 2 s hold, with location from the simulated Agbowo point.
- **Step 2 (operator):** the SOS arrives with the chime and the flashing row; opening it stops the sound.
- **Step 8 (civic report):** "Use my location", then drag the pin, then the landmark field.
- **Step 17 (map):** point out the legend and the role-based starting views (the commander opens on their coverage).
- **Step 25 (new citizen):** switch to YO during onboarding. It stays YO on the dashboard, and the confirmation SMS in the outbox is in Yoruba.

## 8. Definition of done

- Everything in §1–§6 is built, and steps 1–28 pass after Reset demo.
- **Extend demo.mjs, render.mjs and flowui.mjs to cover:**
  - alert state: which cases are "unopened" for which role, repeat/stop logic and mute;
  - location auto-fill from coordinates, the out-of-Oyo fallback and the simulated location;
  - SOS sending with an unknown location;
  - both holds at 2 s;
  - the legend and the default view per role (computed bounds);
  - the language stored on the person, and a citizen SMS rendered in Yoruba;
  - **zero missing Yoruba keys** for citizen and focal screens;
  - `aria-label` present on icon-only buttons in the rendered output.
- `npx tsc -b` gives 0 errors and `npx vite build` succeeds.
