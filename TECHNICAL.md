# BLOC — Technical Documentation

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure](#2-file-structure)
3. [State Model](#3-state-model)
4. [Data Persistence](#4-data-persistence)
5. [iOS Viewport & App Height](#5-ios-viewport--app-height)
6. [Navigation & Screen System](#6-navigation--screen-system)
7. [Design System & Theming](#7-design-system--theming)
8. [Hero Cards & Progress Deck](#8-hero-cards--progress-deck)
9. [Modal System](#9-modal-system)
10. [Module: Progress](#10-module-progress)
11. [Module: Plan](#11-module-plan)
12. [Module: Train](#12-module-train)
13. [Module: Body](#13-module-body)
14. [Module: Nutrition](#14-module-nutrition)
15. [Module: Goals](#15-module-goals)
16. [Module: Settings](#16-module-settings)
17. [Module: Rest Timer](#17-module-rest-timer)
18. [Swipe Row System](#18-swipe-row-system)
19. [Exercise Library](#19-exercise-library)
20. [Progression Logic](#20-progression-logic)
21. [Barcode Scanner](#21-barcode-scanner)
22. [External APIs](#22-external-apis)
23. [Function Reference](#23-function-reference)
24. [Key Algorithms](#24-key-algorithms)
25. [Module: AI Advice (Phase 1–3)](#25-module-ai-advice-phase-13)
26. [Goal Queue Flow](#26-goal-queue-flow)
27. [Next Cycle Recommendation Engine (Phases 1–4)](#27-next-cycle-recommendation-engine-phases-14)
28. [Module: Sample Day Library](#28-module-sample-day-library)
29. [Known Limitations & Future Considerations](#29-known-limitations--future-considerations)
30. [Module: Home](#30-module-home)
31. [Input Modes (Numeric Keyboards)](#31-input-modes-numeric-keyboards)

---

## 1. Architecture Overview

BLOC is a single-file Progressive Web App (`index.html`) with no build toolchain, no framework, and no backend. The entire application — HTML structure, CSS, and JavaScript — is contained within one file. The JS is split across three `<script>` tags: a small early one for pre-boot setup, a second holding the bundled ZXing library, and a third (by far the largest) holding all application logic.

```
┌─────────────────────────────────────────┐
│              index.html                 │
│                                         │
│  ┌─────────┐  ┌─────────┐  ┌────────┐ │
│  │  HTML   │  │   CSS   │  │   JS   │ │
│  │structure│  │ (inline)│  │(inline)│ │
│  └─────────┘  └─────────┘  └────────┘ │
│                                         │
│  Storage: localStorage (browser)        │
│  Fonts: Google Fonts CDN (Inter)        │
│  Food data: Open Food Facts API         │
│  Barcode: ZXing ~336KB bundled inline   │
└─────────────────────────────────────────┘
```

**Key constraints this design imposes:**
- All state must be serialisable to JSON (for `localStorage`)
- No module imports — all functions are global
- Rendering is manual DOM manipulation (no virtual DOM); every screen re-renders fully on navigation, there is no partial diffing
- The ZXing barcode library (~336KB minified) is bundled inline as its own `<script>` block, setting `window.ZXing`

---

## 2. File Structure

The file is organised into clearly commented sections in this order:

```
<head>
  CSS custom properties (design tokens)
    :root — surfaces, accent, semantic colours, --hero-1/--hero-2 defaults
    [data-mode="light"] — light mode surface overrides
    Single-colour theme overrides ([data-theme="teal"], [data-theme="blue"], etc.)
    Multi-theme per-page overrides ([data-theme="multi"] [data-page="..."])
  Global reset & base styles
  Layout (#app, #content, .screen)
  Navigation bar (#nav, #nav-pill, .nav-btn)
  Edge fades (.edge-fade-top, .edge-fade-bottom)
  Typography (.page-header, .page-title, h3, .label)
  Cards (.card, .card-accent, .hero-card, .hero-callouts, .hero-status, etc.)
  Hero swipe deck (#progress-hero-wrap, #progress-hero-dots, .hero-dot)
  Buttons
  Inputs
  Badges, tags, progress bars
  Modals
  Toggles
  Log set rows (.set-row grid; .ss-set-ex-row flex — see §12 for why these differ)
  Progression chips
  Week selector (week-strip)
  Day tabs
  Fill suggested animation (@keyframes inputFlash)
  Empty state
  Nutrition-specific styles
  Theme swatches (Settings)

<body data-theme="multi" data-mode="dark">
  .edge-fade-top / .edge-fade-bottom
  #app
    #content
      Screens: home, progress, plan, train, nutrition, settings
      (body and goals were removed as their own screens in v7.40–v7.51 — see §11 and §13)
    #nav (floating pill bottom nav with #nav-pill highlight and 6 .nav-btn buttons)

  Modals (appended after #app):
    modal-macro              — new macrocycle
    modal-nutr-date          — date picker for Nutrition hero tap
    modal-cycle-history      — past macrocycles list (tapped from Progress hero)
    modal-edit-macro         — edit macrocycle
    modal-add-goal           — add/edit goal (includes macro-slider based split UI)
    modal-custom-exercise    — create custom exercise (requires a body part)
    modal-link               — link/unlink individual superset members
    modal-exercise           — add/edit exercise
    modal-body-profile       — gender, height, birthday for BMR/TDEE calc
    modal-body-log           — log body weight / steps
    modal-nutr-add           — nutrition log chooser (Scan Barcode / Manual / Recipe / Library)
    modal-nutr-barcode       — camera barcode scanner with manual fallback
    modal-nutr-serving       — serving size confirm (shows recipe ingredients for recipes)
    modal-nutr-previous      — food library search
    modal-nutr-manual        — manual food entry
    modal-nutr-edit          — edit a logged food entry
    modal-nutr-quick         — quick-add daily macro totals (overrides meal-based totals)
    modal-timer              — rest timer (countdown + stopwatch)
    modal-exercise-lib-editor — browse and edit the exercise library (v6.10)
    modal-exercise-lib-entry — edit a single custom exercise library entry (v6.10)
    modal-food-lib-editor    — browse and edit the food library
    modal-food-lib-entry     — edit a single food library entry
    modal-recipe-step1       — recipe builder step 1: name and servings
    modal-recipe-ingredients — recipe builder step 2: ingredient list
    modal-recipe-barcode     — camera barcode scanner for recipe ingredient
    modal-recipe-serving     — serving confirm for recipe ingredient
    modal-recipe-manual      — manual entry for recipe ingredient
    modal-recipe-edit-ingredient — edit an existing recipe ingredient
    modal-recipe-list        — My Recipes list with Create new, Edit, Delete
    modal-nutr-copy-entry    — copy or move a food entry or entire meal to another date/meal
    modal-confirm            — custom confirm dialog (centre-aligned; also used as a plain alert)
    modal-fill-day           — Sample Day Library: pick a saved day to copy into the current date (v7.25)
    modal-profile-nutrition  — Settings → Nutrition → Sample libraries list (moved out of the old hidden Profile page in v7.52; same modal id retained)
    modal-sample-day-edit    — edit a single saved sample day's dinner label, or delete it (v7.25)
    <!-- modal-home-log-weight / modal-home-log-steps / modal-home-log-measurements
         (v7.31) were removed in v7.53 — Home's weight/steps/measurement logging
         moved from icon-triggered mini-modals to inline boxes. See §30. -->
    modal-app-preferences    — Settings → Profile card → App preferences: Mode + Theme (v7.50)
    modal-linked-services    — Settings → Profile card → Linked services (v7.50)
    modal-api-key            — Settings → Linked services → API Key, the Anthropic key entry (v7.50; formerly a top-level "AI Advice" section, see §16)
    modal-settings-body-logs — Settings → Profile card → Body logs — the old standalone Body screen's grouped log list only; hero/chart/log-form/measurement-reminder were removed in v7.51 (§13)
    modal-settings-about     — Settings → About this app → storage usage card (v7.50)

    <!-- Removed in the Settings redesign (v7.50–v7.52), each folded into an
         inline collapsible card on the Settings screen instead:
         modal-profile, modal-settings-nutrition, modal-settings-exercise,
         modal-danger-zone. See §16. -->

<script> (early, small)
  Pre-boot iOS viewport measurement so --app-height is correct before first paint

<script> (ZXing bundle, single line, ~336KB, sets window.ZXing)

<script> (main application logic)
  iOS viewport measurement (measureEnv, setAppHeight, setSafeAreaVars, handleKeyboard)
  State declaration & load/save
  Navigation (showScreen, openModal, closeModal, positionNavPill, getPageHeroColors)
  Macrocycle helpers & CRUD, superset helpers
  Exercise CRUD
  Progression logic (exProgData, getWeekWeight, getWeekReps, getGiantSetProgression)
  Render: Home (renderHome, weekly hero, goal banner, quick-log icons, food/session previews — v7.31)
  Render: Progress (renderProgress, hero swipe deck, chart builders)
  Render: Plan (renderPlan, session cards, superset UI, body-part volume table, renderPlanGoalsSection — v7.40)
  Render: Train (renderTrain, set logging, rest timer)
  Render: Body (renderBody, now just the grouped log list — hero/chart/log-form removed v7.51, §13)
  Render: Nutrition (full module — largest single module in the file)
  Sample Day Library (save/fill qualifying nutrition days, goal linking — v7.25)
  Barcode scanner engine (startScannerCamera, stopScannerCamera, _onScannerDetected)
  Food library (addToFoodLibrary, share/export/import)
  Render: Settings (setTheme, setMode, clearAllData, toggleSettingsCard — v7.52)
  Data export/import
  Exercise library
  Utilities (toLocalDateStr, getLocalToday, fmtK, showConfirm, etc.)
  Rest timer (playBeep, buildPicker, countdown, stopwatch)
  Food library editor
  Recipe builder & manager
  Modal swipe-down + tap-outside initialisation (DOMContentLoaded)
  Nav pill initial positioning (requestAnimationFrame)
```

---

## 3. State Model

The entire application state is held in a single global object:

```js
let state = {
  macrocycles:       [],   // Array<Macrocycle> — each includes weightIncrement (see §20)
  exercises:         {},   // Record<sessionKey, Array<Exercise>> — sessionKey = macroId_1_day(+microKey)
  trainLogs:         {},   // Record<string, SetLog> — see key formats below
  bodyLogs:          [],   // Array<BodyLog>  {date, weight, steps, waist?, hip?} — waist/hip always stored in inches regardless of input unit (v6.12)
  nutritionLogs:     [],   // Array<NutritionLog>  (per-day summary — kept in sync by syncNutrLegacyLog() after every log change, for home screen/goals/weekly-view reads that predate nutritionMeals; not the primary source of truth but not dead either)
  goals:             [],   // Array<Goal>  {macroId, startDate, endDate, kcal, steps, protein, carbs, fats, _blocLabel?}
                           //   _blocLabel (v7.00): step label from the LLM recommendation that created this goal,
                           //   used by the advice card to reliably match saved goals back to plan steps for
                           //   live date display. Only present on goals created via the AI goal queue flow.
  customLibrary:     [],   // Array<{name, bodyPart}> — user-added exercise library entries
  nutritionMeals:    {},   // Record<date, {Breakfast:[], Lunch:[], Dinner:[], Snacks:[]}>
  nutritionQuickLog: {},   // Record<date, {kcal, protein, carbs, fats}> — overrides meal totals for that day when present
  foodLibrary:       [],   // Array<FoodItem>  {id, name, brand, per100kcal, per100p, per100c, per100f, defaultServing, source}
  recipes:           [],   // Array<Recipe>
  supersets:         {},   // Record<supersetId, {name: string|null}> — custom display name only; membership lives on the exercises themselves
  sampleDays:        [],   // Array<SampleDayGroup> — see below (v7.25)
  deloads:           {},   // Record<deloadUnitKey, true> — see §12 Deload Logic. Key = `${macroId}_${week}` (no microcycles) or `${macroId}_${week}_m${1|2}` (microcycles)
  exerciseHistory:   {},   // Record<nameNorm, Record<setType, HistoryEntry>> — see §12 Exercise History. HistoryEntry = {sets, reps, weight, dropWeight, dropReps, date}
  exerciseTrackingMode: {}, // Record<nameNorm, 'total'|'perSide'> — remembered tracking mode per exercise name, updated alongside exerciseHistory
  profile:           {},   // {gender, heightCm, birthday, measureUnit} — used for BMR/TDEE calc on the Body screen; measureUnit ('in'|'cm', default 'in') governs the waist/hip input mode only — storage is always inches regardless (v6.12)
  currentMacroId:    null, // string | null
  currentWeek:       1,
  currentDay:        'push',
  currentEditContext: null,
  theme:             'multi',  // string — persisted, applied as data-theme on <body> (set by load()'s defensive defaults, not the object literal)
  mode:              'dark',   // 'dark' | 'light' — persisted, applied as data-mode on <body> (same as above)
};
```

`theme` and `mode` aren't in the literal object above — they're filled in defensively by `load()` on every boot, same mechanism as every other field. `load()` is called once on startup:

```js
function load() {
  const raw = localStorage.getItem('bloc_state');
  if (raw) { try { state = JSON.parse(raw); } catch(e) {} }
  // Defensive defaults — every field state ever reads without a fallback
  // must be listed here, since a fresh install, an old backup, or a
  // partial state object (see clearAllData in §16) all rely on this.
  if (!state.macrocycles)       state.macrocycles = [];
  if (!state.exercises)         state.exercises = {};
  if (!state.trainLogs)         state.trainLogs = {};
  if (!state.bodyLogs)          state.bodyLogs = [];
  if (!state.nutritionLogs)     state.nutritionLogs = [];
  if (!state.goals)             state.goals = [];
  if (!state.customLibrary)     state.customLibrary = [];
  if (!state.nutritionMeals)    state.nutritionMeals = {};
  if (!state.nutritionQuickLog) state.nutritionQuickLog = {};
  if (!state.foodLibrary)       state.foodLibrary = [];
  if (!state.recipes)           state.recipes = [];
  if (!state.supersets)         state.supersets = {};
  if (!state.sampleDays)        state.sampleDays = [];
  // One-time repair (v7.30): a group's range.proteinMax was originally
  // stored as Infinity (no upper bound on protein) — JSON.stringify()
  // silently turns Infinity into null, so any group saved before this fix
  // shipped had already-corrupted data by the very next reload. Restore it
  // to the current JSON-safe sentinel every time state loads.
  state.sampleDays.forEach(g => {
    if (g.range && (g.range.proteinMax === null || g.range.proteinMax === undefined)) {
      g.range.proteinMax = Number.MAX_SAFE_INTEGER;
    }
  });
  if (!state.deloads)           state.deloads = {};
  if (!state.exerciseHistory)   state.exerciseHistory = {};
  if (!state.exerciseTrackingMode) state.exerciseTrackingMode = {};
  if (!state.profile)           state.profile = {};
  if (!state.profile.measureUnit) state.profile.measureUnit = 'in';
  if (!state.insightsRollup)    state.insightsRollup = { completedCycles: [] };   // v7.00
  if (state.blocAdvice === undefined) state.blocAdvice = null;                     // v7.00 — shape extended in v7.22–v7.24 for the challenge feature (§25)
  if (state.nextCycleAdvice === undefined) state.nextCycleAdvice = null;           // v7.19 — Phase 4 LLM second opinion, separate slot from blocAdvice (§27)
  if (!state.theme)             state.theme = 'multi';
  document.body.setAttribute('data-theme', state.theme);
  if (!state.mode)              state.mode = 'dark';
  document.body.setAttribute('data-mode', state.mode);
}
```

There is no longer a migration pass for old `mesocycles`/`currentMesoId` key names or a positional-index-to-stable-id exercise migration — both were removed once the live data was confirmed fully migrated during a 2026 audit pass. Every exercise has always had a stable `id` and `order` field since.

`Macrocycle.weightIncrement` (string, default `'2.5'`) was `lossIncrement` prior to v6.01 — renamed and generalised when the weight-loss-only increment field became available for gain cycles too (see §20). Existing backups need `lossIncrement` → `weightIncrement` renamed on every macrocycle; nothing else about the field's shape or meaning changed.

`Macrocycle.sessionsPerWeek` is calculated, not user-entered, since v6.04 — always `days.length` at creation time (§11). It's still stored on the macrocycle (used by the Plan summary label and `getActivityMultiplier()`'s TDEE estimate), just no longer editable independently of the actual split.

`Exercise.type` is one of `'standard'`, `'giant'`, `'pause'`, or `'dropset'`. `'giant'` and `'pause'` were `'myorep'` and `'myomatch'` prior to v6.06 — this was a full data-level rename (not just display labels), so existing backups need every exercise's `type` field remapped (`myorep`→`giant`, `myomatch`→`pause`) alongside every function/variable that keyed off the old strings (`getMyorepProgression`→`getGiantSetProgression`, `isMyomatch`→`isPauseSet`, etc.). `'dropset'` is new in v6.05 — see §12 Drop Sets. As of **v6.09**, a drop-set exercise's `reps` field holds a real plan-time target for its **main set**, same as any other type — prior to v6.09 this was always forced to `''` since drop sets had no rep target at all. The drop *portion* still has no plan-time target and is discovered live every week (unchanged).

**`SampleDayGroup`** (v7.25, `state.sampleDays[]`) — the Sample Day Library's storage shape:

```js
{
  id: 'sg_1785095901248',
  linkedGoalIds: ['macro_..._g20260713'],       // permanent — only ever grows, via a saved day
  originGoalMacros: { kcal, protein, carbs, fats }, // the goal that first created this group
  range: {                                       // min/max band used for both linking paths (§28)
    kcalMin, kcalMax,
    proteinMin, proteinMax,   // "no upper bound" — see the Infinity/JSON gotcha below
    carbsMin, carbsMax,
    fatsMin, fatsMax,
  },
  days: [
    { date, dinnerName, meals: {Breakfast:[], Lunch:[], Dinner:[], Snacks:[]}, totals: {kcal, protein, carbs, fats} },
  ],
}
```

> **Gotcha — `Infinity` does not survive `JSON.stringify()` (found and fixed in v7.30).** `range.proteinMax` was originally set to the real JS value `Infinity` (protein has no upper bound — more is never disqualifying). Since `save()` round-trips the entire state through `JSON.stringify()`/`JSON.parse()` on every save and reload, `Infinity` silently became `null` almost immediately after being written — and `someValue <= null` coerces to `someValue <= 0` in JS, which is false for any real protein target. This silently broke every range comparison that depended on the "no upper bound" bound, with no thrown error to surface it. Fixed by (a) storing `Number.MAX_SAFE_INTEGER` instead of `Infinity` going forward (a real, JSON-safe number), (b) a `rangeMax(value)` helper that treats a `null`/`undefined` bound as unbounded at every comparison site regardless of what's actually stored, and (c) the one-time `load()` migration above that repairs any already-corrupted stored data. **Any future field meant to represent "no upper bound" must use a real finite sentinel, never `Infinity`/`-Infinity`/`NaN` — none of the three survive a `JSON.stringify()`/`JSON.parse()` round trip.**

### Key formats

- **`state.exercises`** keys: `` `${macroId}_1_${day}${microKey}` `` — always stored against week 1 (the template); every other week's exercise list is derived from it via the progression functions, never stored separately. `microKey` is `''`, `'m1'`, or `'m2'`.
- **`state.trainLogs`** keys, per logged set: `` `${macroId}_${week}_${day}${microKey}_${exerciseId}_${setIndex}` ``. Progression-choice keys (which of weight/reps was chosen for a given exercise/week) use a separate key shape from `getProgKey()`. A drop-set's log entry additionally carries `dropWeight`/`dropReps` fields alongside the normal `weight`/`reps`/`done` — same key, no extra set index (§12).
- Both formats key on the exercise's stable `id`, not a positional array index — this is deliberate, since reordering, superset regrouping, or mid-cycle exercise edits must never silently remap old logs to the wrong exercise.
- **`state.deloads`** keys: `` `${macroId}_${week}` `` when the macro doesn't use microcycles, or `` `${macroId}_${week}_m${1|2}` `` when it does — always at the week/microcycle level, never per day, since a deload applies to every session within that calendar-week unit (§12).
- **`state.exerciseHistory`** keys: exercise name lowercased/trimmed, then set type — `state.exerciseHistory['bench press']['standard']`. Independent of `state.exercises`/`DEFAULT_LIBRARY`, so it persists across macrocycles and works for built-in and custom exercises alike.
- **`state.sampleDays[].id`**: `` `sg_${Date.now()}` ``. Not a compound key — no other part of state references it except `linkedGoalIds` pointing the other direction, from goal to group (§28).

---

## 4. Data Persistence

`save()` calls `localStorage.setItem('bloc_state', JSON.stringify(state))` after every mutation. There is no debouncing or batching — every user action that changes state triggers a synchronous save.

---

## 5. iOS Viewport & App Height

### The problem: stale height on first paint

On iOS in standalone PWA mode, `window.innerHeight` and `100dvh` are unreliable on first paint — they report a stale pre-chrome value. `position: fixed` nav bars anchored to the viewport get stuck using the wrong offset until a real scroll gesture forces a recompute. Locking `html`/`body` scroll to prevent rubber-banding (using `overflow: hidden`) removes the scroll gesture that used to trigger the recompute, leaving the nav permanently misplaced.

### The solution: `measureEnv()` DOM probe

`measureEnv(prop)` creates a throwaway `position:fixed` element with `height: env(<prop>, 0px)` set directly on it (not via a CSS variable), reads its `offsetHeight`, then removes it. This bypasses a known WebKit bug where CSS custom properties bridging `env()` values can return stale or incorrect numbers.

```js
function measureEnv(prop) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;width:0;height:env('
    + prop + ', 0px);visibility:hidden;pointer-events:none;';
  document.documentElement.appendChild(el);
  const val = el.offsetHeight;
  document.documentElement.removeChild(el);
  return val;
}
```

`--app-height`, `--safe-bottom`, and `--safe-top` are all set from probed values via `setAppHeight()` and `setSafeAreaVars()`. All size-sensitive elements use `var(--app-height, 100dvh)` rather than raw `dvh`. Both are recomputed repeatedly over the first few seconds after boot (not just once), since the probed values can still be wrong for a moment during the standalone-launch transition.

### Layout wiring

```css
html, body, #app {
  height: 100dvh;
  height: var(--app-height, 100dvh);
  overflow: hidden;
}
#content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: calc(var(--nav-h) + var(--safe-bottom) + 20px);
}
```

### Nav bar positioning

`#nav` is `position: absolute` inside `#app` (`position: relative`), **not** `position: fixed`. It follows normal CSS layout within `#app`'s box, which is already sized correctly by `--app-height`. The `positionNavDirect()` function additionally sets `nav.style.bottom` to a probed pixel value to avoid WebKit's repaint-lag quirk with `calc()` on custom properties.

```css
#nav {
  position: absolute;
  left: 50%;
  bottom: calc(var(--safe-bottom) - 6px);
  transform: translateX(-50%);
}
```

---

### On-screen keyboard handling

iOS standalone PWA mode presents three distinct keyboard challenges, each with a different root cause and fix.

#### 1. Keyboard detection

**Problem:** In iOS standalone, `window.innerHeight` shrinks with the keyboard — making the commonly used `innerHeight - visualViewport.height` approach always return ~0. The keyboard is undetectable by that method.

**Solution:** Compare `visualViewport.height` against `window.screen.height`, which never changes:

```js
function isKeyboardOpen() {
  if (!window.visualViewport) return false;
  const vvh = window.visualViewport.height;
  const screenH = (window.screen && window.screen.height) || (vvh * 2);
  return vvh < screenH * 0.75;
}
```

`screen.height` is always the full device height in CSS pixels (e.g., 844px on iPhone 14). `visualViewport.height` drops to ~400px when the keyboard opens. The 75% threshold separates keyboard-open from any legitimate small resize (e.g. status bar changes).

#### 2. Train set/rep inputs — scrolling to focused input

**Problem:** When a set row input is tapped, the keyboard opens and `visualViewport.height` shrinks. If `--app-height` were updated to match, `#content` would shrink too, leaving the set inputs in unreachable dead space below the visible area with no scroll room to reach them.

**Solution:** `setAppHeight()` skips its update while the keyboard is open:

```js
function setAppHeight() {
  if (isKeyboardOpen()) return;   // ← guard: keep layout at full height
  const measured = (window.visualViewport && window.visualViewport.height)
    || window.innerHeight;
  const h = measured + measureEnv('safe-area-inset-top');
  document.documentElement.style.setProperty(
    '--app-height', Math.min(h, window.screen?.height || h) + 'px'
  );
}
```

With the layout frozen at full height, `#content` remains full size and the set inputs are still in the DOM scroll range. `handleKeyboard()` then makes them visible:

```js
function handleKeyboard() {
  const open = isKeyboardOpen();
  const vvh = window.visualViewport?.height ?? window.innerHeight;

  // Hide nav while keyboard is up
  const nav = document.getElementById('nav');
  if (nav) nav.style.display = open ? 'none' : '';

  // Extend #content scroll range and scroll focused input to centre
  const content = document.getElementById('content');
  if (!content) return;
  if (open) {
    content.style.paddingBottom = '440px';   // >any keyboard height
    setTimeout(() => {
      const el = document.activeElement;
      if (!el || !['INPUT','TEXTAREA'].includes(el.tagName)) return;
      if (el.closest?.('.modal-overlay')) return;  // modals handle themselves
      const rect = el.getBoundingClientRect();
      const delta = (rect.top + rect.height / 2) - (vvh / 2);
      if (Math.abs(delta) > 10) content.scrollTop += delta;
    }, 350);
  } else {
    content.style.paddingBottom = '';
  }
}
```

Key details:
- `paddingBottom: 440px` is set immediately so `scrollHeight` grows before the `scrollTop` assignment runs.
- `scrollTop +=` delta is used rather than `scrollBy({behavior:'smooth'})` — direct assignment is more reliable on iOS `-webkit-overflow-scrolling:touch` containers.
- The 350 ms delay lets the keyboard animation finish and iOS's own partial scroll settle before we override `scrollTop`.
- Modal inputs are explicitly skipped (they have their own layout mechanism — see §9).

#### 3. Return key navigation between set inputs

Each set row generates two inputs: weight (`inp-w-<logKey>`) and reps (`inp-r-<logKey>`). `onkeydown` handlers chain focus through all sets:

```js
// Weight input: Return → reps input of same set
onkeydown="if(event.key==='Enter'){
  event.preventDefault();
  document.getElementById('inp-r-${logKey}')?.focus();
}"

// Reps input: Return → weight input of next set, or blur on last set
onkeydown="if(event.key==='Enter'){
  event.preventDefault();
  ${nextWKey
    ? `document.getElementById('${nextWKey}')?.focus();`
    : 'this.blur();'}
}"
```

`nextWKey` is computed as `inp-w-${key}_${exId}_${s+1}` for all sets except the last, where it is an empty string (triggering `blur()`). Superset set rows use the same key-chaining scheme against each member's own `exId`.

#### Event listener wiring

All keyboard handlers are driven by `visualViewport.resize`, which fires reliably on both keyboard open and close. A `focusin` listener handles the case where focus moves between inputs while the keyboard is already up (no `resize` fires since viewport height doesn't change):

```js
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    measureAll();      // updates --app-height (guarded), safe-area vars, nav position
    handleKeyboard();  // adjusts nav visibility and scrolls focused input
  });
}
document.addEventListener('focusin', e => {
  if (isKeyboardOpen() && ['INPUT','TEXTAREA'].includes(e.target?.tagName)) {
    setTimeout(handleKeyboard, 80);
  }
});
```

---

## 6. Navigation & Screen System

```js
function showScreen(name) {
  // Deactivates all .screen elements, activates the named one
  // Calls the relevant render function
  // Calls positionNavPill() via rAF
}
```

Screen internal IDs match their nav labels exactly: `home`, `progress`, `plan`, `train`, `nutrition`, `settings`. `body` and `goals` were removed as their own screens in v7.40–v7.51 — Goals now renders inline on Plan (§11), and Body now renders inside a Settings modal (§13); neither has a nav-bar entry or a `showScreen()` dispatch case any more.

### Nav Pill Animation

`positionNavPill()` reads the bounding rect of the currently active `.nav-btn`, then sets `#nav-pill`'s `left` and `width` via inline style. The CSS `transition` on `#nav-pill` (`transform`, `width`) produces the morphing spring animation between nav items.

The pill colour is derived at runtime by `getPageHeroColors(screenName)`:

```js
function getPageHeroColors(name) {
  const probe = document.createElement('div');
  probe.className = 'hero-card';
  probe.setAttribute('data-page', name);
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const c1 = cs.getPropertyValue('--hero-1').trim();
  const c2 = cs.getPropertyValue('--hero-2').trim();
  probe.remove();
  return { c1, c2 };
}
```

This ensures the pill gradient always matches the hero card exactly, picking up the correct CSS cascade from `data-theme` and `data-page` without any hardcoded colour logic in JS.

---

## 7. Design System & Theming

### CSS Custom Properties

All design tokens are defined in `:root`:

```css
:root {
  --bg: #0f1620;
  --bg-rgb: 15, 22, 32;    /* for rgba() gradients */
  --surface: #161f2c;
  --surface2: #1d2837;
  --surface3: #253142;
  --border: rgba(150,180,210,0.10);
  --border2: rgba(150,180,210,0.18);
  --text: #eef3f8;
  --text2: #9fb0c0;
  --text3: #6c7e90;
  --nav-inactive: #d8e2ec;
  --accent: #1D9E75;
  --red: #E24B4A;
  --amber: #EF9F27;
  --blue: #378ADD;
  --purple: #7F77DD;
  --ice-blue: #8FE3F0;
  --font-display: 'Inter', ...;
  --font-mono: 'Inter', ...;  /* kept for legacy call sites; resolves to Inter */
  --r: 12px; --r-sm: 8px; --r-lg: 20px;
  --nav-h: 54px;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-top: env(safe-area-inset-top, 0px);
  --hero-1: #1D9E75;
  --hero-2: #085041;
}
```

### Light Mode

`[data-mode="light"]` overrides surface, text, and border tokens only. Accent and hero colours are deliberately unchanged:

```css
[data-mode="light"] {
  --bg: #e7edf4;
  --bg-rgb: 231, 237, 244;
  --surface: #f2f5f9;
  --surface2: #fafbfd;
  --surface3: #ffffff;
  --border: rgba(20,40,65,0.10);
  --text: #16222e;
  --text2: #51606e;
  --text3: #7c8a98;
}
```

The `#nav` bar intentionally does NOT override `--nav-inactive` in light mode; the floating pill keeps its dark background in both modes.

### Themes

Single-colour themes set `--hero-1` and `--hero-2` globally:

```css
[data-theme="turquoise"] { --hero-1: #2BC7C4; --hero-2: #0B4F4E; }
[data-theme="blue"]      { --hero-1: #378ADD; --hero-2: #0C447C; }
/* ... */
```

The Multi theme overrides per page using a `[data-page]` attribute set on each `.screen`:

```css
[data-theme="multi"] [data-page="progress"]  { --hero-1: #2BC7C4; --hero-2: #0B4F4E; }
[data-theme="multi"] [data-page="plan"]      { --hero-1: #378ADD; --hero-2: #0C447C; }
[data-theme="multi"] [data-page="train"]     { --hero-1: #E8D44D; --hero-2: #6B5A0A; }
[data-theme="multi"] [data-page="body"]      { --hero-1: #1D9E75; --hero-2: #085041; }
[data-theme="multi"] [data-page="nutrition"] { --hero-1: #EF9F27; --hero-2: #633806; }
[data-theme="multi"] [data-page="goals"]     { --hero-1: #E24B4A; --hero-2: #6B1414; }
```

`setTheme(name)` and `setMode(mode)` update `state.theme` / `state.mode`, call `save()`, set `data-theme`/`data-mode` on `<body>`, then re-render whichever screen is currently active (so its hero picks up the new colours immediately rather than waiting for the next nav tap).

---

## 8. Hero Cards & Progress Deck

### Hero Card CSS

```css
.hero-card {
  border-radius: var(--r-lg);
  background: linear-gradient(150deg, var(--hero-1), var(--hero-2));
  padding: 20px;
  position: relative;
  overflow: hidden;
}
.hero-card::before { /* radial highlight overlay */ }
.hero-card::after  { /* noise texture overlay */ }
```

Every screen's hero card container sets `data-page` on the parent `.screen` element so the Multi-theme cascade resolves the correct `--hero-1`/`--hero-2` pair automatically.

### Progress Hero Swipe Deck

The Progress screen renders a 5-slide swipeable deck inside `#progress-hero-wrap > #progress-hero-card`. All slides are fixed to the height of slide 0 via `--hero-fixed-h` (a JS-set CSS variable, re-measured fresh every time slide 0 renders — cleared via `removeProperty` first rather than trusting the previous value). Slides with less content centre-align vertically.

```css
#progress-hero-wrap .hero-card {
  min-height: var(--hero-fixed-h, auto);
}
```

Slides (`renderProgressHero()`'s `switch (progressHeroIndex)`):
- 0 (`buildActiveCycleHeroSlideHtml`): Active cycle overview — name, goal, split badge, weeks remaining, progress bar
- 1 (`buildWeightHeroChart`): Body weight — anchored to the live active cycle's own timeline, with a day-index-aligned overlay comparing against past cycles at the same relative point (day 5 of this cycle vs. day 5 of a past cycle, not calendar-date aligned)
- 2 (`buildVolumeHeroChart`): Weekly training volume line chart
- 3 (`buildGoalColumnHeroChart(macro, 'steps')`): Steps vs goal — bar chart for current week
- 4 (`buildGoalColumnHeroChart(macro, 'kcal')`): Kcal vs goal — bar chart for current week

Slides 3/4 additionally measure their own rendered height post-paint and set `--goal-chart-h` to ~85% of it, so the bars genuinely fill the available card space rather than sitting in a small guessed box.

`renderProgressHero()` renders the current slide into `#progress-hero-card`. `renderProgressHeroDots()` updates the dot indicator below the card.

`initProgressHeroSwipe()` attaches `touchstart`/`touchmove`/`touchend` (and mouse equivalents) to `#progress-hero-wrap`. A swipe of more than 30% of the card width triggers `progressHeroIndex` to advance or retreat and calls `renderProgressHero()`. The deck is guarded against concurrent gesture handling via `_progressHeroBusy` and a `_progressHeroGestureId` counter.

`cycleProgressMacro(dir)` and `resolveProgressMacro()` handle navigating between macrocycles when the user taps the left/right arrows on the hero.

---

## 9. Modal System

All modals are `.modal-overlay` divs appended after `#app`. Each wraps a `.modal-sheet` with `data-modal` set to the overlay's id. On `DOMContentLoaded`, `initModal(overlayEl)` is called on every overlay to attach:
- **Swipe-down to close** — `touchstart`/`touchmove`/`touchend` on the sheet; a downward swipe of ≥80px triggers `closeModal()`
- **Tap-outside to close** — click on the overlay background (not the sheet) calls `closeModal()`

`openModal(id)` adds `.open` to the overlay, and additionally special-cases a handful of modals that need fresh state on every open rather than whatever was last left in the DOM — `modal-body-log` (blank vs pre-filled for edit, keyed off a `dataset.originalDate` sentinel), `modal-add-goal` (clears any stale overlap-validation error message, syncs the macro select), and others following the same pattern. `closeModal(id)` removes `.open` and stops any running camera stream if the closed modal was a barcode scanner.

**Stacked modals and z-index (v6.12):** all `.modal-overlay` elements share `z-index: 200` by default (`#modal-custom-exercise` is the one pre-existing exception, at `300`, for the same reason below), and same-z-index elements stack by DOM/source order — later in the HTML wins. This was invisible until `modal-nutr-add` and `modal-nutr-serving` (both defined early in the file) needed to be openable **on top of** `modal-recipe-ingredients` (defined much later), for the recipe-ingredient food-library search flow (§14). Since `modal-recipe-ingredients` deliberately stays open underneath rather than being closed first, it was rendering over both of them. Fixed by bumping `#modal-nutr-add, #modal-nutr-serving` to `z-index: 300` as well — matching the existing pattern for `#modal-custom-exercise`, which has the same "must layer over another open modal" requirement.

**Settings modal-on-modal (v7.50):** a second, independent tier exists for the Settings screen's own nested modals — `#modal-api-key`, `#modal-body-log`, `#modal-sample-day-edit` sit at `z-index: 210`, one above the default, since each opens on top of a parent modal (Linked services, Body logs, Sample libraries respectively) that deliberately stays open underneath rather than closing. This is a shallower version of the same problem the `modal-nutr-add`/`modal-recipe-ingredients` case solved above — only one nesting level deep here, since Profile/Nutrition/Exercise/Danger Zone are inline Settings-screen cards rather than modals themselves (§16), so their own buttons open directly over the plain screen at the default z-index with nothing to stack above. Deliberately **not** applied to `modal-food-lib-editor` / `modal-recipe-list` / `modal-exercise-lib-editor` — those lead into their own substantial pre-existing modal chains built around the default z-index, so the Settings buttons that open them close the Settings screen's card view first instead of stacking, to avoid pushing those chains' own children behind them.

**Recipe-context auto-return (v6.12):** `closeModal(id)` also special-cases `modal-nutr-add`: if it's being dismissed outright while `nutrAddContext === 'recipe'` (see §14) — via any of the three dismissal paths (✕ button, backdrop tap, swipe-down, all of which already funnel through this one function) — it reopens `modal-recipe-ingredients` underneath. This is guarded by `_nutrAddTransitioning`, a flag set immediately before `selectFromAddList()` deliberately closes `modal-nutr-add` on its way to `modal-nutr-serving`, so that intentional hand-off isn't misread as the person backing out of the whole flow.

`showConfirm(title, message, okLabel, callback)` builds a generic two-button (Cancel / OK) confirmation using `modal-confirm`; it's also reused anywhere a simple one-off alert is needed by passing a no-op callback.

### Modal sheets and the on-screen keyboard

**How modals sit above the keyboard:**

In iOS standalone, `position: fixed` tracks `window.innerHeight`, which shrinks with the keyboard independently of `--app-height`. The `.modal-overlay` is `position: fixed; inset: 0`, so it already occupies only the visible area above the keyboard when the keyboard is open. With `display: flex; align-items: flex-end` on the overlay, the `.modal-sheet` is naturally anchored just above the keyboard — no JS is needed.

The body log modal (`modal-body-log`) is the canonical reference for this behaviour: its sheet has no inline styles, uses the base `.modal-sheet` CSS (`max-height: 92dvh; overflow-y: auto`), and its compact content always fits within the shrunken overlay.

**Modals that need a scrollable list (`modal-nutr-add`, `modal-food-lib-editor`, `modal-exercise-lib-editor`):**

Both require a scrollable results list, which creates an additional challenge. A list using `flex: 1` inside a `display: flex` sheet causes the sheet to grow to its full `max-height`. Because `dvh` does not reliably shrink with the keyboard in iOS standalone, this leaves the sheet taller than the overlay and pushes the search input off the top of the screen.

The fix is structural — the sheet is kept compact by giving the list a fixed `max-height` in pixels rather than `flex: 1`, and that height is then further shrunk live by `fitListToKeyboard(wrapId)` whenever the keyboard opens, rather than resizing the sheet itself:

```html
<!-- Sheet: base CSS only, no flex/overflow:hidden override -->
<div class="modal-sheet" data-modal="modal-nutr-add" style="max-height:85dvh;">
  <!-- fixed-height elements: handle, title, action buttons, search input -->
  <!-- List: bounded height, independently scrollable, shrunk by fitListToKeyboard() -->
  <div id="nutr-add-list-wrap" class="kb-list-wrap">
    <div id="nutr-add-list"
         style="overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;">
    </div>
  </div>
</div>
```

`fitListToKeyboard(wrapId)` measures the wrap element's distance from the top of the viewport and the current `visualViewport.height`, then sets the list's height so its bottom edge lands just above the keyboard. It's called from the shared `visualViewport.resize` handler (see §5) for `nutr-add-list-wrap`, `food-lib-list-wrap`, and (since v6.10) `exercise-lib-list-wrap`, plus once explicitly after each modal's own slide-in transform finishes (a `setTimeout(..., 320)` after opening), since the transform itself doesn't fire a `resize` event.

`overscroll-behavior: contain` on the list prevents scroll events from bubbling out to `#content` when the list boundary is reached.

---

## 10. Module: Progress

Rendered by `renderProgress()`.

Key sub-functions:
- `renderProgressHero()` / `renderProgressHeroDots()` / `initProgressHeroSwipe()` — the 5-slide hero swipe deck (see §8)
- `cycleProgressMacro(dir)` / `resolveProgressMacro()` — navigate between macrocycles
- `renderProgressCharts()` — body weight sparkline, macro pie, weekly steps/kcal bars below the hero
- `setProgressNutrToggle(val)` — today/7-day toggle for the weekly bar charts
- `buildBwProgress(macro)` — start → current → target body weight progress bar
- `renderProgressNutrPies()` / `makePie(p, c, f)` — shared inline-SVG macro pie chart, also used by Nutrition

All charts (sparkline, line charts, bar charts, pies) are generated as inline SVG strings — there is no charting library.

Between the hero and the weekly table stack sits a separate 3-card swipeable "Insights" deck (`#progress-body` / `#progress-body-dots`, driven by `insightsAnimateTo()`/`insightsSnapBack()`/`initInsightsSwipe()`), pre-dating this section's v6.12 additions. The weekly table stack below reuses its exact swipe-gesture pattern. All three cards are built fresh on every `renderProgress()` call and selected by `insightsIndex`; only the current card's markup is ever in the DOM (`cards[insightsIndex]`), not all three docked side by side.

- **Card 1 — Progress**: latest logged weight, 7-day average, weekly change (colour-coded), this week's log count — then (v7.28) the **Phase 1 deterministic trend/plateau narrative** (`buildInsightsCardHTML()`, see §25) inline, directly below that header — then the peak-loss/gain window callout below that. Prior to v7.28 the trend narrative rendered as its own separate, non-swipeable card underneath the whole Insights deck (`#progress-trend-insights`); it was moved inside card 1 so the plateau signal sits with the rest of the at-a-glance weight summary rather than requiring a scroll past two other cards to reach. `buildInsightsCardHTML()` no longer wraps its own return value in a `.card` div (both the insufficient-data branch and the normal branch) — it returns a bordered inner fragment instead, since it's now nested inside card 1's own `.card` wrapper rather than being a standalone card itself.
- **Card 2 — Metabolism**: Mifflin-St Jeor BMR/TDEE, log-based TDEE (`calcDynamicTDEE()`), a calorie target for the active goal type, and a goal-weight ETA derived from the cycle-scoped body-log rate.
- **Card 3 — Next cycle**: the Next Cycle Recommendation Engine — see **§27** for the full write-up (deterministic duration×depth matrix, continuation exceptions and their computed alternative, target-weight/deadline override, maintenance TDEE-discrepancy recalibration, and the Phase 4 LLM second-opinion layer). Computed once per render via `recommendNextCycle(_previewMacro || macro, _nextCycleOverride)`, stored locally as `rec`/`nextCycleRec`.

`renderProgress()` also injects one additional card into a dedicated DOM anchor:
- `#progress-ai-advice` — the Phase 2 AI advice card (`buildAiAdviceCardHTML()`); only visible when the signal warrants intervention and/or a stored response exists

`updateInsightsRollup()` is also called on every Progress render to archive any newly-completed macrocycles to `state.insightsRollup.completedCycles`.

### Goal period summary rows (new in v7.28)

Below the Statistics section (`#progress-nutrition`) and above Weekly Macro Split sits `#progress-cycle-goals`, rendered by `renderProgressCycleGoals()` on every `renderProgress()` call. Shows a compact row per goal period belonging to the resolved/browsed cycle (`resolveProgressMacro()`), ordered by `startDate` ascending:

- Each row shows the goal's `_blocLabel` ("Step N - label" format) as its title, its date range, and its non-zero targets (kcal/protein/carbs/fats/steps) joined with ` · `. Tapping a row opens `openEditGoal(macroGoalID)`.
- The goal covering today gets a green left accent (`border-left`); the **next upcoming** goal (earliest `startDate` after today, among this cycle's own goals) gets a red left accent; every other goal is unaccented.
- **"Next up" subtitle** — the next-upcoming row additionally shows a countdown subtitle: `Next up: starting in N days` while more than a week out, switching to `Next up: starting <Weekday>` (the goal's actual start weekday, computed live — not hardcoded to "Monday", though that's what it'll show in practice once §11's Monday-only rule is universally true) from 6 days before the goal's start date onward (the Tuesday before, for a Monday start). The switch point is computed as an actual date (`startDate - 6 days`), not a fixed day-count threshold, so it lines up correctly regardless of which weekday the goal happens to start on.
- Renders nothing (`el.innerHTML = ''`) if the resolved cycle has no goals, or no cycle is resolved at all.

### Weekly table swipe stack (v6.12; expanded to 3 cards in v7.28)

Below the "Insights" card deck sits a second, separate swipeable stack — same visual mechanics (touch/mouse swipe, dot pagination) as the hero and insights decks, but with no text label under the dots:

- `buildWeeklySummaryCardHTML()` — the weekly summary table (weight delta / avg kcal / avg steps / avg protein) as an HTML string rather than writing directly to the DOM, so it can be selected between by `renderProgressTables()`. Returns a short empty-state card instead of `''` when there isn't enough data yet, since the stack always needs something to show on this slide. **As of v7.28, this card no longer includes the Swing column** — swing moved to its own dedicated card (below), since cramming four metrics' worth of swing data plus the averages into one table was cluttered.
- `buildWeeklySwingsCardHTML()` (**new in v7.28**) — the second slide: smallest/largest consecutive day-to-day change within each calendar week, one column each for weight, kcal, steps, and protein (previously weight-only, embedded in the summary table). Values are formatted with locale thousand-separators (`fmtSigned()`'s `toLocaleString()` call) so a large steps swing reads `+2,450` rather than `+2450`. Same empty-state pattern as the summary card.
- `buildMeasurementsCardHTML()` — same week-bucket shape, for waist/hip. Same empty-state pattern. Now the third slide (was the second, prior to v7.28's swings card insertion).
- `renderProgressTables()` — picks `[buildWeeklySummaryCardHTML(), buildWeeklySwingsCardHTML(), buildMeasurementsCardHTML()][progressTablesIndex]`, writes it into `#progress-tables-wrap`, and renders the dots into `#progress-tables-dots`. `PROGRESS_TABLES_COUNT` is `3` (was `2`).
- `progressTablesAnimateTo(rawIndex)` / `progressTablesSnapBack()` / `initProgressTablesSwipe()` — swipe-gesture handling, directly mirroring `insightsAnimateTo`/`insightsSnapBack`/`initInsightsSwipe` (§ below), except it only re-renders the table stack itself rather than the whole Progress page, since neither table depends on other page state. Unchanged by the 3-card expansion — the modulo-based index math already generalised to any `PROGRESS_TABLES_COUNT`.

**Weight delta (reworked in v6.12):** previously compared a single day's weight against another single day's weight (either first-vs-last within the week, or this-week's-only-entry vs last-week's-last-entry) — noisy enough that a genuine plateau could still show as a steady multi-week loss. Now calculated as **this week's average logged weight minus the most recent prior week (with any data)'s average weight**, carried forward across empty weeks the same way the measurements table already worked. Each week's average is always its own strict 7-day calendar bucket — never a trailing/rolling window spanning into other weeks.

**Swing card (v6.12, split into its own card in v7.28):** the smallest and largest **consecutive day-to-day** change within that week, per metric (weight/kcal/steps/protein) — only between chronological entries that actually happened for that metric that week (a gap between logs isn't treated as a swing), formatted e.g. `−1.5lbs/+2.4lbs`. Shows a single value (no slash) if there's only one day-to-day change that week for that metric, and `—` if there are fewer than two data points. Intended to make water-retention-style/day-to-day volatility visible without it being mistaken for the trend itself.

**Measurements card:** values are the most recently logged waist/hip measurement within that calendar week; deltas compare against the last known value from the most recent prior week with data — never a same-week first-vs-last comparison, since measurements are typically logged at most once a week.

---

## 11. Module: Plan

Rendered by `renderPlan()`.

### Macrocycle CRUD
- `saveMacro()` — creates or updates a macrocycle from the modal inputs. `sessionsPerWeek` is calculated, not read from an input — always `days.length` at creation time (`updateSessionsPerWeekPreview()` shows a live read-only preview in the modal as the split is built; the edit modal shows the same value as a read-only display, since the split itself can't be changed there). `weightIncrement` (default `'2.5'`) is user-editable for any goal type via the modal, superseding the old loss-only `lossIncrement` field (§20).
- **Goal type options (v7.00):** the modal now offers three goal types — Weight Loss, Weight/Strength Gain, and Maintenance. Selecting Maintenance hides the weight increment row (irrelevant when no progression is suggested) via `onMacroGoalTypeChange(prefix)`, which also re-validates the pace warning. The edit modal triggers `onMacroGoalTypeChange('edit-macro')` on open to sync these states for the existing cycle's goal type.
- **Pace validation (v7.00):** `validateMacroPace(prefix)` runs on every keystroke in the target BW and weeks fields. It computes the implied weekly rate of change from the most recent body log and compares it against a bodyweight-relative ceiling — 1% of current bodyweight per week for loss, 0.5% for gain. If the implied rate exceeds 150% of the ceiling, a red inline warning appears below the target BW field: "⚠ This implies ~N lbs/week — faster than what's typically sustainable at your current weight (~N lbs/week). The schedule tracker may show you as falling behind even on healthy progress." Warning is suppressed for maintenance cycles (no directional target) and when no body logs exist. Never blocks saving.
- **Monday-only start date (new in v7.28):** macrocycles can only start on a Monday — enforced (blocking, not just a warning) in both `createMacrocycle()` and `saveEditMacro()` via `isMondayDateStr(dateStr)`. On a non-Monday date, the save is aborted, the start-date field's border flashes red for 1.5s (same pattern as the goal kcal/steps required-field flash, §15), and a static inline error (`#macro-start-error` / `#edit-macro-start-error`) is shown/hidden. Reset on every fresh modal open so a stale error never lingers between attempts. This exists because the mesocycle/microcycle calendar-week math used throughout the app — deload weeks, the Train hero's calendar week dates (§12), `getMacroVolumeSeries()`'s date-fanning — all assume week 1 of mesocycle 1 starts on a Monday; a non-Monday start would silently misalign every one of them. `getNextMacroStart()`'s suggested default is snapped forward to the next Monday via `snapToNextMonday(dateStr)`, so a brand-new macrocycle is never even prompted with an invalid date to begin with.
- `deleteMacrocycle(id)` / `copyMacrocycle(id)` — delete, or deep-clone with a new id and start date
- `getMacroSessionDayKeys(macro)` — returns every session's `day(+microKey)` combination for a macro, the shared building block for anything that needs to iterate "every session in this cycle" (progression preview, body-part volume table, deload weeks-since counter, etc.)

### Session cards (Week 1 template)
Each day (Push/Pull/Legs, or custom-named sessions) renders as its own collapsible card:
- `togglePlanDaySession(macroId, dayKey)` — expand/collapse. Collapse state (`planDayCollapsed`, keyed `${macroId}_${dayKey}`) is an **override on top of a default rule** (v7.40): a session with at least one exercise defaults to collapsed, an empty one defaults expanded — `planDayCollapsed[key] !== undefined ? planDayCollapsed[key] : exercises.length > 0`. The toggle function itself computes that same effective (default-resolved) state before flipping it, rather than blindly negating a possibly-`undefined` override — negating `undefined` directly would always land on `true`, meaning a click on an already-collapsed-by-default session could re-collapse it instead of opening it. `showScreen('plan')` resets `planDayCollapsed = {}` on every fresh navigation to the tab, so the override never outlives a single visit; opening `openAddExercise`/`openAddExerciseToSuperset`/`openEditExercise` for a day explicitly sets its override to expanded first, so actively editing a session never gets collapsed out from under you mid-edit. Collapsing only removes the exercise rows (and their drag handlers) from the DOM — drag-to-reorder is already scoped to a single day, so a collapsed card simply has nothing draggable in it until reopened.
- `renameDaySessionStart(macroId, day, spanId, currentLabel)` — tap-to-rename, following the same inline-`<input>`-swap pattern as superset renaming (`renameSupersetStart`). Writes to `macro.dayLabels[day]`, which only affects the display label — the day's position in `macro.days`, its exercises, and its logged history are all keyed by the stable day id (`push`/`pull`/`legs`/`session0`/...), never by this label.
- The header's summary line (`N exercises · N sets · Nkg volume`) sums `getWeekSets()` and volume across every exercise in the session, including every superset member individually, always using week-1 values. Drop-set exercises contribute 0 to this theoretical volume figure, since they have no planned rep target to project from (§12) — their real volume only appears once logged, in `getSessionVolume()`.

### Exercise modal
- Exercise type: **Standard**, **Giant Set**, **Pause Set**, or **Drop Set** (`ex-type-select`, values `standard`/`giant`/`pause`/`dropset`). Giant Set locks sets to 1 (`onExTypeChange()`). As of **v6.09**, Drop Set keeps the reps-target field visible rather than hiding it — it sets the **main set's** rep target, same as any other type; the inline note below the field is swapped to clarify that only the main set has a target and the drop is always a reduction in weight taken to failure (prior to v6.09 the field was hidden entirely and `ex.reps` was forced to `''`, since drop sets had no rep target at all). Drop Set is disabled in the type dropdown (`setDropsetOptionEnabled(false)`) whenever the modal is adding into or editing a superset member, since drop sets can't be superset members.
- **Last logged reference** (`ex-last-logged-note`) — below the exercise name, shows one line per set type this exercise name has history for (e.g. a standard-set line and a separate giant-set line for the same exercise, if you've trained it both ways), pulled from `state.exerciseHistory`. Reference-only — never affects any calculation. Updated by `updateLastLoggedPreview()` whenever the name changes.
- **History-based defaults** — when adding a new exercise (never when editing an existing one), reps and starting weight prefill from `state.exerciseHistory[name][selectedType]`, and tracking mode prefills from `state.exerciseTrackingMode[name]`, via `applyExerciseHistoryDefaults()`. Switching set type re-applies against that type's own remembered numbers. Sets always stay at the fixed default (2–5), never pulled from history. Everything remains fully editable.
- `saveCustomExercise()` also refreshes the last-logged preview after re-selecting the newly created exercise.

### Supersets
- `openAddExerciseToSuperset(day, ssId)` — add an exercise into an existing group
- `reorderSupersetExercise(day, supersetId, fromInnerIdx, toInnerIdx)` — reorder within a group
- `unlinkSuperset(day, ssId)` — dissolve a group back into standalone exercises
- `deleteSupersetGroup(day, ssId)` — delete every exercise in a group
- `renameSupersetStart(ssId, currentName)` / `getSupersetDisplayName(ssId, members)` — custom group name, stored in `state.supersets[ssId].name`; falls back to a generated "A + B" name from member names when null
- `getSupersetBadge(n)` — the "SS" / member-count badge shown on group cards
- Regular (non-superset) drag-to-reorder is handled by `reorderExercise(day, fromSortedIdx, toSortedIdx)`, which treats each superset group as a single slot
- `openLinkModal(day, exId)` returns immediately without opening anything if the origin exercise is a drop set, and filters drop-set exercises out of the selectable member list regardless of which exercise triggered it — drop sets can't join or be joined into a superset (§12)

### Progression preview ("Weeks 2+")
Grouped by **session first, then by week within** — the reverse of the original week-first layout. For each session (`day`+`microKey` combination), a collapsible card (`togglePlanSession`/`planExpandedSessions`, collapsed by default — distinct from the Week-1 template's `togglePlanDaySession`/`planDayCollapsed`, which defaults expanded) lists every exercise, and under each exercise, one row per week showing that week's sets/reps/weight target. Reps always show the exercise's starting reps for every type (standard/giant/pause) — giant-set's per-week reps escalation is intentionally not reflected here, only in the live Train recommendations. Drop-set exercises have no reps target to show here at all (§12).

### Body part volume table
- `computeBodyPartVolumeRange(macro)` — for every exercise across every session in the cycle, resolves its body part by looking name up against `getLibrary()` (built-in + custom; nothing is stored on the exercise itself), then computes two whole-cycle volume totals per body part: an all-weight-progression scenario and an all-reps-progression scenario (reusing `getWeekSets`/`getWeekWeight`/`getWeekReps`/`getGiantSetProgression`/`parseRepsForVolume` — the same building blocks the progression preview and Train page use). Min/max per body part is the smaller/larger of those two totals; pause sets collapse to the same value in both scenarios since they have no reps-progression path. As of **v6.09**, drop sets contribute their main set's projected volume like any other exercise (`ex.reps` now holds a real target — see §12 Drop Sets); the drop portion itself still contributes 0, since it never has a plan-time target to project from.
- `renderBodyPartVolumeTable(macro)` — renders the result sorted by minimum volume descending. Returns an empty string (renders nothing) if the cycle has no exercises yet.

### Goals (moved here from its own screen in v7.40)

Goals no longer has a standalone screen or nav-bar entry — `renderGoals()` was retired and replaced by `renderPlanGoalsSection()`, rendered below the macrocycle hero on Plan. The underlying goal CRUD, overlap validation, and macro-slider drift-lock logic described in §15 is unchanged; only where it renders and a few additions changed:

- `renderPlanGoalsSection()` — lists every goal belonging to `state.currentMacroId`'s macro, sorted by `startDate`, in the same row style `renderProgressCycleGoals()` (§10) uses: a left accent border (`var(--accent)` for the goal covering today, `var(--red)` for the next genuinely-different upcoming one — computed with the identical "does this goal's targets actually differ from the active one" check `renderHomeGoalBanner()` uses, §30 — `transparent` otherwise), label, date range, and a condensed target summary. Each row is a `.swipe-row-wrap` (tap → `openEditGoal`, swipe → `deleteGoal`, §18).
- `planGoalsSectionCollapsed` (module-level boolean, default `false`) / `togglePlanGoalsSection()` — the section's own collapse state, expanded by default. Unlike `planDayCollapsed` above, this is a plain persistent toggle, not reset on every Plan visit.
- A "+ Build goals" button opens the existing `modal-add-goal`, pre-selecting the current macro (`goal-macro-select`) and re-triggering `onGoalMacroSelectChange()` so the label prefill matches, since `openModal()`'s own default-selection logic picks whichever macro is first in the rebuilt `<option>` list, not necessarily the current one.
- **Dismissible create-goal prompt** — `maybePromptCreateGoal(macroId)`, called at the end of both `createMacrocycle()` (only its plain-save path — not the `_pendingNextCyclePlan` goal-queue branch, which already creates goals of its own) and `saveEditMacro()`. Checks whether any goal already has this `macroId`; if not, uses `showConfirm()` (§9) with a "Not now" Cancel that's a true no-op and an "Add goal" OK that opens the modal pre-selected the same way the button above does.
- **Delete button in the goal modal** — `#goal-delete-btn` in `modal-add-goal`, hidden by default and shown only by `openEditGoal()` (which also stashes the `macroGoalID` being edited on the button's `dataset`); `openModal()`'s fresh-open branch for `modal-add-goal` explicitly hides it again so a fresh "+ Build goals" open never shows a stale delete option left over from the last edit. `deleteGoalFromModal()` reads the stashed id, confirms, then calls the existing `deleteGoal()` and closes the modal.
- `deleteGoal()` and `saveGoal()` both now call `renderPlanGoalsSection()` (and `renderProgressCycleGoals()`, §10) to refresh instead of the retired `renderGoals()`.
- **Progress's own list restricted (v7.41)** — `renderProgressCycleGoals()` (§10) now filters to `g.endDate >= today` (active + upcoming only); the full history including past goals is Plan-only.

---

## 12. Module: Train

Rendered by `renderTrain()` → `renderTrainHero(macro)` (session summary + volume + deload toggle) → `renderTrainDay(macro)` (the exercise cards).

**Auto-selecting the next session (extracted in v7.40):** `getAllMacroSessions(macro)` computes every `{week, dayKey}` session in the macro in order along with whether it's fully logged done (skipping sessions with zero exercises defined); `getNextIncompleteSession(macro)` returns the first incomplete one, or `null` if everything's done. Both used to be inlined directly in `renderTrain()`; they were pulled out into standalone functions specifically so Home's next-session preview (§30) reads from the exact same logic rather than a parallel reimplementation that could silently drift out of sync. `renderTrain()` itself still has its own fallback `getAllMacroSessions()`-based selection (`trainManualSelect`, a module-level boolean — `false` means auto-select the next incomplete session on every render; set `true` by any manual day-tab tap, and falls back to the *last* session in the plan if everything's complete, which `getNextIncompleteSession()` deliberately does not do, since Home wants an unambiguous "nothing left" answer rather than a fallback session).

### Progression data
`exProgData(ex)` is the single source of truth per exercise for a given week — computed once per exercise per render and either used directly (solo exercises) or mapped across `members.map(m => exProgData(m))` (supersets, as `memberData`). It returns sets, chosen `progType`, previous week's actual weight/reps, `recommendedWeight`/`recommendedReps`, `weightJump`, progression-inference fields (below), deload flags (`isDeloadSession`/`isPostDeloadSession`), and — for drop sets only — the parallel `dropWeightPlaceholder`/`dropRepsPlaceholder`/`recommendedDropWeight`/`recommendedDropReps`/`prevActualDropWeight`/`prevActualDropReps` fields. Solo-exercise rendering destructures the fields it needs by name; superset rendering reads them off `memberData[i]` directly — this is why a field can be genuinely used by one path and dead in the other if not double-checked.

**Per-set suggestions (v6.09):** the scalar `weightPlaceholder`/`repsPlaceholder`/`dropWeightPlaceholder`/`dropRepsPlaceholder` fields above are still returned unchanged (set-1-based, used everywhere the *collapsed* card or the exercise-level progression summary reads a single figure). Alongside them, `exProgData()` also returns **`weightPlaceholders`/`repsPlaceholders`/`dropWeightPlaceholders`/`dropRepsPlaceholders`** — arrays, one entry per set index for the *current* week, each computed from **that same set number** in the previous mesocycle/day rather than always deriving from set 1. This is what lets a suggestion correctly reflect a genuine per-set adjustment — e.g. completing sets 1–3 at a heavier weight but dropping set 4 down because it wasn't sustainable — instead of every set inheriting whatever happened on set 1. If the current week has more sets than the previous week (a set added mid-plan), the extra set(s) simply inherit the previous week's *final* set's suggestion. These arrays are what the expanded card's per-set inputs (and every fill/quick-fill/quick-fill-complete button) actually read from; only the collapsed card and the "This week — choose progression" summary still use the scalar, set-1-based fields.

### "Last week" progression badge inference
Shown as "Last wk: ↑ weight" / "↑ reps" / "no progression" in the exercise header (solo) or next to sets/reps in the collapsed preview row (superset members). If a progression path was explicitly chosen last week (via the Weight/Reps toggle), that's used directly. Otherwise it's inferred: compare last week's actual weight against the week before that (or the exercise's starting weight, if last week was week 1) — if it increased, "↑ weight"; else compare reps the same way — if those increased, "↑ reps"; if neither increased, "no progression". This inference exists specifically because filling sets via "Fill Suggested" and just checking them done, without ever tapping the Weight/Reps toggle, is a common real workflow that shouldn't leave the badge silently blank. Suppressed during deload and post-deload sessions (below), where a "deload" badge takes its place instead.

### Set rows
- Solo: `.set-row` is a CSS grid (`24px 1fr 60px 60px 40px` — set number, last-week actual for that specific set index, weight input, reps input, done checkbox). The "last week" column shows what was actually logged for that set number last week, not a repeat of the current suggestion (which is already visible via the input's placeholder). Drop-set exercises use a different layout entirely — see Drop Sets below.
- Superset: `.ss-set-ex-row` is `display: flex`, not a grid — member name, weight input, ×, reps input, done checkbox. The done checkbox shares `.check-done`/`.check-empty` styling with the solo grid rows, which includes `margin: 0 auto` (meant to centre it within a grid cell). In this flex context that competes with any `margin-left: auto` placed elsewhere in the row for the remaining free space — the first input has `margin-left:auto` to right-pack the row, and the checkbox's shared margin is overridden inline (`margin:0`) specifically in this template so the two auto-margins don't fight over the same free space. Drop sets can't be superset members, so this layout never needs the drop-set two-row treatment.
- `logSet(logKey, field, value)` writes a single field (`weight`/`reps`/`dropWeight`/`dropReps`); `toggleSetDone(logKey)` flips `done` with a brief red-border flash if weight/reps (and, for drop sets, dropWeight/dropReps) are missing. Resolves the exercise object itself from the log key — by stripping the known `${macroId}_${week}_${day}_` prefix and the trailing `_${setIndex}` suffix — rather than requiring callers to pass type info, so it can determine `isDropSet` and call `recordExerciseHistory()` internally.
- `fillSuggested(macroId, week, day, exId, sets, weightList, repsList)` — fills every set's inputs with **that set's own** suggested values in one tap (v6.09; previously a single flat value applied to every set), with an amber flash animation on the button and inputs. `weightList`/`repsList` are `'|'`-delimited strings built from `exProgData()`'s per-set arrays (see above) — plain scalars can't cross an inline `onclick=""` HTML attribute as an array, so they're joined with `.join('|')` at render time and split back apart with `.split('|')` inside the function; if a set index is missing from the list (shouldn't normally happen) it falls back to the list's last entry. `fillSuggestedDropset(macroId, week, day, exId, sets, weightList, repsList, dropWeightList)` is the drop-set equivalent — as of v6.09 it fills the main set's reps too (previously never did, since drop sets had no rep target at all), but still never fills drop reps, since the drop is always taken to failure and only ever discovered live.
- `quickFillComplete(...)` / `quickFillCompleteSuperset(...)` — the one-tap fill-and-complete button on the collapsed card header. Both take the same `'|'`-delimited per-set lists as `fillSuggested()` (v6.09) rather than a flat value. Both call `recordExerciseHistory()` after marking sets done, same as `toggleSetDone()`, by resolving the exercise directly from the already-known `exId` parameter (simpler than `toggleSetDone`'s key-parsing, since `exId` is passed in explicitly here).
- **`quickFillCompleteDropset(...)` (new in v6.10)** — the drop-set equivalent of `quickFillComplete()`, shown on the collapsed card for drop-set exercises (previously no such shortcut existed for drop sets at all — see Drop Sets below for why that changed). Unlike `fillSuggestedDropset()`, this one fills **every** field, including drop reps, and marks every set done — deliberately not a strict completeness check, just the same "log what was suggested" shortcut every other exercise type gets. You can still correct the actual drop reps afterward via the expanded card if what you hit differs from the suggestion.

### Session volume
`renderTrainHero()` calls the shared `getSessionVolume(macro, week, dayKey)` rather than computing volume inline — this matters because that shared function correctly doubles weight for `trackingMode === 'perSide'` exercises, and an earlier inline duplicate here did not. Drop-set exercises contribute both halves (main weight × reps, plus drop weight × drop reps).

### Day-tab pills, grouped by calendar week
Day tabs (Push/Pull/Legs or custom sessions, per microcycle) are grouped into one row per **real calendar week**, not simply one row per microcycle. A microcycle only represents a distinct calendar week when the mesocycle actually spans more than one real week (`weeksPerMeso === 2`) — M1 gets its own row, M2 gets its own row. If `weeksPerMeso` is 1 (including the edge case of a macro that enables microcycles but keeps a 1-week mesocycle), all microcycles fall inside the same single calendar week and stay merged into one row, matching the layout for a macro with no microcycles at all.

The subtitle and hero label both use `M1`/`M2` for the microcycle suffix — this was previously `MC1`/`MC2` in two separate spots, a genuine inconsistency (not intentional) that collided with "MC" already meaning *mesocycle* elsewhere in the UI ("MC 4 / 8"). Fixed to match the day-tab pills, which always used `M1`/`M2`.

### Calendar week dates on the hero (new in v7.28)

The Train hero card shows the real calendar date range (`formatDate(start)` – `formatDate(end)`) that the currently-selected mesocycle + microcycle pill corresponds to, directly below the `MC N / total` label — a forward-planning aid for deciding deload weeks against upcoming goal periods, without needing to count weeks by hand.

- `getSelectedTrainWeekDates(macro)` resolves the range from `macro.start` plus an offset, using the same mesocycle-span math as `getMacroVolumeSeries()` (§ Body part volume table, §24) — `mesoSpanDays = (macro.weeksPerMeso || 1) * 7`, offset `= (state.currentWeek - 1) * mesoSpanDays`, plus another 7 days if the currently-viewed microcycle is M2 **and** the mesocycle genuinely spans two real weeks (`weeksPerMeso === 2` with microcycles on) — the same `usesTwoRealWeeks` distinction the day-tab grouping above already makes. Returns `null` (renders nothing) if the macro has no start date.
- The range is **not** snapped to Monday–Sunday boundaries independently of `macro.start` — it's computed directly from whatever date the macrocycle actually started on. Since v7.28 also enforces macrocycles-must-start-on-Monday (§11), this range is a genuine Monday–Sunday week in practice, but the calculation itself doesn't hard-code that assumption — it just fans out from `macro.start`, same as every other date-approximation in the app.
- Rendered inside `renderTrainHero()`, immediately after the existing `hero-label` div; hidden along with the rest of the hero when the selected session has no exercises defined (unchanged pre-existing behaviour for that case).

### Maintenance goalType (v7.00)

Maintenance is a third macrocycle goal type alongside loss and gain. It affects the Train page as follows:

- **No load or reps progression is suggested.** `weightJump` is set to `0` for maintenance cycles in `exProgData()` — both the standard `lightJump` and the `heavyJump` for heavy leg exercises. This means `recommendedWeight` is always the same as last week's actual weight, with no increment added.
- **The progression selector is suppressed.** The "↑ Weight / ↑ Reps" toggle does not render (`showProgSelector = false`) when the active macrocycle has `goalType === 'maintenance'`.
- **The last-week progression badge is suppressed.** The "↑ weight / ↑ reps / no progression" annotation is hidden in both solo cards and superset member rows. A plain suggested weight still appears (carry-forward from last week), so the fill-suggested and quick-fill-complete buttons continue to work correctly.
- **Set-count spacing is unaffected.** The even-spacing between `startSets` and `endSets` (which determines when new sets are added across a mesocycle) continues to run identically to loss and gain cycles — a mild volume progression is considered appropriate even during maintenance, and was deliberately not changed.
- **Deload weeks are fully supported.** The deload mechanism operates on recovery within a training block, not on the goal direction — it applies identically across all three goal types.

`isMaintCycle` is hoisted to the top of the `trainSlots.forEach` loop so it is in scope for both the collapsed card header (lastWkBadge) and the expanded section (showProgSelector) without being declared twice.

### Deload Logic
A deload marks a whole **calendar-week unit** — for macros using microcycles, that's `(week, microcycle)`; for macros without, it's just `(week)`. Marking a unit deload applies to every day type within it (the flag isn't day-specific), toggled via a pill on the Train hero (`toggleDeloadWeek(macroId, week, dayKey)`) scoped to whichever week+microcycle is currently selected — never the sibling microcycle in a 2-week mesocycle.

- **Deload week itself**: every exercise's weight drops to 60% of whatever was actually logged last time, rounded to that exercise's own increment (`roundToIncrement(weight, increment)` — the same `weightJump` value used for normal progression); reps carry over unchanged. Progression chips, last-week badges, and the overall since-start progress badge are all suppressed for the deload session — the reduced weight would otherwise read as a misleading loss.
- **The session immediately after a deload** also skips progression for exactly one occurrence, reverting to the last genuine (non-deload) numbers rather than the deload week's temporarily-reduced ones. "Immediately after" is a **union of two adjacency checks**, not one:
  - `getPrevTrackUnit(macro, week, dayKey)` — same dayKey, one mesocycle earlier. Mirrors the existing `prevWeek2`/`prevKey2` pairing normal progression already uses, since Push-M1 and Push-M2 progress as two fully independent tracks in this app (each mesocycle's M1 only ever compares against the previous mesocycle's M1, never that mesocycle's own M2).
  - `getPrevCalendarWeek(macro, week, dayKey)` — true physical-time adjacency, crossing between M1/M2 (a week's M2 is preceded by that same week's M1; a week's M1 is preceded by the previous week's M2).
  - A deload on MC4 M1 needs to revert **both** MC4 M2 (the immediate physical-calendar sibling — a different track entirely) **and** MC5 M1 (the next occurrence of the same track) — hence the union. `getLastNonDeloadUnit()` walks backward via `getPrevTrackUnit` only (skipping consecutive deloads) to find the actual reference values, since that's always the correct per-track history regardless of which adjacency check flagged the session.
- `isFirstUnitAfterDeload(macro, week, dayKey)` implements the union check; `isDeloadUnit(macro, week, dayKey)` is the raw flag lookup.
- `getWeeksSinceLastDeload(macro, week, dayKey)` — a separate, purely physical-calendar walk (via `getPrevCalendarWeek` only) counting real elapsed weeks since the last deload, for the hero's "N weeks since last deload" callout. Returns `null` (hide the callout) when the current unit is itself a deload, or when no deload has happened yet in this macro.
- The hero's status pill combines both states into one element: red background with the deload warning when active, otherwise the weeks-since-deload text once applicable, otherwise nothing — no "Not a deload week" placeholder text.
- **`recordExerciseHistory()` skips deload sessions entirely** (checked internally via `isDeloadUnit`) — a 60%-reduced week must never become the reference for "last logged" or the next plan's defaults.

### Drop Sets
A drop-set exercise (`ex.type === 'dropset'`) plans its **main set** exactly like any other type — starting weight and, as of **v6.09**, a real reps target (`ex.reps`, prior to v6.09 always forced to `''`). Only the **drop portion** has no plan-time target at all; its weight and reps are both discovered live, logged to failure each week starting in week 1.

- **Data model**: each set's `trainLogs` entry carries `weight`/`reps` (main) plus `dropWeight`/`dropReps` (drop) on the *same* log object — no separate set index for the drop portion.
- **Expanded card layout**: one block per set, containing two `.set-row`s — a "Main" row and a "Drop" row — sharing one done-checkbox on the Main row (`toggleSetDone` requires all four fields filled before allowing completion). This replaces the single-row-per-set grid every other type uses. The Main row's reps input now shows a genuine per-set suggestion (v6.09) rather than always falling back to a bare "failure" placeholder; the Drop row's reps input still always shows "failure" as its placeholder, since that field never has a suggestion.
- **Progression**: follows the same weight/reps progression choice as every other type, applied identically to the main pair and (once there's prior drop data logged) the drop pair — computed via the parallel `recommendedDropWeight`/`recommendedDropReps` fields in `exProgData()`, and the per-set `dropWeightPlaceholders`/`dropRepsPlaceholders` arrays (v6.09, see Progression data above). Drop weight/reps have no plan-time fallback target (unlike main weight/reps, which fall back to `ex.startWeight`/`ex.reps`) — blank means "nothing to suggest yet, log it live."
- **Collapsed card**: shows the real reps target (or "to failure + drop" if nothing's been logged yet at all) instead of always being blank; a red `badge-red` "drop set" badge. As of **v6.10**, a `quickFillCompleteDropset()` shortcut is shown here too (previously no quick-fill-complete existed for drop sets at all, since reps-to-failure couldn't be sanely auto-filled when there was no main-set reps target to suggest in the first place — now that there is one, the shortcut fills weight/reps/drop-weight/drop-reps and marks every set done, same as every other exercise type's shortcut).
- **Superset restriction**: drop sets can't be superset members. The type option is disabled in the modal (`setDropsetOptionEnabled(false)`) when adding into or editing within a superset, `saveExercise()` has a belt-and-braces fallback to `standard` if one somehow gets submitted anyway, and `openLinkModal()` excludes drop-set exercises from the selectable list entirely (and refuses to open at all if the origin exercise is itself a drop set).
- **Volume**: `getSessionVolume()` adds the drop portion (drop weight × drop reps) alongside the main portion for drop-set exercises. As a side effect of the v6.09 reps-target change, the Plan page's *theoretical* volume projections (Week-1 session summary, body-part volume table) now also include a drop-set exercise's main-set contribution — previously both relied on `ex.reps`, which was always `''` for drop sets, so they contributed nothing at all (see §29, since this resolves a previously-listed limitation). The drop portion still contributes nothing to these theoretical projections, correctly, since it never has a plan-time target to project from.

### Exercise History
`state.exerciseHistory` and `state.exerciseTrackingMode` (§3) snapshot the most recent real performance per exercise name (+ set type, for history), refreshed by `recordExerciseHistory(macro, week, dayKey, ex)` every time a set is completed via `toggleSetDone()` or a quick-fill-complete button — never for deload sessions. This replaced an earlier, more expensive approach (searching the single "last completed macrocycle" by end date each time the Add Exercise modal opened) — the running-snapshot approach is O(1) to read, always reflects the true most recent log regardless of which macro it came from, and doesn't require special-casing macros with no logged history yet.

- Recorded fields per (name, type): `sets` (count of sets with a logged weight that week, falling back to the planned count), `reps`, `weight`, `dropWeight`, `dropReps` (drop-set only), `date` (`getLocalToday()`).
- `formatLastLoggedLine(type, entry)` — builds the modal's display line, e.g. "Last logged: 5 sets · 10 reps @ 50kg (12 Jul)", with a type qualifier when it isn't a plain standard set. Strips a trailing `' reps'` from stored rep values before appending its own, since giant-set reps is a free-text field and real logged data can already contain the word (e.g. someone typed "60 reps").
- `updateLastLoggedPreview()` / `applyExerciseHistoryDefaults()` — see §11 Plan for how these drive the exercise modal.

### Rest Timer
See §17 — opened via the clock icon in the Train header.

---

## 13. Module: Body

Body is no longer its own screen or nav-bar entry (removed in v7.51, folded into Settings). `renderBody()` is now a much smaller function, populating only `#body-log-list` inside `modal-settings-body-logs` — everything else it used to build (the hero card, weight-history chart, inline "log weigh-in" card, and measurement reminder pill) was removed along with roughly 200 lines of computation that fed only those sections (weekly/cycle change, `avg7w`, `leftToGoStr`, the profile badge, the measurement-delta callout row) once their target `<div>`s no longer existed anywhere in the markup — deleted outright rather than left as dead-but-guarded code, since none of it was reachable from any UI path any more. The now-unused `ascLogs` variable was removed for the same reason.

- `openSettingsBodyLogs()` — refreshes `renderBody()` then opens `modal-settings-body-logs`. Called from Settings → Profile card → "Body logs", and internally by `openTodaysBodyLogModal()` below. Does not close any parent modal (Profile is now an inline Settings card, not a modal, §16).
- `openTodaysBodyLogModal()` — opens the Body logs modal, then, stacked on top of it, either today's existing entry via `openEditBodyLog(today)` or a blank entry (`openModal('modal-body-log')`, which defaults its date field to today) if nothing's logged yet. This is what Home's "Edit today's logs" link calls (§30) — it used to just open the Body screen; now it lands directly on today's own entry.
- `openBodyProfile()` / `saveBodyProfile()` — gender, height (cm or ft/in via `switchHeightUnit`), birthday, stored in `state.profile`. Previously reachable by tapping the Body page's hero card; now opened directly from Settings → Profile card → "About me" (`modal-body-profile` itself is unchanged). Height unit resets to ft/in on every open regardless of last-used unit (a known minor friction point, not a bug — confirmed as acceptable).
- `calcAge()`, `getActivityMultiplier()`, `calcMifflinBMR()`, `calcDynamicTDEE()` — BMR/TDEE calculation, still used by the Progress page's Metabolism insight card (§10) even though Body itself no longer surfaces them directly. Body weight is stored and displayed in **lbs** throughout (confirmed intentional — training weight elsewhere in the app is in kg; there is deliberately no unit toggle for body weight). `getActivityMultiplier()` averages steps across the person's *entire* logged history with no recency window — also intentional, since this multiplier only feeds the BMR/TDEE estimate and more historical data makes it more accurate, not less.
- `openEditBodyLog(idx)` / `saveInlineBodyLog()` / `saveBodyLog()` / `deleteBodyLog(date)` — body weight + steps log CRUD, unchanged. `saveInlineBodyLog()`'s own inline card no longer exists in the UI (removed with the rest of the hero section), but the function itself is retained since nothing else needed touching to remove just its container.

### Waist/hip measurements (new in v6.12)

Optional waist and hip fields on `state.bodyLogs`, entered via `modal-body-log` (or, since v7.31, Home's own inline measurements box — §30, reworked from a mini-modal to an inline box in v7.53 — which keeps a parallel `homeFracState`/`setHomeMeasUnit`/`setHomeFrac` rather than sharing the ids below, since both sets of inputs can coexist in the DOM) but always stored as inches (never the input unit) so a later unit switch can't corrupt historical data.

- `setMeasUnit(unit)` — toggles the modal between inches and cm input modes, persists the choice to `state.profile.measureUnit`, and swaps which of `#meas-fields-in`/`#meas-fields-cm` is visible.
- `setFrac(field, val)` — sets the active quarter-inch button (0/¼/½/¾) for `waist` or `hip` in inches mode; tracked in the module-level `fracState` object, not on the input elements themselves, since the whole-number field and the fraction picker are separate controls that together make one value.
- `cmToIn(cm)` — converts a cm entry to inches, rounded to 2dp, for storage.
- `fmtInch(val)` — smart display formatting: trims to the minimum decimals needed (`33` / `33.5` / `33.25`) rather than a fixed decimal count.
- `saveBodyLog()` reads whichever unit mode is active (inches: whole-number field + `fracState`; cm: direct field via `cmToIn()`) and writes the resolved-to-inches `waist`/`hip` values onto the entry alongside weight/steps. `openEditBodyLog()` reverses this to populate both unit modes' fields when editing an existing entry, so switching the toggle mid-edit shows consistent values either way.
- `saveInlineBodyLog()` and `saveBodyLog()`'s date-change path both preserve any existing `waist`/`hip` already logged for that date rather than clobbering them with `null` — same pattern already used for `steps`.
- The hero-card measurement callout row (current value + delta since first log) described in earlier versions of this document no longer exists — it was part of the section removed in v7.51. Waist/hip history is still fully preserved and still editable; there's just no longer a dedicated summary callout for it outside the log rows themselves.

### Recent Entries — month grouping (new in v6.11)

Every log entry with **both** weight and steps filled in is eligible to collapse into a monthly group; anything missing either field always renders as a standalone row, regardless of which month it falls in. This isn't month-scoped (the current calendar month groups exactly the same as any past month) — the only thing that keeps an entry out of a group is being incomplete.

```
for each log, newest first:
  monthKey = date.slice(0, 7)                 // 'YYYY-MM'
  if weight && steps:
    add to monthGroups[monthKey]
    if this is the first time monthKey was seen this render:
      emit a collapsed group header here
  else:
    emit this log as a standalone row here
```

Because `logs` is already sorted newest-first, the first (i.e. most recent) log encountered for a given month is always where that month's group header gets anchored — this is what makes groups come out sorted newest-month-first with zero extra sort step, and why an incomplete entry from a month that's otherwise fully grouped still shows up in its correct chronological position rather than getting shunted to the top or bottom of the list.

**Why incomplete entries are excluded, concretely:** if you log weight from a scale immediately but your phone's steps take until the next day to sync, that entry is genuinely incomplete for a day or two — grouping it anyway would bury it inside a collapsed group you'd have to think to expand, right when you're most likely to want to see it (to finish filling it in). Once you add the steps later — no explicit action needed, it's just a normal edit via `saveBodyLog()` — the next render naturally reclassifies it into whichever month group it belongs to.

- `bodyExpandedMonths` (plain module-level object, not persisted — same pattern as `planGoalsSectionCollapsed`, §11) — keyed by `'YYYY-MM'`, tracks which group(s) are currently expanded.
- `toggleBodyMonth(monthKey)` — flips a group's expanded state and re-renders.
- Each collapsed group header shows entry count and average weight for that month; expanding it renders the exact same row template (tap to edit, swipe to delete) used for standalone rows, just nested inside the group's card.
- The previous hard cap of showing only the most recent 30 entries was removed — grouping keeps the list compact on its own without needing to truncate, and truncating would have arbitrarily cut a month's entries mid-group. This predates, and is unaffected by, the v7.51 modal move.

---

## 14. Module: Nutrition

Rendered by `renderNutrDaily()`. This is the largest module in the file.

### Hero & date navigation
- `renderNutrHero()` — kcal/macro summary for `nutrSelectedDate`, driven by the active goal (`getGoalForDay`)
- Tap → `openNutrDatePicker()` / `nutrPickDate(val)`. Swipe left/right → `nutrShiftDate(delta)`, wired through `initNutrHeroSwipe()`'s gesture handler, which calls `nutrShiftDate` exactly once per completed swipe via a card-swap animation (`commitSwipe()`)
- There is no day-badge strip — an earlier 7-day-strip UI (`renderNutrBadges()`) was removed as dead code once the tap/swipe hero pattern fully replaced it; the DOM element it targeted no longer exists in the markup either
- `openNutrQuickAdd()` / `saveNutrQuickAdd()` / `clearNutrQuickAdd()` — the day-level kcal/protein/carbs/fats override, stored in `state.nutritionQuickLog[date]`, which takes priority over meal-based totals for that date wherever `getDayTotals()` is read

### Diary
- `getNutrDayMeals(date)` / `getDayTotals(date)` — aggregate a day's meals + quick-log override
- `renderNutrDiary()` — one card per meal (Breakfast/Lunch/Dinner/Snacks), each item's small print varying by `item.source` (`'library'` / `'manual'` / `'barcode'` / `'recipe'`) — brand is shown for everything except recipes, which show a serving count instead
- `initYesterdaySwipes()` — swipe-to-copy strip under each meal; `copyMealFromYesterday(meal)` executes it past the one-third-width threshold
- `openMealMenu(meal)` / `showMealMenuSheet(...)` — the `···` action sheet: copy, move (`openMealCopyMove(mode)` → `confirmCopyFoodEntry()`), or `saveMealAsRecipe()`
- `saveMealAsRecipe()` builds `recipeIngredients` from the meal's current items and opens the recipe builder directly — it does **not** auto-log the resulting recipe anywhere; saving it lands on the Recipe List, by design. (An earlier, unused entry point — `openNutrRecipeBuilder()` — used to set a flag that made `saveRecipe()` jump straight back into the serving modal to auto-log; that flag and the dead branch reading it were removed once confirmed nothing set it anymore. Settings → My Recipes uses the unrelated `openRecipeBuilder()` directly and was never affected.)
- Per-item: `openCopyFoodEntry`/`confirmCopyFoodEntry` (single item), `deleteFoodEntry`, `openEditFoodEntry`/`updateEditPreview`/`saveEditFoodEntry`
- `syncNutrLegacyLog(date)` — recomputes `getDayTotals(date)` and upserts the result into `state.nutritionLogs`. Called after every logging change (add, edit, delete, quick-add). Not dead code — see §3's note on `nutritionLogs`.
- `addFoodEntry(entry)` — the single function every meal-logging path (barcode, manual, library, quick-add) funnels through to actually push an item into `state.nutritionMeals`. As of v7.53, also the hook point for the Sample Day Library's Dinner-entry prompt — see §28.

### Logging flow
- `openNutrAdd(meal, isReopen)` → `renderNutrAddList()` (search results, sourced from `getLibrary()` + food library, most-recently-logged first via `getLastNutrEntryForFood`)
- Scan → `openNutrBarcode()` → scanner engine (§21) → `_onScannerDetected` → `openNutrServingModal()`
- Manual → `openNutrManual()` → `updateManualPreview()` → `saveManualEntry()`
- Library/recipe row tap → `selectFromLibrary`/`selectFromAddList` → `openNutrServingModal()` → `updateServingPreview()` → `confirmServing()`
- `fitListToKeyboard('nutr-add-list-wrap')` keeps the search results visible above the keyboard — see §9

### Food library search reused for recipe ingredients (new in v6.12)

The recipe builder's "Add ingredients" screen (`modal-recipe-ingredients`) gained a third action button, "Food Library", alongside Scan Barcode and Manual — `openRecipeIngredientSearch(isReopen)` opens **the same `modal-nutr-add` modal** used for meal logging, rather than a separate search UI, configured for this different purpose:

- `nutrAddContext` (module-level, `'meal'` | `'recipe'`, default `'meal'`) governs what a committed selection actually does. `openNutrAdd()` resets it to `'meal'` on every open (so the modal self-heals back to its original behaviour); `openRecipeIngredientSearch()` sets it to `'recipe'` and hides the Recipes/Manual/Scan Barcode row (`#nutr-add-actions-row`, given an id specifically so it can be toggled) — none of those three apply when the point of opening the modal was already to search the library.
- `quickAddFromList(idx)` and `confirmServing()` both branch on `nutrAddContext`: in `'recipe'` mode they `recipeIngredients.push(...)` a resolved-total ingredient (`{name, grams: 1, kcal, protein, carbs, fats, source: 'library'|'recipe'}` — deliberately shaped like a manual-entry ingredient, since the totals are already fully resolved and there's no per-gram value to preserve for later gram-based re-editing) and call `renderRecipeIngredients()`, instead of `addFoodEntry(...)`. The isRecipe-vs-regular-food scaling logic (recipe library items store *per-serving* values in their `per100kcal` field, by convention — see the existing per-item branching already in both functions) is unchanged; only the destination of the final totals differs.
- Because `editRecipeIngredient()`/`saveRecipeIngredientEdit()` gate their gram-based editing path on `ing.source === 'barcode' && ing.per1kcal != null`, these new library-sourced ingredients (no `per1kcal`) automatically fall into the existing manual-style edit path (servings count + per-serving macro fields) with no additional code needed there.
- **Returning to the parent modal:** all three ways of dismissing `modal-nutr-add` (✕ button, backdrop tap, swipe-down) funnel through the shared `closeModal(id)` function, so the recipe-context "return to `modal-recipe-ingredients`" logic lives there rather than being duplicated per dismissal path — see §9.
- **Keeping the search open after each addition:** exactly mirrors the existing meal-logging behaviour via the pre-existing `_nutrReturnToAddList` flag — `cancelNutrServing()` and `confirmServing()` both reopen the food search (branching between `openNutrAdd(nutrActiveMeal, true)` and `openRecipeIngredientSearch(true)` by context) after the servings modal closes, so several ingredients can be added in a row without the modal fully closing between each one.
- `_nutrAddTransitioning` (module-level boolean) suppresses the recipe-context auto-return in `closeModal()` specifically during the brief hand-off when `selectFromAddList()` closes `modal-nutr-add` on its way to opening `modal-nutr-serving` — without this guard, that deliberate transition would be misread as the person dismissing the whole flow, bouncing them back to `modal-recipe-ingredients` mid-flow instead of into the servings editor.

### Food library & recipes
- `addToFoodLibrary()`, `exportFoodLibrary()`/`importFoodLibrary()`, `shareFoodLibItem(idx)`/`shareFoodLibItemByIdx(idx)` (two active entry points — list-index-based, used from the two different list contexts they each render in), `importSharedFoodItem(file)`
- Recipe builder: `openRecipeBuilder(editId?)` → `recipeGoToIngredients()` → `renderRecipeIngredients()` → `confirmRecipeIngredient()`/`confirmRecipeManual()`/`openRecipeIngredientSearch()` → `saveRecipe()`

### Sample Day Library (new in v7.25 — full write-up in §28)

Below the hero card, `#nutr-save-badge-wrap` shows a save prompt on any day that's close enough to its own goal's targets and has a recipe logged for Dinner ("On target for your goal — save this day to pre-fill later?"); tapping it stores the whole day into a library grouped by goal. Next to Quick Add in the hero's corner, a **Fill Day** button opens a picker of previously saved days (for this goal or any goal with similar-enough targets) and copies every meal from the chosen day onto the current date, with a confirm-to-overwrite guard if the date already has logs. See §28 for the full linking model, the two different tolerance bands, and a documented data-corruption bug (fixed in v7.30) worth reading before touching this code.

---

## 15. Module: Goals

**As of v7.40, Goals is no longer a standalone screen** — its rendering moved to Plan (§11: `renderPlanGoalsSection()`, the "+ Build goals" flow, the dismissible create-goal prompt, the in-modal delete button). This section number is kept stable for cross-reference purposes and documents the underlying CRUD/validation functions, which are unchanged in behaviour regardless of where they're called from.

- `getActiveGoal()` — the goal covering today's date, regardless of macro
- `getGoalForDay(dateStr)` vs `getGoalForDate(dateStr, macroId)` — two similar-looking lookups that are both intentionally kept: the Nutrition page isn't tied to a specific macrocycle so it uses the date-only version; the Progress page's per-macro chart needs the macro-scoped version so a chart for macro A never picks up a goal that technically belongs to macro B
- `saveGoal()` — validates required fields (kcal, steps — red-border flash via the same pattern as Train's set validation if either is empty), checks `findOverlappingGoal(startDate, endDate, excludeIdx)` and blocks the save with an inline error if the new/edited range overlaps any other goal, then upserts. Now refreshes `renderPlanGoalsSection()` and `renderProgressCycleGoals()` on completion (§11) rather than the retired `renderGoals()`.
- `deleteGoal(macroGoalID)` — removes the goal, renumbers whatever's left in that macrocycle via `renumberMacroGoalSteps()` (see §11's note on this producing the "Step N -" label prefix), then refreshes the same two render targets as `saveGoal()`. Callable from a swipe-to-delete row (Plan) or from the goal modal's own delete button (§11).
- **Overlap prevention**: goal periods can never overlap, across any macrocycle. A new goal's start date defaults to the day after the latest existing goal's end date (any macro); saving is blocked (not just warned) if the chosen range collides with an existing goal
- **Macro-drift lock**: `initGoalMacroSliders(existingGoal)` back-derives the protein-multiplier and carb/fat-split slider positions from an existing goal's saved grams (using today's latest bodyweight log as the divisor). `goalMacroSliderState.userTouched` tracks whether the person actually dragged a slider this session (set only by the sliders' real `oninput` handlers, never by the programmatic `.value =` set during init, since that doesn't fire `input`). On save, if the goal being edited is **active or past** (`startDate <= today`) and no slider was touched, its exact stored `protein`/`carbs`/`fats` are kept as-is rather than recomputed — otherwise editing an old goal's kcal target, weeks after your bodyweight changed, would silently drift its macros. New/upcoming goals (or any goal where a slider actually moved) always use the live computed values.
- `computeGoalMacroGrams()` — reads current slider positions and returns `{proteinG, carbG, fatG}`

---

## 16. Module: Settings

Rendered by `renderSettings()`, which still just handles theme swatches, the mode toggle, storage info, and the API key status line — all now living inside modals rather than directly on the screen (see Layout below), but populated the same way regardless of which container they're in, since `document.getElementById()` doesn't care whether its target is currently visible.

- `setTheme(name)` / `setMode(mode)` — update state, set the `data-theme`/`data-mode` attribute, save, re-render the active screen
- `exportData()` / `importData(event)` — full-state JSON backup/restore, with a structural sanity check on import (`parsed.macrocycles && parsed.exercises && parsed.trainLogs` must all be present)
- `clearAllData()` — resets macrocycles/exercises/logs/goals/nutrition/foodLibrary/recipes/supersets/profile/sampleDays to empty, but **preserves** `theme`/`mode` (carried forward from the pre-clear state and re-applied to `<body>` immediately) since the confirm dialog only ever promises to delete tracked data, not appearance preferences. The reset object's shape is kept in exact sync with everything `load()`'s defensive defaults expect — an earlier version of this function omitted `recipes`/`supersets`/`profile` entirely, which left `state.supersets` undefined and threw on the very next superset action, since several reads of it aren't null-guarded (e.g. `state.supersets[ssId]`). **`sampleDays` (§28) was similarly missing until v7.31** — didn't crash anything (`load()`'s defensive default caught it on next boot), but meant a "Clear all data" left the Sample Day Library quietly intact, which the confirm dialog's wording doesn't promise.
- `exportLibrary()` / `importExerciseLibrary(file)` — exercise library backup/restore (merge-by-name)

### Layout (redesigned three times in v7.50–v7.52; this describes the final v7.52 shape)

The Settings screen is a list of collapsible cards, plus one always-visible Export button:

```
About this app          — tappable row → modal-settings-about (storage usage)
Profile card            — expanded by default
  App preferences        → modal-app-preferences (Mode + Theme)
  About me                → modal-body-profile (§13)
  Body logs               → modal-settings-body-logs (§13)
  Linked services         → modal-linked-services → modal-api-key
Nutrition card           — expanded by default
  My Recipes, Sample libraries, View/edit/export/import food library, Import recipe
Exercise card            — expanded by default
  View/edit library, Export, Import
Backup                   — Export JSON backup, always visible, not behind a card
Danger Zone card         — collapsed by default (the one exception)
  Import JSON backup, Clear all data
```

`toggleSettingsCard(key)` is a plain display-toggle against static markup (`#settings-card-body-{key}` / `#settings-card-chevron-{key}`) — none of these four cards show dynamic data, so there's no re-render involved, just a `style.display` flip and a chevron rotation. Card headers use the existing `.section-title` CSS, which already sets `text-transform: uppercase`, so no separate "all-caps" styling was needed.

**Every button within a card is visually identical** (`.lib-primary-btn`, icon + label, full width) — the v6.10 two-tier primary/secondary hierarchy described below no longer applies to these Settings cards themselves (only "My Recipes" keeps the `.accent-tint` modifier, since it's still the single most-used action in the Nutrition card). The two-tier layout is retained one level deeper, inside the Exercise/Food Library Editor screens those buttons open — see below.

**Danger Zone severity styling is unchanged from v6.10**: "Clear all data" (`.btn-danger-fill`) gets a solid red fill with white text, matching the visual weight of the accent-filled Export button, since it's the app's other truly one-way action; "Restore from backup" (now "Import JSON backup") uses the app's normal neutral button border with just red text, since it's recoverable via re-import.

**Modal-on-modal stacking (v7.50, §9):** buttons that open App preferences, About me, Body logs, Linked services → API key, or Sample libraries → a saved day's editor stack their target modal on top of whatever's already open rather than closing it first — so backing out of a nested modal returns to exactly where you were, not all the way to the Settings screen. The three buttons that open Food library editor / My Recipes / Exercise library editor are the deliberate exception: those lead into substantial pre-existing modal chains built around the default z-index, so bumping their own z-index to stack would have pushed their own children behind them — those three close the Settings screen's card view (nothing to close, since Settings itself isn't a modal — this really just means "don't stack," they simply open directly) rather than layering.

**What moved out of here:** the old flat "About / Appearance / Libraries / Backup / Danger Zone" single-column layout (v6.10–v7.49), and before that a hidden "Profile →" page (`modal-profile`, v7.25) holding only "Sample day libraries" — both are gone. `modal-profile`, `modal-settings-nutrition`, `modal-settings-exercise`, and `modal-danger-zone` (three short-lived intermediate modals from the first pass of this redesign, v7.50–v7.51) were all deleted once their contents became inline cards; `openProfilePage()` and `openSettingsNutritionModal()` were deleted as dead code alongside them. `modal-profile-nutrition` (Sample Day Library management, §28) kept its original element id throughout despite moving from the old hidden Profile page to the new Nutrition card, since nothing about the modal itself changed — only what opens it.

### Linked services → API key (new in v7.00; relocated in v7.50)

An optional Anthropic API key can be entered via Settings → Profile → Linked services → API Key. The key is stored in `localStorage` directly under the key `'bloc_api_key'`, **not** in `state` — this means it is never included in JSON exports or backups, intentionally. It is read by `getApiKey()` (returns the string or `null`) and written/cleared by `saveApiKey()`. This used to be a top-level "AI Advice" section directly on the Settings screen; the storage mechanism and functions are unchanged, only the modal it lives in and the path to reach it moved.

`renderSettings()` checks `getApiKey()` on every render — if a key is present, the input shows a masked placeholder and a "✓ API key saved" status line; if absent, the placeholder resets to `"sk-ant-…"`. Saving an empty field removes the key.

### Exercise Library Editor (new in v6.10)

The first in-app view/edit screen for the exercise library — previously export/import were the only ways to touch it (§19). Deliberately mirrors the Food Library Editor pattern (§14) almost exactly:

- `openExerciseLibraryEditor()` → `renderExerciseLibEditor()` — searchable list (`exercise-lib-search`), built from `getLibrary()` (built-in `DEFAULT_LIBRARY` + `state.customLibrary`), sorted by body part then name same as the picker.
- **Built-in entries are read-only** — shown with a `default` badge instead of edit/delete buttons, and tapping the row does nothing (`openExerciseLibEntry()` no-ops if the resolved item isn't from `state.customLibrary`). This matches the existing rule already enforced by `importExerciseLibrary()` — default exercises can never be overwritten, this screen just makes that visible rather than only enforcing it silently on import.
- **Custom entries are fully editable** — `openExerciseLibEntry(idx)` → `saveExerciseLibEntry()` (matched by original name, since `state.customLibrary` entries have no id of their own — same lookup style as `saveCustomExercise()`) / `deleteExerciseLibEntry(idx)` (confirm-gated, filters by name from `state.customLibrary`).
- **Renaming or deleting only ever affects the picker going forward.** Exercises already added to a plan keep whatever name they were given at the time — plan exercises store their own `name` string, not a reference to the library entry — exactly like editing a food library entry never touches past nutrition logs. `state.exerciseHistory` (§12) is similarly untouched: it's keyed by name independently and isn't cleaned up on rename, so a renamed exercise's history simply becomes unreachable under the new name (matches existing behaviour for `state.exerciseHistory` generally — nothing in the codebase migrates history keys on rename today).
- Uses the same searchable-list-with-keyboard treatment as the Food Library Editor (`exercise-lib-list-wrap`, `fitListToKeyboard()` — see §9).

---

## 17. Module: Rest Timer

Opened via `openTimerModal()` (clock icon in Train screen header).

Two modes — Countdown and Stopwatch — toggled by `setTimerMode(mode)`.

Countdown uses an iOS-style drum-scroll picker (`buildPicker(...)`) for minutes and seconds. `countdownStart()` starts/pauses/resumes; `countdownReset()` resets. Three-beep alert via `playBeep()` (Web Audio API oscillators — does not interrupt media playback).

Stopwatch uses `swToggle()` and `swReset()` with `requestAnimationFrame` for tenths-of-second precision.

`updateTimerIcon()` turns the clock icon accent green while any timer is running, and back to the default when stopped.

Closing the modal via `closeTimerModal()` cancels and resets all timers.

---

## 18. Swipe Row System

Most list rows (exercises, body log, nutrition diary, goals, food library, recipes) use the same swipe-left gesture pattern, initialised by `initSwipeRows(containerEl)`:

```
onTouchStart: record startX
onTouchMove:
  deltaX = startX - currentX  (only left swipe)
  translate row by -deltaX, clamped to action button width
  reveal action buttons (delete, copy, etc.)
onTouchEnd:
  if deltaX > threshold: lock open
  else: snap back
```

A `_swipeCloseAll()` helper closes any open row when a new swipe begins or when the user taps elsewhere. `initSwipeRows` is called after every re-render of a swipeable list (it doesn't persist across `innerHTML` replacement), including from `renderPlan()` for both the macrocycle overview card and the per-session exercise lists.

The Nutrition "swipe-to-copy from yesterday" strip (§14, `initYesterdaySwipes`) is a related but distinct gesture — it fills/reveals progressively as you drag rather than snapping open at a threshold, and completes an action at one-third width rather than revealing buttons.

---

## 19. Exercise Library

The exercise library (`getLibrary()`) is a merged set of built-in exercises (`DEFAULT_LIBRARY`, hardcoded, ~26 entries covering Biceps/Calves/Chest/Legs/Back/Shoulders/Triceps) and user-added custom exercises (`state.customLibrary`). Every custom exercise requires a body part at creation time (`saveCustomExercise()`, via the `modal-custom-exercise` sheet) — there is no way to add one without it. Built-in exercises cannot be deleted or edited via the UI but can be exported. Custom exercises can be overwritten on import only if they have the same name.

**In-app viewing/editing (new in v6.10):** previously export/import were the only way to touch the library outside the Add Exercise picker. Settings → Libraries → Exercise library → View / edit library now opens a full in-app editor — see §16 for the UI details and the read-only-defaults / custom-only-editing rule.

Body part is never stored on an individual plan exercise (`state.exercises[...]` entries) — it's resolved on demand by looking the exercise's `name` up against `getLibrary()`. This is what powers the Plan page's body-part volume table (§11) without needing any data migration for exercises that were added before that feature existed.

---

## 20. Progression Logic

Three functions are the shared source of truth for every progression-related calculation in the app (Plan preview, Train recommendations, body-part volume table all call the same ones — this was consolidated during a 2026 audit after finding two of these had drifted into disagreeing hardcoded copies):

```js
function getWeekWeight(ex, week, progType, goalType, weightIncrement) {
  // Returns ex.startWeight unless progType === 'weight'.
  // jump = ex.isHeavyLeg ? (isGain ? 10 : 5) : weightIncrement
  // return ex.startWeight + jump * (week - 1)
}

function getWeekReps(ex, week, progType) {
  // Returns ex.reps unless progType === 'reps'. +1 rep/week when active,
  // handling both single numbers and "8-10"-style ranges. As of v6.09,
  // this works for drop sets too — ex.reps holds the main set's real
  // target now, rather than always being '' as it was before v6.09.
}

function getGiantSetProgression(ex, week) {
  // Pause set: fixed base reps derived from ex.reps — weight-only progression,
  // this never changes regardless of week.
  // Giant set: base reps + 10 * (week - 1).
}
```

`weightIncrement` is the one user-configurable input — set per macrocycle (defaults to 2.5 kg), used for standard (non-heavy-leg) exercises on **any** goal type since v6.01. Prior to that it was `lossIncrement`, editable only on loss cycles (gain cycles used a hardcoded 5kg). Heavy-leg jumps remain fixed regardless of the user's setting:

| Goal type | Standard exercises | Heavy leg exercises |
|---|---|---|
| Weight Loss | + configured `weightIncrement` / mesocycle | +5 kg / mesocycle |
| Strength Gain | + configured `weightIncrement` / mesocycle | +10 kg / mesocycle |

`exProgData(ex)` (Train page, §12) is a higher-level wrapper around these three functions that additionally layers in what was *actually logged* (as opposed to the theoretical target) for "previous week" displays and next-week recommendations, plus deload-aware overrides (§12) and, for drop-set exercises, the parallel drop-weight/drop-reps computation.

**Exercise types** (renamed from `myorep`/`myomatch` to `giant`/`pause` in v6.06 — a full data-level rename, not just display labels):
- **Standard** — weight or rep progression, chosen per exercise per week
- **Giant Set** (was "Myorep Giant Set") — weight or rep progression (giant-set reps add +10/week when reps is chosen)
- **Pause Set** (was "Myorep Matching") — fixed reps, weight progression only
- **Drop Set** (new in v6.05; main-set reps target added in v6.09) — main set is planned exactly like Standard (starting weight, and since v6.09 a reps target too); only the drop portion (drop weight, drop reps) is discovered live each week starting in week 1. Progression, once there's a prior week to compare against, applies identically to both the main and drop pairs — and, since v6.09, suggestions are computed **per set** rather than uniformly from set 1 (see §12 Progression data). See §12 for the full data model and UI.

This same weight-jump formula is shared by the Plan page's progression preview and the Train page's live recommendations, so both always agree.

### Deload weight rounding
```js
function roundToIncrement(weight, increment) {
  return Math.round(weight / increment) * increment;
}
```
Used specifically for deload weeks: `roundToIncrement(lastLoggedWeight * 0.6, weightJump)` — 60% of whatever was actually logged last time, rounded to the exercise's own applicable increment (the same value normal progression would add). See §12 Deload Logic for the full session-level behaviour.

---

## 21. Barcode Scanner

The scanner uses a two-tier strategy selected at runtime:

**Tier 1 — Native `BarcodeDetector`**
```js
function _getNativeDetector() {
  if (_nativeDetector) return _nativeDetector;
  if ('BarcodeDetector' in window) {
    _nativeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
  }
  return _nativeDetector;
}
```

**Tier 2 — ZXing JS fallback**
```js
function _initZxReader() {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [...]);
  const reader = new ZXing.MultiFormatReader();
  reader.setHints(hints);
  return reader;
}
```

`startScannerCamera(ctx)` requests camera via `getUserMedia({ video: { facingMode: 'environment' } })`, streams to a `<video>` element, draws frames to a `<canvas>`, and runs detection on each frame. `ctx` is `'nutr'` or `'recipe'` to direct the result to the correct flow.

`_onScannerDetected(ctx, code)` halts the scan loop and feeds the barcode to the Open Food Facts lookup.

On detection: viewfinder corners flash white via CSS class, the device vibrates (`navigator.vibrate(200)`), and the product lookup modal opens.

This entire module was deliberately left untouched during the 2026 audit pass — it's a working, self-contained subsystem, and none of the bugs found elsewhere in the app touched it.

---

## 22. External APIs

**Open Food Facts** — barcode product lookup:
```
GET https://world.openfoodfacts.org/api/v0/product/{barcode}.json
```
Returns `product.product_name`, `product.brands`, and `product.nutriments` (energy-kcal_100g, proteins_100g, carbohydrates_100g, fat_100g). All values are stored per-100g internally.

**Google Fonts** — Inter font family loaded via `<link>` in `<head>`. Requires network on first load; cached by the browser thereafter.

---

## 23. Function Reference

Not exhaustive — covers the functions most useful to know when working on the codebase. See each module's section above for fuller context.

### Navigation
| Function | Description |
|---|---|
| `showScreen(name)` | Activates the named screen, calls its render function, re-positions nav pill |
| `positionNavPill()` | Reads active `.nav-btn` rect, sets `#nav-pill` left/width |
| `getPageHeroColors(name)` | DOM probe to read `--hero-1`/`--hero-2` for the named page |
| `openModal(id)` | Adds `.open` to the named modal overlay; special-cases a few modals that need fresh state on every open |
| `closeModal(id)` | Removes `.open`, stops camera if applicable; also special-cases `modal-nutr-add` to auto-return to `modal-recipe-ingredients` in recipe context (v6.12, §9) |
| `initModal(overlayEl)` | Attaches swipe-down-to-close and tap-outside-to-close to a modal overlay |
| `showConfirm(title, msg, okLabel, callback)` | Generic two-button confirm dialog; also reused as a plain alert |

### Home (new in v7.31 — see §30)
| Function | Description |
|---|---|
| `renderHome()` | Top-level render — calls each section renderer below |
| `renderHomeHero()` | Weekly kcal/protein/carbs/steps vs. target, with badges and conditional sublabels |
| `getHomeWeekStart(dateStr)` / `getHomeIsoDow(dateStr)` | DST-safe Monday-of-week / ISO day-of-week helpers |
| `getHomeMetricTolerance(field)` / `getHomeMetricBadge(field, avg, target)` / `getHomeMetricSublabel(...)` | Badge polarity + adjustment-needed sublabel logic |
| `renderHomeGoalBanner()` | Upcoming-goal heads-up, gated on a genuine target change within 6 days |
| `goToPlanAndFlashGoal(macroGoalID)` | Switches to the goal's macro, navigates to Plan, flashes its row |
| `renderHomeLogBoxes()` | Inline weight/steps/measurements boxes — weight/steps daily, measurements on a 4-day cycle (v7.53) |
| `saveHomeWeight()` / `saveHomeSteps()` | Save today's weight/steps from their inline boxes; no modal to close as of v7.53 |
| `saveHomeMeasurements()` / `setHomeMeasUnit(unit)` / `setHomeFrac(field, val)` | Inline waist/hip box's save + unit/fraction toggles, own state separate from §13's |
| `initHomeMeasBox()` | Sets the measurements box's unit toggle and resets fraction pickers after each render (v7.53) |
| `renderHomeFoodPreview()` | Today's planned food, ordered by first meal appearance |
| `renderHomeTrainPreview()` | Next incomplete session preview, name + sets × reps × suggested weight |
| `renderHomeEditLogsLink()` / `openTodaysBodyLogModal()` | "Edit today's logs" → Settings → Body logs → today's entry |
| `getAllMacroSessions(macro)` / `getNextIncompleteSession(macro)` | Shared with Train (§12) — the single source of truth for "what's next" |

### Progress
| Function | Description |
|---|---|
| `renderProgressHero()` / `renderProgressHeroDots()` / `initProgressHeroSwipe()` | The 5-slide hero swipe deck |
| `insightsAnimateTo(idx)` / `initInsightsSwipe()` | 3-card "Insights" swipe deck (Progress/Metabolism/Next cycle), pre-dates v6.12 |
| `buildWeeklySummaryCardHTML()` | Weekly summary table (weight delta, avg kcal/steps/protein) as an HTML string; weight delta is this-week-average vs last-week-average (v6.12, was single-day-to-single-day before). Swing column removed in v7.28 — moved to `buildWeeklySwingsCardHTML()` |
| `buildWeeklySwingsCardHTML()` | Weekly swing table (smallest/largest day-to-day change) as an HTML string, one column each for weight/kcal/steps/protein — its own card as of v7.28 (previously weight-only, embedded in the summary table); values use locale thousand-separators |
| `buildMeasurementsCardHTML()` | Weekly waist/hip table as an HTML string, only including weeks with a measurement logged (v6.12) |
| `renderProgressTables()` / `progressTablesAnimateTo(idx)` / `initProgressTablesSwipe()` | Swipe deck holding the three table cards above (v6.12; expanded from 2 to 3 cards in v7.28) |
| `renderProgressCycleGoals()` | Small row summaries of every goal period belonging to the resolved cycle, ordered by start date; green accent for the active goal, red accent + "Next up: starting in N days"/"starting `<Weekday>`" subtitle for the next upcoming one (v7.28) |
| `computeWeeklyInsights(macro)` | Deterministic insights engine — per-week stats, baseline anchor, plateau detection, drift, goalType-branched signal/headline/detail (v7.00) |
| `buildInsightsCardHTML()` | Phase 1 deterministic card HTML — signal pill, narrative, stat tiles, drift visualisation (v7.00). As of v7.28, nests inside Insights-deck card 1 (below the weight header, above the peak-window callout) rather than rendering as its own standalone card below the deck — returns a bordered inner fragment, not a `.card`-wrapped one |
| `updateInsightsRollup()` | Archives newly-completed macrocycles to `state.insightsRollup.completedCycles`; called on every Progress render (v7.00) |
| `computeSafetyFloor(macro)` | Minimum safe kcal for aggressive AI recommendations — log-based BMR × 0.80, fallback to best-loss-week − 175 (v7.00) |
| `buildBlocAdvicePrompt(macro)` | Builds `{ systemPrompt, userMessage }` for the Anthropic API — injects safety floor, protein minimum, weekly bucket table with partial-week flags, prior advice, rollup history (v7.00) |
| `askBlocForAdvice()` | Async — makes the Anthropic API POST, validates response, materialises dates, computes `nextCheckIn`, stores to `state.blocAdvice` (v7.00) |
| `buildAiAdviceCardHTML()` | Phase 2 AI advice card — loading/cooldown/idle button states, stored advice with collapsible narrative and pre/post-choice plan layout (v7.00) |
| `condenseBlocAdvicePlans(response)` | Compact kcal/protein/carbs-per-step progression string for each path — building block for both the prior-advice prompt context and the Accept-a-challenge "originally recommended" note (v7.22) |
| `condenseBlocAdviceEntry(stored)` | Condenses a full `state.blocAdvice`-shaped object into one prior-check-in history entry, folding in `revisionInfo` (original-vs-revised + acknowledgment) when present (v7.22) |
| `formatPriorAdviceEntry(entry, idx)` | Renders one condensed history entry as a prompt-ready line (v7.22) |
| `buildBlocChallengePrompt(macro, challengeText)` | Rebuilds the base prompt fresh, appends the extended challenge schema (`acknowledgment` + `isSignificantRevision`), returns `{ systemPrompt, messages }` for a 3-turn call (v7.22) |
| `askBlocForChallenge(challengeText)` | Async — sends the one-shot challenge; `conversation.replyUsed` is set before the fetch starts; stores the validated result into `conversation.pendingRevision`, not `response` (v7.22) |
| `goalStepDiffRowHTML(origGoal, revGoal, idx)` / `buildPlanDiffHTML(origPath, revPath, emoji)` | Diff-view rendering for the challenge preview — paired/removed/new step treatment (v7.22) |
| `buildBlocChallengePreviewHTML()` | Renders the challenge preview block — significance badge, acknowledgment, diffed plans, Accept/Decline pair (v7.22) |
| `acceptBlocChallenge()` / `declineBlocChallenge()` | Resolve a pending challenge — Accept branches on `isSignificantRevision` (headline/narrative kept + subtitle note, vs. swapped wholesale); Decline purges the revision untouched (v7.22–v7.24) |
| `getNextMonday()` | ISO date string of next Monday (or today if Monday) — used as goal start anchor |
| `getSundayAfterWeeks(startDateStr, weeks)` | Sunday end date N weeks after a given start date |
| `getMondayAfter(sundayStr)` | Monday immediately after a given Sunday |
| `getNextSundayInclusive(dateStr)` | Sunday on or after a given date (if today is Sunday, returns today) |
| `getPrecedingSunday(dateStr)` | Most recent Sunday on or before a given date |
| `materialiseDates(goals, macro)` | Resolves LLM goal start/end dates (uses provided dates, falls back to sequential Mon–Sun), back-calculates fats |
| `startGoalQueue(pathKey)` | Launches goal queue — records chosenPath, deletes upcoming cycle goals, builds truncation + LLM steps, calls `_launchGoalQueue` |
| `_openQueueStep(idx)` | Opens goal modal for queue step — truncation uses edit mode (`_editIdx` set before `openModal`), new goals use reset mode with field override after |
| `saveGoalAndAdvanceQueue()` | Saves current queue step (with macro preservation for truncation), advances to next step or completes |
| `cancelGoalQueue()` | Aborts queue, resets all queue state and modal chrome |
| `_resetGoalModal()` | Restores goal modal to default "New Goal Period" state |

### Macrocycle / Plan
| Function | Description |
|---|---|
| `saveMacro()` | Creates or updates a macrocycle from modal inputs; `sessionsPerWeek` is calculated from `days.length`, not read from an input |
| `deleteMacrocycle(id)` / `copyMacrocycle(id)` | Delete, or deep-clone to a new id/start date |
| `getMacroSessionDayKeys(macro)` | Every `day(+microKey)` combination in the cycle |
| `updateSessionsPerWeekPreview()` | Live-updates the read-only sessions-per-week preview in the New Macrocycle modal as the split is built |
| `togglePlanDaySession(macroId, dayKey)` | Expand/collapse a Week-1 template session card |
| `renameDaySessionStart(macroId, day, spanId, currentLabel)` | Tap-to-rename a session's display label |
| `togglePlanSession(macroId, sessionKey)` | Expand/collapse a Weeks-2+ progression preview session card |
| `reorderExercise(day, fromSortedIdx, toSortedIdx)` | Drag-to-reorder, treating superset groups as one slot |
| `reorderSupersetExercise(day, supersetId, fromInnerIdx, toInnerIdx)` | Reorder within a superset group |
| `unlinkSuperset(day, ssId)` / `deleteSupersetGroup(day, ssId)` | Dissolve a group, or delete every exercise in it |
| `renameSupersetStart(ssId, currentName)` | Tap-to-rename a superset group |
| `openLinkModal(day, exId)` | Link/unlink superset members; excludes drop-set exercises entirely (§12) |
| `computeBodyPartVolumeRange(macro)` / `renderBodyPartVolumeTable(macro)` | Cycle-wide min/max volume per body part |
| `getSessionVolume(macro, week, dayKey)` | Total logged volume for one session/week, respecting per-side tracking and drop-set drop volume |
| `updateLastLoggedPreview()` | Refreshes the exercise modal's "Last logged" reference note from `state.exerciseHistory` |
| `applyExerciseHistoryDefaults()` | Prefills reps/weight/tracking-mode defaults from history when adding a new exercise (never when editing) |
| `setDropsetOptionEnabled(enabled)` | Enables/disables the Drop Set option in the type dropdown (disabled in superset contexts) |

### Training
| Function | Description |
|---|---|
| `exProgData(ex)` | Full progression data object for one exercise in the current week — scalar set-1-based fields plus (v6.09) per-set `weightPlaceholders`/`repsPlaceholders`/`dropWeightPlaceholders`/`dropRepsPlaceholders` arrays, deload overrides, and (for drop sets) the parallel drop-weight/drop-reps fields |
| `getWeekWeight(ex, week, progType, goalType, weightIncrement)` | Theoretical target weight for a given week |
| `getWeekReps(ex, week, progType)` | Theoretical target reps for a given week — works for drop sets too since v6.09 (`ex.reps` now holds a real main-set target) |
| `getGiantSetProgression(ex, week)` | Giant-set/pause-set reps target (renamed from `getMyorepProgression` in v6.06) |
| `logSet(logKey, field, value)` | Updates a single set field (`weight`/`reps`/`dropWeight`/`dropReps`) in `state.trainLogs` |
| `toggleSetDone(logKey)` | Flips a set's done state; resolves the exercise itself from the key to determine drop-set validation and record history; red-flashes any missing required field |
| `fillSuggested(macroId, week, day, exId, sets, weightList, repsList)` | Fills every set with its own per-set suggestion (v6.09; `weightList`/`repsList` are `'|'`-delimited, previously a single flat value for all sets) |
| `fillSuggestedDropset(macroId, week, day, exId, sets, weightList, repsList, dropWeightList)` | Drop-set equivalent — as of v6.09 also fills main reps (previously never did); still never fills drop reps |
| `quickFillComplete(...)` / `quickFillCompleteSuperset(...)` | One-tap fill-and-complete from the collapsed card header; per-set lists since v6.09 |
| `quickFillCompleteDropset(...)` | Drop-set equivalent (new in v6.10) — fills every field including drop reps and marks every set done, unlike `fillSuggestedDropset()` |
| `getProgKey(macroId, week, day, exId)` | Key format for a progression-choice (weight vs reps) log entry |
| `selectProgType(...)` | Records which progression path was chosen for an exercise this week |
| `roundToIncrement(weight, increment)` | Rounds to the nearest multiple of increment — used for deload weight rounding |
| `isDeloadUnit(macro, week, dayKey)` | Whether a given week(+microcycle) unit is marked deload |
| `toggleDeloadWeek(macroId, week, dayKey)` | Marks/unmarks the deload flag for the currently-selected week+microcycle unit |
| `getPrevTrackUnit(macro, week, dayKey)` | Same-track (same dayKey) previous mesocycle unit — used for progression reversion |
| `getPrevCalendarWeek(macro, week, dayKey)` | True physical-time previous calendar week, crossing between M1/M2 — used only for the weeks-since-deload count |
| `getLastNonDeloadUnit(macro, week, dayKey)` | Walks back via `getPrevTrackUnit`, skipping deloads, to find the last genuine reference values |
| `isFirstUnitAfterDeload(macro, week, dayKey)` | Union of same-track and physical-calendar adjacency — true for the session(s) immediately following a deload |
| `getWeeksSinceLastDeload(macro, week, dayKey)` | Real elapsed calendar weeks since the last deload, for the hero callout |
| `recordExerciseHistory(macro, week, dayKey, ex)` | Snapshots weight/reps/sets/tracking-mode into `state.exerciseHistory`/`state.exerciseTrackingMode`; no-ops for deload sessions; always reads set index 0 regardless of which set was actually interacted with |
| `formatLastLoggedLine(type, entry)` | Formats one history entry into the modal's display line |
| `getSelectedTrainWeekDates(macro)` | Real calendar `{start, end}` for the currently-selected mesocycle+microcycle, fanned out from `macro.start` via the same `mesoSpanDays` math as `getMacroVolumeSeries()`; returns `null` if the macro has no start date (v7.28) |

### Body
| Function | Description |
|---|---|
| `openBodyProfile()` / `saveBodyProfile()` | Gender/height/birthday profile, used for BMR/TDEE |
| `openEditBodyLog(idx)` / `saveInlineBodyLog()` / `saveBodyLog()` / `deleteBodyLog(date)` | Body weight + steps + waist/hip log CRUD (waist/hip added v6.12) |
| `calcAge()` / `getActivityMultiplier()` / `calcMifflinBMR()` / `calcDynamicTDEE()` | BMR/TDEE calculation chain |
| `toggleBodyMonth(monthKey)` | Expands/collapses a month group in Recent Entries (new in v6.11) |
| `setMeasUnit(unit)` | Toggles the body log modal's waist/hip input between inches and cm; persists to `state.profile.measureUnit` (v6.12) |
| *(measurement reminder, v7.00)* | Inline logic in `renderBody()` — finds the most recent body log with `waist` or `hip` set; if ≥6 days have elapsed since that log and any measurements have ever been recorded, renders an amber pill into `#body-meas-reminder` ("X days since last measurements — tap to log") that opens `modal-body-log` on tap. Never appears if measurements have never been logged. |
| `setFrac(field, val)` | Sets the active quarter-inch fraction (0/¼/½/¾) for `waist` or `hip` in the inches input picker (v6.12) |
| `cmToIn(cm)` / `fmtInch(val)` | Cm→inch conversion for storage; smart decimal-trimmed display formatting (v6.12) |

### Nutrition
| Function | Description |
|---|---|
| `getDayTotals(date)` | Aggregates kcal/protein/carbs/fats for a date (meals, or quick-log override if present) |
| `nutrPickDate(dateStr)` / `nutrShiftDate(delta)` | Set current date via picker, or shift by swipe |
| `renderNutrDiary()` | Renders per-meal food log cards |
| `openMealMenu(meal)` / `saveMealAsRecipe()` | The `···` action sheet; save-as-recipe does not auto-log |
| `openNutrServingModal()` / `updateServingPreview()` / `confirmServing()` | Serving confirm modal flow; `confirmServing()` branches on `nutrAddContext` since v6.12 to add a recipe ingredient instead of a meal log entry when opened via the recipe builder's food library search |
| `saveManualEntry()` | Saves manual food entry; converts to per-100g for the library |
| `confirmCopyFoodEntry()` | Executes copy or move; handles both single-item and whole-meal |
| `copyMealFromYesterday(meal)` | Copies previous day's meal entries into current date |
| `deleteFoodEntry(date, meal, idx)` | Removes a food entry |
| `syncNutrLegacyLog(date)` | Recomputes and upserts `state.nutritionLogs` for a date — still actively called, not dead |
| `saveEditFoodEntry()` | Saves edit; direct macros for manual, per-100g calc for barcode |
| `makePie(p, c, f)` | Generates inline SVG macro pie chart |
| `fitListToKeyboard(wrapId)` | Shrinks a modal's scrollable list to stay above the keyboard |
| `openRecipeIngredientSearch(isReopen)` | Opens `modal-nutr-add` in recipe-ingredient mode (v6.12) — sets `nutrAddContext = 'recipe'`, hides the Recipes/Manual/Scan Barcode row |
| `quickAddFromList(idx)` | Quick-add from the search list at last-logged amount; branches on `nutrAddContext` since v6.12 (meal log vs recipe ingredient) |

### Sample Day Library (new in v7.25 — see §28)
| Function | Description |
|---|---|
| `dayWithinSaveTolerance(totals, goal)` | Whether today's logged totals are within `SAVE_DAY_TOLERANCE` of its own goal's targets — gates the save badge |
| `computeSimilarGoalRange(goal)` | Builds a group's stored min/max band from the originating goal ± `SIMILAR_GOAL_TOLERANCE`; `proteinMax` uses `Number.MAX_SAFE_INTEGER`, not `Infinity` (v7.30 fix, §3) |
| `rangeMax(value)` | Treats a `null`/`undefined` upper bound as unbounded at every range-comparison call site (v7.30) |
| `totalsWithinRange(totals, range)` | Whether a day's logged totals fall inside a group's band — used only at save time |
| `goalTargetsWithinRange(goal, range)` | Whether a goal's own targets (not a logged day) fall inside a group's band — used only for Fill Day discovery and the pill list, never for saving (v7.29) |
| `findSampleGroupForGoal(macroGoalID)` | The group formally linked to a goal (`linkedGoalIds.includes(...)`), or `null` |
| `findSampleGroupForTotals(totals)` | The first group whose band a day's totals fall inside — save-time linking |
| `findSampleGroupForFillDay(goal)` | Fill Day's group resolution: formally-linked first, else any group the goal's own targets currently match (v7.29) |
| `getEffectiveLinkedGoalIds(group)` | `linkedGoalIds` unioned with every currently-existing goal whose targets satisfy `goalTargetsWithinRange` right now — recomputed live, drives the pill list (v7.29) |
| `getOrCreateSampleGroup(goal, totals)` | Resolves or creates the group a newly-qualifying day should save into (totals-based) |
| `getDinnerRecipeItem(date)` | First `source === 'recipe'` item in that date's Dinner, or `null` |
| `isDateSavedInLibrary(date)` | Whether a date already exists in any group's `days[]` |
| `saveDayToLibrary()` | Saves the current date into its resolved/created group, guarding against a duplicate dinner name |
| `renderNutrSaveBadge()` | Renders the save button / nothing into `#nutr-save-badge-wrap` below the Nutrition hero (the "saved" pill itself lives inside the hero card, not here) |
| `openFillDayModal()` / `confirmFillDay(groupId, date)` / `fillDayFromSample(groupId, date)` | Fill Day flow — list saved days, confirm-overwrite if the target date has logs, then deep-clone the stored meals across |
| `maybePromptFillDinnerDay()` | Proactive Fill Day prompt on every Dinner entry when a match exists — fills from the most recent saved day on accept (v7.53) |
| `getGoalDisplayLabel(macroGoalID)` | `"<Macrocycle name> - <_blocLabel>"` for a goal, or `null` if it's since been deleted |
| `openProfileNutrition()` | Opens Settings → Nutrition → Sample libraries (`modal-profile-nutrition`) directly — `openProfilePage()` was removed in v7.52 along with the hidden Profile page it used to open |
| `renderProfileNutritionLibraries()` | Renders every group as a card — origin pill (bold/green) + effective-linked pills (subtle), saved days as swipeable rows |
| `openSampleDayEditor(groupId, date)` / `saveSampleDayEdit()` / `deleteSampleDayFromEditor()` / `deleteSampleDay(groupId, date)` | Edit a saved day's dinner label, view its logged meals read-only, or delete it (removes the whole group if it was the last day) |

### Barcode Scanner
| Function | Description |
|---|---|
| `startScannerCamera(ctx)` | Requests camera, starts scan loop; ctx = 'nutr' or 'recipe' |
| `stopScannerCamera(ctx)` | Stops camera stream and resets viewfinder UI |
| `closeScannerModal(ctx)` | Stops camera then closes modal |
| `_onScannerDetected(ctx, code)` | Handles detected barcode; feeds into lookup function |
| `_getNativeDetector()` | Lazy-inits BarcodeDetector; cached after first call |
| `_initZxReader()` | Creates a ZXing MultiFormatReader with hints |

### Food Library & Recipes
| Function | Description |
|---|---|
| `getLibrary()` | Merged built-in + custom exercise library |
| `openFoodLibraryEditor()` / `renderFoodLibEditor()` | Browsable food library modal |
| `openFoodLibEntry(idx)` / `saveFoodLibEntry()` / `deleteFoodLibEntry(idx)` | Library entry edit CRUD |
| `exportFoodLibrary()` / `importFoodLibrary(file)` | Food library backup/restore |
| `shareFoodLibItem(idx)` / `shareFoodLibItemByIdx(idx)` | Share a single food item (two entry points, different list contexts) |
| `openRecipeBuilder(editId?)` | Opens builder; pre-loads existing recipe if editId given |
| `saveRecipe()` | Saves recipe to state; upserts food library; lands on Recipe List |
| `deleteRecipe(id)` | Removes from `state.recipes` and `state.foodLibrary` |

### Goals (renders on Plan as of v7.40 — see §11/§15)
| Function | Description |
|---|---|
| `getActiveGoal()` | Goal covering today's date, any macro |
| `getGoalForDay(dateStr)` | Goal covering a given date, any macro (Nutrition) |
| `getGoalForDate(dateStr, macroId)` | Goal covering a date, scoped to one macro (Progress) |
| `findOverlappingGoal(startDate, endDate, excludeIdx)` | First existing goal whose range overlaps the given one |
| `saveGoal()` | Validates required fields + overlap, applies the macro-drift lock, upserts |
| `saveGoalAndAdvanceQueue()` | Queue-aware save — updates/pushes based on step type, advances or completes queue (v7.00) |
| `deleteGoal(macroGoalID)` | Removes a goal, renumbers remaining steps in its macro, refreshes Plan + Progress |
| `deleteGoalFromModal()` | Reads the goal id stashed on the goal modal's delete button, confirms, calls `deleteGoal()` |
| `initGoalMacroSliders(existingGoal)` | Sets initial slider positions; resets `userTouched` |
| `computeGoalMacroGrams()` | Reads current slider positions, returns `{proteinG, carbG, fatG}` |
| `renderPlanGoalsSection()` | Renders the current macro's goal list on Plan, replacing the retired `renderGoals()` (v7.40) |
| `togglePlanGoalsSection()` | Expands/collapses the Plan goals section |
| `maybePromptCreateGoal(macroId)` | Dismissible nudge to add a goal after saving a macrocycle with none linked (v7.40) |

### Plan / Macrocycle
| Function | Description |
|---|---|
| `onMacroGoalTypeChange(prefix)` | Fires on goalType select change — toggles weight-increment row visibility, re-validates pace warning (v7.00) |
| `validateMacroPace(prefix)` | Shows/hides inline pace warning below target BW field based on bodyweight-relative ceiling (v7.00) |
| `isMondayDateStr(dateStr)` | Whether a date string falls on a Monday — blocks `createMacrocycle()`/`saveEditMacro()` from saving otherwise (v7.28) |
| `snapToNextMonday(dateStr)` | Rolls a date forward to the next Monday (or returns it unchanged if already one) — used for `getNextMacroStart()`'s suggested default (v7.28) |

### Settings
| Function | Description |
|---|---|
| `setTheme(name)` | Updates `state.theme`, sets `data-theme` on `<body>`, saves |
| `setMode(mode)` | Updates `state.mode`, sets `data-mode` on `<body>`, saves |
| `exportData()` | Downloads full state as JSON |
| `getApiKey()` | Returns stored Anthropic API key from `localStorage` (`'bloc_api_key'`) or null (v7.00) |
| `saveApiKey()` | Writes or clears the API key from `localStorage`; never touches `state` (v7.00) |
| `importData(event)` | Restores state from a JSON file |
| `clearAllData()` | Resets tracked data to empty defaults (incl. `sampleDays` as of v7.31); preserves theme/mode |
| `exportLibrary()` | Downloads merged exercise library |
| `importExerciseLibrary(file)` | Merges exercise library from JSON |
| `openExerciseLibraryEditor()` / `renderExerciseLibEditor()` | Browsable exercise library modal (new in v6.10) — mirrors the food library editor |
| `openExerciseLibEntry(idx)` / `saveExerciseLibEntry()` / `deleteExerciseLibEntry(idx)` | Custom exercise library entry edit CRUD; no-ops for built-in (default) entries |
| `toggleSettingsCard(key)` | Expands/collapses one of the Settings screen's Profile/Nutrition/Exercise/Danger Zone cards (v7.52) |

### Rest Timer
| Function | Description |
|---|---|
| `openTimerModal()` | Opens timer, initialises pickers on first open |
| `closeTimerModal()` | Closes modal, resets all timer state |
| `setTimerMode(mode)` | Switches between countdown and stopwatch |
| `buildPicker(...)` | Constructs a drum-scroll picker element |
| `countdownStart()` | Starts, pauses, or resumes countdown |
| `countdownReset()` | Stops and resets to picker view |
| `swToggle()` | Starts, pauses, or resumes stopwatch |
| `swReset()` | Stops and resets stopwatch |
| `playBeep()` | Three-tone alert via Web Audio API |
| `updateTimerIcon()` | Updates clock icon colour |

### Utilities
| Function | Description |
|---|---|
| `getLocalToday()` | Returns `'YYYY-MM-DD'` in local timezone |
| `toLocalDateStr(date)` | Converts a Date object to `'YYYY-MM-DD'` in local timezone |
| `formatDate(str)` | Returns human-readable date string |
| `fmtK(n)` | Formats number as `'1.2k'` above 1000, else plain |
| `parseRepsForVolume(repsVal)` | Parses a reps value/range to a single number for volume math (lower bound of a range) |
| `initSwipeRows(containerEl)` | Attaches swipe-left gesture to every row in a container |

### iOS Viewport & Keyboard
| Function | Description |
|---|---|
| `measureEnv(prop)` | DOM probe to read CSS `env()` values as numbers, bypassing WebKit's stale-variable bug |
| `setAppHeight()` | Sets `--app-height` from `visualViewport.height`; skips update when keyboard is open to keep layout at full height |
| `setSafeAreaVars()` | Sets `--safe-bottom` and `--safe-top` CSS vars from probed values |
| `positionNavDirect()` | Sets `nav.style.bottom` directly in pixels to avoid CSS repaint-lag on `calc()` with custom properties |
| `isKeyboardOpen()` | Returns `true` when `visualViewport.height < screen.height * 0.75`; reliable in iOS standalone where `innerHeight` also shrinks with keyboard |
| `handleKeyboard()` | Hides nav, extends `#content` scroll range, and scrolls focused set/rep input to centre of visible area above keyboard |
| `fitListToKeyboard(wrapId)` | Shrinks a specific modal list's height to clear the keyboard (Nutrition add-food and food library editor) |
| `measureAll()` | Calls `setAppHeight`, `setSafeAreaVars`, `positionNavDirect` — run on every `visualViewport.resize` and at boot |

---

## 24. Key Algorithms

### Local Date Handling

All date operations use `toLocalDateStr()` or `getLocalToday()` to avoid UTC offset bugs. This was a persistent issue in earlier versions where `date.toISOString()` would return the previous day for UK users in BST.

```js
function getLocalToday() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function toLocalDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
```

Date comparisons use string comparison (`a.date.localeCompare(b.date)` or plain `<=`/`>=`), which is valid for ISO 8601 strings — this is exactly what `findOverlappingGoal()` and `getGoalForDay()`/`getGoalForDate()` rely on. Date cutoffs use `new Date(getLocalToday() + 'T00:00:00')` for local-midnight anchoring.

### Volume Calculation

The shared formula behind `getSessionVolume()` and the body-part volume table:

```
per-set volume = sets × reps × weight × (trackingMode === 'perSide' ? 2 : 1)
```

`reps` is resolved via `parseRepsForVolume()`, which takes the lower bound of a range (e.g. "8-10" → 8) for theoretical/target calculations, or the actual logged value for real session volume. The per-side multiplier exists because a per-side-tracked exercise's logged weight is only one side's load — doubling it reflects true total load moved, and every volume calculation in the app must apply it consistently (this was previously a source of a real bug — see §12).

### Body Weight Cycle Progress (Plan Screen)

```
startBw     = earliest body log on or after macro.start
current     = most recent body log (any date)
totalNeeded = |startBw - target|
achieved    = |startBw - current|
bwPct       = clamp(0, 100, round(achieved / totalNeeded * 100))
```

### Serving Size Calculation

All serving calculations use per-100g values:

```js
const total = grams * servings;
const per1  = per100 / 100;
kcal        = Math.round(per1 * total);
```

### Swipe-to-Copy Animation (Yesterday Strip)

```
onMove(clientX):
  currentX = max(0, clientX - startX)
  pct      = min(100, currentX / elementWidth * 100)
  fill.width  = pct%
  text.translateX = min(currentX * 0.4, 30)px
  fill.opacity = 0.08 + (pct/100 * 0.22)

onEnd():
  if currentX >= elementWidth / 3:
    animate to completion → copyMealFromYesterday()
  else:
    snap back
```

### Progress Hero Fixed Height

To prevent the swipeable deck from changing height as the user swipes between slides of different content lengths:

```js
// After rendering slide 0:
wrap.style.removeProperty('--hero-fixed-h');  // don't trust a stale prior value
const h = card.getBoundingClientRect().height;
document.getElementById('progress-hero-wrap').style.setProperty('--hero-fixed-h', h + 'px');
// All subsequent slides use min-height: var(--hero-fixed-h)
```

### Goal Overlap Detection

```js
function findOverlappingGoal(startDate, endDate, excludeIdx) {
  return (state.goals || []).find((g, i) =>
    i !== excludeIdx && g.startDate <= endDate && g.endDate >= startDate
  ) || null;
}
```

Standard interval-overlap test (`aStart <= bEnd && aEnd >= bStart`), applied across every goal regardless of macrocycle. `excludeIdx` skips the goal currently being edited so saving without changing its dates doesn't flag itself.

### Macrocycle Monday-Start Snap/Validate (v7.28)

```js
function isMondayDateStr(dateStr) {
  return !!dateStr && new Date(dateStr + 'T00:00:00').getDay() === 1;
}
function snapToNextMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun..6=Sat
  const add = dow === 1 ? 0 : dow === 0 ? 1 : (8 - dow);
  d.setDate(d.getDate() + add);
  return toLocalDateStr(d);
}
```

`snapToNextMonday`'s offset table: Monday stays put (`+0`); Sunday rolls forward one day (`+1`); every other weekday rolls forward `8 - dow` days (Tuesday `+6` … Saturday `+2`) — i.e. always the *next* Monday, never the same-week one behind it. Verified against a full week of inputs before shipping. `isMondayDateStr` is the blocking check in `createMacrocycle()`/`saveEditMacro()`; `snapToNextMonday` only shapes the *suggested* default in `getNextMacroStart()`, so it never silently overrides what someone actually typed.

### "Next Up" Goal Countdown Switch Point (Progress, v7.28)

```js
const daysUntil = Math.round((startDateObj - todayDate) / 86400000);
const switchDate = new Date(startDateObj); switchDate.setDate(switchDate.getDate() - 6);
if (today < toLocalDateStr(switchDate)) {
  // "Next up: starting in N days"
} else {
  // "Next up: starting <Weekday>" — startDateObj's actual weekday, computed live
}
```

The switch point is a real *date* (`start − 6 days`), not a day-count threshold compared directly — this matters at the boundary: a goal starting Monday shows the plain day-count through the Monday one week prior (`daysUntil === 7`), then switches to the fixed weekday from the Tuesday immediately after that (`daysUntil === 6`) onward. Deriving it from a subtracted date rather than `daysUntil <= 6` produces the identical result but was chosen because it reads directly as "the Tuesday before start" — the exact framing the feature was specified against — rather than a day-count that happens to be equivalent.

### "Last Week" Progression Inference (Train)

When no progression path was explicitly chosen for the previous week:

```
if last week's weight > the week before it (or ex.startWeight, if last week was week 1):
  infer "weight"
else if last week's reps > the week before it (same fallback):
  infer "reps"
else:
  "no progression" — don't guess
```

Deliberately not a blanket default to "weight" — that produced false positives for sessions where nothing had actually changed.

### Per-Set Progression Suggestions (Train, v6.09)

Prior to v6.09, every set's suggested weight/reps came from a single exercise-wide figure derived from set 1 — so if you had to drop the weight partway through a session (set 4 couldn't sustain the same load as sets 1-3), that adjustment was invisible to next mesocycle's suggestions. As of v6.09, each set's suggestion is computed independently, from that same set number the previous time this exercise was trained:

```
for each set index s in the current week (0-based):
  srcSet = (s < prevWeekSetCount) ? prevWeek.sets[s] : prevWeek.sets[last]
  // ^ a newly-added set (no matching index last time) inherits the
  //   previous week's FINAL set's suggestion, rather than being blank

  if progType === 'weight':
    suggestion[s].weight = srcSet.weight + weightJump
    suggestion[s].reps   = srcSet.reps            // unchanged
  else: // progType === 'reps'
    suggestion[s].weight = srcSet.weight          // unchanged
    suggestion[s].reps   = srcSet.reps + 1 (or +10 for giant sets)
```

Applied identically to `weightPlaceholders`/`repsPlaceholders` (main) and `dropWeightPlaceholders`/`dropRepsPlaceholders` (drop-set only) — see §12 Progression data. Deload and post-deload sessions are unaffected — they still use one flat reference for the whole exercise, since there's no per-set progression decision being made on those weeks anyway.

---

## 25. Module: AI Advice (Phase 1–3)

Added in v7.00. The Progress page now includes two additional cards below the existing Insights swipe deck, rendered into dedicated DOM anchors `#progress-trend-insights` and `#progress-ai-advice`. Phase 3 (challenge/revise the advice mid-conversation) added in v7.22–v7.24.

### Phase 1 — Deterministic insights layer

**`buildDayMap()`** was extended to include a `carbs` field alongside `kcal` and `protein`, populated from both `nutritionLogs` and `nutritionMeals`. This feeds the insights engine and the historical rollup.

**`computeWeeklyInsights(macro)`** — the core deterministic engine. Pure computation, no DOM writes. Reuses `buildDayMap()` and `calcDynamicTDEE()`. Returns per-week stats (avgWeight, delta, avgKcal, avgProtein, avgCarbs, nutrDayCount, bStart, bEnd) plus derived signals:

- **Baseline anchor (loss cycles only):** weeks 1–2 of a cut often show inflated drops (glycogen/digestive clearance). If a week's weight delta is below −2% of bodyweight per week it is considered anomalously fast, and the baseline slides forward (capped at weeks 3–4). On gain and maintenance cycles, the baseline is always week 1.
- **Valid week threshold:** ≥4 days with nutrition logged.
- **Plateau detection (loss only):** ≤0.5 lbs/week average delta for 2+ consecutive buckets. Threshold is 0.5 (not 0.3) — a tighter value would break real plateau detection when a single week comes in at e.g. −0.34 lbs.
- **Caloric drift:** recent 2-week avg kcal minus baseline 2-week avg kcal.
- **Signal (goalType-branched):** one of `plateau-creep`, `plateau-adaptation`, `drift-warning`, `on-track` (loss); `gain-deficit`, `gain-undereating`, `gain-excess`, `on-track` (gain); `maint-stable`, `maint-unstable`, `maint-nodata` (maintenance). The signal drives both the Phase 1 card's pill colour/headline and the Phase 2 button's eligibility.

**`buildInsightsCardHTML()`** renders the signal pill, headline, detail narrative, goalType-specific stat tiles, and (for loss cycles with meaningful drift) a three-column drift visualisation showing baseline avg, delta arrow, and recent avg. Shows a "available in ~N more weeks" empty state when `insufficientData` is true.

**Schedule-status pill (Phase 0 audit, v7.00):** `buildActiveCycleHeroSlideHtml` was audited for direction-awareness across all three goal types. The pill now has a dedicated maintenance branch: success = staying within ±2 lbs of target (green), 2–5 lbs off (amber), >5 lbs off (red). Loss and gain cycle pill logic is unchanged. The unrealistic-pace flag (`validateMacroPace`) guards against the pill showing permanently red for a cycle whose target implies a physiologically implausible rate.

### Historical rollup

**`state.insightsRollup`** — stored in state, loaded with a `{ completedCycles: [] }` default.

**`updateInsightsRollup()`** — called on every Progress render. Detects macrocycles whose end date is past and archives any not yet recorded. Each `CycleRollup` entry:

```js
{
  id, name, goalType, start, end, weeks,
  startBw, endBw, targetBw,
  startWaist, endWaist, startHip, endHip,   // first/last logged measurements within the cycle
  avgKcal, avgProtein, avgCarbs,
  plateauWeeksDetected,
  signals,    // array of signal strings detected during the cycle
}
```

Capped at the last 10 completed cycles. Entries are written once and frozen — no recomputation on subsequent renders. Serves as the LLM's long-run context in Phase 2 API calls.

### Phase 2 — AI advice layer

**Eligibility signals:** only intervention-warranting signals show the button — `plateau-creep`, `plateau-adaptation`, `gain-deficit`, `gain-undereating`, `gain-excess`, `maint-unstable`. `drift-warning` is informational only and does not trigger the button.

**`computeSafetyFloor(macro)`** — computes the minimum safe kcal for aggressive recommendations:
- Primary: `calcDynamicTDEE().bmr × 0.80` (log-based BMR, not Mifflin-St Jeor — more accurate for someone actively tracking).
- Fallback (no log-based TDEE available): best single week with ≥1 lb loss, `avgKcal − 175`. Hard minimum 1,400 kcal.

**`buildBlocAdvicePrompt(macro)`** — constructs the system prompt and user message sent to the API. All constraints are computed client-side and injected as hard rules:
- Safety floor kcal (from `computeSafetyFloor`)
- Protein minimum: `Math.ceil(latestBw)` — 1g per lb of current bodyweight, rounded up
- Next Monday date (goal start anchor)
- Cycle end date (LLM warned to note if plan extends past it)
- Full weekly bucket table with partial-week flag: any bucket whose `bEnd` is ≥ today is marked `[IN PROGRESS — N of 7 days logged so far, averages are provisional]`
- Prior advice this cycle (signal, plans, which was chosen)
- Completed cycle history from `state.insightsRollup`

**`askBlocForAdvice()`** — async, makes a real POST to `https://api.anthropic.com/v1/messages` using the stored API key. Requires the `anthropic-dangerous-direct-browser-access: true` header for CORS (the API is designed for server-to-server use; this header opts into direct browser access for user-supplied-key scenarios). Model: `claude-sonnet-4-6`. Max tokens: 8,000.

On success:
1. Parses and validates the JSON response (required fields: `signal`, `headline`, `narrative`, `recommendations.sustainable.goals`, `recommendations.aggressive.goals`)
2. Runs `materialiseDates()` on both goal paths (resolves any missing startDate/endDate, back-calculates fats as `round((kcal - protein×4 - carbs×4) / 9)`)
3. Computes `nextCheckIn` client-side: always 2 weeks from today (not end-of-plan), rounded to the next Monday. A 16-day guard in `buildAiAdviceCardHTML` catches any stale `nextCheckIn` values stored before this change and caps them at `storedAt + 14 days`.
4. Stores to `state.blocAdvice = { response, storedAt, macroId, chosenPath: null }`

On error: resets `_blocAdviceLoading`, re-renders (so the button restores), shows a 6-second inline error message. **Does not touch `state.blocAdvice` or the cooldown** — a failed call never starts a cooldown.

**`_blocAdviceLoading`** — module-level boolean, not in state. True during the in-flight API call. `buildAiAdviceCardHTML()` reads this to render "✦ BLOC is thinking…" instead of the button.

**`state.blocAdvice`** shape:
```js
{
  response: {
    signal, headline, narrative, primaryAction, secondaryAction,
    recommendations: {
      sustainable: { label, rationale, summary, goals: [...] },
      aggressive:  { label, rationale, summary, goals: [...] },
    },
    nextCheckIn: { sustainable: 'YYYY-MM-DD', aggressive: 'YYYY-MM-DD' },
    _cycleEnd, _sustainableExceedsCycle, _aggressiveExceedsCycle,
    _revisionNote,   // v7.22+ — set only after an accepted MINOR challenge revision; the
                     // acknowledgment text, rendered as an italic subtitle. null otherwise.
  },
  storedAt:    'YYYY-MM-DD',
  macroId:     string,
  chosenPath:  null | 'sustainable' | 'aggressive',
  chosenAt:    'YYYY-MM-DD' | null,               // v7.22+ — when chosenPath was set, for prior-advice history
  conversation: { replyUsed: boolean, pendingRevision: object | null },  // v7.22+ — see Phase 3 below
  priorAdviceThisCycle: [ /* condensed check-in entries, same macro only */ ],  // v7.22+
  revisionInfo: { originalSummary, acknowledgment } | null,  // v7.22+ — set on Accept, read by the next check-in's history
}
```

**Collapse state (reworked in v7.15):** the narrative, selected-plan, and unchosen-plan sections were originally three independently-collapsible blocks, with `narrativeOpen`/`altOpen` persisted onto `state.blocAdvice` itself. As of v7.15 all three (narrative/selected/alt) collapse via a single module-level `_blocAdviceSectionsOpen = { narrative: false, selected: false, alt: false }`, deliberately **not** persisted — every fresh page load resets to collapsed, rather than the old behaviour of remembering whatever was open last session. The previously-always-visible "Selected plan" section became collapsible at the same time, defaulting closed like the other two.

**`buildAiAdviceCardHTML()`** — renders three distinct states:

1. **No stored advice / not enough data:** returns `''` (no card)
2. **Eligible, idle:** "✦ Ask BLOC for advice" button. Disabled with amber note if no API key. Shows safety floor and protein minimum below.
3. **In-flight:** "✦ BLOC is thinking…" non-interactive tile.
4. **Cooldown:** "✦ Next check-in: [date]" non-interactive tile. Date from `nextCheckIn[chosenPath]`; if no plan chosen, uses the earlier of the two dates. Stale values (>16 days from `storedAt`) are capped at `storedAt + 14 days`.
5. **Stored advice rendered:** headline (collapsible via ▲/▼ toggle on the headline row), full narrative paragraphs, primary/secondary action pills, plan section.

**Plan section layout:**
- **Pre-choice:** both Sustainable (🌱) and Aggressive (⚡) plans shown with their goal breakdowns and "Use [X] plan →" buttons.
- **Post-choice:** selected plan shown under a "Selected plan" label. Unchosen plan collapsed behind "View alternative plan" toggle (default closed). A "Switch to [X] plan" button in the unchosen plan section lets the user change their choice.

**`goalSummaryBlock(path, pathKey)`** — inner function that renders each plan's goal steps. Cross-references `state.goals` by `_blocLabel` first (reliable direct key match) then falls back to date proximity (for goals saved before label tracking). Weeks are computed from actual `startDate`/`endDate` rather than any stored `weeks` field (which may be null for LLM-generated goals). The exceed-cycle warning is recomputed dynamically each render from actual displayed dates — disappears automatically once goals are edited to fit within the cycle.

### Phase 3 — Challenge this advice (v7.22–v7.24)

A single-reply, single-shot follow-up on the mid-cycle advice feature only (`state.nextCycleAdvice`'s Phase 4 second opinion is untouched — see §27). No cross-cycle history: everything below is scoped to the active macro and wiped the moment `state.blocAdvice.macroId` no longer matches it.

**`conversation`** on `state.blocAdvice`: `{ replyUsed, pendingRevision }`. `replyUsed` flips to `true` the instant a challenge is sent — win, lose, or API error — and never resets except on a brand-new ask for the same or a different macro. `pendingRevision` holds the parsed, validated candidate response while awaiting Accept/Decline; `null` otherwise.

**`buildBlocChallengePrompt(macro, challengeText)`** — does **not** store the original prompt anywhere; rebuilds it fresh via `buildBlocAdvicePrompt(macro)` every time (cheap, deterministic, guarantees the challenge sees current logged data). Appends an extended-schema instruction to the base system prompt and sends a 3-message array: the original user prompt, the current stored response (as a fabricated assistant turn, minus internal fields like `_cycleEnd`), then the challenge text as a new user turn.

**Extended schema** — same `recommendations.sustainable`/`.aggressive` shape as the normal advice response (both paths always fully present, regardless of whether a path was already chosen), plus two new top-level fields:
- **`acknowledgment`** — 1-2 sentences, either admitting a mistake or defending the original call. Deliberately its own field (not prepended into `narrative`) so it can be stripped/displayed independently without string-parsing.
- **`isSignificantRevision`** (boolean, **required** — validated with `typeof === 'boolean'`, same strictness as the other required fields) — the model's own judgment on whether this revision changes its fundamental read of the situation (e.g. refeed recommendation → steeper cut) versus a minor correction within the same overall approach (one field tightened, a data error fixed). The prompt explicitly ties this to what the UI will do with it: **false → the original headline/narrative stay visible**, so the model is told to only mark `true` when leaving the old narrative up would be actively misleading next to the new plans.

**`askBlocForChallenge(challengeText)`** — mirrors `askBlocForAdvice()`'s fetch/parse/validate/error pattern. Sets `conversation.replyUsed = true` and closes the input **before** the fetch even starts — the one-shot is spent the moment it's sent, regardless of outcome. On success, materialises dates and computes `nextCheckIn`/cycle-exceed flags exactly like a normal response (so an accepted revision is indistinguishable to `startGoalQueue()` from a first-time response), then stores into `conversation.pendingRevision` — **not** into `response`, which stays untouched until Accept.

**Diff rendering** — `buildPlanDiffHTML(origPath, revPath, emoji)` walks both goal arrays index-by-index via `goalStepDiffRowHTML(origGoal, revGoal, idx)`: paired steps render the original normally, then the revised step directly below it (accent background, left border, down-arrow, including 👟 steps alongside kcal/protein/carbs). Uneven lengths: extra original steps get a "✕ Step removed" marker; extra revised steps get a "＋ New step" treatment with the same styling, just nothing paired above them. Applies to both plans always.

**`buildBlocChallengePreviewHTML()`** — renders the preview shown *in addition to* (not replacing) the current stored advice: a "⚠ Significant change" / "Minor correction" badge (read straight from `isSignificantRevision`, before any Accept decision), the acknowledgment, the first narrative paragraph, both diffed plans, then the single Accept/Decline pair — positioned before the "Use plan" buttons in the card template, not per-plan.

**`declineBlocChallenge()`** — sets `conversation.pendingRevision = null`. The original response is untouched; the challenge affordance does not reappear (`replyUsed` stays `true`).

**`acceptBlocChallenge()`** — branches on `isSignificantRevision`:
- **Minor (`false`)** — keeps `response.headline`/`narrative`/`primaryAction`/`secondaryAction` exactly as they were (still the real reason advice was first requested); only `recommendations`/`nextCheckIn`/cycle-exceed flags come from the revision. The acknowledgment is written to `response._revisionNote` and rendered as a small italic subtitle beneath the (unchanged) narrative.
- **Significant (`true`)** — `headline`/`narrative`/`primaryAction`/`secondaryAction` are swapped in wholesale from the revision; `_revisionNote` is set to `null` since the new narrative already carries the reasoning.

Either way: `chosenPath`/`chosenAt` reset to `null` (a revised plan invalidates a prior pick against the old one — the card falls through to the same "Use plan" buttons shown on a first-time response, no special-casing needed in `startGoalQueue()`), and `revisionInfo = { originalSummary, acknowledgment }` is written — `originalSummary` is `condenseBlocAdvicePlans(response)` captured **before** it's overwritten, so the pre-revision numbers survive even after `response` is replaced.

**Cross-check-in history — `priorAdviceThisCycle`:** every fresh (non-challenge) ask beyond the first pushes a condensed entry for the response it's about to supersede, via `condenseBlocAdviceEntry(stored)`: a compact kcal/protein/carbs-per-step progression per path (`condenseBlocAdvicePlans()`), a one-line "why" (from `primaryAction`/`headline`), and which path was chosen and when. If `stored.revisionInfo` is set (an accepted challenge stood at the time this check-in was superseded), the entry also folds in the pre-revision numbers and the acknowledgment — rendered by `formatPriorAdviceEntry()` as *"Originally recommended X... After a user challenge, revised to Y (reason: Z)."* A **declined** challenge leaves no trace here at all — `revisionInfo` is only ever written by `acceptBlocChallenge()`, so a decline is indistinguishable from never having challenged. `buildBlocAdvicePrompt()`'s "PRIOR ADVICE THIS CYCLE" section renders the full `priorAdviceThisCycle` array plus the still-current (not-yet-superseded) response condensed the same way — giving the next call complete chronological context without ever reaching across a cycle boundary.

---

## 26. Goal Queue Flow

Added in v7.00. When the user taps "Use [Sustainable/Aggressive] plan →", `startGoalQueue(pathKey)` launches a sequential modal flow.

**`startGoalQueue(pathKey)`:**
1. Records `chosenPath` on `state.blocAdvice` (drives cooldown date and plan section layout).
2. Finds the currently active goal (covers today). Computes `getNextSundayInclusive(today)` as the new end date.
3. Deletes all upcoming goals for the current macrocycle (`startDate > today && macroId === macro.id`) — cleaner than selective overwrite, removes any leftover goals from a previous advice round.
4. Builds queue steps: optional truncation step first (if active goal exists and its end date is after the current Sunday), then all LLM goals in sequence.

**Truncation step** (`_isTruncationStep: true`, `_editIdx: activeGoalIdx`): opens the active goal in edit mode (sets `modal._editIdx` before calling `openModal` so the modal handler treats it as an edit, not a blank new goal). All four fields (startDate, endDate, kcal, steps) are set explicitly after `openModal` — the modal handler does not set date/numeric inputs in edit mode, only calls `initGoalMacroSliders`. Description reads "Closing your current goal on this Sunday — only the end date has changed — save to confirm."

**LLM goal steps** (no `_editIdx`): `openModal` runs its normal new-goal reset, then all fields are overridden from the step data. Sliders are reinitialised from the LLM's recommended `kcal/protein/carbs`.

**`_goalQueueAdvancing`** — module-level boolean. Set to `true` immediately before `closeModal('modal-add-goal')` between steps. The `closeModal` handler guards `if (_goalQueue && !_goalQueueAdvancing)` before aborting the queue — this distinguishes a programmatic inter-step close from a user-initiated swipe/backdrop dismissal.

**`saveGoalAndAdvanceQueue()`:**
- Validates required fields (kcal, steps) with red-border flash on failure.
- Runs overlap check excluding the goal being edited/replaced (`editIdxForOverlap` from `modal2._editIdx`).
- For the truncation step: if `goalMacroSliderState.userTouched` is false, preserves the original goal's macros exactly (protein/carbs/fats carried forward unchanged); if true, uses the slider-computed values. Truncation never silently recomputes macros from current bodyweight.
- Saves via `state.goals[editIdx] = g` (truncation) or `state.goals.push(g)` (new goal).
- Writes `_blocLabel: g.label` onto every saved goal object — the step label from the LLM recommendation, used for reliable date cross-referencing in `goalSummaryBlock`.
- Clears `modal2._editIdx` so subsequent steps open as new goals.
- Sets `_goalQueueAdvancing = true`, calls `closeModal`, then `setTimeout(350)` before calling `_openQueueStep(nextIdx)` and resetting the flag.

**`cancelGoalQueue()`:** resets `_goalQueue`, `_goalQueueAdvancing`, closes the modal, calls `_resetGoalModal()`.

**`_resetGoalModal()`:** restores the modal title, save button label, and queue indicator to their default "New Goal Period" state.

**Goal modal queue indicator:** `#goal-queue-indicator` div (hidden by default) shows "Step N of M" label and a "✕ Cancel plan" button. Step description text explains what the current step does. Save button label changes to "Save & continue (N/M) →" or "Save & finish →".

---

## 27. Next Cycle Recommendation Engine (Phases 1–4)

Card 3 of the Progress page's "Insights" swipe deck (§10). Built across four phases (v7.05–v7.21): a fully deterministic recommendation engine (Phases 1–3), then an optional LLM second-opinion layer on top of it (Phase 4). Distinct from the mid-cycle "Ask BLOC for advice" feature (§25) — this is specifically about what to do once the *active* cycle ends, not mid-cycle correction — and the two never share state, a cooldown clock, or a stored-response slot.

### Phase 1 — Deterministic engine

**`recommendNextCycle(macro, override)`** is the core function, called once per Progress render (`nextCycleRec`) and again wherever a fresh recommendation is needed (`openNextCycleMacroModal`, `chooseNextCyclePlan`, `askBlocForNextCycleAdvice`). Pure computation, no DOM writes. Returns:

```js
{
  goalType, isContinuation, rationale, bridge, placeholderWeeks, taper,
  overrideConflict, directionRamp, needsDirectionChoice, directionWasForced,
  continuationAlternative,          // v7.21 — see below
  newMacroStart, newMacroEnd,
  cycleDurationWeeks, dynResult, trendResult, sustainableRange,
  latestBw, recentKcal, rampStartKcal,
}
```

**Direction logic**, branched on the *current* macro's `goalType`:

- **`loss` (cut)** — classifies the cut by `durationBand` (`short` <8wk, `medium` 8–16wk, `long` >16wk) and `depthBand` (`aggressive` if the deficit is >700 kcal/day or >25% of TDEE, `moderate` if >500 kcal/day or >15%, else `mild`), then looks up a minimum bridge length from a fixed matrix:

  | Duration ↓ / Depth → | mild | moderate | aggressive |
  |---|---|---|---|
  | short | 2 | 3 | 4 |
  | medium | 3 | 4 | 6 |
  | long | 4 | 6 | 8 |

  A **short + mild** cut instead recommends **continuing the cut** (`isContinuation: true`, narrative-only — "Build this plan next" doesn't apply, the user extends the active macrocycle themselves). Every other combination recommends a **maintenance bridge**, sized by `computeMaintenanceBridgeFromCut()` (see below).

- **`gain` (bulk)** — a bulk-to-cut transition needs no mandatory bridge (a surplus doesn't cause the same adaptive suppression a deficit does, so there's nothing to recover from). A **short bulk (<10wk) with a non-excessive surplus (≤500 kcal/day)**, or **any bulk with a mild gain rate (≤0.35 lbs/week)**, instead recommends **continuing the bulk** (`isContinuation: true`). Otherwise recommends a **cut**, sized by `computeCutFromBulk()` (see below) — with an optional note if the bulk ran >12 weeks, suggesting a short maintenance step first for a cleaner TDEE reading (not physiologically required, just offered).

- **`maintenance`** — never recommends another maintenance cycle. Direction is taken from the cycle *before* this one (`state.insightsRollup.completedCycles`, one hop back): a prior cut recommends a bulk next, a prior bulk recommends a cut next, sized the same way as the gain/loss branches above via `applyPlaceholderOrOverride()`. If there's no prior cycle, or the prior cycle wasn't itself a cut/bulk, `needsDirectionChoice: true` — Card 3 offers two buttons ("Plan a cut" / "Plan a bulk") that set `override.forcedDirection` and re-run the whole function, landing in the auto-determined branch (`directionWasForced: true`, with a back button to return to the choice).

**Continuation alternative (v7.21):** whenever `isContinuation` is set (either the loss or gain branch above), the engine *also* computes the "normal logic" alternative it would have recommended had the cycle not qualified for continuation — the maintenance bridge (for a continuing cut) or the cut (for a continuing bulk) — attached as `continuationAlternative`. This is a full substitute rec object (`goalType`, `rationale`, `bridge`/`directionRamp`, `newMacroEnd`, `overrideConflict`, sharing the primary rec's `newMacroStart`/`dynResult`/`sustainableRange`/etc.), so it can be fed to `fillNextCycleMacroModal()`/`buildNextCycleGoalSteps()` exactly like a primary recommendation. Computed via two pure closures shared with the primary (non-continuation) path, so the two can never disagree about what "normal logic" actually means for the same data:

- **`computeMaintenanceBridgeFromCut()`** — the reverse-diet ramp + flat-hold bridge (used by both the loss branch's primary maintenance recommendation and its continuation alternative).
- **`computeCutFromBulk(useOverride)`** — the cut sizing logic (used by both the gain branch's primary cut recommendation and its continuation alternative; wraps `applyPlaceholderOrOverride('loss', useOverride)`).

`useOverride` is `override` for the primary call, `null` for the alternative — a target-weight/deadline typed against "continue the bulk" has no meaning for a cut, and vice versa.

Card 3 renders the alternative as a small secondary box ("Alternative — [Cut/Bulk/Maintenance]", one line of rationale, "Build the [X] option instead →") right below the continuation recommendation. The button calls `openNextCycleMacroModal(true)`, which builds `rec.continuationAlternative` directly instead of recomputing.

**Weekly kcal ramps** — two distinct shapes depending on the case:

- **`buildReverseDietRows(recentKcal, tdee, weeklyIncrement)`** — the bridge case (cut → maintenance). Steps from the ramp's start point toward TDEE in fixed `weeklyIncrement` steps (75 kcal for an aggressive cut, 125 otherwise), guaranteed to land exactly on TDEE in its final week. `computeMaintenanceBridgeFromCut()` then pads with flat hold weeks (or uses the climb's natural length as-is if it already exceeds the matrix minimum) to reach the bridge's total minimum duration — the final climb week counts as the first hold week, not an addition to it.
- **`buildDirectionSteppedRamp(startKcal, finalTargetKcal, tdee, totalWeeks, goalTypeRec, safetyFloor)`** — the cut/bulk-direction case. A step-and-hold table (not a continuous curve): holds each kcal level for 3 weeks before stepping again. Step size is **asymmetric for cuts only** — 250 kcal while still on the easy side of TDEE (still in surplus, coming off a bulk), 125 kcal once past TDEE into genuinely restrictive territory. **Bulks always use the smaller 125 kcal step throughout** — there's no equivalent "fast phase" that's safe for a bulk, since even a mild surplus held too long still risks unnecessary fat gain. Clamps any level from going below `safetyFloor` (cuts only), flagging clamped steps. Returns pre-merged `{startWeek, endWeek, kcal, clamped}` rows.

Both ramps start from **`rampStartKcal`** — the current cycle's *last planned goal's* kcal, not `recentKcal` (a 14-day actual-intake average, which reflects adherence noise in either direction) — since a ramp's job is to continue from wherever the plan actually left off, not to react to recent eating.

**`getSustainableWeightRange()`** — floor (cuts) and ceiling (bulks) derived from completed maintenance cycles in the rollup that held stable (≤0.5 lbs/week) for ≥3 weeks: floor = 5% below the lowest confirmed sustainable weight, ceiling = 5% above the highest. Cold-start fallback (no qualifying cycle yet): 10% below/above the most recent logged weight.

**`computeTaperCurve(startWeight, weeks)`** — the safe rate-of-change ceiling for a cut/bulk of a given length: 1.5% of *running* bodyweight in week 1, tapering linearly to 1% (cuts/bulks ≤10 weeks) or 0.5% (>10 weeks) by the final week. Recalculated against running weight each week, not the starting weight. Returns `{ weeklyRates, totalSafeChange }`.

### Phase 2 — Target weight / deadline override

**`recommendNextCycle(macro, override)`**'s second parameter, `override = { targetWeight, deadline, forcedDirection }`, only ever meaningful for `goalType === 'loss' | 'gain'` (never read for `maintenance` — its length is dictated by the matrix/ramp math, not a user choice, so maintenance never gets these input fields at all).

**`applyPlaceholderOrOverride(recGoalType, useOverride)`** — a pure closure (refactored in v7.21 to return its results rather than mutate outer scope, so it can safely run twice in one `recommendNextCycle()` call — once for the primary recommendation, once for a continuation's alternative). Applies a 12-week default duration, or a resolved override if one clears both safety checks below. Also builds the direction ramp once the duration is settled, defaulting to the taper curve's own maximum safe change when no target weight was given (i.e. "assume the safest fastest pace," the same philosophy the bridge case uses without needing input).

**`resolveNextCycleOverride(latestBw, goalTypeRec, sustainableRange, newMacroStart, override)`** — two independent checks:
1. **Floor/ceiling** (hard safety boundary) — a requested target beyond it is always flagged, never offered as a one-tap alternative.
2. **Taper curve** (pace boundary) — a request that's safe on floor/ceiling grounds but implies too fast a rate for the stated timeframe offers **both** one-tap alternatives: nearest safe date for the stated weight, or nearest safe weight for the stated date.

Returns `{ weeks, endDate, conflict }` — `conflict` is `null` when safe, otherwise `{ type: 'boundary'|'pace', message, altDate, altWeight }`.

### Phase 3 — Maintenance TDEE-discrepancy recalibration

**`computeMaintenanceRecalibration(macro, ins)`** — only fires for the *currently active* maintenance macro (never a past cycle's finished goals). Distinct from the whole-history `calcTrendBasedTDEE()`/`calcDynamicTDEE()`, which is deliberately slow-moving — this is a locally-scoped check for "the body is doing something different right now, mid-bridge."

Trigger requires **both**: a genuine directional trend over the last 3 qualifying weeks (avg weekly delta >0.5 lbs in either direction, same stability threshold used elsewhere — not just noise), **and** the resulting locally-implied TDEE (from just the two most recent qualifying weeks, via the same 3,500-kcal-per-lb rule) disagreeing with the current/future goals' actual kcal target by >150 kcal or >7%.

Surfaces as a "Start recalibration →" button on the existing Phase 1 trend-insights card (`buildInsightsCardHTML()`), not a new card. Opens `modal-maint-recalibration`, previewing the new kcal/macros and every affected goal (today's + not-yet-started) with old→new shown. **Steps are never touched** — maintenance goals are always 8,000 flat, a rule enforced globally in `buildNextCycleGoalSteps()` regardless of what the current active goal happens to be.

**`acceptMaintenanceRecalibration()`** batch-updates every affected goal, matched by `macroId` + `startDate` (goal objects have no `id` field — matching by `g.id` would silently update zero goals).

### Phase 4 — LLM second-opinion layer

Separate from the mid-cycle advice feature end to end: its own prompt builder, its own API call, its own storage slot (`state.nextCycleAdvice`), its own eligibility gate. Gated to within **3 weeks of the active cycle's end date** — this gate applies only to the LLM call; the deterministic recommendation itself is never gated by cycle timing.

**`isNextCycleAdviceEligible(macro, rec)`** — returns `{ eligible, reason, daysToEnd }`. Ineligible when: no recommendation at all; a continuation with no computed alternative; a maintenance bridge with no determinable direction (`needsDirectionChoice`); previewing a different macro than the real active one (§ preview dropdown, testing aid); or more than 21 days from cycle end. `daysToEnd` (added v7.22, bundled alongside the challenge feature though otherwise unrelated to it — see §0 of the original spec) is exposed on the return value purely so the render layer can compute `daysUntilEligible = daysToEnd - 21` without recomputing the date math a second time.

**`nextCycleAdvicePlanMode(rec)`** — the shared resolver both the prompt builder and the response validator call, so the two can never disagree about what shape of response was actually asked for. First resolves **`planRec`** — the rec actually being planned for. Normally that's `rec` itself, but when the deterministic engine recommends a continuation, `planRec` becomes `rec.continuationAlternative` instead: a plain extension isn't something this feature builds via the goal queue either way, so `plans[]` always targets a genuinely-new-cycle direction. From `planRec`, derives one of three modes:

- **`conflictTwoPlans`** — the user gave both a target weight and a deadline, and the deterministic engine flagged it unsafe. Exactly 2 plans, keyed `"preserve-weight"` / `"preserve-date"`, each resolving the conflict differently (concrete alt-date/alt-weight numbers from `resolveNextCycleOverride` are handed to the model directly, not re-derived).
- **`directionTwoPlans`** — a cut/bulk-direction cycle with no deadline given. Exactly 2 plans, keyed `"sustainable"` (long/steady, typically 12–20 weeks) and `"aggressive"` — for a **cut**, may run shorter (typically 6–10 weeks) with a faster deficit; for a **bulk**, must run **just as long** as sustainable, never shorter (a bulk is never shortened to make it "aggressive" — only the surplus is pushed modestly harder). Each plan self-declares its own `weeks` field.
- **otherwise** — exactly 1 plan, filling to `planRec.newMacroEnd` exactly (maintenance bridges, or a cut/bulk where the user already gave a deadline that resolved cleanly).

**`buildNextCycleAdvicePrompt(macro, rec)`** — reuses the mid-cycle prompt's weekly-data/cycle-history context, plus: the engine's own floor/ceiling and a **forward-looking** taper curve sized to the *next* cycle's own duration (distinct from `rec.taper`, a look-back check on the cut just finished); the maintenance TDEE-discrepancy flag when the current cycle is itself a maintenance bridge; any user-supplied target/deadline; and — when `rec.isContinuation` — a **CONTINUATION CONTEXT** block giving the model both the engine's own "extend" reasoning and the alternative's "switch" reasoning, explicitly asking it to weigh in on which is actually better in its narrative while still returning buildable plans for the switch option.

**Steps handling:** BLOC only ever uses daily step count as a lever during a **cut**. The `"steps"` schema field is included only when `planRec.goalType === 'loss'`; for gain/maintenance it's omitted from the schema entirely (never even requested), and forced to 8,000 client-side after parsing regardless of what — if anything — the model returned for that field.

**Fill-to-length guard:** every plan must exactly fill its own intended cycle length, computed from `planRec.newMacroStart` and either the plan's own `weeks` field (directionTwoPlans mode) or `planRec.newMacroEnd`. A mismatch between the last goal's `endDate` and the expected end is a **hard validation failure** (the response is rejected, not silently accepted) — this is what actually forces the model to fill the cycle it was asked to plan for, not just a prompt instruction.

**Bulk-never-shortened guard:** in `directionTwoPlans` mode for a `gain`-type `planRec`, rejects the response if the `"aggressive"` plan's `weeks` is less than `"sustainable"`'s.

**`askBlocForNextCycleAdvice()`** — same fetch/parse/validate/error pattern as `askBlocForAdvice()` (§25), POSTing to `https://api.anthropic.com/v1/messages` with `claude-sonnet-4-6`, max 8,000 tokens. Validates required top-level fields, per-plan shape (`key`, `label`, ≥2 goals), then runs the fill-to-length and bulk-never-shortened guards above before materialising fats and enforcing the steps rule. Stores to:

```js
state.nextCycleAdvice = {
  response: { signal, headline, narrative, plans: [{ key, label, rationale, summary, weeks?, goals: [...] }] },
  storedAt:      'YYYY-MM-DD',
  macroId:       string,
  chosenPlanKey: null | string,
}
```

**`_nextCycleAdviceLoading`** / **`_nextCycleAdviceSectionsOpen`** — module-level, not persisted, mirroring `_blocAdviceLoading`/`_blocAdviceSectionsOpen` from the mid-cycle feature.

**`buildNextCycleAdviceSectionHTML(macro, rec)`** — rendered directly inside Card 3's template (not a separate DOM anchor, since it should only ever appear while the Next Cycle card is actually showing), right below "Build this plan next." Handles loading, gated-by-timing, ready-to-ask, and stored-advice states. The gated-by-timing case (only this one gets an explanatory hint — every other ineligibility reason stays silent, matching "Build this plan next" itself being absent) shows a **live countdown to eligibility** (v7.22) rather than a static message: `Math.ceil(daysUntilEligible / 7)` weeks while more than 13 days out, switching to a daily count (`available in N days`) inside that window. The countdown is measured to the 21-day eligibility mark itself, not to the cycle's actual end date — the 21-day gate in `isNextCycleAdviceEligible` didn't need to change at all. The stored-advice state is generic over however many plans came back — pre-choice shows every plan with its own CTA; post-choice shows the chosen plan expanded with any other plan(s) tucked under a single "View alternative(s)" toggle.

**`chooseNextCyclePlan(planKey)`** — resolves `planRec` via `nextCycleAdvicePlanMode(rec).planRec` (not raw `rec.goalType`, which during a continuation would be the wrong direction), records the choice, and builds `_pendingNextCyclePlan = { goalType, newMacroStart, newMacroEnd: <last goal's endDate>, _llmGoals: plan.goals }`, then calls the same `fillNextCycleMacroModal()` helper the deterministic path uses.

**`fillNextCycleMacroModal(goalType, totalWeeks)`** — shared modal-prefill helper, extracted from `openNextCycleMacroModal()` so both the deterministic path and the LLM path fill the New Macrocycle modal identically.

**`buildNextCycleGoalSteps(rec)`** — unchanged for the deterministic path (groups consecutive same-kcal weeks into one goal); gained a short-circuit at the top (`if (rec._llmGoals && rec._llmGoals.length) return rec._llmGoals;`) so an accepted LLM plan's already-materialised goals are used directly. Everything downstream — `createMacrocycle()`'s pending-plan hook, `_launchGoalQueue`, `_openQueueStep` (§26) — needs zero changes to support either source.


---

## 28. Module: Sample Day Library

A library of past qualifying nutrition days that can be replayed onto a new date via **Fill Day** — introduced v7.25, with a data-corruption bug fixed in v7.30 (see the `Infinity`/JSON callout in §3). Entirely a Nutrition-page + Settings-page feature; state lives in `state.sampleDays` (§3 for the `SampleDayGroup` shape).

### Two tolerance bands, two different jobs

- **`SAVE_DAY_TOLERANCE`** (`{ kcal: 50, proteinLow: 10, carbs: 15, fats: 10 }`) — gates whether *today's logged day* is close enough to *its own goal's targets* to be worth offering the Save badge for at all.
- **`SIMILAR_GOAL_TOLERANCE`** (`{ kcal: 100, proteinLow: 15, carbs: 25, fats: 15 }`) — the wider band used to build a group's stored `range` (centred on whichever goal originated it) and to decide whether a *different* goal counts as "similar enough" to share that group's library.

Both bands treat protein as floor-only — extra protein never disqualifies a match, only a shortfall does — everything else (kcal/carbs/fats) is a symmetric ± band.

### Saving a day

- `dayWithinSaveTolerance(totals, goal)` — is today's logged day within `SAVE_DAY_TOLERANCE` of **its own** goal's targets?
- `getDinnerRecipeItem(date)` — the first `Dinner` item with `source === 'recipe'`, or `null`. Other items alongside it in `Dinner` are fine; the recipe is only used as the day's identifying label. A day with no recipe in `Dinner` can never be saved.
- `isDateSavedInLibrary(date)` — whether a date already exists in any group's `days[]`.
- `renderNutrSaveBadge()` — renders into `#nutr-save-badge-wrap`, directly below the Nutrition hero card. Three states: nothing (no goal / out of tolerance / no dinner recipe / already stored under this exact recipe name), the save button ("On target for your goal — save this day to pre-fill later?", solid blue fill, `onclick="saveDayToLibrary()"`), or — once saved — nothing here at all, since the "Saved to library" pill lives **inside** the hero card itself (`renderNutrHero()`, appended below the progress bar) rather than in this separate wrap, so it survives even though the badge wrap goes empty.
- `saveDayToLibrary()` — resolves/creates the target group via `getOrCreateSampleGroup()`, guards against a duplicate dinner name (re-render only, no throw), then pushes `{date, dinnerName, meals: deep-cloned getNutrDayMeals(date), totals}` onto `group.days`.
- `getOrCreateSampleGroup(goal, totals)` — the linking decision for a **save**, based on the day's **logged totals**, not the goal's targets: reuse the group already linked to this goal (`findSampleGroupForGoal`) if one exists; else find any existing group whose `range` the day's totals fall inside (`findSampleGroupForTotals`) and push this goal's id onto that group's `linkedGoalIds`; else create a brand-new group scoped to this goal, with `range = computeSimilarGoalRange(goal)`. This totals-based (not goal-target-based) matching at save time was a deliberate design choice — matching on what was actually logged, not what was merely planned, catches a goal whose plan *looks* different on paper but produced a day that behaved the same in practice.

### Fill Day

- `openFillDayModal()` — resolves a group via `findSampleGroupForFillDay(goal)`: the formally-linked group (`findSampleGroupForGoal`) if one exists, else — **new in v7.29** — any group whose `range` the *current goal's own targets* fall within (`goalTargetsWithinRange`), so a brand-new similar goal can pull from an existing library immediately, before anyone has logged (let alone saved) a single qualifying day under it specifically. Lists every saved day in the resolved group, newest first.
- `confirmFillDay(groupId, sourceDate)` — warns (`showConfirm`) before overwriting if the target date already has any meal logs or a quick-log; `fillDayFromSample()` otherwise runs directly.
- `fillDayFromSample(groupId, sourceDate)` — deep-clones the stored day's `meals` onto `nutrSelectedDate`, clears any quick-log override for that date, and calls `syncNutrLegacyLog()`.

### Dinner-entry prompt (new in v7.53)

A second, proactive entry point into Fill Day, distinct from the button — `maybePromptFillDinnerDay()`, called from `addFoodEntry()` (§14) whenever `nutrActiveMeal === 'Dinner'`. Since `addFoodEntry()` is the single function every meal-logging path (barcode confirm, manual entry, library/recipe select, quick-add-from-list) already funnels through, this only needed hooking once, at the one true choke point, rather than duplicated across each entry path.

- Resolves a match with `findSampleGroupForFillDay(goal)` — the exact same lookup Fill Day's own picker uses (§28 above): the goal's formally-linked group if one exists, else any group whose range the goal's own targets fall within.
- If found, picks that group's **most recently saved day** (`days` sorted by date descending, `[0]`) — the prompt only ever offers one specific day, unlike the Fill Day button's full picker list.
- `showConfirm()` (§9) with the message "There is an approved day already saved for this meal and this goal — want to fill the whole day?". Accepting calls `fillDayFromSample(groupId, sourceDate)` **directly** — no separate overwrite warning the way `confirmFillDay()` shows, since the prompt itself already serves that purpose and the whole point is to overwrite, including the item that was just logged. Declining is a no-op; the just-logged entry is left exactly as it is (`showConfirm`'s Cancel button never runs a callback — see §9).
- Fires on **every** item logged into Dinner, not just the first for that date — adding three separate items to Dinner in the same session shows the prompt three times if a match still exists after each one. No suppression/dismissal state is tracked across entries; this was a deliberate simplicity choice rather than an oversight, matching the spec this was built against.
- Because `fillDayFromSample()` writes directly to `state.nutritionMeals[nutrSelectedDate]` rather than calling `addFoodEntry()`, accepting the prompt cannot re-trigger itself — no recursion guard was needed.

### Proactive linking for display + discovery (v7.29)

Two matching bases exist side by side and are **not** interchangeable:
- **Totals-based** (`findSampleGroupForTotals`, `totalsWithinRange`) — what a logged day's actual numbers matched against, used only at save time (above).
- **Goal-target-based** (`goalTargetsWithinRange`) — whether a *goal's own targets* (not a logged day) fall inside a group's `range`. Used only for two read-only, non-mutating purposes:
  - `findSampleGroupForFillDay(goal)` — Fill Day discovery (above).
  - `getEffectiveLinkedGoalIds(group)` — the Nutrition Libraries pill list (below): unions the group's permanent `linkedGoalIds` with every *currently existing* goal whose targets happen to satisfy `goalTargetsWithinRange` right now, recomputed fresh on every render. This is why a goal can appear as a linked pill without ever having contributed a saved day — the group's stored `linkedGoalIds` array itself is untouched by this; it only grows via an actual save (`getOrCreateSampleGroup`), same as before v7.29.

### Settings → Nutrition → Sample libraries

- `openProfileNutrition()` — calls `renderProfileNutritionLibraries()`, opens `modal-profile-nutrition` directly (no longer routes through a hidden Profile page — `openProfilePage()` and `modal-profile` were both removed in the v7.52 Settings redesign, §16). Stacks on top of the Settings screen's Nutrition card rather than closing anything, following the same "just another modal, no back-stack" pattern as every other modal-to-modal transition in the app (e.g. §14's recipe-ingredient-search hand-off) rather than a custom back button.
- `renderProfileNutritionLibraries()` — one card per `SampleDayGroup`, sorted by each group's most recent saved day. Inside each card:
  - A row of pills at the top: the group's **origin goal** (`linkedGoalIds[0]`, via `getGoalDisplayLabel()`) rendered bold/green; every other id from `getEffectiveLinkedGoalIds()` rendered as a subtler grey pill — this is what surfaces a goal as "linked" purely because its targets match, even with zero saved days of its own.
  - `getGoalDisplayLabel(macroGoalID)` — `` `${macro.name} - ${goal._blocLabel}` `` (falls back gracefully to just the label, or `null`, if the goal/macro has since been deleted — filtered out of the pill list via `.filter(Boolean)`).
  - Below the pills: the group's origin target macros, saved-day count, and effective-linked-goal count.
  - Each saved day is a swipeable row (`initSwipeRows`) — tap to open `openSampleDayEditor(groupId, date)` (edit the dinner label, view every logged meal item read-only, or delete), swipe to `deleteSampleDay(groupId, date)` directly. Deleting a group's last day removes the whole group.

### The `Infinity`/JSON bug (found and fixed in v7.30)

See §3's callout for the full story — `range.proteinMax` was stored as the real JS value `Infinity`, which `JSON.stringify()` silently turns into `null` on every `save()`, and `x <= null` coerces to `x <= 0` in JS. This broke `goalTargetsWithinRange`, `totalsWithinRange`, and therefore every downstream consumer of both (Fill Day discovery, the pill list, and even fresh saves) for **any state that had gone through at least one save/reload cycle** — which in practice was immediately, since `save()` runs after every mutation. Fixed via a real finite sentinel (`Number.MAX_SAFE_INTEGER`) going forward, a `rangeMax(value)` helper that treats `null`/`undefined` as unbounded at every comparison site regardless of what's actually stored, and a one-time `load()` migration that repairs any already-corrupted stored `range.proteinMax` back to the sentinel. Diagnosed by replaying the person's actual exported JSON backup through both the old and fixed comparison logic side by side and confirming the old logic returned `false` (matching the reported symptom) while the fixed logic returned `true` — not just tested against synthetic/rounded numbers.

---

## 29. Known Limitations & Future Considerations

### Current Limitations

| Area | Limitation |
|---|---|
| **Offline** | No service worker. Google Fonts require a network connection on first load. |
| **Cross-device sync** | Data is device-local. No sync between devices or browsers. |
| **Bundle size** | The ZXing barcode library adds ~336KB to the file. Loaded once and cached by the browser. |
| **Camera permissions** | iOS Safari requires explicit camera permission per site. If denied, the manual barcode entry field remains as a fallback. |
| **Push notifications** | No background timer alerts when the app is backgrounded or screen is locked. |
| **Storage limit** | `localStorage` capped at 5–10 MB. Extremely large libraries or years of logs could approach this. |
| **Undo** | No undo mechanism. Deletes are confirmed but irreversible. |
| **Body weight units** | Body weight is lbs-only (training weight elsewhere is kg-only); no unit toggle exists for either, unlike height which has one. Confirmed intentional, not planned to change. Waist/hip measurements (v6.12) are the exception — they do have an inches/cm input toggle, though storage is always inches regardless of which unit was used to enter a given value. |
| **Legacy nutrition log** | `state.nutritionLogs` (per-day summary format) predates `nutritionMeals`/`nutritionQuickLog` and isn't the primary source of truth — but it's still actively kept in sync by `syncNutrLegacyLog()` after every log change (add, edit, delete), for whichever reads still go through it. An earlier version of this document incorrectly described it as read-only/dead; it was corrected after adding inline code comments surfaced the live call sites. |
| **AI advice emoji icons** | The goal summary blocks in the AI advice card use emoji (🔥 kcal, 👟 steps, 💪 protein, 🌾 carbs) rather than the app's SVG iconography. A dedicated icon audit pass is planned to replace these with inline SVG icons using `currentColor`, consistent with the rest of the app's visual language. |
| **AI goal label matching** | `_blocLabel` is only written to goals created via the AI queue flow (v7.00 onward). Goals saved before this version, or edited outside the queue, fall back to date-proximity matching in `goalSummaryBlock`. If a user manually edits goal dates such that they no longer overlap the LLM's original dates, the card may not reflect the edited dates until a new advice call is made. |
| **Drop-set theoretical volume (partially resolved in v6.09)** | The Plan page's *theoretical* (pre-logged) volume projections — the Week-1 session summary and the body-part volume table — now include a drop-set exercise's main-set contribution, since `ex.reps` holds a real target for it as of v6.09 (previously always `''`, contributing 0). The **drop portion** still contributes 0 to these projections, correctly — it never has a plan-time target, only ever discovered live, so there's nothing to project. Real logged volume (`getSessionVolume()`, used everywhere in Train/Progress) was never affected either way and correctly includes both portions. |
| **Maintenance recalibration flag (Phase 3, §27) — not yet click-tested live** | `computeMaintenanceRecalibration()` is logic-tested against synthetic scenarios matching real data and verified against the actual live functions, but hasn't been exercised in the live app yet, since it only fires during an active maintenance bridge and testing so far has happened outside of one. Treated as working; flag if anything looks off once genuinely tested against a live maintenance cycle. |
| **Sample Day Library — formal links never expire (§28)** | `group.linkedGoalIds` only ever grows (a goal is added the moment a day is saved under it) — there's no path that removes an id from it, even if that goal's targets are later edited to fall well outside the group's `range`. In practice this is rarely visible, since `getEffectiveLinkedGoalIds()` still shows it as a linked pill either way (formally-linked ids are unconditionally included), but it means a formal link is permanent even after the underlying similarity that justified it is gone. |

### Resolved (previously listed as open questions)

**Macrocycle/Mesocycle terminology** — an earlier version of this document flagged the internal variable names (`macro`/`meso`) as being inverted relative to strength-and-conditioning periodisation theory. A full audit specifically checked for this and found no such inversion anywhere in the current codebase or UI — the terminology throughout is consistent and correct. This note is retained here only so the concern isn't re-investigated from scratch in future.

**Dead code from earlier redesigns** — a page-by-page audit (Plan → Train → Body → Nutrition → Goals → Settings) worked through every screen looking specifically for functions, variables, and DOM targets left behind by earlier UI changes. Confirmed and removed: an old Nutrition day-badge strip and its handler, an unused nutrition macro-view toggle, a superseded recipe-builder entry point (and a dead branch it left behind in `saveRecipe()`), a superseded food-share function, and the old mesocycle-key/positional-exercise-id migration code in `load()` (confirmed the live data no longer needed it). No further known instances remain from this pass, though any future redesign should expect to leave similar residue and budget an audit pass accordingly.

**Sample Day Library — `Infinity`/JSON corruption (§28, fixed v7.30)** — `range.proteinMax` was stored as the real JS value `Infinity` to mean "no upper bound"; `JSON.stringify()` silently turns `Infinity` into `null`, and since `save()` round-trips the entire state through JSON on every mutation, the corruption happened almost immediately after the feature shipped, breaking every downstream match check with no thrown error to surface it. Diagnosed against a real exported backup (not synthetic data) before shipping the fix, which combines a JSON-safe sentinel (`Number.MAX_SAFE_INTEGER`) going forward, defensive `rangeMax()` guards at every comparison site, and a one-time `load()` migration repairing already-corrupted stored data. Retained here as a general warning: no field anywhere in `state` should ever be assigned `Infinity`, `-Infinity`, or `NaN` — none of the three survive a `JSON.stringify()`/`JSON.parse()` round trip, and `localStorage` persistence means every field in `state` takes that round trip constantly.

**Sample Day Library — `clearAllData()` omitted `sampleDays` (§28, fixed v7.31)** — the exact same class of oversight as the historical `supersets`/`profile` omission above, caught while writing this document rather than by a bug report. Didn't crash anything (`load()`'s defensive default silently backfilled an empty array on next boot), but meant "Clear all data" left the Sample Day Library fully intact — inconsistent with what the confirm dialog promises. Fixed by adding `sampleDays: []` to the reset object.

### Architecture Considerations for Future Development

**Service Worker / Offline-first**
A cache-first service worker for fonts would make the app fully offline-capable. A `manifest.json` with `start_url`, `display: standalone`, and icon assets would improve the PWA install experience on Android.

**Local-first Sync**
Supabase + PowerSync has been considered as a sync layer. Would require refactoring `state` into a normalised schema and replacing `localStorage` with a PowerSync-managed SQLite store.

**Native App**
Capacitor wrapping is compatible with the single-file architecture with minimal changes. Main additions: native push notifications for timer alerts, native camera API for barcode scanning.

**Data Model Evolution**
The dual nutrition log format (`nutritionLogs` legacy + `nutritionMeals`/`nutritionQuickLog` current) is technical debt — `nutritionLogs` is still actively written by `syncNutrLegacyLog()` after every change, it's just no longer the primary source of truth for anything in the current UI. A pass to identify which (if any) remaining reads actually need it, migrate them onto `nutritionMeals`/`nutritionQuickLog`, and then retire `syncNutrLegacyLog()` and the array entirely would remove this permanently — worth doing deliberately rather than assuming it's already inert, since it isn't.

**Body Part Granularity**
The exercise library's body-part taxonomy is currently coarse (7 groups, "Legs" lumping quads/hamstrings/glutes together). The Plan page's body-part volume table would benefit from a more granular taxonomy if that table's usefulness grows — this would only require editing `DEFAULT_LIBRARY`/custom entries, since body part is resolved by lookup rather than stored per-exercise.

---

## 30. Module: Home

New in v7.31, iterated through v7.34. Rendered by `renderHome()`, the default screen on load (`showScreen('home')` at the end of the `DOMContentLoaded` handler) and the first nav-bar button. Appended here as §30 rather than renumbered into sequence near §10 (Progress) to avoid touching the many `§N` cross-references elsewhere in this document — see §6 for the screen-id note.

### Weekly hero card

- `getHomeWeekStart(dateStr)` — the Monday starting the calendar week containing `dateStr`, built the same DST-safe way the rest of the app computes dates: construct a local-midnight `Date`, then `setDate()` (never raw millisecond arithmetic), read back through `toLocalDateStr()`.
- `getHomeIsoDow(dateStr)` — ISO day-of-week, Monday=1..Sunday=7.
- `HOME_METRIC_POLARITY` — `{ kcal: 'both', protein: 'underBad', carbs: 'overBad', steps: 'underBad' }`. Badge colour depends on which direction is "bad" for that metric, not a single blanket rule: kcal is bad both under *and* over tolerance; protein/steps are only bad when under (exceeding is fine, never penalised); carbs is only bad when over (matches the equivalent, unimplemented-here, convention for fats elsewhere in the app).
- `getHomeMetricTolerance(field)` — reuses `SAVE_DAY_TOLERANCE` (the same tolerance band the "does this day qualify to be saved as a Sample Day" check uses, §28) for kcal/protein/carbs; steps gets its own `HOME_STEPS_TOLERANCE = 500`, since `SAVE_DAY_TOLERANCE` has no steps entry.
- `getHomeMetricBadge(field, avg, target)` — under tolerance → "Falling behind"; over → "Exceeding"; within → "On track". Colour (`bg`/`color`, reusing the existing `.badge-green`/`.badge-red` colour values directly rather than the CSS classes, since the badge needs to pick from either based on computed polarity rather than a fixed class) is red for the "bad" direction per `HOME_METRIC_POLARITY`, green otherwise; "On track" is always green. Returns a neutral grey "No data" badge if nothing's logged yet this week or there's no active goal.
- `getHomeMetricSublabel(field, dayMap, weekStart, today, target, unit)` — only called (and only rendered) when the badge isn't "On track" (v7.32 — originally always computed/shown, changed so an on-pace metric doesn't clutter the card with a redundant line). Computes `daysRemaining = 8 - isoDow(today)` (today plus whatever's left in the week) and `loggedSoFar` = the sum of actual logged values for every day strictly before today this week (days with no log contribute nothing). `requiredDaily = (target*7 - loggedSoFar) / daysRemaining`. On the week's last day (`daysRemaining === 1`) this naturally reduces to "hit exactly `requiredDaily` today" with no special-cased branch — the general remaining-budget formula degenerates to the single-day case on its own, since dividing by 1 changes nothing. Otherwise renders as "Adjust your daily avg by ±delta {unit} for the rest of the week to hit target", or "On pace for the week" if `delta` rounds to 0.
- `renderHomeHero()` — kcal/protein/carbs/steps rows in that fixed order, each showing avg vs. target, the badge, and (conditionally) the sublabel. Uses `getActiveGoal()` (§15) and `buildDayMap()`/`avgDayMapField()` (existing helpers, §24) — `avgDayMapField` already excludes days with no data from the average, which is what makes "This week's avg" only count days actually logged so far.

### Upcoming goal banner

`renderHomeGoalBanner()` — deliberately does **not** just take the chronologically-next goal in `state.goals`. A macrocycle's future weeks are frequently already pre-scheduled as separate goal entries (continuations of the same targets), and surfacing every one of those as "a new goal starting soon" would be near-constant noise. Instead:

- Compares each future goal (`startDate > today`, sorted ascending) against `getActiveGoal()` field-by-field (`kcal`/`protein`/`carbs`/`fats`/`steps`) and picks the first one whose targets actually differ.
- Only shows if that goal starts within **6 days** (so it first appears the Tuesday before a Monday start, not the Monday itself — `daysAway > 6` hides it).
- Headline: "Your new goal starts tomorrow!" only when `daysAway === 1` (only possible if today is Sunday, since goals are Monday-aligned); otherwise "Your new goal starts on Monday" (no trailing period — the Sunday variant keeps its "!" since that was a separate, later correction).
- Label resolution mirrors the Plan goals list (§11): `upcoming.label || upcoming._blocLabel`, with a "Step N: " prefix added only if the macro has more than one goal step **and** the label doesn't already start with its own "Step N" text — `_blocLabel`s generated by the AI advice flow (§25) often already carry that prefix baked in, and double-prefixing read as "Step 4: Step 4 - Hard Cut...".
- Shows a diff against the active goal — only the fields that actually changed (`"1,800 kcal → 1,500 kcal"` etc.), "No changes to targets" as a fallback, or the full breakdown if there's no active goal to diff against.
- `goToPlanAndFlashGoal(macroGoalID)` (tap target) — switches `state.currentMacroId` to the goal's own macro first (so its row is guaranteed to exist regardless of which cycle Plan last showed), forces `planGoalsSectionCollapsed = false` (§11), navigates to Plan, then adds a `.goal-flash` class (a `box-shadow` keyframe animation, 1.4s) to the row matching `[data-goal-id="${macroGoalID}"]` once it's painted, removing the class after the animation completes. Fires on every visit via that route, not just the first.

### Log boxes (icon tiles replaced with inline boxes in v7.53)

`renderHomeLogBoxes()` — reinstates the pre-v7.31 Body-page pattern (a plain input box that disappears once today's value is logged) rather than the icon-triggered mini-modals used briefly through v7.31–v7.52. Renders into `#home-log-boxes`, called from `renderHome()`.

- **Weight and steps** — each shows a `.card` with a single input + Save button, rendered only if that field isn't already logged for today (`state.bodyLogs` for weight, `buildDayMap()[today].steps` for steps). `saveHomeWeight()` / `saveHomeSteps()` write the one field they own, explicitly carrying forward whatever else is already logged for today (weight preserves steps/waist/hip and vice versa) rather than defaulting them to `null` — the same "preserve, don't clobber" pattern `saveInlineBodyLog()` (§13) established. Both call `renderHome()` directly on save now (no modal to close).
- **Measurements** — gated on a **4-day cycle rather than daily**: `daysSinceMeas` is computed from the most recent `bodyLogs` entry with a `waist` or `hip` value (`Infinity` if none exist yet, so the box shows immediately for a first-time user rather than waiting on an undefined "since"), and the box only renders when `daysSinceMeas >= 4`. Once shown, it's the full waist/hip form — unit toggle, quarter-inch picker — not just a tap-to-open prompt; this is the same markup and ids the now-removed `modal-home-log-measurements` used (`homeFracState`, `setHomeMeasUnit()`, `setHomeFrac()`, all retained), just inlined directly into the screen rather than behind a modal. A fixed warning line ("It has been 4 days since you last recorded your measurements.") sits above the form regardless of the actual elapsed count. `initHomeMeasBox()` runs right after the box is inserted into the DOM to set the unit toggle to `state.profile.measureUnit` and reset the fraction pickers — the inline equivalent of what the old modal's open-handler used to do. `saveHomeMeasurements()` always writes to **today's** date (the 4-day gate controls whether the box shows, not what date it logs to) and, like the other two boxes, preserves whatever weight/steps are already logged today. The countdown "restarting" needs no special-case code — it falls out naturally from `daysSinceMeas` being recomputed fresh on every render against whatever the most recent `bodyLogs` measurement entry now is.
- **Removed in this rework**: `modal-home-log-weight`, `modal-home-log-steps`, `modal-home-log-measurements`, and their three `openHomeLog*()` opener functions — there's nothing left to open, since these are inline now. `saveHomeWeight()`/`saveHomeSteps()`/`saveHomeMeasurements()` themselves were kept (their state-writing logic didn't change) but had their `closeModal(...)` calls dropped.

The scale-shaped icon and the steps footprint icon from the old tile design are gone along with the tiles themselves — the boxes use plain text labels, no icon artwork.

### Previews

- `renderHomeFoodPreview()` — groups today's planned items (via the existing `getNutrDayMeals()`, §14) into recipes (summed servings) and non-recipe items (summed grams), **ordered by first meal appearance** (Breakfast → Lunch → Dinner → Snacks) rather than alphabetically or by aggregate order — an item logged in both Breakfast and Lunch sorts ahead of one only in Lunch, tracked via a `firstMealIndex` map built while iterating meals in that fixed order. Card title reads "Planned food today"; renders an explicit "Nothing planned for today" empty state rather than omitting the card. Tapping anywhere on the card (not just its "Open →" link) navigates to Nutrition.
- `renderHomeTrainPreview()` — uses `getNextIncompleteSession(macro)`, extracted from `renderTrain()`'s own auto-select logic into a shared `getAllMacroSessions(macro)` / `getNextIncompleteSession(macro)` pair (§12) specifically so Home and Train can never disagree about what "next" means. Row per exercise: name, `getWeekSets()` × `ex.reps`, and — added after an initial pass omitted it — `getWeekWeight(ex, week, 'weight', macro.goalType, macro.weightIncrement)` for a suggested weight, deliberately not the exercise's set-type or its last-mesocycle progression (kept intentionally simple per spec). Title reads "Next session – {session name}", where the session name resolves `macro.dayLabels[dayId] + microSuffix` the same way Train's own hero does. Whole card is tappable (forces `trainManualSelect = false` first, so it always lands on the true next-incomplete session even if Train had a manual selection left over from a previous visit).
- **"Edit today's logs" link** — `openTodaysBodyLogModal()` (§13): opens the Body logs modal, then stacks either today's existing entry (`openEditBodyLog`) or a blank one defaulting to today on top of it.

---

## 31. Input Modes (Numeric Keyboards)

New in v7.54. `inputmode` was set field-by-field across every relevant input in the app so mobile keyboards show the right keypad (numeric or decimal) instead of the full qwerty keyboard — chosen deliberately over a blanket rule based on `type="number"`, since `inputmode` and `type` are independent: `inputmode` controls which on-screen keyboard appears, `type` controls validation/semantics, and a handful of fields in this app intentionally use `type="text"` for reasons unrelated to keyboard choice (see below).

### Process

A full audit was run first (not assumed from memory) — every `<input>` in the file was located, including ones only ever generated inside JS template strings rather than static HTML (Train's set-logging inputs, Home's log boxes, Progress's inline target-weight field, Plan's custom-session-name field), by combining static-HTML section boundaries with a nearest-preceding-`function` lookup for anything inside `<script>`. This caught fields a simple `grep` for `<input` would have missed, since several of them span multiple lines with `${...}` interpolation between the tag's attributes. The resulting audit (~95 assignable fields, plus selects/hidden/file inputs listed for completeness but excluded from scope) was reviewed field-by-field rather than applied by a general rule.

### Rules applied

| Category | `inputmode` | Fields |
|---|---|---|
| Steps | `numeric` | `home-steps-input`, `body-steps-input`, `goal-steps-input` |
| Reps | `numeric` | `inp-r-{logKey}`, `inp-dr-{logKey}` (drop reps) — both are `type="text"`, not `type="number"` (§12), specifically so non-numeric entries stay possible; `inputmode` alone controls the keypad here without touching that |
| Sets | *(no input field — sets are `<select>` dropdowns, `ex-sets-start-input`/`ex-sets-end-input`; nothing to change)* |
| Waist/hip whole-number entry | `numeric` | `home-body-waist-whole`, `home-body-hip-whole`, `body-waist-whole`, `body-hip-whole` — the *display* value is decimal (a whole-inch field combined with a quarter-inch picker, §13), but the input field itself only ever takes a whole number, so it gets the whole-number keypad |
| Training weight & body weight | `decimal` | `ex-weight-input`, `inp-w-{logKey}`, `inp-dw-{logKey}`, `home-weight-input`, `body-weight-input` |
| Waist/hip cm entry | `decimal` | `home-body-waist-cm`, `home-body-hip-cm`, `body-waist-cm`, `body-hip-cm` — cm entry is a single decimal field, unlike the whole-number-plus-fraction inches entry above |
| Kcal/macros | `decimal` | `goal-kcal-input`, every `*-kcal`/`*-protein`/`*-carbs`/`*-fats` field across Quick Add, Manual Entry, Edit Entry, Recipe Builder, and the Food Library editor |
| Food grams & servings | `decimal` | Every `*-grams`/`*-servings` field across the same set of modals, plus `fle-rss` (reference serving size) |
| Barcode manual entry | `numeric` | `nutr-barcode-input`, `recipe-barcode-input` |
| Height | `numeric` (ft/in) / `decimal` (cm) | `profile-feet`, `profile-inches` → numeric; `profile-cm` → decimal |
| Mesocycle count | `numeric` | `macro-weeks-input`, `edit-macro-weeks-input` — stays a plain number input (not converted to a dropdown), whole-number keypad |
| Macro weight increment & target bodyweight | `decimal` | `macro-weight-increment-input`/`edit-macro-weight-increment-input` (a weight value), `macro-target-bw-input`/`edit-macro-target-bw-input`, and Progress's Next Cycle target-weight field (no `id` — matched and edited directly rather than via the id-based batch pass) |
| Names, labels, search boxes | *(unchanged)* | Every free-text field (macro/goal/exercise/food/recipe names, brand, session name, dinner label, all search boxes) intentionally keeps the default qwerty keyboard |
| Dates | *(unchanged)* | `type="date"` fields already show the native date picker regardless of `inputmode` |
| API key | *(unchanged)* | `settings-api-key-input` is alphanumeric, `type="password"` |

### Implementation

Applied via a single script pass rather than 66 individual manual edits: a multi-line-safe regex matched each target `<input>` tag by its `id` (including the literal `${logKey}` template-string ids, which appear verbatim in the source before runtime interpolation and can be matched directly), then inserted the `inputmode` attribute immediately after that tag's `type="..."` attribute if not already present. Verified exhaustively afterward — every one of the ~66 target ids was individually re-checked to confirm the attribute actually landed, rather than trusting the batch-replace count alone, since a silent miss here would be easy to overlook in a change this size.
