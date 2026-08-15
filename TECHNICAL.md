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
  customLibrary:     [],   // Array<{name, bodyPart, category?}> — user-added exercise library entries; category ('weight'|'cardio', new ~v7.60–v7.68) defaults to 'weight' via getLibraryCategory() when absent, and bodyPart is meaningless (and hidden in the Add Custom modal) for cardio entries
  nutritionMeals:    {},   // Record<date, {Breakfast:[], Lunch:[], Dinner:[], Snacks:[]}>
  nutritionQuickLog: {},   // Record<date, {kcal, protein, carbs, fats}> — overrides meal totals for that day when present
  foodLibrary:       [],   // Array<FoodItem>  {id, name, brand, per100kcal, per100p, per100c, per100f, defaultServing, source}
  recipes:           [],   // Array<Recipe>
  supersets:         {},   // Record<supersetId, {name: string|null}> — custom display name only; membership lives on the exercises themselves
  sampleDays:        [],   // Array<SampleDayGroup> — see below (v7.25)
  deloads:           {},   // Record<deloadUnitKey, true> — see §12 Deload Logic. Key = `${macroId}_${week}` (no microcycles) or `${macroId}_${week}_m${1|2}` (microcycles)
  progressionLocks:  {},   // Record<lockKey, LockEntry> — see §12 Progression Compliance Guard (v7.55). LockEntry = {weightTargets, repsTargets, sets, lockedAtWeek}
  progressionTargets: {},  // Record<lockKey + '_w' + week, {weightTargets, repsTargets}> — per-week target cache backing the guard's idempotency (v7.57), see §12
  exerciseHistory:   {},   // Record<nameNorm, Record<setType, HistoryEntry>> — see §12 Exercise History. HistoryEntry = {sets, reps, weight, dropWeight, dropReps, date}
  exerciseTrackingMode: {}, // Record<nameNorm, 'total'|'perSide'> — remembered tracking mode per exercise name, updated alongside exerciseHistory
  profile:           {},   // {gender, heightCm, birthday, measureUnit, distanceUnit} — used for BMR/TDEE calc on the Body screen; measureUnit ('in'|'cm', default 'in') governs the waist/hip input mode only — storage is always inches regardless (v6.12). distanceUnit ('km'|'mi', new ~v7.60–v7.68) is the global Distance Units Settings preference — only shown as a per-exercise km/m picker in Plan's cardio exercise modal when set to 'km' (a 'mi' preference has no further per-exercise sub-choice)
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
  if (!state.progressionLocks)  state.progressionLocks = {};   // v7.55 — see §12 Progression Compliance Guard
  if (!state.progressionTargets) state.progressionTargets = {}; // v7.57 — per-week target cache, see §12
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

**`Exercise.category`** (new in the cardio session, ~v7.60–v7.68): `'weight' | 'cardio'`. Legacy exercises and `customLibrary` entries with no stored `category` are treated as `'weight'` via `getLibraryCategory()` at every read site — a pure function, not a `load()` migration, since there was nothing to actually write back. A cardio exercise carries an entirely different set of plan-time fields instead of `type`/`reps`/`weight`:

```js
{
  id, name, order, category: 'cardio',
  setsStart, setsEnd,        // same shared range field as weight exercises (now 1–15, was 2–7)
  metricType:    'time' | 'distance',  // which one is the fixed plan-time target
  targetSeconds: 90,          // present when metricType === 'time'
  targetDistance: 2.5,        // present when metricType === 'distance'
  distanceUnit:  'km' | 'm' | 'mi',
  speedLevel:    8,            // optional
  resistanceLevel: 6,          // optional
  supersetId, supersetOrder,   // same superset fields as weight exercises — cardio can be a member
}
```

The Train-side log entry for a cardio set stores whichever of time/distance *isn't* the fixed target (the complementary metric), plus `speedLevel`/`resistanceLevel` if logged that week — same `state.trainLogs` key shape as any other exercise (§ Key formats below), no separate key format needed.

The "standalone" boolean that used to exist purely to force a 1-set session was removed in the same session — `setsStart`/`setsEnd` can now both independently range 1–15, so a single-set session is simply `setsStart === setsEnd === 1`.

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
- **`state.progressionLocks`** keys (`getProgressionLockKey()`): `` `${macroId}_${dayKey}_${exerciseId}` `` — one per exercise per track, independent of week, since the whole point is that a lock persists across however many weeks it takes to clear (§12).
- **`state.progressionTargets`** keys: the same lock key with `_w${week}` appended — caches the exact target a given week was judged against the first time it's evaluated, so a later re-evaluation (the render-time catch-up sweep, or a genuine post-hoc edit) always compares against the same numbers rather than silently recomputing a different one (§12).
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

**Full-width nav bar (new in the cardio session, ~v7.60–v7.68)**: `#nav` changed from a floating auto-width pill anchored to the bottom of the app shell to a bar spanning the app's **full width**, and every `.nav-btn`'s text label is now permanently visible — the `max-width`/`opacity` transition that previously revealed a label only on the active tab was removed, so all six labels show unconditionally regardless of which screen is active. `positionNavPill()`'s underlying rect-based positioning logic is unchanged; only the outer bar's own width and the label-visibility CSS changed.

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

As of v7.58 (full cosmetic redesign — see README Version History), design tokens use a flatter "Signal" palette: a near-black ground, quiet surfaces, and a single muted-purple accent used as a line/glow rather than a flood. All are defined in `:root`:

```css
:root {
  --bg: #161826;
  --bg-rgb: 22, 24, 38;
  --surface: #1c1e2e;
  --surface-rgb: 28, 30, 46;
  --surface2: #232532;
  --surface3: #2b2d3d;
  --border: rgba(233,233,237,0.08);
  --border2: rgba(233,233,237,0.16);
  --text: #e9e9ed;
  --text2: rgba(233,233,237,0.65);
  --text3: rgba(233,233,237,0.45);
  --nav-inactive: rgba(233,233,237,0.5);
  --accent: #9184d9;
  --accent2: #b5abfc;
  --red: #E24B4A;
  --warn: #e0a08f;
  --amber: #d9c48f;
  --blue: #8fb3d9;
  --purple: #b5abfc;
  --ice-blue: #9fd9d9;
  --font-display: 'Inter', ...;
  --font-mono: 'Inter', ...;  /* kept for legacy call sites; resolves to Inter */
  --r: 8px; --r-sm: 4px; --r-lg: 14px;
  --nav-h: 54px;
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-top: env(safe-area-inset-top, 0px);
}
```

`--red` and `--warn` were split in v7.59–v7.60 after `--red` was found to have been silently overwritten to a muted rose during the initial v7.58 pass. `--red` (`#E24B4A`) is reserved for danger/destructive states only; `--warn` (`#e0a08f`) is used for warning/drift visuals that want a softer tone.

### Dividers

Also new in v7.58: pages no longer wrap sections in `.card` containers — a three-tier divider system replaces card wrappers:

```css
.divider-hero { height: 2px; background: var(--border2); margin: 20px 0; border: none; }  /* heavy — under a hero card/section */
.divider      { height: 1px; background: var(--border2); margin: 20px 0; }                /* medium — standard page-section divider */
.divider-sm   { height: 0.5px; background: var(--border); margin: 12px 0; }                /* light — inter-row, e.g. table rows */
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

As of v7.58's redesign, the selectable multi-theme system (formerly nine colour themes, each setting `--hero-1`/`--hero-2`, with a Multi theme overriding per page via `[data-page]`) has been removed. The app now uses a single fixed palette (the `:root` tokens above) for every page — there is no `data-theme` attribute, no `setTheme()` function, and no theme picker in Settings.

`setMode(mode)` updates `state.mode`, calls `save()`, sets `data-mode` on `<body>`, then re-renders whichever screen is currently active.

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

Every screen's hero card container sets `data-page` on the parent `.screen` element. This was originally used to resolve the correct `--hero-1`/`--hero-2` pair under the old Multi theme; since that theme system was removed in v7.58 (see §7), the attribute remains in the markup but no longer drives any CSS override — the app now uses one fixed palette everywhere.

### Progress Hero Card

As of v7.59–v7.60, this is no longer a swipeable multi-slide deck — it's down to a single view, the Active Cycle card, rendered by `buildActiveCycleHeroSlideHtml(macro, canCycle, todayStrShort)` into `#progress-hero-card`. The weight-over-time, volume-over-time, and steps/kcal-vs-goal slides that used to live here as separate swipeable cards have been folded elsewhere:
- Weight trend is now a collapsible sparkline (`buildWeightSparklineHtml(cycleLogs)`) behind an expand chevron on the Active Cycle card itself, gated on `progressWeightSparkOpen`
- The steps/kcal bar-chart visual now powers the Statistics card's 7-Day/All toggle instead (see §10)
- The volume line chart was dropped entirely rather than relocated

`#progress-hero-wrap .hero-card` still sets `display: flex; flex-direction: column; min-height: var(--hero-fixed-h, auto)` so the card doesn't jump size as its content (sparkline open/closed) changes; `.hero-chart-fill` handles vertical centering for shorter content within that reserved height.

The old swipe-gesture infrastructure (`initProgressHeroSwipe()`, `progressHeroIndex`, `renderProgressHeroDots()`, `_progressHeroBusy`/`_progressHeroGestureId`) and the per-slide builders `buildWeightHeroChart`/`buildVolumeHeroChart`/`buildGoalColumnHeroChart` described in earlier revisions of this document no longer apply — check the current `renderProgressHero()` implementation directly if any of that machinery still exists before relying on it.

`cycleProgressMacro(dir)` and `resolveProgressMacro()` still handle navigating between macrocycles when the user taps the left/right arrows on the hero.

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

**`#modal-confirm` top-tier z-index (v7.63):** `#modal-confirm` sits at `z-index: 320` — above every other modal tier described above, including the previous highest (`#modal-nutr-barcode` at `310`). This is because `showConfirm()` can be triggered while another modal is already open and deliberately left that way (e.g. the Nutrition dinner fill-day prompt, §28, which fires while the food library add modal — `modal-nutr-add` — is still open so the person can keep quick-adding). Since a confirm dialog must always be actionable, it's pinned above every other tier rather than needing a case-by-case z-index bump each time a new call site introduces a deeper stack.

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
- `renderProgressHero(animate = false)` / `renderProgressHeroDots()` / `initProgressHeroSwipe()` — the hero card (see §8)
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

- `buildWeeklySummaryCardHTML()` — the weekly summary table (**avg weight** — new in the cardio session, ~v7.60–v7.68, sitting immediately left of the weight delta column — / weight delta / avg kcal / avg steps / avg protein) as an HTML string rather than writing directly to the DOM, so it can be selected between by `renderProgressTables()`. Returns a short empty-state card instead of `''` when there isn't enough data yet, since the stack always needs something to show on this slide. **As of v7.28, this card no longer includes the Swing column** — swing moved to its own dedicated card (below), since cramming four metrics' worth of swing data plus the averages into one table was cluttered.
- `buildWeeklySwingsCardHTML()` (**new in v7.28**) — the second slide: smallest/largest consecutive day-to-day change within each calendar week, one column each for weight, kcal, steps, and protein (previously weight-only, embedded in the summary table). Values are formatted with locale thousand-separators (`fmtSigned()`'s `toLocaleString()` call) so a large steps swing reads `+2,450` rather than `+2450`. Same empty-state pattern as the summary card.
- `buildMeasurementsCardHTML()` — same week-bucket shape, for waist/hip. Same empty-state pattern. Now the third slide (was the second, prior to v7.28's swings card insertion).
- `renderProgressTables()` — picks `[buildWeeklySummaryCardHTML(), buildWeeklySwingsCardHTML(), buildMeasurementsCardHTML()][progressTablesIndex]`, writes it into `#progress-tables-wrap`, and renders the dots into `#progress-tables-dots`. `PROGRESS_TABLES_COUNT` is `3` (was `2`).
- `progressTablesAnimateTo(rawIndex)` / `progressTablesSnapBack()` / `initProgressTablesSwipe()` — swipe-gesture handling, directly mirroring `insightsAnimateTo`/`insightsSnapBack`/`initInsightsSwipe` (§ below), except it only re-renders the table stack itself rather than the whole Progress page, since neither table depends on other page state. Unchanged by the 3-card expansion — the modulo-based index math already generalised to any `PROGRESS_TABLES_COUNT`.

**Weight delta (reworked in v6.12):** previously compared a single day's weight against another single day's weight (either first-vs-last within the week, or this-week's-only-entry vs last-week's-last-entry) — noisy enough that a genuine plateau could still show as a steady multi-week loss. Now calculated as **this week's average logged weight minus the most recent prior week (with any data)'s average weight**, carried forward across empty weeks the same way the measurements table already worked. Each week's average is always its own strict 7-day calendar bucket — never a trailing/rolling window spanning into other weeks.

**Swing card (v6.12, split into its own card in v7.28):** the smallest and largest **consecutive day-to-day** change within that week, per metric (weight/kcal/steps/protein) — only between chronological entries that actually happened for that metric that week (a gap between logs isn't treated as a swing), formatted e.g. `−1.5lbs/+2.4lbs`. Shows a single value (no slash) if there's only one day-to-day change that week for that metric, and `—` if there are fewer than two data points. Intended to make water-retention-style/day-to-day volatility visible without it being mistaken for the trend itself.

**Measurements card:** values are the most recently logged waist/hip measurement within that calendar week; deltas compare against the last known value from the most recent prior week with data — never a same-week first-vs-last comparison, since measurements are typically logged at most once a week.

### Hero count-up animation (new v7.65)

`buildActiveCycleHeroSlideHtml(macro, canCycle, todayStrShort, animate = false)` — `animate` is only ever `true` when called from `renderProgressHero(true)`, itself only called from `renderProgress(true)`, itself only ever called from `showScreen('progress')` — i.e. an actual page load. Every other `renderProgressHero()` call site (`cycleProgressMacro()`, `toggleProgressWeightSpark()`, `progressHeroAnimateTo()`) omits the argument and defaults to `false`, so browsing between cycles or expanding the weight sparkline re-renders statically without replaying the animation.

When `animate` is true, the hero renders at 0 (the "Weight lost/gained so far" figure, the calendar-time progress bar + its `%` label, and the Volume/Steps/Kcal callouts), then `animateProgressHeroValues(data)` counts everything up together over a shared 1000ms `easeOutCubic` timeline — mirroring `animateHomeHeroValues()` (§30). Two things worth noting:
- The weight figure and the calendar-time bar are **not the same metric** — the bar tracks % of the cycle's calendar time elapsed, unrelated to how much weight has actually moved — but both animate on the same shared timeline purely for visual consistency (confirmed as the desired behaviour rather than assumed).
- The bar's `id="progress-hero-cyclebar"` gets an inline `transition:none`, same reason as every other JS-animated bar in this pass — the pre-existing CSS `transition: width 0.4s ease` on `.hero-progress-fill` was re-triggering itself on every per-frame JS width update, producing a visible stall-then-snap right at the end of the animation instead of a smooth finish.

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
- **Weight / Cardio category toggle (new in the cardio session, ~v7.60–v7.68)**, `ex-category-select` (or equivalent toggle), values `'weight'`/`'cardio'` — reconfigures which fields the rest of the modal shows via `onExCategoryChange()`. Switching to Cardio hides the weight-specific type/reps/weight fields and shows: a Time-vs-Distance target toggle, the corresponding time (min/sec) or distance input, a per-exercise km/m unit picker (only rendered when the global `state.profile.distanceUnit` preference is `'km'`), and optional speed/resistance level inputs. See "Cardio Exercises" below for the full field list and Train-side behaviour.
- **Sets range widened to 1–15 (was 2–7)**, applying to both weight and cardio exercises, dropping the separate `standalone` boolean that previously existed purely so a session could be forced to a single set — a 1-set session is now simply `setsStart === setsEnd === 1`, same field, no special-casing.
- **Exercise picker filters to the active category** — `getLibrary()`/the picker's underlying list is filtered by whichever category tab is selected (Weight vs Cardio), so the two lists never mix regardless of built-in or custom origin. `saveCustomExercise()` writes whichever category was active when "Add Custom" was opened, and the Add Custom modal conditionally hides its Body Part field (`ex-custom-bodypart-row` or equivalent) when the active category is Cardio, since body part has no meaning for a cardio exercise.
- Exercise type: **Standard**, **Giant Set**, **Pause Set**, or **Drop Set** (`ex-type-select`, values `standard`/`giant`/`pause`/`dropset`) — only shown when the category is Weight. Giant Set locks sets to 1 (`onExTypeChange()`). As of **v6.09**, Drop Set keeps the reps-target field visible rather than hiding it — it sets the **main set's** rep target, same as any other type; the inline note below the field is swapped to clarify that only the main set has a target and the drop is always a reduction in weight taken to failure (prior to v6.09 the field was hidden entirely and `ex.reps` was forced to `''`, since drop sets had no rep target at all). Drop Set is disabled in the type dropdown (`setDropsetOptionEnabled(false)`) whenever the modal is adding into or editing a superset member, since drop sets can't be superset members.
- **Last logged reference** (`ex-last-logged-note`) — below the exercise name, shows one line per set type this exercise name has history for (e.g. a standard-set line and a separate giant-set line for the same exercise, if you've trained it both ways), pulled from `state.exerciseHistory`. Reference-only — never affects any calculation. Updated by `updateLastLoggedPreview()` whenever the name changes.
- **History-based defaults** — when adding a new exercise (never when editing an existing one), reps and starting weight prefill from `state.exerciseHistory[name][selectedType]`, and tracking mode prefills from `state.exerciseTrackingMode[name]`, via `applyExerciseHistoryDefaults()`. Switching set type re-applies against that type's own remembered numbers. Everything remains fully editable.
- `saveCustomExercise()` also refreshes the last-logged preview after re-selecting the newly created exercise.

### Cardio Exercises (new in the cardio session, ~v7.60–v7.68)

Cardio is a `category`, not an `Exercise.type` — it sits alongside weight exercises in the same session/superset structures, but plans an entirely different field set (see §3 State Model for the shape).

- **Plan card summary** — `getCardioSummaryLine(ex)` (or equivalent) builds a compact readable string like "3–5 sets · 30s target · resistance 8" from `setsStart`/`setsEnd`, the fixed `metricType` target, and whichever level fields are set, alongside a distinct cardio badge instead of the usual weight/reps summary.
- **Superset membership** — a cardio exercise can be linked into a superset alongside weight exercises via the normal `openLinkModal()`/superset flow (§ Supersets above); a cardio member's Plan-card row shows "follows leader" in place of its own sets range, matching how non-leader weight members already display, since a superset's set count is always driven by its leader.
- **Bug fix — sets dropdown stuck disabled**: editing a non-leader superset member could leave its sets dropdown permanently disabled afterward, because the enable/reset step that normally runs on a fresh "Add exercise" open was missing on the edit path for non-leader members. Fixed by running the same reset unconditionally on modal open, regardless of add vs. edit or leader vs. non-leader.
- **Bug fix — superset done-count badge**: the combined "N/M sets done" badge shown on a superset card was always counting a cardio member's sets as 0 done, since the done-count logic only ever checked weight-style set-log fields. Fixed by branching the per-member done check on `ex.category`.
- **"min" vs "m" label fix**: the time-target label (minutes, `min`) and the distance-target unit (metres, `m`) read too similarly at a glance next to each other — relabelled for clarity.

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

Rendered by `renderTrain(animate = false)` → `renderTrainHero(macro, animate)` (session summary + volume + deload toggle) → `renderTrainDay(macro)` (the exercise cards).

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

### Session progress count-up animation (new v7.65)

`renderTrainHero(macro, animate = false)` — `animate` is `true` only when called from `renderTrain(true)`, itself only ever called from `showScreen('train')` — an actual Train page load. The second `renderTrainHero(macro)` call site, inside `renderTrainDay()` (fires on every set logged/toggled/cleared, since `renderTrainDay()` re-renders the exercise cards after any of those actions and calls `renderTrainHero()` again at its end to keep the session-% figure in sync), omits the argument and defaults to `false` — so logging a set doesn't restart the animation on a number that was already sitting there. When `animate` is true, `Session progress`'s `%` figure and its bar render at 0 and `animateTrainHeroValue(sessionPct)` counts both up together over the same shared 1000ms eased timeline as Home/Progress (§30/§10), with the same `transition:none` fix on the bar (`id="train-hero-bar"`) to stop the pre-existing CSS transition fighting the per-frame JS updates.

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

### Cardio Exercises (Train-side; new in the cardio session, ~v7.60–v7.68)

A cardio exercise (`ex.category === 'cardio'`) renders a dedicated logging card, structurally separate from the per-row grid every weight exercise type uses:

- **Layout** — expand/collapse like any other exercise card; column headers (Set / Target / logged unit / speed / resist / ✓) are laid out with CSS grid rather than flex/table, matching the technique weight exercises already used elsewhere in Train. This was a deliberate fix: an earlier flex-based attempt left the header cells misaligned against their data rows whenever a level column was hidden (not every cardio exercise sets speed/resistance), since flex doesn't guarantee column-width parity across independently-rendered rows the way a shared grid template does.
- **One row per set** — logs whichever of time/distance *isn't* `ex.metricType` (the fixed plan-time target), plus optional speed/resistance inputs and a done toggle. There is no weight/reps pair at all for a cardio row.
- **Placeholders** — every input's placeholder is last week's logged value at that same set index, sourced the same way weight exercises pull a "last week" reference, but with **no computed suggestion layered on top** — cardio has no progression model, so there's nothing to suggest beyond "here's what you did last time."
- **Header info** — shows the last **logged** speed/resistance (not the plan-time default, which may never have been hit or updated) plus a delta badge in the same "Last wk: +500m/−30s" style as the weight-exercise "Last wk: ↑ weight" badge, built from comparing this week's fixed-target complementary metric against last week's.
- **Fill Suggested** — for cardio, only fills the speed/resistance level fields (there's no weight/reps to fill); **Clear** behaves identically to every other exercise type, wiping the exercise's logs for the current session.
- **Exemptions** — cardio exercises are fully bypassed by:
  - Progression suggestions (`exProgData()`'s weight/reps computation never runs for a cardio exercise)
  - The Progression Compliance Guard (§ above) — no lock can ever be created against a cardio exercise, since there's no weight/reps target to miss
  - Deload weight reduction — deload only ever scales weight-exercise logged values by 60%; a cardio exercise's targets and logs are untouched during a deload week
- **Superset membership** — a cardio exercise can be a superset member alongside weight exercises, following the leader's set count (§11 Plan). Since different members can have entirely different metric/level configurations, each member renders its own per-row mini labels rather than sharing one label row across the group.


`state.exerciseHistory` and `state.exerciseTrackingMode` (§3) snapshot the most recent real performance per exercise name (+ set type, for history), refreshed by `recordExerciseHistory(macro, week, dayKey, ex)` every time a set is completed via `toggleSetDone()` or a quick-fill-complete button — never for deload sessions. This replaced an earlier, more expensive approach (searching the single "last completed macrocycle" by end date each time the Add Exercise modal opened) — the running-snapshot approach is O(1) to read, always reflects the true most recent log regardless of which macro it came from, and doesn't require special-casing macros with no logged history yet.

- Recorded fields per (name, type): `sets` (count of sets with a logged weight that week, falling back to the planned count), `reps`, `weight`, `dropWeight`, `dropReps` (drop-set only), `date` (`getLocalToday()`).
- `formatLastLoggedLine(type, entry)` — builds the modal's display line, e.g. "Last logged: 5 sets · 10 reps @ 50kg (12 Jul)", with a type qualifier when it isn't a plain standard set. Strips a trailing `' reps'` from stored rep values before appending its own, since giant-set reps is a free-text field and real logged data can already contain the word (e.g. someone typed "60 reps").
- `updateLastLoggedPreview()` / `applyExerciseHistoryDefaults()` — see §11 Plan for how these drive the exercise modal.

### Progression Compliance Guard (v7.55–v7.57)
If weight (or reps) progression is selected for an exercise but the suggested number isn't actually hit on every set, the following week's suggestion freezes at that same missed target — rather than continuing to climb — until a session matches it exactly, at which point normal progression resumes from there. This is deliberately **whole-exercise, not per-set**: if any one set misses, the whole exercise locks (a simplification, not an oversight — see §29).

- **Storage**: `state.progressionLocks[lockKey]` where `lockKey = getProgressionLockKey(macro.id, dayKey, exId)` — one entry per exercise per track, independent of week. Presence means locked; entry shape is `{weightTargets, repsTargets, sets, lockedAtWeek}`, both target arrays frozen at whatever they were computed as the week the lock was created.
- **What's checked**: main set weight and reps only, compared per-set against whichever target applies that week (the frozen lock target if already locked, otherwise the normal computed suggestion). Drop-set drop portions are entirely exempt — they're never a fixed plan target, always "to failure," discovered live. Giant/pause sets are checked the same way as any other exercise, against whichever route (weight or reps) was actually selected.
- **Deload override**: `evaluateProgressionLock()` returns immediately for a deload or the single post-deload session (checked via `isDeloadUnit()`/`isFirstUnitAfterDeload()`, above) — a lock already in storage simply isn't touched, so it rides through both untouched and resumes control the moment normal progression weeks return. The overhead quick-fill-complete button also reappears normally on deload/post-deload even if the exercise is otherwise locked, matching deload's "overrules everything" rule elsewhere.

**Evaluation — `evaluateProgressionLock(macro, week, dayKey, ex)`:**
Runs whenever a set is marked done (`toggleSetDone()`, `quickFillComplete()`/`quickFillCompleteDropset()`/`quickFillCompleteSuperset()`) or an already-done set's weight/reps is edited afterward (`recheckProgressionLockForKey()`, wired to `onblur` — deliberately **not** `oninput`, since evaluating on every keystroke risks freezing a lock target on a half-typed value). Only evaluates once every set for that exercise/week is logged **and** done; a partially-logged session is left for next time.

**Retroactive catch-up sweep**: `exProgData(ex)` (above) sweeps `evaluateProgressionLock()` across every week from 2 up to (but not including) the currently-viewed one, on every render. This exists because the reactive triggers above only ever fire on the exact interaction that changes something — a week logged before this guard existed, or one whose fields were never touched again after the fact, would otherwise sit un-evaluated forever, even if genuinely non-compliant. The sweep is idempotent (an already-resolved week is a harmless no-op), so simply viewing a later week is enough to catch it up.

**Target caching (v7.57) — why re-evaluation needed to stop recomputing.** The sweep above calls `evaluateProgressionLock()` repeatedly and idempotently for the same past weeks on every render. Without caching, a week that already cleared its lock could get silently re-judged next time against a *freshly recomputed* — and typically higher — "normal" target (since `computeRawSuggestedTargets()` always derives from the previous week's actual + increment), wrongly re-locking a week that was already correctly resolved. Fixed by `state.progressionTargets`: the exact target a given week is judged against is cached the first time it's evaluated (`_w${week}` suffix on the lock key) and always reused afterward, regardless of how many times or when it's re-checked.

**Display timing — `isLocked` in `exProgData()` only reflects locks from a strictly earlier week:**
```js
const isLocked = !!progLock && (progLock.lockedAtWeek || 0) < state.currentWeek;
```
This matters because the sweep above, plus a trailing `evaluateProgressionLock(macro, state.currentWeek, ...)` call at the end of `exProgData()` (kept *after* `isLocked` is captured, so it can only ever affect what next week sees), mean a lock can genuinely be created or cleared *during* the current week's own render pass. Per spec: logging a new miss must not hide this week's own chips (only the *following* week shows the locked state), and completing the frozen target must not reveal the chips again mid-week (the week that clears a lock still shows the banner throughout, since it came into that week already locked — chips only return the week after). Comparing `lockedAtWeek` against the currently-viewed week, rather than simply checking whether a lock object exists, is what makes both hold regardless of render order or how many times the same week re-renders.

**`prevWasLocked`** — a snapshot taken immediately before the sweep evaluates the single week right before the current one, used to suppress the "Last wk: ↑ weight/reps" badge (above) the week after a lock clears. If last week started out locked, it must — by elimination — have been the week that successfully cleared it (otherwise this week would itself still be locked), so showing an inferred progression route there would be misleading; the badge shows nothing instead.

**UI behaviour while locked** (solo and superset both, `exProgData()`'s `isLocked` field driving both):
- Weight/reps progression chips ("This week — choose progression") replaced with a "Progression on hold" note (or, for a locked superset member, an inline note in place of its chip row) showing the frozen weight/reps.
- Collapsed card shows a single frozen figure instead of the usual "last / next" pair.
- Header badge shows `· ⚠ locked` as plain text (same visual weight as `· Last wk: ↑ weight`, not a coloured pill) instead of the last-week progression route.
- The one-tap quick-fill-complete button is hidden entirely (solo), or the whole combined button is hidden if *any* superset member is locked — forcing a genuine manual log rather than one-tap auto-completing a target that may not be achievable.
- A session that's fully done but didn't match its target (`missedTarget`, computed the same way as the guard's own check but purely for display) shows `✓ done · ⚠ missed target` instead of a plain `✓ done`.

**Reps sanitisation (v7.57, bundled fix)**: the guard's strict per-set comparison surfaced a pre-existing data quirk — the reps field is free text, and a literal `"60 reps"` (instead of `"60"`) could be typed straight into storage (the same quirk `formatLastLoggedLine()`, above, already had to strip for display). A computed target is always a bare number/range, so this silently failed the compliance check even when the actual rep count matched. Fixed at the source rather than in the comparison: `sanitizeReps(v)` strips a trailing `reps`/`rep` word, applied in `logSet()` (manual entry) and at every quick-fill/complete function's reps assignment, so the word can never re-enter storage from any write path.

### Rest Timer
See §17 — opened via the clock icon in the Train header.

---

## 13. Module: Body

Body is no longer its own screen or nav-bar entry (removed in v7.51, folded into Settings). `renderBody()` is now a much smaller function, populating only `#body-log-list` inside `modal-settings-body-logs` — everything else it used to build (the hero card, weight-history chart, inline "log weigh-in" card, and measurement reminder pill) was removed along with roughly 200 lines of computation that fed only those sections (weekly/cycle change, `avg7w`, `leftToGoStr`, the profile badge, the measurement-delta callout row) once their target `<div>`s no longer existed anywhere in the markup — deleted outright rather than left as dead-but-guarded code, since none of it was reachable from any UI path any more. The now-unused `ascLogs` variable was removed for the same reason.

- `openSettingsBodyLogs()` — refreshes `renderBody()` then opens `modal-settings-body-logs`. Called from Settings → Profile card → "Body logs", and from Home's steps card "View logs" button (§30, v7.72). Does not close any parent modal (Profile is now an inline Settings card, not a modal, §16).
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
- `quickAddFromList(idx)` and `confirmServing()` both branch on `nutrAddContext`: in `'recipe'` mode they `recipeIngredients.push(...)` and call `renderRecipeIngredients()` instead of `addFoodEntry(...)`. **Fixed in v7.65** — see "Recipe ingredient gram editing" below; this used to hardcode `grams: 1` and drop the per-gram rate entirely for real library foods, which is what §14's ingredient-editing bug traced back to.
- **Returning to the parent modal:** all three ways of dismissing `modal-nutr-add` (✕ button, backdrop tap, swipe-down) funnel through the shared `closeModal(id)` function, so the recipe-context "return to `modal-recipe-ingredients`" logic lives there rather than being duplicated per dismissal path — see §9.
- **Keeping the search open after each addition:** exactly mirrors the existing meal-logging behaviour via the pre-existing `_nutrReturnToAddList` flag — `cancelNutrServing()` and `confirmServing()` both reopen the food search (branching between `openNutrAdd(nutrActiveMeal, true)` and `openRecipeIngredientSearch(true)` by context) after the servings modal closes, so several ingredients can be added in a row without the modal fully closing between each one.
- `_nutrAddTransitioning` (module-level boolean) suppresses the recipe-context auto-return in `closeModal()` specifically during the brief hand-off when `selectFromAddList()` closes `modal-nutr-add` on its way to opening `modal-nutr-serving` — without this guard, that deliberate transition would be misread as the person dismissing the whole flow, bouncing them back to `modal-recipe-ingredients` mid-flow instead of into the servings editor.

### Recipe ingredient gram editing (fixed v7.65)

Two bugs, found together via an audit prompted by a real backup file (`bloc-backup-2026-08-01.json`), both stemming from the same root cause: `ing.grams` is an overloaded field. For a genuinely weighable ingredient it's a real gram figure paired with a per-gram rate (`per1kcal`/`per1p`/`per1c`/`per1f`); for a "Per item" manual entry (`source: 'manual'`) or a nested recipe used as an ingredient (`source: 'recipe'`) it's actually a **servings count** — `editRecipeIngredient()`'s manual-mode branch explicitly does `const servings = ing.grams || 1`. The ingredient list (`renderRecipeIngredients()`) always labels it "g" regardless of which meaning applies.

- **Data loss on add** — `quickAddFromList(idx)` and `confirmServing()`'s recipe-context branches both computed a real gram amount and per-gram rate from the library item a few lines earlier, then discarded both and hardcoded `grams: 1` on the pushed ingredient, with no `per1kcal` stored at all. A real, weighable food (confirmed against the backup: `"British Chicken Breast Fillets 650g (RSS - 100g)"`, `source: 'library'`) ended up indistinguishable from a true 1-serving manual entry. Fixed by preserving the real `grams` and deriving `per1kcal`/`p`/`c`/`f` from the source item's `per100*` fields (`confirmServing()` additionally folds its `servings` multiplier into one combined gram figure first — `total = grams * servings` — since recipe ingredients only ever scale by grams, never a separate per-ingredient servings count, matching `confirmRecipeIngredient()`'s existing convention). Nested recipe-as-ingredient (`source: 'recipe'`) is unaffected — `grams: 1` there is correct, since a nested recipe has no real weight, only a servings-of-that-recipe count.
- **Edit-modal misread of legacy data** — `editRecipeIngredient()`/`updateRecipeIngredientEditPreview()`/`saveRecipeIngredientEdit()` used to gate the weight-based edit path on `ing.source === 'barcode' && ing.per1kcal != null`. Any ingredient predating the `per1kcal`/`source` schema fields (14 such ingredients found across the sample backup's 24 recipes, all with the `"(RSS - Xg)"` naming pattern that confirms they were originally barcode-scanned, just before those fields existed) fell through to the manual/servings branch — its real `grams` (e.g. 95, 200, 140) got read as a servings count, producing a broken edit view (e.g. "95 servings, 3 kcal each, 0.1g protein" for a 270kcal/95g focaccia).

**The fix** — two new shared helpers replace the `source === 'barcode'` check everywhere it was used:
```js
function isWeightEditableIngredient(ing) {
  if (!ing) return false;
  if (ing.per1kcal != null) return true;                        // explicit rate — always weight-based
  if (ing.source === 'manual' || ing.source === 'recipe') return false; // genuinely servings-based
  return !!(ing.grams && ing.grams > 0);                          // legacy, no rate — derive one
}
function getIngredientRate(ing) {
  if (ing.per1kcal != null) return { per1kcal: ing.per1kcal, per1p: ing.per1p, per1c: ing.per1c, per1f: ing.per1f };
  const g = ing.grams || 1;
  return { per1kcal: ing.kcal / g, per1p: ing.protein / g, per1c: ing.carbs / g, per1f: ing.fats / g }; // safe: this is exactly the math that produced the stored totals
}
```
Any ingredient without an explicit rate, that isn't `manual`/`recipe`, is now treated as weight-editable with its rate derived on the fly from `kcal ÷ grams` — which is safe precisely because that's the same arithmetic that originally produced the stored totals. `saveRecipeIngredientEdit()` persists the derived rate back onto the ingredient the first time it's edited, so subsequent edits read a stored rate rather than re-deriving. No migration script, no data touched until the person actually opens that ingredient's edit modal — verified against the real backup's Chicken Sandwich recipe (Focaccia/Chicken/Fries) and against a simulated per-gram lifecycle (add at 250g → edit to 500g → macros exactly double).

### "Per gram" manual entry mode (new v7.65)

Both manual-add modals — the Nutrition diary's Quick Add (`modal-nutr-manual`) and the Recipe Builder's manual ingredient add (`modal-recipe-manual`) — gained a **Per item / Per gram** toggle (`.toggle-row`/`.toggle-btn`, same pattern as the in/cm measurement toggle). `nutrManualMode` / `recipeManualMode` (module-level, `'item'` | `'gram'`, default `'item'`) drive which fields show and how `saveManualEntry()` / `confirmRecipeManual()` store the result:

- **Per item** — unchanged from before v7.65: a name (Nutrition diary's Quick Add didn't previously have a name field at all — added, optional, defaults to `'Manual entry'`) or a servings count (Recipe Builder), times flat per-serving macros. `source: 'manual'`, never saved to the food library, `grams` field holds the servings count (see above).
- **Per gram** — you enter the **totals for however much you're using** (not a per-100g rate — reading straight off however the packaging states it, at whatever weight you're actually using), plus the grams that total represents. The app divides once: `per1kcal = kcal / grams` (and the same for protein/carbs/fats), storing both the totals and the derived rate. `source: 'manual-weight'`. Saved to `state.foodLibrary` via `addToFoodLibrary()` with `per100kcal = per1kcal * 100` etc., so it's searchable/reusable next time exactly like a scanned product.
- The Nutrition diary side needed **no changes** to `openEditFoodEntry()`/`updateEditPreview()`/`saveEditFoodEntry()` — those already branch purely on `item.source === 'manual'`, so a `'manual-weight'` entry automatically falls into the existing grams/servings-editable path and finds its rate via the food-library name lookup those functions already do for barcode items.
- Multiplication conventions are kept strictly separate per an explicit product requirement: logged diary entries use `per1kcal × grams × servings` (two independent multipliers — `confirmServing()`, `saveEditFoodEntry()`); recipe ingredients only ever use `per1kcal × grams` (one multiplier — `confirmRecipeIngredient()`, and now the Per gram manual path too). Recipe `servings` is a separate, recipe-level concept (how many servings the whole finished recipe makes) used only once, dividing the recipe's totals for the "per serving" line under the ingredient list — never blended into per-ingredient math.

### Food library & recipes
- `addToFoodLibrary()`, `exportFoodLibrary()`/`importFoodLibrary()`, `shareFoodLibItem(idx)`/`shareFoodLibItemByIdx(idx)` (two active entry points — list-index-based, used from the two different list contexts they each render in), `importSharedFoodItem(file)`
- Recipe builder: `openRecipeBuilder(editId?)` → `recipeGoToIngredients()` → `renderRecipeIngredients()` → `confirmRecipeIngredient()`/`confirmRecipeManual()`/`openRecipeIngredientSearch()` → `saveRecipe()`

### Hero count-up animation (new v7.65)

`renderNutrHero(animate = false)` — when `animate` is true (only from `renderNutrition(true)`, itself only called from `showScreen('nutrition')`, i.e. an actual page load — every other call site, including every food-log/quick-add/date-change action, stays at the default `false`), the kcal figure and its progress bar plus the Protein/Carbs/Fats callouts render at 0 and are counted up to their real values together by `animateNutrHeroValues(data)` over a shared 1000ms eased (`easeOutCubic`) timeline, same pattern as Home/Progress/Train (§30/§10/§12). The bar's `id="nutr-hero-bar"` gets an inline `transition:none` so the CSS `transition: width` on `.hero-progress-fill` doesn't fight the per-frame JS updates — omitting this produced a visible stall-then-snap artifact where the bar looked like it paused near the end then jumped to its true final width, since each JS-driven width change was itself re-triggering its own separate 400ms CSS transition.

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
- `setDistanceUnit(unit)` (new in the cardio session, ~v7.60–v7.68) — writes `state.profile.distanceUnit` (`'km'`/`'mi'`), save, re-render. Read by Plan's cardio exercise modal to decide whether the per-exercise km/m sub-picker shows at all (only when the global preference is `'km'` — a `'mi'` preference has no further per-exercise choice to make).
- `exportData()` / `importData(event)` — full-state JSON backup/restore, with a structural sanity check on import (`parsed.macrocycles && parsed.exercises && parsed.trainLogs` must all be present)
- `clearAllData()` — resets macrocycles/exercises/logs/goals/nutrition/foodLibrary/recipes/supersets/profile/sampleDays to empty, but **preserves** `theme`/`mode` (carried forward from the pre-clear state and re-applied to `<body>` immediately) since the confirm dialog only ever promises to delete tracked data, not appearance preferences. The reset object's shape is kept in exact sync with everything `load()`'s defensive defaults expect — an earlier version of this function omitted `recipes`/`supersets`/`profile` entirely, which left `state.supersets` undefined and threw on the very next superset action, since several reads of it aren't null-guarded (e.g. `state.supersets[ssId]`). **`sampleDays` (§28) was similarly missing until v7.31** — didn't crash anything (`load()`'s defensive default caught it on next boot), but meant a "Clear all data" left the Sample Day Library quietly intact, which the confirm dialog's wording doesn't promise.
- `exportLibrary()` / `importExerciseLibrary(file)` — exercise library backup/restore (merge-by-name)

### Layout (redesigned three times in v7.50–v7.52; this describes the final v7.52 shape)

The Settings screen is a list of collapsible cards, plus one always-visible Export button:

```
About this app          — tappable row → modal-settings-about (storage usage)
Profile card            — expanded by default
  App preferences        → modal-app-preferences (Mode + Theme + Distance Units)
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
- **Cardio** (new in the cardio session, ~v7.60–v7.68; a `category`, not an `Exercise.type` — see §3) — none of the three progression functions above ever run against a cardio exercise. There is no weight/reps jump to compute, no Progression Compliance Guard lock possible, and no deload weight reduction applied; Train placeholders are purely last-week's logged value, with no suggestion layered on top. See §12 Cardio Exercises for the full behaviour.

This same weight-jump formula is shared by the Plan page's progression preview and the Train page's live recommendations, so both always agree.

### Deload weight rounding
```js
function roundToIncrement(weight, increment) {
  return Math.round(weight / increment) * increment;
}
```
Used specifically for deload weeks: `roundToIncrement(lastLoggedWeight * 0.6, weightJump)` — 60% of whatever was actually logged last time, rounded to the exercise's own applicable increment (the same value normal progression would add). See §12 Deload Logic for the full session-level behaviour.

### Progression Compliance Guard (v7.55–v7.57)
Layered on top of the three functions above, not a replacement for them: if a chosen progression route isn't actually achieved on every set, the following week's suggestion freezes at the missed target instead of continuing to climb, via `state.progressionLocks`. See §12 Module: Train for the full mechanism (evaluation, retroactive catch-up, target caching, display timing, and UI behaviour).

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
| `renderHome(animateHero = false)` | Top-level render — calls each section renderer below; `animateHero` true only on an actual page load (v7.65) |
| `renderHomeHero(animate = false)` | Weekly kcal/protein/carbs/steps vs. target, with badges and conditional sublabels; counts up from 0 when `animate` (v7.65) |
| `animateHomeHeroValues(badges)` | Counts the hero's avg numbers + bars up together over a shared 1000ms eased timeline (v7.65) |
| `getHomeWeekStart(dateStr)` / `getHomeIsoDow(dateStr)` | DST-safe Monday-of-week / ISO day-of-week helpers |
| `getHomeMetricTolerance(field)` / `getHomeMetricBadge(field, avg, target, dayMap, weekStart, today)` | Badge polarity + pace-aware colour logic — untouched by v7.65's advice changes |
| `getWeeklyRequiredDaily(field, dayMap, weekStart, today, target)` | Shared catch-up-rate calc — returns `{requiredDaily, loggedSoFar, daysTrackedSoFar, daysRemaining}` (v7.65) |
| `formatAdviceSublabel(requiredDaily, target, unit, today)` / `getHomeMetricSublabel(...)` | "Adjust by X" / "Hit X today" wording, and the per-metric wrapper around it (v7.65) |
| `projectedWeeklyAverage(dailyGoingForward, info)` | What the whole week nets out to if a given daily figure is hit for the rest of it (v7.65) |
| `getReconciledMacroAdvice(dayMap, weekStart, today, goal)` | Reconciles kcal/protein/carbs/fats advice against each other so they're never mutually impossible (v7.65) |
| `buildAdviceLineHtml(...)` | Shared per-metric advice-line renderer — sublabel + "New target" + "Projected weekly avg" bullets (v7.65) |
| `buildHomeConsolidatedMessage(badges, dayMap, weekStart, today, goal)` | The expandable warning panel — now runs reconciliation when kcal/protein is flagged (v7.65) |
| `renderHomeGoalBanner()` | Upcoming-goal heads-up, gated on a genuine target change within 6 days |
| `goToPlanAndFlashGoal(macroGoalID)` | Switches to the goal's macro, navigates to Plan, flashes its row |
| `renderHomeLogBoxes()` | Inline weight/steps/measurements boxes — weight/steps daily, measurements on a 4-day cycle (v7.53) |
| `saveHomeWeight()` / `saveHomeSteps()` | Save today's weight/steps from their inline boxes; steps plays a no-reveal swipe animation as of v7.65 |
| `playLogSaveAnimation(rowId, buildLines, onDone, opts = {})` | Swipe-cover + optional result-flash save confirmation; `opts.noReveal` skips the flash and shortens to just the swipe (v7.65) |
| `saveHomeMeasurements()` / `setHomeMeasUnit(unit)` / `setHomeFrac(field, val)` | Inline waist/hip box's save + unit/fraction toggles, own state separate from §13's |
| `initHomeMeasBox()` | Sets the measurements box's unit toggle and resets fraction pickers after each render (v7.53) |
| `renderHomeFoodPreview()` | Today's planned food, ordered by first meal appearance |
| `renderHomeTrainPreview()` | Next incomplete session preview, name + sets × reps × suggested weight |
| `openSettingsBodyLogs()` | Settings → Body logs, and Home's steps card "View logs" button (v7.72) |
| `getAllMacroSessions(macro)` / `getNextIncompleteSession(macro)` | Shared with Train (§12) — the single source of truth for "what's next" |

### Progress
| Function | Description |
|---|---|
| `renderProgressHero(animate = false)` / `renderProgressHeroDots()` / `initProgressHeroSwipe()` | The hero card; counts up from 0 on an actual page load when `animate` (v7.65) |
| `animateProgressHeroValues(data)` | Counts the weight figure, calendar-time bar, and Volume/Steps/Kcal callouts up together (v7.65) |
| `insightsAnimateTo(idx)` / `initInsightsSwipe()` | 3-card "Insights" swipe deck (Progress/Metabolism/Next cycle), pre-dates v6.12 |
| `buildWeeklySummaryCardHTML()` | Weekly summary table (avg weight — new ~v7.60–v7.68 — weight delta, avg kcal/steps/protein) as an HTML string; weight delta is this-week-average vs last-week-average (v6.12, was single-day-to-single-day before). Swing column removed in v7.28 — moved to `buildWeeklySwingsCardHTML()` |
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
| `getLibraryCategory(entry)` | Returns `entry.category` if present, else `'weight'` — the default-resolution helper for legacy exercises/library entries with no stored category (new ~v7.60–v7.68) |
| `onExCategoryChange()` | Reconfigures the exercise modal's visible fields when the Weight/Cardio toggle changes (new ~v7.60–v7.68) |
| `getCardioSummaryLine(ex)` | Builds the Plan-card cardio summary string (e.g. "3–5 sets · 30s target · resistance 8") from sets range, fixed metric target, and level fields (new ~v7.60–v7.68) |

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
| `getProgressionLockKey(macroId, dayKey, exId)` | Storage key for a progression compliance lock — one per exercise per track, independent of week (v7.55, §12) |
| `computeRawSuggestedTargets(macro, week, dayKey, ex)` | Recomputes what a week's per-set weight/reps target would be under normal progression rules, no lock applied — the "what should have been hit" side of the compliance check (v7.55, §12) |
| `evaluateProgressionLock(macro, week, dayKey, ex)` | Creates, updates, or clears a progression lock by comparing a fully-logged week's actual sets against the applicable target; caches the target used per-week so re-evaluation can never drift (v7.55–v7.57, §12) |
| `recheckProgressionLockForKey(logKey)` | `onblur` handler re-running the compliance check when an already-done set's weight/reps is edited afterward — deliberately not on every keystroke (v7.56, §12) |
| `sanitizeReps(v)` | Strips a trailing `reps`/`rep` word from a reps value before it's stored — the compliance guard's fix for a pre-existing free-text-field data quirk (v7.57, §12) |
| `renderCardioExerciseCard(...)` | Full logging card for a cardio exercise — grid-aligned headers, one row per set logging the non-fixed metric, level inputs, done toggle (new ~v7.60–v7.68) |
| `fillSuggestedCardio(...)` | Fills only the speed/resistance level fields for a cardio exercise's sets — there's no weight/reps to fill (new ~v7.60–v7.68) |
| `getCardioLastLoggedDelta(ex, week, dayKey)` | Builds the "Last wk: +500m/−30s"-style header delta badge by comparing this week's logged complementary metric against last week's (new ~v7.60–v7.68) |

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
| `renderNutrHero(animate = false)` | Kcal/macro summary hero; counts up from 0 on an actual page load when `animate` (v7.65) |
| `animateNutrHeroValues(data)` | Counts the kcal figure, its bar, and Protein/Carbs/Fats up together (v7.65) |
| `getDayTotals(date)` | Aggregates kcal/protein/carbs/fats for a date (meals, or quick-log override if present) |
| `nutrPickDate(dateStr)` / `nutrShiftDate(delta)` | Set current date via picker, or shift by swipe |
| `renderNutrDiary()` | Renders per-meal food log cards |
| `openMealMenu(meal)` / `saveMealAsRecipe()` | The `···` action sheet; save-as-recipe does not auto-log |
| `openNutrServingModal()` / `updateServingPreview()` / `confirmServing()` | Serving confirm modal flow; `confirmServing()` branches on `nutrAddContext` since v6.12 to add a recipe ingredient instead of a meal log entry when opened via the recipe builder's food library search — as of v7.65 the recipe branch preserves the real gram amount and per-gram rate rather than discarding them (see §14) |
| `setNutrManualMode(mode)` / `saveManualEntry()` | Per item/Per gram toggle and save for the Nutrition Quick Add manual modal (v7.65) — Per gram derives and stores a real per-1g rate, saves to the food library |
| `confirmCopyFoodEntry()` | Executes copy or move; handles both single-item and whole-meal |
| `copyMealFromYesterday(meal)` | Copies previous day's meal entries into current date |
| `deleteFoodEntry(date, meal, idx)` | Removes a food entry |
| `syncNutrLegacyLog(date)` | Recomputes and upserts `state.nutritionLogs` for a date — still actively called, not dead |
| `saveEditFoodEntry()` | Saves edit; direct macros for manual, per-100g calc for barcode/library/manual-weight (any `source !== 'manual'`) |
| `makePie(p, c, f)` | Generates inline SVG macro pie chart |
| `fitListToKeyboard(wrapId)` | Shrinks a modal's scrollable list to stay above the keyboard |
| `openRecipeIngredientSearch(isReopen)` | Opens `modal-nutr-add` in recipe-ingredient mode (v6.12) — sets `nutrAddContext = 'recipe'`, hides the Recipes/Manual/Scan Barcode row |
| `quickAddFromList(idx)` | Quick-add from the search list at last-logged amount; branches on `nutrAddContext` since v6.12 (meal log vs recipe ingredient) — as of v7.65 the recipe branch preserves real grams/rate for library foods, same fix as `confirmServing()` |
| `isWeightEditableIngredient(ing)` / `getIngredientRate(ing)` | Whether a recipe ingredient is weight-editable (rate present, or derivable from a legacy `kcal ÷ grams`, excluding `manual`/`recipe` sources); its `{per1kcal,per1p,per1c,per1f}` rate, stored or derived (v7.65) |
| `setRecipeManualMode(mode)` / `confirmRecipeManual()` | Per item/Per gram toggle and save for the Recipe Builder's manual ingredient modal (v7.65) — Per gram stores a real rate and saves to the food library |

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
| `setDistanceUnit(unit)` | Updates `state.profile.distanceUnit` (`'km'`/`'mi'`), saves, re-renders — governs whether Plan's cardio exercise modal shows its per-exercise km/m sub-picker (new ~v7.60–v7.68) |
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

### Dinner-entry prompt (new in v7.53; matching logic fixed v7.62; modal stacking fixed v7.63)

A second, proactive entry point into Fill Day, distinct from the button — `maybePromptFillDinnerDay(entry)`, called from `addFoodEntry(entry)` (§14) whenever `nutrActiveMeal === 'Dinner'`, passing through the just-logged entry. Since `addFoodEntry()` is the single function every meal-logging path (barcode confirm, manual entry, library/recipe select, quick-add-from-list) already funnels through, this only needed hooking once, at the one true choke point, rather than duplicated across each entry path.

- **Bails immediately unless `entry.source === 'recipe'`** — only a saved recipe carries the identifying dinner name a saved day is keyed by (same restriction `getDinnerRecipeItem()` applies). A manual entry, library food, or barcode item logged into Dinner is never a qualifying match and must not trigger the prompt.
- Resolves the linked group with `findSampleGroupForFillDay(goal)` — the exact same lookup Fill Day's own picker uses (§28 above): the goal's formally-linked group if one exists, else any group whose range the goal's own targets fall within.
- **Matches the specific logged item**, not just "any group exists": searches `group.days` for a day whose `dinnerName` (case-insensitive) equals the just-logged recipe's name, and only proceeds if one is found. Before v7.62 this step didn't exist at all — the prompt fired for every item logged into Dinner as long as *any* linked group existed, regardless of what was actually logged or whether it matched anything saved.
- `showConfirm()` (§9) with the message "There is an approved day already saved for this meal and this goal — want to fill the whole day?". Accepting closes `modal-nutr-add` (the food library add modal, which — per the quick-add comment in §14 — deliberately stays open through repeated logging and can therefore still be open when this prompt fires) and then calls `fillDayFromSample(groupId, sourceDate)`, `sourceDate` being the **matched** day rather than always the group's most recent one. No separate overwrite warning the way `confirmFillDay()` shows, since the prompt itself already serves that purpose and the whole point is to overwrite, including the item that was just logged. Declining is a no-op beyond closing the prompt itself — the food library modal (if open) and the just-logged entry are both left exactly as they are (`showConfirm`'s Cancel button never runs a callback — see §9).
- `#modal-confirm` renders at `z-index: 320` (§9), above `modal-nutr-add`'s `300`, so the prompt is never hidden behind the still-open food library modal — this was the actual bug fixed in v7.63 (the confirm dialog was rendering at the ambient default z-index and getting buried).
- Can still fire more than once per session if a person logs several different qualifying recipes into Dinner — each is evaluated independently against the group's saved days. No suppression/dismissal state is tracked across entries.
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
| **Progression Compliance Guard — whole-exercise, not per-set lock granularity (§12)** | If 3 of 4 sets hit the target but one didn't, the entire exercise locks, not just the offending set — a deliberate simplification agreed during design rather than tracking per-set lock state, which would add real complexity for a corner case (per-set targets already vary week to week via the v6.09 per-set carry-forward). Revisit only if per-set locking is explicitly requested. |
| **Cardio has no progression model at all (§12, new ~v7.60–v7.68)** | Deliberate, not a gap — cardio exercises never get a computed suggestion, only last week's logged value as a placeholder. There is no plan for a "suggested pace/distance" feature; cardio is intentionally treated as free-form conditioning work rather than a progressively-overloaded lift. |
| **`Exercise.category` default has no `load()` migration (§3, new ~v7.60–v7.68)** | Unlike most schema additions in this app (which get a defensive default written back in `load()`), a missing `category` is resolved purely at read time via `getLibraryCategory()`, returning `'weight'` without ever writing the field back onto the stored exercise/library entry. This is intentional — there's nothing to repair, since every read site already calls the same helper — but means `state.exercises`/`state.customLibrary` entries predating the cardio session will never actually gain a `category` field in storage, only ever resolve to one on read. Worth knowing before writing any future code that reads `ex.category` directly instead of through `getLibraryCategory()`. |
| **API-key-missing redirect on "Ask BLOC for advice" (Build Order step 9, backlog — not built)** | Per `bloc-onboarding-tour-scope-v2.md` §1/§9, this was explicitly scoped as *out* of the tour system proper and logged here as a follow-up rather than implemented: when a person without an Anthropic API key taps "Ask BLOC for advice" (or reaches the equivalent point in a Mini-Tour, §39), there's currently no redirect into Settings → Linked services to add one — the button is simply `disabled` with a small inline note (`⚠ Add your Anthropic API key in Settings to enable this.`, see the AI ADVICE module) rather than an active tap-through. Worth a small standalone pass: on tap, route to `modal-api-key` directly instead of leaving the disabled state as the only signal. |
| **`renderProgress()` crashes on a macrocycle with a goal type but no body logs at all (found while testing §39, pre-existing, not caused by the tour system)** | `showScreen('progress')` throws `Cannot read properties of null (reading 'toLocaleString')` inside the Next Cycle bridge-table renderer (~line 7648, `r.kcal.toLocaleString()` where `r.kcal` is `null`) for a macrocycle that has a `goalType` but zero `bodyLogs` entries — reproduces with plain navigation, no tour or Mini-Tour involved; confirmed by calling `showScreen('progress')` directly against a synthetic account with no tour code in the call stack. Adding `targetBw`/`goal` to the macro didn't avoid it, so the actual missing precondition is still unidentified. A brand-new real account behaves fine in practice since it has no macrocycle at all yet at that point (the Plan/Progress screens don't attempt this calculation with nothing to calculate from) — this only bites an account with a macrocycle already created but no weight ever logged against it, which is a real but narrow window. Worth a dedicated look at `recommendNextCycle()`'s bridge-row computation before the Progress Mini-Tour (§39) is considered fully hardened. |

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

New in v7.31, iterated through v7.34 (and again in v7.65 — count-up animation, reconciled advice, steps save animation). Rendered by `renderHome(animateHero = false)`, the default screen on load (`showScreen('home')` at the end of the `DOMContentLoaded` handler) and the first nav-bar button. Appended here as §30 rather than renumbered into sequence near §10 (Progress) to avoid touching the many `§N` cross-references elsewhere in this document — see §6 for the screen-id note.

### Weekly hero card

- `getHomeWeekStart(dateStr)` — the Monday starting the calendar week containing `dateStr`, built the same DST-safe way the rest of the app computes dates: construct a local-midnight `Date`, then `setDate()` (never raw millisecond arithmetic), read back through `toLocalDateStr()`.
- `getHomeIsoDow(dateStr)` — ISO day-of-week, Monday=1..Sunday=7.
- `HOME_METRIC_POLARITY` — `{ kcal: 'both', protein: 'underBad', carbs: 'overBad', steps: 'underBad' }`. Badge colour depends on which direction is "bad" for that metric, not a single blanket rule: kcal is bad both under *and* over tolerance; protein/steps are only bad when under (exceeding is fine, never penalised); carbs is only bad when over (matches the equivalent, unimplemented-here, convention for fats elsewhere in the app).
- `getHomeMetricTolerance(field)` — reuses `SAVE_DAY_TOLERANCE` (the same tolerance band the "does this day qualify to be saved as a Sample Day" check uses, §28) for kcal/protein/carbs; steps gets its own `HOME_STEPS_TOLERANCE = 500`, since `SAVE_DAY_TOLERANCE` has no steps entry.
- `getHomeMetricBadge(field, avg, target, dayMap, weekStart, today)` — under tolerance → "Falling behind"; over → "Exceeding"; within → "On track". Colour (`bg`/`color`, reusing the existing `.badge-green`/`.badge-red` colour values directly rather than the CSS classes, since the badge needs to pick from either based on computed polarity rather than a fixed class) is red for the "bad" direction per `HOME_METRIC_POLARITY`, green otherwise; "On track" is always green. Returns a neutral grey "No data" badge if nothing's logged yet this week or there's no active goal. Runs its own **pace-aware** check (not a plain avg-vs-target comparison) using the same "remaining budget ÷ days left" math as `getWeeklyRequiredDaily` below, kept as its own inline calculation deliberately — badge colour is intentionally untouched by the v7.65 advice-reconciliation work (see below), so it was left alone rather than refactored to share code with the parts that did change.
- `getWeeklyRequiredDaily(field, dayMap, weekStart, today, target)` **(v7.65, extracted from the body of the old `getHomeMetricSublabel`)** — returns `{ requiredDaily, loggedSoFar, daysTrackedSoFar, daysRemaining }` rather than a bare number, since the projected-weekly-average bullets (below) need the logged-so-far totals alongside the daily figure. `daysRemaining = 8 - isoDow(today)` (today plus whatever's left in the week); `loggedSoFar`/`daysTrackedSoFar` sum actual logged values for every day strictly before today this week (a day with no log contributes nothing to either, so it can't silently count as zero progress and inflate the catch-up rate). `requiredDaily = (target × (daysTrackedSoFar + daysRemaining) − loggedSoFar) ÷ daysRemaining`.
- `formatAdviceSublabel(requiredDaily, target, unit, today)` **(v7.65)** — the display-text half of what used to be inlined in `getHomeMetricSublabel`: "Hit X today to bring the week to target" on the week's last day (`daysRemaining <= 1`, degenerating naturally from the same formula, no special-cased branch), else "Adjust your daily avg by ±delta {unit} for the rest of the week to hit target", or "On pace for the week" if `delta` rounds to 0. Takes a `requiredDaily` value directly rather than computing one itself, so a **reconciled** figure (see below) reads with identical wording to an unreconciled one.
- `getHomeMetricSublabel(field, dayMap, weekStart, today, target, unit)` — now a thin wrapper: `getWeeklyRequiredDaily(...).requiredDaily` piped into `formatAdviceSublabel(...)`. Used as-is for steps, and for kcal/protein/carbs whenever reconciliation isn't in play (see `buildHomeConsolidatedMessage` below). Only called (and only rendered) when the badge isn't "On track" (v7.32).
- `renderHomeHero(animate = false)` — kcal/protein/carbs/steps rows in that fixed order, each showing avg vs. target, the badge, and (conditionally) the sublabel. Uses `getActiveGoal()` (§15) and `buildDayMap()`/`avgDayMapField()` (existing helpers, §24) — `avgDayMapField` already excludes days with no data from the average, which is what makes "This week's avg" only count days actually logged so far. See "Count-up animation" below for the `animate` param.

### Weekly advice reconciliation (new v7.65)

`getHomeMetricSublabel`'s catch-up math was originally four completely independent calculations — kcal, protein, and carbs each computed their own "adjust by X" figure with zero awareness of the other two. This is mathematically fine in isolation but can produce **mutually impossible** advice: e.g. "reduce kcal by 760/day" alongside "increase protein by 37g/day" — the extra 37g of protein alone costs 148kcal, which the reduced budget has no room for once carbs and fats are accounted for at all. Diagnosed and specified against a real example (1500 kcal / 224g protein / 100g carbs / 23g fats goal); the fix lives in `getReconciledMacroAdvice()`, called from `buildHomeConsolidatedMessage()` only once kcal or protein is actually flagged "concerning" (red badge) — carbs/steps being off on their own isn't a kcal-vs-protein conflict, so their sublabel stays fully independent either way. **This only ever changes the advice TEXT — never badge colour, never which metrics get flagged.**

```js
const RECONCILE_CARBS_FLOOR = 50;         // g/day
const RECONCILE_FATS_FLOOR  = 15;         // g/day
const RECONCILE_PROTEIN_MAX_DROP = 15;    // g/day below protein's flat goal
```

`getReconciledMacroAdvice(dayMap, weekStart, today, goal)`:
1. Computes each metric's own independent `requiredDaily` (kcal, protein, carbs, **and fats** — fats has no hero row/badge of its own, but its catch-up rate is still needed here) via `getWeeklyRequiredDaily`.
2. **Feasibility check** — does protein's own catch-up rate, converted to kcal, fit inside the kcal catch-up rate alongside carbs and fats sitting at their floors? `floorKcalCost = (proteinRaw × 4) + (50 × 4) + (15 × 9); feasible = floorKcalCost <= kcalRaw`.
3. **Feasible branch** — kcal and protein both keep their own independent numbers unchanged. Carbs and fats each try to keep their own independent numbers too; only if that combined cost overshoots the kcal left over after protein does either get trimmed toward its floor — fats first (no visible counter of its own, lowest UX cost), carbs only if fats-at-floor still isn't enough.
4. **Infeasible branch** — protein's advice is capped at `goal.protein − 15` (a hard floor **below the flat daily goal**, not below the inflated catch-up number — confirmed explicitly, since "reduce by no more than 15g" was initially misread as relative to the catch-up figure during spec discussion). Carbs and fats both drop to their floors. Kcal is then *recalculated* as whatever that combination actually costs (`proteinAdvice×4 + 50×4 + 15×9`) — landing above kcal's own "ideal" catch-up rate for the week, which is the whole point: kcal absorbs the hit so protein doesn't have to drop further than the 15g cap allows.
5. Returns `{ feasible, kcal, protein, carbs, fats, fatsChanged }` — `fatsChanged` is `true` whenever fats ended up somewhere other than its own independent number, which is the only signal `buildHomeConsolidatedMessage()` uses to decide whether to show a fats line at all.

Verified against the worked example: infeasible branch correctly returns `protein: 209` (224 − 15), `kcal: 1171` (209×4 + 200 + 135), `carbs: 50`, `fats: 15`. A second, milder scenario (small overshoot, not an outright conflict) correctly lands in the feasible branch with fats/carbs trimmed only slightly off their own independent numbers.

`buildAdviceLineHtml(name, field, dayMap, weekStart, today, target, unit, reconciledValue, warningPrefix)` — the shared per-metric line renderer for the expanded warning panel. Calls `getWeeklyRequiredDaily` for the `{ loggedSoFar, daysTrackedSoFar, daysRemaining }` info bundle regardless of whether a reconciled value was passed in, then:
- `displayValue` = `reconciledValue` if given, else the metric's own `requiredDaily`.
- The existing `formatAdviceSublabel` sentence, optionally prefixed (kcal's infeasible-branch line gets `"Can't meet kcal target this week without cutting protein further — "`).
- **"New target: X{unit}/day"** — `Math.round(displayValue)`.
- **"Projected weekly avg if met: X{unit}"** — `projectedWeeklyAverage(displayValue, info)`, i.e. what the *whole* week (already-logged days plus `displayValue` for every remaining day) would actually average out to. For an unreconciled figure this is always ≈ the metric's own goal by construction (that's what `requiredDaily` solves for); the bullet only gets interesting for a reconciled figure, where it deliberately lands away from goal — e.g. protein's projected average in the worked example comes out to 194g (below the 224g goal, reflecting the accepted shortfall), while kcal's comes out to 1746 (above the 1500 goal, since the week already ran high and can only partially recover).

`buildHomeConsolidatedMessage(badges, dayMap, weekStart, today, goal)` — the `goal` parameter is new in v7.65 (needed to run reconciliation). Builds `concerningFields` from the flagged badges; `needsReconciliation = concerningFields.has('kcal') || concerningFields.has('protein')`; if true, calls `getReconciledMacroAdvice` once and threads the result into `buildAdviceLineHtml` for whichever of kcal/protein/carbs are actually being shown. A separate fats-only line is appended via the same helper when `reconciled.fatsChanged`. A footnote — "Adjustments shown here don't include what you've already logged today" — sits directly under the warning header (above the per-metric lines, not after them — moved there on request after initially being placed last), visible whenever the panel is expanded, independent of whether reconciliation actually triggered (the today-exclusion is true of the underlying catch-up math generally, not just the reconciled path).

### Hero count-up animation (new v7.65)

`renderHome(animateHero = false)` → `renderHomeHero(animate)`. `animate` is `true` only from `showScreen('home')` (an actual page load, including app boot) — every other call site (`saveHomeWeight()`, `saveHomeSteps()`, `saveHomeMeasurements()`, `toggleHomeAdvice()`) calls `renderHome()`/`renderHomeHero()` with no argument, defaulting to `false`, so a quick-log save re-renders the hero statically without restarting the count-up on numbers the person was already looking at.

When `animate` is true, each metric's avg number and progress-bar width render at 0, then `animateHomeHeroValues(badges)` counts all four up together over a shared 1000ms `easeOutCubic` timeline (`requestAnimationFrame` loop, single shared `start` timestamp so every number/bar stays in lockstep). Metrics with no data (`avg === null`) are skipped — nothing to count up to, they just show "—" throughout.

**CSS-transition/JS-animation conflict (found and fixed same session):** `.hero-progress-fill` has a pre-existing `transition: width 0.4s ease` (used elsewhere for bars that jump between two states across separate renders). Setting `style.width` every animation frame was itself re-triggering that transition on every single frame, so the browser was chasing a moving target on its own separate easing curve — visible as the bar appearing to stall near the end of the JS animation, then snapping to its true final width once the last CSS transition finally caught up. Fixed with an inline `transition:none` on each animated bar (`id="hero-fill-${field}"` here; the same fix was applied to the equivalent bars in Progress/Train/Nutrition below), since the JS loop already provides all the easing needed.

This same pattern — `animate` param threaded only through the real page-load call path, disabled CSS transition on the JS-driven bar, shared `easeOutCubic`/1000ms timeline — was replicated for Progress (§10), Train (§12), and Nutrition (§14) hero cards in the same session, after this one was built and tested first.

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
- **Measurements header (fixed v7.62)**: the weigh-in and steps boxes each render a "Log weigh-in"/"Log steps" eyebrow header above their input; the measurements box was missing the equivalent "Log measurements" header entirely — it went straight from the box's top padding into the 4-day warning line. Added so all three boxes are visually consistent.
- **No cross-box dividers**: the three boxes render back-to-back inside `#home-log-boxes` with no divider between them — a single `.divider` is appended once, after whichever box renders last, right before the food preview that follows.

### Save-confirmation animation (`playLogSaveAnimation()`, new in v7.61; extended to steps in v7.65)

Plays over the weigh-in, measurements, and (as of v7.65) steps inline log boxes after `saveHomeWeight()`/`saveHomeMeasurements()`/`saveHomeSteps()` write the new value: a `.log-save-overlay` panel swipes in from the right covering the inputs/button (600ms), then — for weight/measurements — a `.log-save-flash` result fades in over the same row (one line per metric, showing the prior logged value and the delta against it, or "Saved — first logged entry" if there was no prior log). After a hold, `onDone()` runs (just `renderHome()`, so the box hides itself the normal way once today's field reads as logged).

**Steps — `opts.noReveal` (new v7.65):** `playLogSaveAnimation(rowId, buildLines, onDone, opts = {})` — when `opts.noReveal` is set, the flash step is skipped entirely and `onDone` fires at 600ms (right when the swipe finishes covering the box) instead of waiting through the full hold — just the swipe, then the box vanishes. `saveHomeSteps()` calls it as `playLogSaveAnimation('home-steps-row', null, () => renderHome(), { noReveal: true })`; the `home-steps-row` wrapper div (`position:relative;overflow:hidden`) didn't previously exist on the steps box and was added specifically so the overlay has something to animate over, matching the wrapper the weight/measurements boxes already had.

The hold time (weight/measurements only) has moved twice since launch: 5s at launch (v7.61) → briefly 2s (v7.63) → settled at 3s (v7.64). The constant lives as the second argument to the trailing `setTimeout(onDone, …)` call inside `playLogSaveAnimation()` — 600ms swipe-in plus the hold, so 3600ms total for the current 3s value.

The scale-shaped icon and the steps footprint icon from the old tile design are gone along with the tiles themselves — the boxes use plain text labels, no icon artwork.

### Previews

- `renderHomeFoodPreview()` — groups today's planned items (via the existing `getNutrDayMeals()`, §14) into recipes (summed servings) and non-recipe items (summed grams), **ordered by first meal appearance** (Breakfast → Lunch → Dinner → Snacks) rather than alphabetically or by aggregate order — an item logged in both Breakfast and Lunch sorts ahead of one only in Lunch, tracked via a `firstMealIndex` map built while iterating meals in that fixed order. Card title reads "Planned food today"; renders an explicit "Nothing planned for today" empty state rather than omitting the card. Tapping anywhere on the card (not just its "Open →" link) navigates to Nutrition.
- `renderHomeTrainPreview()` — uses `getNextIncompleteSession(macro)`, extracted from `renderTrain()`'s own auto-select logic into a shared `getAllMacroSessions(macro)` / `getNextIncompleteSession(macro)` pair (§12) specifically so Home and Train can never disagree about what "next" means. Row per exercise: name, `getWeekSets()` × `ex.reps`, and — added after an initial pass omitted it — `getWeekWeight(ex, week, 'weight', macro.goalType, macro.weightIncrement)` for a suggested weight, deliberately not the exercise's set-type or its last-mesocycle progression (kept intentionally simple per spec). Title reads "Next session – {session name}", where the session name resolves `macro.dayLabels[dayId] + microSuffix` the same way Train's own hero does. Whole card is tappable (forces `trainManualSelect = false` first, so it always lands on the true next-incomplete session even if Train had a manual selection left over from a previous visit).
- **Steps card "View logs" button (v7.72, replacing the old "Edit today's logs" link)** — within `renderHomeHero()`'s per-metric row builder, the `ctaStr` for the steps row (`m.field === 'steps'`) renders a permanent "View logs" button (`onclick="showScreen('settings');openSettingsBodyLogs();"`), regardless of whether steps are tracked yet this week. **Bug fixed in the same pass**: `ctaStr` was originally gated on `!tracked` (steps untracked this week) rather than on which metric the row was — so a brand-new account with no data at all rendered the button on *every* row (kcal/protein/carbs too), not just steps. Fixed by keying `ctaStr` to `m.field === 'steps'` directly, independent of `tracked`. The old "Edit today's logs" link (its render function `renderHomeEditLogsLink()`, its `#home-edit-logs-link` placeholder div, its CSS, and its dedicated `openTodaysBodyLogModal()` opener) was removed entirely rather than left dormant, since `openSettingsBodyLogs()` alone (§13) already covers what the button needs to do.

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

## 32. Module: Onboarding Tour System (groundwork, v7.74)

The full tour system (Demo Tour, Macrocycle Creation Tour, Mini-Tours, spotlight/tooltip component) is scoped but not yet built as of v7.74. This section documents only the completed prep pass — stable `id` anchors for every spotlight target the tour will need — reconciled against the two scope docs (`bloc-onboarding-tour-scope-v2.md`, `-v3.md`) that define the full feature.

### Spotlight-target ID audit

Of the ~9 elements flagged across both scope docs as needing IDs before tour work could begin, four had already gained stable IDs incidentally during other v7.72–v7.73 work and needed no change:
- `bloc-advice-btn` — the "Ask BLOC for advice" button (§ AI Advice)
- `nutr-save-badge-wrap` — Nutrition's sample-day save-prompt banner (the button renders directly inside this wrapper, so the wrapper id is a sufficient spotlight target)
- `nutr-manual-mode-item` / `nutr-manual-mode-gram` — the Per item/Per gram toggle in the Nutrition manual-entry modal
- `swipe-yesterday-{meal}` — the swipe-to-copy-from-yesterday strip, already keyed per meal

Five needed new IDs, added in this pass (all purely additive, no logic touched):
- `prog-selector-{macroId}-{exId}` — Train's per-exercise progression selector (Weight/Reps choice), inside the expanded exercise-card view
- `locked-notice-{macroId}-{exId}` — the "Progression on hold" notice shown in place of the selector when an exercise is under an active compliance lock
- `deload-toggle-{macroId}` — the "Mark as deload" / "✓ Deload" span in the Train hero card
- `fill-day-btn` — Nutrition's "Fill day" button
- `meal-menu-btn-{meal}` — the per-meal `···` options button, keyed per meal to match the existing swipe-strip id pattern

All five follow the app's existing per-item id convention (`{prefix}-{macroId}` / `{prefix}-{macroId}-{exId}` / `{prefix}-{meal}`) rather than a bare static id, since each renders once per exercise/macro/meal and a collision-prone static id would only ever correctly target the first instance on the page.

### Still outstanding (not yet built as of v7.74, before this section's step 3 work)
Per the v3 scope doc's Build Order: the spotlight/tooltip component itself (step 3), `bloc-demo-data.json` fetch wiring (step 4), the Demo Tour sequence (step 5), the profile-entry hard gate (step 6), the Macrocycle Creation Tour (step 7), the Settings Help-icon → Mini-Tours modal (step 8), and the API-key redirect (step 9, logged separately).

## 33. Module: Onboarding Tour Engine (spotlight + tooltip, v7.75)

Build Order step 3. This is the reusable engine — `startTour()` and its supporting functions — that every actual tour (Demo, Macrocycle Creation, all five Mini-Tours) will call into with its own step list. Nothing in this module knows about tour *content*; it only knows how to walk a step array, mask the screen, point at an element, and clean up afterward. No tour currently starts from anywhere in the app — that's steps 5–8, still to come.

### Step shape

```js
{
  targetId: 'bloc-advice-btn',   // required — id of the element to spotlight
  title: 'Ask BLOC for advice',  // required
  body: 'When a plateau...',     // required
  placement: 'auto'|'top'|'bottom', // optional, default 'auto'
  waitForAction: false,          // optional — advance via a real tap on the
                                  // target instead of the Next button
  onEnter: (step) => {},         // optional — fires before this step renders
                                  // (e.g. expand a collapsed card so its
                                  // target exists in the DOM)
  onAdvance: (step) => {},       // optional — fires right after this step
                                  // advances, before the next one renders
}
```

`startTour(steps, opts)` — `opts.allowSkip` shows a Skip-tour link (Macrocycle Creation Tour only, per scope §1/§4 — the Demo Tour has no skip); `opts.onComplete` fires once after the last step advances naturally; `opts.onSkip` fires instead if Skip was used, kept as a separate callback so a caller doesn't have to inspect *how* the tour ended just to branch on it. `opts.finalLabel` overrides the last step's button text (defaults to "Get Started").

### Masking: four divs, not a clip-path hole

The overlay is four separate fixed `div`s (`tour-mask-top/bottom/left/right`) framing the target's rect, rather than one full-screen div with a CSS `clip-path` cutout. Two reasons:
1. A rectangular hole in a single element needs an SVG `path()` clip — plain `polygon()` can't express a subtracted region.
2. More importantly, one element can only have one `pointer-events` value. The tour needs the backdrop to **block** taps everywhere except the target, and for `waitForAction` steps the target itself needs to receive a **completely native** tap — no synthetic re-dispatch, no `pointer-events: none` trick that would also let taps fall through everywhere else. Four real divs solve both at once: each one *is* opaque backdrop that blocks taps, and the untouched gap between them (exactly the target's rect, ±6px padding) simply has no element sitting over it, so a tap there reaches the real DOM node underneath exactly as if no tour were running.

A separate `#tour-ring` div (pointer-events: none) draws the accent border/glow around that same rect purely for visual highlight, and pulses (`.tour-ring-pulse`) on `waitForAction` steps so they read as interactive rather than just decorative.

### Positioning & the iOS scroll settle

`_renderTourStep()` calls `target.scrollIntoView({ block: 'center', behavior: 'smooth' })`, then waits a `requestAnimationFrame` *plus* a 220ms `setTimeout` before measuring `getBoundingClientRect()` and positioning the mask/ring/tooltip. A bare rAF isn't reliably enough time for a smooth `scrollIntoView` to actually finish on iOS Safari — the same category of timing gap as the existing WebKit stale-hit-region issue documented elsewhere in this file, and fixed the same pragmatic way (a short timeout after the frame, not relying on a scroll-end event that iOS doesn't reliably fire).

Placement defaults to below the target, flipping above if there isn't ~90px of clearance before the floating nav bar (`roomBelow = vh - bottom - 90`, using `window.visualViewport.height` when available so an open keyboard is accounted for the same way the rest of the app already handles it — see the `measureEnv()`/`visualViewport` pattern in the input-mode and safe-area sections above). Steps can force `placement: 'top'|'bottom'` explicitly for cases where the natural auto-choice would be wrong.

### Resize/keyboard tracking

`_repositionTourStep()` (bound to both `window.resize` and `window.visualViewport.resize` for the duration of a tour) re-measures and repositions the *current* step's DOM without re-running `onEnter` or `scrollIntoView` — so an in-progress step doesn't visually detach from its target on rotation or when the keyboard opens/closes, mirroring how modals and the nav bar already stay glued to `visualViewport` elsewhere in the app.

### `waitForAction` steps

Instead of rendering a Next button, the step attaches a one-time `click` listener directly to the real target element and calls `tourNext()` from it. Because the mask has no coverage over the target's rect (see above), the person's tap is a completely ordinary interaction with the app — it does whatever the target's own `onclick` does *and* advances the tour, with no coordination needed between the two. This is what the v3 scope's two-step AI-advice sequence (§10.4 — narrative expand, then plan expand) and the Train progression-selector steps need: the tour has to wait for a genuine tap on the real UI, not just simulate one.

### Cleanup

`endTour()` removes every tour DOM node by id, detaches the resize/visualViewport listeners, removes any pending `waitForAction` click listener, and nulls `_tourState`. `startTour()` calls it defensively before starting, so a tour can never stack on top of another one left dangling by a bug elsewhere.

### Verification

Checked with a Playwright smoke test against a local copy of the file (not committed — throwaway, screenshot + DOM assertions only): mask rect math and z-index tier, tooltip top/bottom flip near the nav bar, progress dots and final-step label text, `waitForAction` firing from a real target click with no Next button rendered, `Skip tour` invoking `onSkip` rather than `onComplete`, and full DOM teardown after both a natural completion and a skip. Real on-device iOS PWA verification (the actual point of the scroll-settle timeout and `visualViewport` tracking above) is still outstanding — the emulated viewport testing here confirms the logic, not the on-device keyboard/safe-area behavior itself.

### Addendum (v7.82): Back button, and a real smooth-scroll timing bug

**Back button.** `tourBack()` existed in the engine from the start but was never exposed anywhere in the tooltip UI — `_renderTourTooltipContent()` now renders a `Back` button (hidden on step 0) alongside Skip/Next. It's a re-render of the previous step, not a true undo: an `onEnter` with a genuine side effect (the Macrocycle Creation Tour's `waitForAction` step, which actually creates a macrocycle) isn't reversed by going back past it, only re-shown. Fine for steps that just expand a card or open a modal, worth knowing for anything that mutates real data.

**A genuine `scrollIntoView` timing bug, found live.** `target.scrollIntoView({ block: 'center', behavior: 'smooth' })`, followed by a 220ms settle timeout before measuring the target's rect, worked for every step tested through v7.81 — all of them were short scroll distances. The first step requiring a much larger jump (Progress's hero card down to the weekly-summary deck, added in v7.82 — see §36's addendum) reproduced a real failure: the smooth-scroll animation was still mid-flight when the 220ms timeout fired, so `_positionTourStep()` measured a mid-scroll rect instead of the settled one, and the tooltip rendered roughly 150px below the actual viewport — its own Next button literally unreachable. Fixed by switching to `behavior: 'auto'` (instant scroll), which removes the entire category of "did the animation finish in time" races rather than just tuning the timeout longer for one step. The tradeoff is losing the smooth visual scroll transition between steps; worth it for a tour that has to work reliably regardless of how far any future step's target sits from the previous one. Re-verified: a full 15-step Demo Tour walk-through with Playwright now completes with zero skips or timeouts, including the step that originally broke.

### Addendum (v7.83): Skip Tour now confirms first

`tourSkip()` no longer ends the tour immediately — it opens a small confirmation overlay (`_showTourSkipConfirm()`) with Cancel (`_cancelTourSkip()`, just removes the overlay, tour continues exactly as it was) and "Yes, skip" (`_confirmTourSkip()`, the real skip logic — what `tourSkip()` used to do directly). Deliberately its own dedicated overlay (`.tour-confirm-overlay`, z-index 410) rather than the app's existing `showConfirm()`/`modal-confirm` — that generic confirm dialog sits at z-index 320, which is *below* the tour's own mask (400), so it would render completely invisibly behind it if reused here. `endTour()`'s cleanup list now also removes `tour-skip-confirm` defensively, in case a tour ever ends by some other path while the confirmation is still open. Verified with Playwright: Cancel leaves `_tourState` intact and removes only the confirmation overlay; confirming actually ends the tour via the normal Skip path (`opts.onSkip` fires, not `opts.onComplete`) and — tested against the Macrocycle Creation Tour specifically — correctly leaves `modal-macro` open afterward, same as Skip always has.

### Addendum (v7.84): Back navigation across screens, and a mask that could collapse to show the whole page

Both bugs here were reported after the tour had otherwise been working well for a while — genuinely edge-case-shaped, in that neither showed up until a specific combination (Back across a screen boundary; a spotlighted card tall enough to exceed the viewport) actually occurred.

**Back navigation landing on the wrong screen.** Every tour step that needed a specific screen active called `showScreen(...)` from inside its own `onEnter` — but only the FIRST step of each page segment ever did this, on the implicit assumption that a step could only ever be reached by advancing forward from that segment's start. True for `tourNext()`, false for `tourBack()`: going back from, say, the first Progress step to the last Home step lands directly on a step that never itself called `showScreen('home')`, because forward navigation never needed it to. Home stayed hidden (inactive `.screen`, not literally removed from the DOM), so `document.getElementById(step.targetId)` still found the element — inside a hidden screen, `getBoundingClientRect()` returns an all-zero rect pinned at `(0, 0, 0, 0)` — which is exactly the reported symptom: the spotlight resolving to the top-left corner of the screen. Matches the reporter's own observation precisely: it "worked" whenever the two adjacent steps happened to share a screen already (no navigation needed either way) and broke specifically when they didn't.

Fixed by centralizing screen management rather than continuing to handle it ad hoc per step:

```js
function _ensureTourScreen(step) {
  if (!step.screen) return;
  const activeEl = document.querySelector('.screen.active');
  const activeName = activeEl ? activeEl.id.replace('screen-', '') : null;
  if (activeName !== step.screen) showScreen(step.screen);
}
```

Called at the top of `_renderTourStep()`, before `onEnter` — every step across all tours (Demo Tour, Macrocycle Creation Tour, all 5 Mini-Tours) now declares an explicit `screen` property, and every `showScreen(...)` call that used to live inside an individual `onEnter` was removed as redundant. This makes Back (and, as a side effect, any future non-linear navigation) correct by construction rather than by the ordering happening to work out — a step's own declared `screen` is checked and corrected every single time it renders, regardless of which step was active immediately before it. Worth noting the Mini-Tours were never actually vulnerable to this specific bug (each one only ever targets a single screen, so Back within one never crosses a boundary) — the `screen` property was added there anyway for consistency with the new pattern, not because a bug reproduced.

**A spotlight that could cover the whole page.** The AI-advice narrative step's card, once expanded, can be genuinely taller than the viewport — measured live at 1497px on an 844px-tall screen. `_positionTourStep()`'s mask math was already defensively clamped (`Math.max(0, top)` for the top mask's height, `Math.max(0, vh - bottom)` for the bottom one), but that clamping is mathematically correct in a way that produces a bad *visual* result for an oversized target: if the target is centered via `scrollIntoView({block:'center'})` and is taller than the viewport, both `top` (negative) and `vh - bottom` (also negative) clamp to zero, leaving literally nothing to darken above or below — indistinguishable, visually, from no spotlight being applied at all. Reported as "spotlights the whole progress page," which is accurate: with both masks at zero height, the "hole" really does span the entire visible screen.

First fix attempt used `scrollIntoView({block:'start'})` for any target over 85% of the viewport height, on the theory that top-aligning would at least guarantee some margin above the target. It didn't — `block:'start'` aligns the target flush with the viewport's top edge, zero margin included, so the top mask was *still* zero height, just anchored to a different scroll position. Caught by re-measuring rather than assuming the first fix worked: a follow-up test showed `maskTopHeight: 0` again after the "fix."

The actual fix replaces any `scrollIntoView` block-mode reliance with an explicit scroll offset for oversized targets:

```js
const preScrollRect = target.getBoundingClientRect();
const tooTallToCenter = preScrollRect.height > vhEstimate * 0.85;
if (tooTallToCenter) {
  const TOUR_TOP_MARGIN = 70;
  const absoluteTop = preScrollRect.top + window.scrollY;
  window.scrollTo({ top: Math.max(0, absoluteTop - TOUR_TOP_MARGIN), left: 0, behavior: 'auto' });
} else {
  target.scrollIntoView({ block: 'center', behavior: 'auto' });
}
```

Normal-sized targets keep the existing centered behavior unchanged. Re-verified live: the top mask now measures a real, substantial height (259px in the reproduction case — more than the requested 70px margin, likely because the target's on-page position combined with the deliberate offset works out differently than a flat pixel count suggests, but unambiguously a real, visible dark region rather than zero) with a clearly visible ring border around the spotlighted card. The bottom mask still clamps to zero for a target this tall — expected and fine, since the card genuinely does run off the bottom of the screen; the fix's job was only to guarantee at least one clear visual boundary, not to make an oversized target somehow fit.

### Verification (v7.84)

Checked with Playwright across two comprehensive runs rather than spot checks: a full 17-step forward walk through the Demo Tour, and a full 16-step backward walk from the end back to step 0 — the latter crossing every single page boundary in the tour (Nutrition → Train → Plan → Progress → Home) via `tourBack()`, checking that every step's target resolves to a real, non-zero, non-`(0,0)` rect both times. Both runs came back clean except for one already-known, already-flagged issue (`nutr-save-badge-wrap` — the Dinner-recipe data problem reported separately and still pending its own fix), confirming neither engine bug has any other instance lurking elsewhere in the current step lists.

### Addendum (v7.85): manual-scroll drift, and three onEnter resets Back was missing

**`window.scrollTo`/`window.scrollY` were always dead code.** `html`/`body` never scroll in this app shell — `#content` is the only real scrollable element (flex child of `#app`, `overflow-y: auto`). The v7.84 tall-target fix above scrolled via `window.scrollTo` and read the current offset via `window.scrollY`, both of which only ever affect/read `window`'s own scroll position — permanently `0` here, since nothing about the layout lets `window` scroll at all. In practice this meant the tall-target branch was a no-op: calling it never actually moved anything, so whatever scroll position `#content` happened to be sitting at (including one left over from the person manually scrolling to read a tooltip, since the mask doesn't block scroll gestures) stayed exactly where it was, and the tooltip/mask got positioned against that stale rect — reported as the tooltip rendering out of frame after scrolling mid-tour.

Fixed two ways together, since either alone leaves a gap:

1. **Scroll `#content`, not `window`**, in the tall-target branch:
```js
const absoluteTop = preScrollRect.top; // scrollTop was just reset to 0 (below), so this
                                        // viewport-relative top IS the absolute offset
if (_tourScrollEl) _tourScrollEl.scrollTop = Math.max(0, absoluteTop - TOUR_TOP_MARGIN);
```
2. **Reset `#content.scrollTop` to `0` at the very top of `_renderTourStep()`**, before anything measures against it — on every single step render, Next and Back alike, not just the tall-target case:
```js
const _tourScrollEl = document.getElementById('content') || document.scrollingElement;
if (_tourScrollEl) _tourScrollEl.scrollTop = 0;
```
This gives every step a known, consistent starting scroll position regardless of what the person did with the previous tooltip on screen, rather than only patching the one branch that happened to be visibly broken. The normal-size-target branch (`scrollIntoView({block:'center'})`) already self-corrected against manual scroll drift on its own, but resetting first keeps both branches working from the same baseline and is cheap enough to apply unconditionally.

**Three Back-specific respotlight bugs, all the same shape: an `onEnter` written for the forward path only.** Each of these steps' `onEnter` set up exactly what forward navigation needed and assumed nothing else would ever change the relevant state before landing there — true when the tour only ever moves forward through a segment, false the moment Back can land on the same step after a *later* step's `onEnter` has already mutated shared state.

1. **Progress's first insights-card step** (`onEnter: () => { insightsIndex = 0; }`) never touched `_aiAdviceBodyOpen` and never called `renderProgress()`. Forward, this didn't matter — the card was already collapsed on first arrival. Back from the narrative step (which sets `_aiAdviceBodyOpen = true` and re-renders) landed back on this step with the advice section still expanded and no re-render to fix it, so the ring stayed sized to the larger, expanded card instead of shrinking back to this step's actual (collapsed) content — reported as "the spotlight doesn't reduce to its position before clicking next." Fixed by having this step's `onEnter` also reset `_aiAdviceBodyOpen = false` and call `renderProgress()`, same pattern the other insights-card steps already used.

2. **The Aggressive-plan step** never reset `insightsIndex`. Forward, it didn't need to — `insightsIndex` was already `0` from the first step and nothing in between changes it. Back from the Next Cycle step (whose `onEnter` sets `insightsIndex = 2` to jump the swipe deck to a different card) landed back on the Aggressive-plan step with `insightsIndex` still `2`, so the deck kept showing the Next Cycle card underneath a tooltip/ring meant for the Aggressive plan — reported as "the swipe deck doesn't revert back to the insights card with the aggressive plan expanded and spotlighted." Fixed by adding `insightsIndex = 0` to this step's `onEnter` (and, defensively, to the narrative and Sustainable-plan steps' `onEnter` too, since Back can in principle land directly on any of them).

3. **The Nutrition ellipsis-menu step** (`meal-menu-btn-Dinner`) never closed `modal-nutr-manual`. The following step opens that modal in its own `onEnter` and only ever closes it via the tour's `onComplete`/`onSkip` handlers — there was no path that closed it on a plain Back. Back from the Quick Add step therefore left the modal sitting open on top of (and blocking interaction with) this step's spotlighted `···` button — reported as "the quick add modal stays open." Fixed by adding `onEnter: () => closeModal('modal-nutr-manual')` to the ellipsis-menu step; `closeModal()` is already a no-op against an already-closed modal, so this is harmless on the forward pass too.

All three fixed identically in both the Demo Tour's step list and the corresponding Mini-Tour's own copy (Progress Mini-Tour, Nutrition Mini-Tour) — the two lists are separate literal arrays, not shared, so each needed the same edit applied twice.

### Addendum (v7.86): tooltip pinned below the safe area instead of flipping placement

Reported live via screenshot: the AI-advice narrative step's tooltip rendered with its title and part of its body underneath the status bar / dynamic island, its progress dots and Back/Next buttons pushed up into (or past) that same unsafe area — on that particular device, functionally unreachable.

**Root cause.** The v7.84-era placement logic preferred putting the tooltip below the target, flipping it above only if there wasn't enough room before the floating nav bar (`roomBelow >= tipHeight ? 'bottom' : 'top'`). The 'top' branch clamped the tooltip's vertical position with `Math.max(16, top - tipHeight - 14)` — a flat 16px screen-edge margin that has no idea where the safe area actually starts. On a target positioned far enough down the page that flipping to 'top' was the natural choice (exactly the AI-advice narrative card in the reproduction — same target as the v7.84 oversized-card fix, tall enough that `top - tipHeight - 14` landed above the safe area), the tooltip rendered flush with the literal top of the viewport, safe-area-inset be damned.

**The fix drops the flip entirely** rather than patching the clamp, per an explicit design call: the tooltip is now *always* pinned at `safeTop + 12px` from the top of the viewport, for every step, with no placement decision to get wrong in the first place.

```js
const safeTopPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top')) || 0;
const tipTop = safeTopPx + TOUR_TOOLTIP_TOP_GAP; // TOUR_TOOLTIP_TOP_GAP = 12
```

Since the tooltip no longer moves to accommodate the target, the target now has to move to accommodate the tooltip. `_renderTourStep()` renders the tooltip's content first — purely to get its real `offsetHeight`, since title/body length varies step to step — then scrolls `#content` so the target's top lands just below the tooltip and its arrow:

```js
const contentStartY = tipTop + tipHeight + TOUR_TARGET_GAP; // TOUR_TARGET_GAP = 24
const preScrollRect = target.getBoundingClientRect(); // scrollTop was reset to 0 just above
_tourScrollEl.scrollTop = Math.max(0, preScrollRect.top - contentStartY);
```

This is deliberately the *same* calculation for every target regardless of size — it replaces both the old normal-target `scrollIntoView({block:'center'})` path and the v7.84 oversized-target explicit-offset path with one path. The v7.84 "spotlight covers the whole page" bug (both mask pieces clamping to zero height for a target taller than the viewport) can no longer occur by construction: the target's top is always pinned to a known line below the tooltip, so the top mask always has real height between the top of the screen and that line, and the ring/bottom-mask simply clip to whatever of the target happens to be visible below it — accepted as correct rather than special-cased, per the same "spotlight shows whatever is visible" call. A target that's taller than the remaining viewport, or one that still runs off the bottom after this scroll, is no different from any other content the person can scroll further to see; the mask no longer tries to guarantee the whole thing fits.

**Known tradeoff, accepted rather than engineered around.** A target sitting very close to the natural top of its screen (nothing above it to scroll away) can't be pushed down past `contentStartY` if that line falls below the target's unscrolled position — `scrollTop` is already clamped to its minimum of `0` in that case. In practice this only affects a small number of first-in-segment targets (e.g. `home-goal-banner`, the very first element on Home); the tooltip may sit slightly over the top of such a target rather than cleanly above it. Not fixed here deliberately — doing so would mean re-introducing per-target special-casing (extra scroll padding, a shrink-to-fit tooltip, etc.) for a purely cosmetic edge case, working against the same simplification this whole addendum is about. Back/Next remain fully reachable regardless, since the tooltip itself is never displaced from its fixed safe-area-anchored position — the one property this fix actually exists to guarantee.

Also removed as dead weight: the `placement: 'auto'|'top'|'bottom'` step-shape option (documented but never actually used by any step in any tour) and the `roomBelow`/nav-bar-clearance calculation that used to decide the flip.

### Addendum (v7.87): dynamic placement restored — the safe area needed a clamp, not a lockdown

v7.86 removed the tooltip's above/below flip entirely in response to the dynamic-island screenshot, on the reasoning that a fixed position could never again render in the unsafe area. Correct, but broader than what was actually asked for: the follow-up request clarified the tooltip should still be able to go either above or below the target — whichever side has more room — it just must never be allowed to cross into the safe area. v7.86 had fixed the symptom by removing the mechanism it belonged to.

**Reverted:** the placement decision goes back to comparing actual room on each side of the target:
```js
const roomAbove = top - safeTopPx;
const roomBelow = vh - bottom - 90; // keep clear of the floating nav bar
const placement = roomBelow >= roomAbove ? 'bottom' : 'top';
```
This differs slightly from the pre-v7.86 (v7.84) version, which was `roomBelow >= tipHeight ? 'bottom' : 'top'` — "prefer below unless it doesn't fit." The new version picks whichever side has strictly more space, per the explicit "go wherever has more space" instruction, rather than defaulting to below whenever it's merely adequate.

Also reverted: the v7.84 scroll behavior (`scrollIntoView({block:'center'})` for normal-sized targets, an explicit `TOUR_TOP_MARGIN` offset scroll for targets taller than 85% of the viewport). This had to come back too — v7.86's "scroll the target below a fixed tooltip position" approach only made sense when the tooltip's position was fixed; with placement dynamic again, the tooltip needs the target's settled position to decide which side to render on, not the other way around.

**What actually stayed fixed, and is the real point of this addendum:** the 'top' placement's clamp.
```js
// v7.84 / broken:
tipTop = Math.max(16, top - tipHeight - 14);
// v7.87 / fixed:
tipTop = Math.max(safeTopPx + 16, top - tipHeight - 14);
```
This one-line change is the actual root-cause fix for the original screenshot — a flat `16px` screen-edge margin has no idea where the safe area ends, so a 'top' placement could render flush with the literal top of the viewport, underneath the status bar / dynamic island. Clamping against `safeTopPx + 16` instead means 'top' placement can now legitimately be chosen (whenever there's more room above the target than below), and the tooltip will still never cross into the unsafe area — worst case, if the target sits too close to the top of the screen for the full tooltip height to fit above it, the tooltip simply overlaps the top of the target slightly rather than ever creeping upward past the safe line. Given the target is still fully spotlighted underneath regardless, this is a minor cosmetic compromise in a genuinely rare case, not a functional one — Back/Next remain reachable either way, which was the actual complaint.

Mask/ring behavior — clipping to whatever portion of the target is visible, no special-casing for an oversized target — is unchanged from v7.86; that part of the redesign wasn't in question this round, only the tooltip's own placement mechanism.

## 34. Module: Demo Data Fetch (v7.76)

Build Order step 4. `bloc-demo-data.json` ships as a second static file, deployed alongside `index.html` in the same GitHub Pages directory. This is a genuinely new thing for the app: BLOC has been fully offline-first since v1 — every read and write goes through `localStorage` only — and this is its first network dependency of any kind. It's same-origin and static (not a third-party call), but the fetch still has to assume it might fail, since nothing about offline-first behavior should regress for it.

### New-user detection

```js
const _isNewUserOnBoot = !localStorage.getItem('bloc_state');
load();
fetchDemoDataIfNewUser(_isNewUserOnBoot);
```

The check happens **before** `load()` runs, not after. `load()` only ever reads `localStorage` — populating the in-memory `state` object with defaults if nothing's there — it never calls `save()` itself. So checking `bloc_state`'s presence beforehand is the one accurate way to know "has this device ever actually saved anything," as opposed to "is `state` currently empty," which would also be true for other cases (mid-way through a manual Clear All Data, for instance).

This also means the fetch naturally never re-fires after a device's first successful save — no separate `bloc_demo_seen` flag needed. The Demo Tour's own wipe-and-handoff (§5 of the scope doc, not yet built) ends by writing a fresh real `state` via `save()`, which is itself what permanently closes the window for this fetch to run again on that device. The one edge case — someone opens the app, the Demo Tour begins, and they leave before it finishes without anything ever being saved — correctly re-triggers the fetch (and the tour) on their next visit, which is the right behavior: nobody should get stuck mid-demo with no way back in.

### Fetch + failure handling

```js
let demoData = null; // parsed bloc-demo-data.json, once successfully fetched

function fetchDemoDataIfNewUser(isNewUser) {
  if (!isNewUser) return;
  fetch('bloc-demo-data.json')
    .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
    .then(data => { demoData = data; })
    .catch(err => { console.warn('[demo] bloc-demo-data.json fetch failed...', err.message); });
}
```

Every failure path — network error, 404, malformed JSON, an ad-blocker, a stale Pages cache — collapses to the same outcome: `demoData` stays `null`, nothing throws, nothing blocks the rest of boot, and the person lands on the ordinary empty-state onboarding the app has always had. The only trace is a `console.warn`, deliberately not surfaced to the person — a missing demo file is a deploy problem for later, not something a new user should ever see an error about.

Nothing reads `demoData` yet as of v7.76. Build Order step 5 (the Demo Tour sequence itself) is what will actually apply it into `state`, pin the app's "today" to the dataset's anchor date (2 Aug 2026, per the scope doc's §3.2), and drive `startTour()` (§33) through it.

### Verification

Checked with Playwright against a local static file server (`python -m http.server`, not a `file://` load — `fetch()` of a relative same-origin JSON path needs real HTTP semantics to behave like production GitHub Pages will) covering three cases: a genuinely new user (empty localStorage) triggers the request and `demoData` populates with the real dataset; a returning user (pre-seeded `bloc_state`) makes zero request for the file at all, confirmed via a Playwright route interceptor rather than just checking the outcome; and a deliberately aborted/blocked request leaves `demoData` null with no uncaught error and the Home screen rendering normally, confirming the offline-first guarantee holds even with this new dependency in place.

## 35. Module: Tour "Today" Anchor (v7.77)

Part of Build Order step 5 (the Demo Tour sequence), split out on its own since it turned out to be a genuinely separate piece of work worth getting right in isolation before wiring it into an actual tour flow.

### The problem

The demo dataset's anchor date is Sunday 2 Aug 2026 (`bloc-onboarding-tour-scope-v3.md` §3.2) — every engineered number in it (the plateau signal, the 14-day kcal trend, the measurement-reminder banner's 4-day window, the AI advice narrative) was computed against that exact date being "today." If the app used the device's *real* current date instead while showing that data, every one of those carefully-matched figures would silently disagree with the advice text sitting right next to it — worse the further the real calendar drifts from Aug 2026.

`getLocalToday()` looked like the obvious single choke point to override — its own doc comment says it's "used everywhere instead of `Date#toISOString()`" — but an audit turned up **17 other call sites** independently constructing `new Date()` for the exact same "what is today" purpose, entirely bypassing it: Progress's date header, the weekly-average window, plateau detection's cutoff, the Home page's day-of-week elapsed-week calc, `calcAge()` (which feeds the BMR/TDEE numbers the demo's protein/kcal figures are built on), several cycle active/past comparisons, an ETA projection, and the Nutrition date-picker's "Yesterday" button. None of these were bugs before this feature existed — the real device date and "today" were always the same thing — but every one of them needed fixing for an anchor override to actually work end-to-end rather than half-work in a way that would be confusing to debug later.

### The fix

```js
let _tourAnchorDate = null; // 'YYYY-MM-DD' while the Demo Tour is active, else null
function setTourAnchorDate(dateStr) { _tourAnchorDate = dateStr; }
function now() {
  return _tourAnchorDate ? new Date(_tourAnchorDate + 'T00:00:00') : new Date();
}
```

`now()` (DATE HELPERS section, next to `toLocalDateStr()`) is the one function every "what is today" call in the app goes through. `getLocalToday()` is now just `toLocalDateStr(now())`. All 17 other identified call sites were converted from `new Date()` to `now()` in place — same behavior, same return type, zero logic changes beyond the source of "today" itself.

**Two deliberate exceptions, not converted:**
- A new macrocycle's default name (`` `${label} ${year}` ``, in `fillNextCycleMacroModal()`) still uses a real `new Date().getFullYear()`. This only matters for the Macrocycle Creation Tour and general macro creation — both real, non-demo flows — where the actual current year is exactly what should be suggested, anchor or not.
- `now()`'s own internal `new Date()` fallback, for the obvious reason.

`Date.now()` (epoch-millisecond uniqueness tokens, e.g. `'sg_' + Date.now()` for sample-day group ids) is untouched by design — these aren't calendar-date semantics at all, and anchoring them would risk id collisions across a pinned-date session rather than prevent anything.

### Verification

Checked with Playwright: `getLocalToday()` returns the real device date with no anchor set; setting `setTourAnchorDate('2026-08-02')` makes it return that exact string, `now().getDay()` correctly reports `0` (Sunday, matching the scope doc's own description of the anchor date), and `calcAge()` computes against the anchored date; clearing the anchor (`setTourAnchorDate(null)`) reverts `getLocalToday()` to the real device date on the very next call; and a direct `new Date().getFullYear()` check (simulating the macro-name-year exception) confirmed it stays on the real year throughout, unaffected by the anchor being set.

### Still outstanding (as of v7.77)

Nothing in the app calls `setTourAnchorDate()` yet, and `demoData` (§34) still isn't applied into `state` anywhere. §36 (below) is where both of those get wired together.

## 36. Module: Demo Tour Sequence (v7.78)

Build Order step 5, and the point where the tour engine (§33), the demo-data fetch (§34), and the "today" anchor (§35) all get wired together into something that actually runs. As of this version, a genuinely new user (empty `bloc_state`) sees the full Demo Tour automatically on first load, with no manual trigger anywhere.

### Enter / exit

```js
function enterDemoMode() {
  if (!demoData) return;
  state = JSON.parse(JSON.stringify(demoData)); // deep copy, never mutates the cached fetch
  setTourAnchorDate('2026-08-02');
  showScreen('home');
}

function startDemoTour() {
  enterDemoMode();
  requestAnimationFrame(() => setTimeout(() => {
    startTour(buildDemoTourSteps(), {
      allowSkip: false,
      finalLabel: 'Get Started',
      onComplete: exitDemoMode,
    });
  }, 400));
}
```

`enterDemoMode()` deep-copies `demoData` into `state` rather than assigning the reference directly — the tour's own `onEnter` hooks (expanding exercise cards, opening the AI-advice narrative/plan sections, opening the Nutrition manual-entry modal) mutate `state` and other module state freely as the person moves through it, and none of that should ever leak back into the object `fetchDemoDataIfNewUser()` cached. `startDemoTour()` is called directly from that fetch's success path (§34) — the 400ms delay after the state swap and re-render gives Home's count-up animation and first paint room to settle before the mask/tooltip in `startTour()` measures anything, the same pragmatic pattern the tour engine already uses for `scrollIntoView` (§33).

`exitDemoMode()` is the wipe-and-handoff described in the scope doc's §5: it clears the anchor (`setTourAnchorDate(null)`, so the very next `getLocalToday()` call reverts to the real device date), then rebuilds `state` to the exact same empty shape `clearAllData()` uses — deliberately the same object literal, so the two never drift apart — and this is the one `save()` call in the whole flow. Per the scope doc, this should route into forced profile entry next; that gate is Build Order step 6 and doesn't exist yet, so it currently lands on a plain empty Home screen instead, marked with a `TODO` at the call site.

### Step list

`buildDemoTourSteps()` returns the 15-step array `startTour()` walks — copy is the first-pass draft from `bloc-onboarding-tour-scope-v2.md` §10.2, plus the Progress AI-advice two-step split and the two Train additions from `-v3.md` §10.4. Target ids are the ones added in the ID prep pass (§32) and the tour engine's own build (§33); several steps carry an `onEnter` that navigates screens (`showScreen(...)`) or expands/opens something that's collapsed or modal by default before the spotlight measures its target — the AI-advice narrative and selected-plan sections (`_blocAdviceSectionsOpen.narrative`/`.selected`), and the Nutrition manual-entry modal (`openModal('modal-nutr-manual')`).

### The Train-steps bug, and why the fix is a dynamic lookup rather than a name

The two Train steps (progression choice, missed-target lock) were originally going to target one specific exercise each by name, matching the scope doc's own description: Lat Pull Machine as the clean "choose your progression" example, Lat Pulldown as the locked one. Testing surfaced a real disagreement — the app's live progression-lock evaluation (re-derived from logged sets against targets on every render, not just read back verbatim from the dataset's stored `progressionLocks` blob) locked a *different* exercise than the dataset's own `progressionLocks` keys implied it should. Rather than patch the dataset or hardcode around one specific observed mismatch, both steps now expand every exercise on the tour's Train landing day at once and dynamically find whichever one the DOM actually shows as locked vs. normal:

```js
const expandAllExercisesForDay = () => {
  const macro = state.macrocycles.find(m => m.id === macroId);
  if (!macro) return;
  exList.forEach(ex => { expandedExercises[`${macroId}_${week}_${day}_${ex.id}`] = true; });
  renderTrainDay(macro);
};
// ...
onEnter: (step) => {
  expandAllExercisesForDay();
  const found = document.querySelector(`[id^="prog-selector-${macroId}-"]`);
  if (found) step.targetId = found.id;
}
```

Each step's `targetId` starts as a harmless placeholder (`'train-hero'`) and is overwritten inside `onEnter` once the real element is known — the tour engine (§33) calls `onEnter` before it reads `step.targetId` for that render, so mutating the step object in place is exactly the intended extension point, not a workaround. This makes both steps correct regardless of which specific exercise the live logic locks, and immune to ever going stale if the dataset or the progression logic changes later — a meaningfully more robust fix than hardcoding around the one mismatch this session happened to find.

### Verification

Checked end-to-end with Playwright against a local static server: on a fresh page load with empty `localStorage`, the tour starts automatically, `state.macrocycles` holds the demo macro, and `getLocalToday()` correctly reports the anchor date (`2026-08-02`) while the tour is active. Clicking through all 15 steps via the tooltip's Next/Get Started button advances the tour index by exactly one every time with zero auto-skips (the tour engine's target-not-found safety net, §33, never fires) — confirming every one of the 15 target ids resolves correctly at the point its step renders, including the two dynamically-resolved Train ids. Screenshots at the Train progression-selector step and the Nutrition Per-item/Per-gram modal step both confirmed correct visual positioning and real demo data on screen (the engineered Dinner meal breakdown, the locked/normal exercise split). On completion, `state.macrocycles.length` is back to `0` and `getLocalToday()` reverts to the real device date, confirming the wipe-and-handoff and anchor-clear both fire correctly.

### Still outstanding

The profile-entry hard-block gate (§37, below) and the Macrocycle Creation Tour (§38) are what §36 originally left outstanding — both are now built. The Settings Help-icon → Mini-Tours modal (Build Order step 8) and the API-key redirect (step 9) remain unbuilt. Real on-device iOS PWA verification of the full tour system (as opposed to the emulated-viewport Playwright testing done throughout §33–§38) is still outstanding.

### Addendum (v7.82): welcome screen, an `_aiAdviceBodyOpen` bug, and two copy/targeting fixes

**Welcome screen.** `startDemoTour()` no longer goes straight from `enterDemoMode()` into the spotlight sequence — it now opens `modal-tour-welcome` first (brief "Welcome to BLOC" intro + a "Let's go →" button), and the actual sequence only starts once that button is tapped, via the new `beginDemoTourSteps()`. Ordinary `.modal-overlay` — dismissable the normal way (backdrop tap, swipe-down) same as any other modal, not hard-blocked like the profile gate. Caught a self-inflicted bug while building it: the markup used JS-style `\u2192`/`\u2014` escape sequences inside static HTML rather than inside a `<script>` string, where they don't get interpreted at all and render as the literal six-character text `\u2192` — confirmed via screenshot, fixed by using the real → and — characters directly.

**A real bug in the AI-advice steps, found by testing (not by reading code).** The narrative/selected-plan steps set `_blocAdviceSectionsOpen.narrative`/`.selected`, matching the toggle names used inside `buildAiAdviceCardHTML()`. What wasn't obvious from that function alone: `buildInsightsCardHTML()`, the caller that actually wraps the advice card into the page, gates the ENTIRE `aiAdvice.body` (headline, narrative, both plan sections — everything `_blocAdviceSectionsOpen` controls) behind a separate, outer flag, `_aiAdviceBodyOpen` (the "View BLOC AI advice" collapse toggle), which the tour never touched. Setting the inner flags true had no visible effect because the whole section they lived inside was still collapsed. Diagnosed by live-testing rather than re-reading the render functions harder: called `buildAiAdviceCardHTML()` directly in a Playwright `page.evaluate()` and confirmed it returned real content (`body.length` in the thousands), which ruled out the data/eligibility logic — then traced forward from there to find where that returned `body` actually gets used, landing on the `_aiAdviceBodyOpen ? aiAdvice.body : ''` gate. Fixed by setting both flags together in both onEnter handlers (Demo Tour and Progress Mini-Tour, §39 — same bug, same fix, both had it since they share near-identical step definitions):

```js
onEnter: () => { _aiAdviceBodyOpen = true; _blocAdviceSectionsOpen.narrative = true; renderProgress(); }
```

Confirmed live afterward: the advice headline text and "Challenge this" section both now genuinely appear in `progress-body`'s rendered HTML.

**Nutrition copy.** The "Two shortcuts worth knowing" step referenced a swipe-to-copy-from-yesterday gesture that's no longer part of the intended demo narrative — trimmed to a single step about the `···` meal-options menu only (title/copy changed in both the Demo Tour and the Nutrition Mini-Tour).

**Progress "swipeable decks" step retargeted.** The hero card stopped being a swipe deck at some point in the app's own redesign history, making the original copy ("swipe left and right on both this card and the one below") describe a UI that no longer exists. Retargeted from `progress-hero-wrap` to `progress-tables-wrap` (the weekly-summary/swings/measurements deck, confirmed still genuinely swipeable), with copy now referencing the insights card (`progress-body`) seen a few steps earlier instead of a "card below" that isn't swipeable. This step is what surfaced the `scrollIntoView` timing bug documented in §33's addendum — it's a much larger scroll distance than any earlier step needed.

### Addendum (v7.83): AI-advice steps split into three, and a missing Next Cycle spotlight

**Narrative / Sustainable / Aggressive, not narrative / "chosen plan."** The single "Your chosen plan" step became two — one for the Sustainable plan, one for the Aggressive plan, the latter explicitly calling out the "Challenge this" feature. The underlying UI doesn't have a fixed Sustainable/Aggressive pairing to `_blocAdviceSectionsOpen`'s `.selected`/`.alt` flags — `.selected` always shows whichever plan was actually *chosen*, `.alt` always shows the other one, regardless of which one that happens to be. Naming a step "The Sustainable plan" and just setting `.alt = true` would be correct for this dataset (`chosenPath: 'aggressive'`, so Sustainable is genuinely the alt) but wrong for any dataset or real Mini-Tour user whose chosen path is Sustainable instead. Fixed by reading `state.blocAdvice.chosenPath` at each step's `onEnter` and deriving which flag corresponds to which named plan on the fly:

```js
const chosenPath = state.blocAdvice && state.blocAdvice.chosenPath;
_blocAdviceSectionsOpen.selected = chosenPath === 'sustainable';
_blocAdviceSectionsOpen.alt = chosenPath !== 'sustainable';
```

— and the mirror-image check for the Aggressive step. Correct regardless of which plan a real Mini-Tour user actually picked. One case this doesn't specifically handle: an advice instance with no plan chosen yet (`chosenPath` is `null`) renders a different, pre-choice layout — both plans shown side by side unconditionally, with `.selected`/`.alt` not applying to that branch at all. Harmless (the Sustainable and Aggressive steps just show the same already-visible content twice rather than anything wrong), not specifically handled since it's a real-data-only edge case the Demo Tour's dataset never hits (`chosenPath` is always set there).

**A previously-missing spotlight.** The Progress insights deck (`progress-body`) is a 3-card swipe deck — weight/trend/AI-advice (card 1, `insightsIndex = 0`), BMR/TDEE/ETA (card 2), and the Next Cycle Recommendation Engine with its own "ask BLOC for a second opinion" feature (card 3, `insightsIndex = 2`). Every prior version of both the Demo Tour and the Progress Mini-Tour only ever showed card 1 — card 3 was never spotlighted at all, despite being one of the deck's three cards and the app's largest genuinely separate AI-advice feature (`askBlocForNextCycleAdvice()`, `TECHNICAL.md`'s own Next Cycle Recommendation Engine module). Added a new step that sets `insightsIndex = 2` before re-rendering, spotlighting the same `progress-body` container now showing that card's real content. Copy deliberately doesn't assert the second-opinion button is tappable *right now* — its own 3-week-from-cycle-end eligibility gate (checked against the demo dataset's macro: starts 2026-06-08, ends mid-September, well outside the window at the 2 Aug anchor date) means it's realistically showing its countdown state rather than an active button during the demo, and real Mini-Tour users will be at all different points in their own cycles. The final "swipeable decks" step now resets `insightsIndex = 0` in its own `onEnter`, so the person doesn't leave the tour with that deck sitting on the Next Cycle card by default.

## 37. Module: Profile Entry Gate (v7.79)

Build Order step 6. Per `bloc-onboarding-tour-scope-v2.md` §1/§10.1: gender, height, and date of birth become mandatory for a brand-new account, hard-blocking the rest of the app until all three are filled in. Rather than build a separate gate screen, this reuses the existing Settings → About me profile modal (`modal-body-profile`) — only its dismissability and copy change while the gate is active.

### The three pieces

```js
let _profileGateActive = false;

function isProfileComplete() {
  const p = state.profile || {};
  return !!(p.gender && p.heightCm && p.birthday);
}
```

**Blocking dismissal.** Every way a modal in this app can be dismissed — backdrop tap, swipe-down on the handle, the ✕ button (see `initModal()`, §32-adjacent MODALS section) — already funnels through `closeModal(id)`. Blocking it there blocks all three at once:

```js
function closeModal(id) {
  if (id === 'modal-body-profile' && _profileGateActive) return;
  // ...
}
```

The ✕ button is additionally hidden via CSS (`#modal-body-profile.gate-active .modal-close-btn { display: none; }`) rather than left visible-but-inert, so there's nothing on screen that looks tappable but silently does nothing.

**Mandatory validation.** `saveBodyProfile()` normally allows a partial save (leaving a field blank on an edit doesn't erase a previously-saved value — that behavior is unchanged for ordinary Settings use). While gated, it now refuses to proceed unless gender, height, and birthday are all genuinely present, showing an inline `profile-gate-error` message instead of silently accepting an incomplete save:

```js
if (_profileGateActive && !(gender && finalHeightCm && bday)) {
  const errEl = document.getElementById('profile-gate-error');
  if (errEl) errEl.style.display = 'block';
  return;
}
```

On a successful gated save, it clears `_profileGateActive`, removes the `gate-active` class and explainer text, closes the modal, and — since a freshly-gated account has nothing else set up — hands off into `startMacrocycleCreationTour()` (§38).

**Who gets gated.** `maybeOpenProfileGate()` only ever gates a genuinely empty account:

```js
function maybeOpenProfileGate() {
  if (_tourState) return;
  if (!state.macrocycles || state.macrocycles.length > 0) return;
  if (isProfileComplete()) return;
  openProfileGate();
}
```

This is deliberately conservative — an existing real account with macrocycles is never retroactively locked out just because it predates this requirement, even if its profile happens to be incomplete. The `_tourState` check avoids fighting an already-running tour (the Demo Tour's own `exitDemoMode()` calls `openProfileGate()` directly once it's finished, rather than racing this generic check against it). Three call sites: `exitDemoMode()` (direct call, always gates since state was just wiped), `fetchDemoDataIfNewUser()`'s `.catch()` (a new user whose demo fetch failed still needs gating), and boot itself, for a returning device that's somehow still empty.

**A boot-time ordering bug.** The boot-time call originally ran synchronously, immediately after `load()`. `maybeOpenProfileGate()` references `_tourState`, which is a `let` declared later in the same script (inside the tour engine, §33) — and `let` bindings are in the temporal dead zone until their own declaration line actually executes. Calling a function that touches `_tourState` before that line runs throws `ReferenceError: Cannot access '_tourState' before initialization`. Fixed by deferring with `setTimeout(maybeOpenProfileGate, 0)`, which pushes the call to a macrotask after the rest of the script — including `_tourState`'s declaration — has finished executing, the same category of fix already used elsewhere in boot for paint-dependent work (`positionNavPill`'s double-rAF).

### `clearAllData()` now preserves profile

The scope doc requires profile to survive Clear All Data — previously it didn't; `clearAllData()`'s state rebuild explicitly reset `profile: {}` along with everything else. Fixed the same way `keepMode` already worked:

```js
const keepMode = state.mode;
const keepProfile = state.profile || {};
state = { /* ... */ profile: keepProfile, /* ... */ mode: keepMode || 'dark', /* ... */ };
```

A wipe can still leave a 0-macrocycle account with an incomplete profile, if that profile was never filled in before this feature existed — `clearAllData()` now calls `maybeOpenProfileGate()` at the end, treating that case identically to any other empty account rather than special-casing "wiped" vs "never set up."

### Verification

Checked with Playwright across four scenarios: completing the Demo Tour opens the gate automatically, `closeModal()` genuinely refuses to dismiss it, an empty save is rejected with the validation message shown, and a valid save clears the gate, saves the profile, and routes onward; a returning device (pre-seeded `bloc_state`) with 0 macrocycles and an incomplete profile is gated on boot; an existing real account with macrocycles and an incomplete profile is never gated; and Clear All Data on an account with an already-complete profile preserves it exactly and correctly does not re-trigger the gate.

## 38. Module: Macrocycle Creation Tour (v7.80)

Build Order step 7 — the last piece of the core onboarding sequence (Demo Tour → profile gate → this). Triggered only from `saveBodyProfile()`'s gated-completion path; never interrupts an existing account creating a second or later macrocycle through Plan's own "+ New" button.

### Why this tour is structurally different from the Demo Tour

Every Demo Tour step (§36) points at data the tour itself controls — `demoData`, loaded wholesale into `state` before the tour starts. This tour points at a **real macrocycle the person is actually creating**, filled in with whatever they type. That difference forces two things the Demo Tour never needed:

1. A genuine pause for real user input. The tour can't fill in the macrocycle name, weeks, or start date on the person's behalf — it has to wait for them to do that for real and tap Create. This is exactly what `waitForAction` (§33) was built for: the step targets `macro-create-btn` directly, shows no Next button, and advances only when the real button is genuinely clicked, running the real `createMacrocycle()` handler as a side effect of that same click — not simulated in any way.
2. Handling a real side effect of that real action. `createMacrocycle()` calls `maybePromptCreateGoal()`, which can pop a `showConfirm()` "Add a goal?" dialog. Left alone, that dialog would sit underneath the tour's z-index-400 mask, unreachable. The next step's `onEnter` dismisses it programmatically — `document.getElementById('confirm-cancel-btn').click()` — the same action tapping "Not now" would take. Goal creation isn't part of this tour's scope; the person can still add one later through the normal flow.

### The bridge step

Six steps are named in `bloc-onboarding-tour-scope-v2.md` §10.3 (goal type, start date, split & microcycles, weight vs cardio, exercise type, supersets). A seventh — the `waitForAction` step targeting `macro-create-btn` — isn't one of them; the doc only ever specified *what* to explain, not the mechanics of handing off between two separately-triggered real creation flows (the macrocycle modal, then the exercise editor). Documented in-code as a deliberate addition rather than left unexplained.

### A copy correction

The scope doc's original Monday-rule tooltip read: *"BLOC will snap your start date forward automatically."* That's not what the app does — `createMacrocycle()` blocks the save and flashes the start-date field red instead (`isMondayDateStr()` check, matching the README's v7.29 entry: "blocked, not just warned"). Shipping the original copy would have described behavior the person was about to watch *not* happen. Rewritten to match reality:

> Every calculation in BLOC — deload weeks, calendar weeks, mesocycles — assumes week 1 starts on a Monday, so BLOC blocks any other date until you pick one that lines up.

### A second modal-leak bug, same category as before

Testing this tour surfaced a second instance of the same problem class the Train-steps bug (§36) belonged to: leftover state from an earlier part of the flow silently breaking a later part. The Demo Tour's final step opens `modal-nutr-manual` via `onEnter` and, by design, ends on that step — nothing ever closes it. `exitDemoMode()` wipes `state` but was never touching the DOM's `.open` classes, so that modal stayed visually open (z-index 300) sitting in front of `modal-macro` (default z-index 200) once the Macrocycle Creation Tour tried to open it, silently absorbing every click meant for the Create button. Fixed by sweep-closing every open modal at the top of `exitDemoMode()`:

```js
document.querySelectorAll('.modal-overlay.open').forEach(el => el.classList.remove('open'));
```

Brute-force rather than calling `closeModal()` per id, deliberately: `state` is about to be wiped entirely regardless, so none of `closeModal()`'s side effects (camera-stream teardown, keyboard blur) apply or matter here, and this version stays correct even if a future step change leaves some other modal open.

### Verification

Checked end-to-end with Playwright: a full run from Demo Tour completion, through profile entry, through steps 1–3 (Next-button driven), through the real `waitForAction` pause — filling in an actual macro name and a real Monday start date, then clicking `#macro-create-btn` directly rather than simulating the tour's own advance — confirmed a real macrocycle appears in `state.macrocycles` (not faked), the "Add a goal?" confirm dialog is correctly auto-dismissed, and the Add Exercise modal opens automatically for the new macro's first session; the remaining two steps and completion land correctly on Plan with the macrocycle intact. A separate run confirmed Skip Tour ends the tour while leaving `modal-macro` open exactly as the person left it, so an in-progress but unfinished macro-creation form is never lost to a skip.

### Still outstanding

Real on-device iOS PWA verification of the full tour system (as opposed to emulated-viewport Playwright testing throughout §33–§39) is still outstanding. Everything else in the Build Order is now built — see §39.

## 39. Module: Mini-Tours + API-Key Redirect Logging (v7.81)

Build Order steps 8 and 9 — the last two items, completing the core onboarding tour system end to end.

### Mini-Tours

Per `bloc-onboarding-tour-scope-v2.md` §1 (recap) and §8.4: fully manual, Settings-triggered, on-demand, never auto-shown or auto-retriggered. A new Help icon (`settings-help-btn`, a circled "?") sits at the top of the Settings screen, opening `modal-tour-help` — a modal listing five buttons, one per page (Home/Progress/Plan/Train/Nutrition), each launching that page's Mini-Tour.

**Structured for a future FAQ tab.** §8.4 specifically asks for the modal to anticipate a Tours-vs-FAQs segmented control without needing a rebuild once only Tours exists. The modal body is a single uppercase label row ("Tours") followed by the five buttons — exactly where a two-tab switcher would slot in later, without restructuring anything below it.

**Real data, not `demoData`.** Every Mini-Tour reuses the same per-page tooltip copy as the corresponding Demo Tour steps (§36), but points at whatever the person's actual current state is — no anchor date (§35), no `enterDemoMode()`. This is a deliberately different contract than the Demo Tour's: real data varies enormously per person (no macrocycle yet, nothing logged today, no AI advice ever requested), so several steps target elements that may not currently hold anything interesting, or may not exist in the DOM at all. Both are fine — the tour engine's target-not-found handling (§33) already skips a step cleanly if its element isn't there, which is exactly the graceful-degradation behavior an "explore the app" tour needs.

**Train Mini-Tour reuses the dynamic-lookup trick.** Same approach as the Demo Tour's Train steps and the Macrocycle Creation Tour's exercise steps: expand every exercise on the *currently active* session (`state.currentMacroId`/`currentWeek`/`currentDay`, not a fixed demo day), then find whichever one actually renders a `prog-selector-`/`locked-notice-` element. A real account might have neither (nothing logged yet) or only one of the two — the dynamic lookup handles all three cases identically, falling back to the `train-hero` placeholder if nothing matches.

**A third instance of the modal-leak bug.** The Nutrition Mini-Tour's last step opens `modal-nutr-manual`, same as the Demo Tour's — and same problem: nothing closed it. Unlike the Demo Tour, a Mini-Tour has no wipe-and-handoff to sweep everything closed at the end, so the fix here is narrower and more explicit — `onComplete`/`onSkip` handlers on `startTour()` that close that specific modal on either exit path:

```js
startTour([...], {
  allowSkip: true,
  finalLabel: 'Done',
  onComplete: () => closeModal('modal-nutr-manual'),
  onSkip: () => closeModal('modal-nutr-manual'),
});
```

Safe to call on both paths even when the modal was never opened (e.g. the person skipped before reaching that step) — `closeModal()` on an already-closed modal is a no-op. This is now the third time this exact category of bug has appeared (Train exercise-name assumption, §36; the Demo-Tour-to-Macrocycle-Tour modal leak, §38; this one) — worth treating "does this step's `onEnter` open something that nothing else closes?" as a standing checklist item for any future tour step, rather than continuing to catch each instance only via testing.

### API-key redirect — logged, not built

Build Order step 9 reads "Log the API-key redirect as a separate small task" — per the scope doc's own §1/§9, this was explicitly scoped *outside* the tour system rather than as something to implement here. Logged in §29's Known Limitations table instead: tapping "Ask BLOC for advice" without a saved key currently shows a disabled button with an inline warning rather than an active redirect into Settings → Linked services (`modal-api-key`). Left as a backlog item per the doc's own instruction, not built as part of this pass.

### A found-but-unrelated bug

Building synthetic-account test fixtures for the Mini-Tours (real data, not `demoData`, needed sparser hand-built state objects than any prior testing in this feature) surfaced a genuine pre-existing crash in `renderProgress()`, confirmed unrelated to anything in the tour system — it reproduces from plain `showScreen('progress')` navigation with no tour code anywhere in the call stack. Logged in §29 rather than fixed here, since chasing it further was out of scope for this pass; see that entry for the reproduction details.

### Verification

Checked with Playwright against hand-built synthetic accounts (not `demoData`) covering two shapes: a real account with a macrocycle and real (non-demo) exercises, and a genuinely empty account with no macrocycle at all. The Help icon opens the modal; the Train Mini-Tour completes without error against exercises with no progression lock or logged history yet (confirming the dynamic-lookup fallback works, not just the happy path already proven in §36/§38); the Nutrition Mini-Tour completes without leaving `modal-nutr-manual` open; the Home and Train Mini-Tours both complete without error against the fully-empty account; and Skip Tour ends a Mini-Tour cleanly. The Progress Mini-Tour's own logic wasn't independently re-verified end-to-end in this pass — it hit the pre-existing `renderProgress()` bug above on every synthetic fixture tried — but it uses the identical mechanism (target `progress-body`, toggle `_blocAdviceSectionsOpen`, call `renderProgress()`) already verified working against real rendering in the Demo Tour's Progress steps (§36), so it's judged correct by that equivalence rather than independently re-tested here.

---

## 40. Module: Splash Screen (v7.88)

A boot-time animated intro — four "pillar" blocks (Train/Fuel/Overcome/Repeat), the real BLOC wordmark image, and a tagline row — that plays before the real app becomes visible. All markup, CSS, and JS live inline as the first content inside `<body>`, ahead of `#app`, wrapped in a single IIFE that runs on `DOMContentLoaded` (or immediately if the document has already finished loading by the time the script executes).

### Sequence

1. **Drop-in** — the four blocks fall in Tetris order (bottom-left → bottom-right → top-right → top-left), staggered `DROP_STAGGER = 380ms` apart. Each falls over `DROP_FALL_MS = 520ms` on a steep gravity-style ease-in (`cubic-bezier(0.76, 0, 0.87, 0)`), landing with a hard-compress "thud" — `scaleY`/`scaleX` squash with no bounce or overshoot past neutral — plus a ground-shadow opacity/scale flash and a small dust puff kicked out either side.
2. **Flip** — each block's inner card rotates 180° to reveal its pillar icon, at fixed delays (700 / 1250 / 1800 / 2350ms) offset by `ENTRY_OFFSET` (the total drop-in duration, so flips only start once every block has actually landed).
3. **Lift + reveal** — ~1s after the last flip, the top row lifts 32px and the bottom row lifts 16px (`LIFT_TOP`/`LIFT_BOTTOM` — twice the distance, opening an even gap on both sides of the middle row), and each block's pillar word fades in underneath it. The word's starting position is computed **analytically**, not measured off the live block — see "A measurement bug and how it was avoided" below.
4. **Scatter** — blocks fly outward to random offsets/rotations and fade out, entirely independent of the wordmark/tagline, which stay untouched at this point.
5. **Rise + flight** — the wordmark group (BLOC image + tagline, wrapped together so they move as one) rises from below to its resting position, at the same moment each pillar word's own position offset animates back to `(0, 0)` — landing it in its real, permanent slot in the tagline row. Both run on the same `RISE_MS = 900ms` duration so they visibly arrive together.
6. **Settle** — OVERCOME's word picks up `font-weight: 800` and the accent colour; the three tagline bullets (invisible until now, coloured to match the background) fade in to their normal muted colour.
7. **Fade-out** — after a short hold, the whole splash overlay fades and `#app` is revealed at the same instant — see "Revealing the app" below.

### Timing constants

```js
var DROP_STAGGER = 380;   // ms between each block starting its fall
var DROP_FALL_MS = 520;   // fall duration per block
var ENTRY_OFFSET = DROP_STAGGER * (dropOrder.length - 1) + DROP_FALL_MS + 400 + 150;
                           // last drop start + fall + thud settle + breathing room
var RISE_MS = 900;        // wordmark-group rise / pillar-word landing duration — must
                           // match the CSS transition durations on both
var LIFT_TOP = 32;        // px — must match .block.lifted-top translateY(-32px)
var LIFT_BOTTOM = 16;     // px — must match .block.lifted-bottom translateY(-16px)
var BLOCK_SIZE = 70;      // px — must match .block width/height
var REVEAL_GAP = 8;       // px between a lifted block's bottom edge and its word
```

`pauseUntil` (the lift+reveal trigger), `scatterAt`, and `riseAt` are each derived by adding a fixed offset to the previous stage's start time, all defined inline in `runSequence()`/`boot()` rather than as separate named constants.

### Pillar words: same-element offset, not a floating clone

Each pillar word is a permanent child of the real tagline row — the same DOM element is visible under its block during the reveal step and in the tagline at the end; there's no separate floating clone. It starts displaced via an inline CSS custom-property transform (`transform: translate(var(--fx), var(--fy))`), set once, analytically, at reveal time; "landing" is simply that transform animating back to `(0, 0)`, which is the word's own natural resting position in the tagline's flex row — nothing else to compute.

This replaced an earlier approach (built, then discarded during development) that used a separate `position: fixed` clone, measured via `getBoundingClientRect()` at flight time against a hidden target row. That approach proved unreliable across several iterations — pillar words landing at coordinates unrelated to the actual block or tagline position, in one case ending up entirely off-screen. Root cause: the technique relied on an assumption about exactly when `getBoundingClientRect()` reflects a just-changed, still-transitioning value, and that assumption was applied inconsistently across the surrounding code (in one place accounting for a parent's pending transform offset, in another not). The current technique has no such dependency — nothing is ever measured while something else is mid-transition.

### A measurement bug and how it was avoided

The step-3 reveal position (where each pillar word starts, under its block) is computed from `.block-wrap`'s `getBoundingClientRect()` — not `.block`'s. `.block-wrap` never has a transform applied to it at all; only its child `.block` does (for lift/scatter). Measuring the wrap is therefore always safe regardless of what the block is doing at that instant. The lift amount itself (32px or 16px) is added as plain arithmetic on top of the wrap's static rect, rather than trying to read the block's own live position mid-lift-transition — sidestepping the same class of timing assumption described above entirely, rather than getting it right by luck.

### Revealing the app

```css
#app { visibility: hidden; }
#app.bloc-app-ready { visibility: visible; }
```

`#app`'s hidden state is a plain rule in the app's existing `<head>` stylesheet — not something toggled by JS after the page has started rendering — so it applies before first paint, with no frame in which real app content could be visible before the splash covers it. `.bloc-app-ready` is added to `#app` at the exact same point `.fade-out` is added to `#splash` (end of step 7), so the two happen together: the splash animates its own `opacity`/`visibility` down over 0.5s while the app underneath is already visible, producing a crossfade rather than a hard cut the moment the splash disappears.

### CSS scoping

Every splash colour is declared as a custom property on `#splash` itself — `--splash-bg`, `--splash-surface`, `--splash-accent`, `--splash-ice`, `--splash-text`, `--splash-dark-text` — rather than at `:root`. The app's own `:root` already defines `--bg`, `--text`, and `--surface` with different exact values (`--text: #e9e9ed` app-wide vs. `#F2F2F2` in the splash's original design; `--surface: #1c1e2e` vs. `#1E2030`) — declaring the splash's palette globally would have silently overridden the app's real theming everywhere else, not just within the splash. Every splash class selector is also scoped under `#splash` (`#splash .block`, `#splash .face`, `#splash .tword`, etc.) as a second, independent layer of isolation. Checked against the full existing codebase for naming collisions before merging (class names, element ids, and custom-property names) — none found.

### Frequency gate

```js
function qualifiesForSplash() {
  return true;
}
```

Currently unconditional — the splash plays on every real fresh load. "Fresh load" specifically means an actual page parse (`DOMContentLoaded`/script execution from scratch): first open, a force-quit and reopen, or the OS evicting the page from memory in the background and the person then reopening it. It does **not** mean every time the person switches back to the app from another app — on both iOS and Android the page is normally suspended in place and resumed, with no reload and no re-execution of this script. Written as its own named function specifically so a different rule (e.g. once per calendar day, via a `localStorage` date check) is a one-line swap without touching anything else in the module — `qualifiesForSplash()` is the only call site any future frequency change needs to touch.

### Verification

Built and refined iteratively across many rounds of visual review against screenshots (device rendering, layout position, and timing feedback), not automated Playwright testing — unlike the onboarding tour modules above (§32–39), there is currently no automated test coverage for this module. The bug described above (pillar words landing in the wrong position) was diagnosed and fixed from a screenshot showing the actual wrong rendered state, not from a logged or reproduced test failure. Worth treating as a candidate for Playwright coverage in a future pass, given the number of sequenced, timing-dependent DOM state changes involved — a deterministic clock/timer mock would make the whole sequence straightforward to assert against.

### Still outstanding

- Timing constants (drop stagger/fall duration, lift/rise distances, pause lengths) were tuned by eye against an isolated single-page demo, not against the real app's actual boot-time performance — state load, `measureAll()`, font loading, and the rest of the app's own boot work all run concurrently with this module in production, and haven't been confirmed not to affect the felt pacing.
- The horizontal offset (`--fx`) used to position each pillar word under its block is derived from the block's real geometry, but the delta calculation assumes the tagline's flex-row layout doesn't reflow between the moment it's measured and the moment the word lands — true today, but worth re-checking if the tagline's content or styling changes later.


## 41. Module: Home — On-Track Ring Fix + Per-Card Advice Modal (v7.90)

### The bug

`renderHomeHero()`'s ring and its subline text were answering two different questions from two independent code paths. The ring showed `trackedCount / badges.length` — a count of metrics with *any data logged this week*, regardless of whether they were on or off target. The subline separately checked `concerning` (badges flagged red) and could say e.g. "Kcal off target this week" in the same render where the ring showed "4/4". Both were individually correct for what they measured; they just measured different things while sitting side by side, reading as a contradiction.

Fixed by introducing `onTrackCount = withData.length - concerning.length` and using that for both the ring's fraction and its fill percentage. `trackedCount` (data-presence) is kept as a separate variable, still used for the subline's "X of Y tracked so far" wording, which is a genuinely different (and still correct) thing to say there.

### Per-card redesign

Previously each metric card on Home showed no advice text at all — `buildHomeConsolidatedMessage()` (the reconciliation-aware advice engine, see §30/v7.65) existed in full but was never actually called from anywhere. As of this version:

- A card whose badge is red (`getHomeMetricBadge` returning `var(--red)`) gets its progress-bar fill switched from `--accent` to `--red`, and a red info-icon button appears top-right (`position:absolute`, on a `position:relative` card).
- Tapping the icon calls `openHomeMetricAdvice(field)`, which opens `modal-home-metric-advice` — a plain centered modal with the metric's advice content and a single Dismiss button (`closeModal('modal-home-metric-advice')`).
- Nothing else changed about the card layout — this replaces what would otherwise be inline text, per the goal of keeping the grid uncluttered whether a card is on-track or not.

### Data flow

`renderHomeHero()` caches `{ badges, dayMap, weekStart, today, goal }` into a module-level `_homeHeroCache` at the end of every render. `openHomeMetricAdvice` reads from that cache rather than recomputing the whole hero — so the modal always reflects exactly what's currently on screen, and a stale modal can never open against data from a previous render.

See §43 below for how this modal's content was subsequently broadened from "just this field's own line" to the full reconciled kcal/protein/carbs/fats picture.

---

## 42. Module: Extend Macrocycle (v7.91)

### Problem being solved

Adjusting a macrocycle's length was previously only possible by editing `macro.weeks` directly (the mesocycle *count* — see the historical note on `createMacrocycle`). But `getWeekSets()` uses `macro.weeks` as the interpolation denominator for scaling `setsStart`→`setsEnd` across the cycle — `t = (week-1)/(totalWeeks-1)`. Bumping `macro.weeks` on an in-progress cycle silently reflows that interpolation for every week, including ones already completed, retroactively changing what "week 6 of 10" was supposed to mean the moment the cycle became "week 6 of 13".

### Design

Extension is stored as a wholly separate field, `macro.extensionWeeks` (raw calendar weeks — not mesocycles), never folded into `macro.weeks` itself:

```js
function getMacroDurationWeeks(macro) {
  return (macro.weeks || 8) * (macro.weeksPerMeso || 1) + (macro.extensionWeeks || 0);
}
```

Three new helpers do the rest of the work:

- **`getMacroExtensionInfo(macro)`** — converts `extensionWeeks` into whole extra mesocycles plus, when `weeksPerMeso` doesn't divide evenly into the requested weeks, a flag that the trailing mesocycle is partial (only M1 exists — M2 is dropped). E.g. `weeksPerMeso: 2`, `extensionWeeks: 3` → 1 full extra mesocycle (M1+M2) + 1 partial mesocycle (M1 only) = `extraMesos: 2`, `partialFinalMeso: true`.
- **`getMacroEffectiveMesoCount(macro)`** — `macro.weeks + extraMesos`. Every iteration bound that used to just loop `1..macro.weeks` (Train's week picker, `getAllMacroSessions`, volume totals, the Plan progression preview, `computeBodyPartVolumeRange`, the two `currentMeso`/`weekLabel` displays) now loops to this instead.
- **`isMesoMicroValid(macro, week, mc)`** — `false` only for `(totalMesos, 2)` on a macro with a partial trailing mesocycle; `true` for everything else, including every microcycle of every original (non-extension) mesocycle.

Critically, **`getWeekSets`'s `totalWeeks` argument is never changed at any call site** — every one of the ~15 call sites in the codebase still passes `macro.weeks` (the original count) exactly as before. Instead, `getWeekSets` itself was given one new line:

```js
function getWeekSets(ex, week, totalWeeks) {
  if (week > totalWeeks) return ex.setsEnd;
  const t = totalWeeks > 1 ? (week - 1) / (totalWeeks - 1) : 0;
  return Math.round(ex.setsStart + t * (ex.setsEnd - ex.setsStart));
}
```

For any mesocycle number beyond the original count, there's nothing left to interpolate toward — the plan already peaked — so it just holds flat at `setsEnd`. This is effectively "repeat the final mesocycle": since exercises were never stored per-mesocycle to begin with (only ever mesocycle 1's template, reused algorithmically — see the historical note on `createMacrocycle`), holding at peak sets while `getWeekWeight`/`getWeekReps` (which were never a function of total cycle length) keep progressing uninterrupted **is** the repeat, with zero new exercise data to manage.

Verified: `getWeekSets({setsStart:3,setsEnd:6}, w, 7)` for `w` in `[1,4,7]` (no extension) returns `[3,5,6]`, unchanged; for `w` in `[7,8,9]` with the same `totalWeeks:7` (i.e. weeks 8–9 are extension weeks) returns `[6,6,6]`.

### Partial-mesocycle guards

Two spots needed to actively react to a partial trailing mesocycle, not just tolerate it:

- **`selectTrainWeek(w)`** — if the incoming week doesn't have a valid M2 and `state.currentDay` currently points at an `m2` session, it's bumped to the equivalent `m1` key before rendering, so a stale selection from a previous (valid) week can't point at a session that was never generated for this one.
- **Train's day-tab strip** (`weeksPerMeso === 2` branch) — filters `micros` through `isMesoMicroValid(macro, state.currentWeek, mc)` before building rows, so the M2 row simply doesn't render while viewing the partial week.

Verified with Playwright: `getMacroExtensionInfo` for `weeksPerMeso:2, extensionWeeks:3` on a 7-mesocycle macro returns `{ extraMesos: 2, partialFinalMeso: true, totalMesos: 9 }`; `getAllMacroSessions` for week 9 returns only the four `*m1` sessions (no `*m2`); the Train day-tab strip at week 9 renders `['Pull M1','Legs M1','Push M1','Arms M1']` only.

### UI flow

Three modals: `modal-macro-extend-weeks` (numeric-keypad weeks input), `modal-macro-extend-choice` ("Extend last goal" vs "Add new goal period"), `modal-macro-extend-edit` (edit/remove an existing extension). A module-level `_macroExtendTargetId` carries the macro id across all three, since the flow spans separate modal opens.

- **Extend button** — `hero-nav-arrows`, stacked below "+ New"; only rendered when `!macro.extensionWeeks`.
- **Extension badge** — new `#macro-extend-badge` div between `#macro-overview` and `#plan-goals-section`, rendered from `renderPlan()`; only shown when `macro.extensionWeeks` is truthy. Tapping opens the edit/remove modal. Exactly one of {Extend button, badge} is ever visible for a given macro.
- **"Extend last goal"** — reuses the existing `openEditGoal(macroGoalID)` unchanged, then overwrites just the end-date field with `toLocalDateStr(getMacroEndDate(macro))` (now extension-aware automatically via `getMacroDurationWeeks`).
- **"Add new goal period"** — resets `modal._editIdx` and calls `openModal('modal-add-goal')` for its normal fresh-goal defaulting, then overrides the macro select, start date (day after the old final goal's end), end date (new cycle end), kcal/steps (copied from that goal), and re-runs `prefillGoalLabelForSelectedMacro()` + `initGoalMacroSliders(lastGoal)` so the protein/carb/fat sliders back-derive to match the source goal's macros exactly, adjustable from there.
- **Edit/remove** — editing rewrites `macro.extensionWeeks` directly (growing adds weeks, shrinking crops them — no explicit data migration; every extension-aware function already bounds itself off `getMacroEffectiveMesoCount`, so a shrink just stops enumerating the cropped weeks, and any `trainLogs` already saved there are orphaned rather than deleted, consistent with how the rest of the app treats shrinking elsewhere). Remove goes through `showConfirm()` before `delete`-ing the field entirely.

### AI advice prompt

Both prompt builders (`buildBlocAdvicePrompt` and the Next Cycle equivalent) already computed their `Duration:` line from `macro.weeks` directly; changed to `getMacroDurationWeeks(macro)` (automatically extension-aware) with an appended note when `macro.extensionWeeks` is set — e.g. `(base plan 14w, extended by 3w — the extension repeats the final mesocycle at peak sets)` — so the model has the real end date without needing a special flag, and understands *why* the duration changed if it references the cycle's history.

---

## 43. Module: Home advice — full reconciled picture + fats floor to 20g (v7.92)

Two changes to the kcal/protein/carbs/fats reconciliation introduced in §30 (v7.65) and re-surfaced via the per-card modal in §41 (v7.90):

### Fats floor raised 15g → 20g

`RECONCILE_FATS_FLOOR` changed from `15` to `20`. No other change to the cascade itself — the existing trim order (fats toward its floor first, carbs only if fats-at-floor still doesn't fit the budget) already matched the requested priority order of kcal > protein > carbs > fats exactly; only the numeric floor moved. Verified: an artificially infeasible scenario (`kcal: 1200, protein: 260` against real logged data) returns `{ feasible: false, kcal: 1360, protein: 245, carbs: 50, fats: 20, fatsChanged: true }` — `protein` capped 15g below its 260g goal, `kcal` recalculated to cover `protein*4 + 50*4 + 20*9`, `fats` sitting exactly at its new 20g floor.

### Every off-target kcal/protein card now shows the full picture

`openHomeMetricAdvice(field)` previously called `buildAdviceLineHtml` once, for just the tapped field (with a reconciled value substituted in for kcal/protein when applicable — see §41). As of this version, whenever `field` is `kcal` or `protein` (the two that trigger `getReconciledMacroAdvice`), the modal renders **all four** reconciled lines — kcal, protein, carbs, and fats — via four separate `buildAdviceLineHtml` calls, plus a footnote stating the priority order and the fats floor. Tapping the Kcal card and tapping the Protein card, when both are flagged concerning in the same week, now show byte-identical content — the same reconciled solution, since it's one shared computation regardless of which card triggered the view. Verified against real backup data (kcal 1500 target, currently 1663 avg trending over; protein 224g target, currently 204g avg trending under): both cards' modals show the same four lines — Kcal "New target: 1,378/day", Protein "New target: 239g/day", Carbs "New target: 60g/day" (down from its own independent ~100g rate), Fats "New target: 20g/day" (pinned to the new floor) — confirming the cascade correctly squeezed both fats to its floor *and* carbs below its own independent number to make room for the protein increase, matching the "fats first, carbs only once fats bottoms out" rule.

Carbs and steps, when *they're* the flagged/tapped metric (kcal and protein both on track), fall back to the single-field branch unchanged — there's nothing to reconcile against when nothing else needs squeezing.

Carbs' badge polarity (`HOME_METRIC_POLARITY.carbs = 'overBad'`, in `getHomeMetricBadge`) was checked and confirmed already correct against the requirement that carbs only ever flags off-track when *over* threshold, never under — this predates this session's changes (see §29/§59-60-era work) and needed no code change: `behindPace` (currently under, needing to eat *more* to reach target) resolves to `isBad = polarity !== 'overBad'` → `false` for carbs; only `aheadPace` (currently over, needing to eat *less*) resolves `isBad = true`. Verified directly: `getHomeMetricBadge('carbs', 60, 100, ...)` (well under target) returns `{ label: 'On track', color: 'var(--green)' }`.

## 44. Module: Nutrition — Per-Day Planning Row (v7.93)

This module went through several iterations in one working session before landing on its final design — worth recording the journey briefly since the early iterations' reasoning explains why the final one looks the way it does, and because the changelog/version history otherwise makes it look like this shipped in one pass.

### Iteration history (all superseded by the design below)

1. **First cut**: reused Home's `getReconciledMacroAdvice(dayMap, weekStart, today, goal)` directly, gated on `nutrSelectedDate === today`. Simple, but meant the row only ever appeared on today's own page.
2. **Second cut**: broadened the gate to the whole current calendar week (`weekStart`–`weekEnd`), so it stayed visible while browsing any day this week. Still called Home's engine unchanged — every day showed the *same* number (today's rate), just labelled differently.
3. **Third cut**: narrowed the gate to `today`–`weekEnd` (dropping already-passed days, since there's nothing left to plan for a day that's over), and simplified the label to "Adjusted to get the week back on track."
4. **Final design (this section)**: replaced the shared engine with a day-specific one, so each day's suggestion is actually different and reflects only what's logged before it — see below.

### What it is now

A second row of four `.hero-callout` tiles — Kcal, Protein, Carbs, Fats — below the existing goal callouts on `renderNutrHero()`, "logged / suggested" format matching the row above it. Shown only when `nutrSelectedDate` falls between `today` and the end of the current calendar week (Sunday) inclusive, and only when kcal or protein is flagged concerning **right now** (checked via Home's real, today-anchored `getHomeMetricBadge` — a single live fact about whether the week needs correcting at all, independent of which day is being browsed).

### The core design problem this solves

The whole point of this row is to support planning the week one day at a time — today, then tomorrow, then the day after, in order. That requires each day's suggested figure to depend only on days *before* it, and to never move because of that day's own logging. Home's `getWeeklyRequiredDaily` doesn't have this property: the moment "today" (whichever day is passed in) has *any* logged data for a field, it flips from treating that day as still-open (spread the remaining budget across it and every day after) to treating it as settled (exclude it, spread the remainder from tomorrow onward). That's the right behavior for Home's job — a single "is the week on pace right now" read — but wrong for Nutrition's: it would mean the day you're actively looking at silently changes its own suggested target from moment to moment as you add or remove food, and a future day you're planning ahead would incorporate its *own* not-yet-real entries into its *own* suggestion, both of which defeat the point of forward planning.

### `getDayViewRequiredDaily(field, dayMap, weekStart, viewDate, target)`

A parallel function to `getWeeklyRequiredDaily`, deliberately never touching it. The only structural difference: it always takes the "not yet closed" branch, unconditionally — `cutoff` is always `viewDate - 1 day`, `daysRemaining` is always `8 - isoDow(viewDate)` (i.e. always includes `viewDate` itself). `viewDate`'s own entry in `dayMap` is never read. Concretely, for whichever day is being viewed, this always answers "the flat daily rate needed for *this day and every day after it*, based only on what's already logged on strictly earlier days" — exactly the "today behaves like any future day being planned ahead" contract requested.

### `getNutrDayReconciledAdvice(dayMap, weekStart, viewDate, goal)`

A full parallel copy of `getReconciledMacroAdvice` — same kcal > protein > carbs > fats cascade, same 50g/20g floors, same 15g protein-drop cap in the infeasible case — with every `getWeeklyRequiredDaily(field, dayMap, weekStart, today, ...)` call swapped for `getDayViewRequiredDaily(field, dayMap, weekStart, viewDate, ...)`. Kept as a genuine copy rather than a parameterized shared function specifically so the two engines can't accidentally couple to each other as either evolves independently later — Home's math must never change as a side effect of a Nutrition-only tweak, or vice versa.

### Verification

Playwright, against real backup data. Directly confirmed the core property: computed `getNutrDayReconciledAdvice` for today, then simulated adding a 900kcal snack to today's log and recomputed — today's own figures were byte-identical before and after (`kcal: 1420, protein: 227.8, carbs: 82.2, fats: 20` both times). Recomputing *tomorrow's* figures before vs. after that same edit showed the expected shift (`kcal: 1378 → 1216`, flipping from feasible to the infeasible/protein-capped branch) — tomorrow absorbed exactly what today's edit added, today didn't move at all. Also confirmed via screenshot: browsing forward to Sunday with the intervening days left unplanned shows the whole week's remaining budget compressed into that one day, as expected from the cascading design. Gate boundaries reconfirmed: hidden on the two already-passed days this week, visible from today through Sunday, hidden entirely outside the current week.

### Layout

`.hero-callouts` is a fixed 3-column CSS grid (built for the existing Protein/Carbs/Fats row above it). This row overrides `grid-template-columns` inline (`repeat(4, 1fr)`) on just this instance, and drops tile value font-size from the class default 15px to 13px inline, so a 4-digit kcal "logged / suggested" pair (e.g. "1589 / 1378") fits comfortably in a quarter-width column on a ~390px viewport. The label above the tiles is centered (`text-align:center`), matching a follow-up visual fix — it initially inherited left alignment from its container.

## 45. Bug fixes bundled with v7.93

**Duplicated divider below the macrocycle extension badge (Plan page).** The extension badge (§42) drew its own `border-top` *and* `border-bottom`, but `renderPlanGoalsSection()` already draws its own leading `.divider` immediately below wherever the badge sits — two lines stacked with only margin between them once the badge existed. Fixed by dropping the badge's `border-bottom` entirely; the goals section's existing divider now does that job alone, exactly as it did before the badge was introduced.

**Tap-outside-to-close missing on four modals.** `initModal(overlayEl)` — the function that wires up backdrop-tap-to-close for every other modal in the app — requires a `.modal-sheet` child element, and returns immediately (attaching nothing at all, not even the backdrop listener) if it doesn't find one. The four modals introduced in v7.90/v7.91 (`modal-home-metric-advice`, `modal-macro-extend-weeks`, `modal-macro-extend-choice`, `modal-macro-extend-edit`) were all built as plain centered dialogs in the style of `modal-confirm` — which also lacks a `.modal-sheet`, but deliberately: a destructive-action confirmation forcing an explicit Cancel/Confirm choice is a reasonable design to make non-backdrop-dismissible. For these four, the omission was unintentional. Rather than changing `initModal`'s shared behavior (which would also grant `modal-confirm` a backdrop-dismiss it was never meant to have), each of the four overlay elements got an explicit inline handler: `onclick="if(event.target===this) closeModal('...')"`.

## 46. Home advice text — "starting today" vs "starting tomorrow" (v7.93)

Small wording addition to `formatAdviceSublabel`, no math changed anywhere. `getWeeklyRequiredDaily` already internally decided, every time it ran, whether the flat catch-up rate it returned started counting from today (today has no logged data yet for that field, so it's still "open") or from tomorrow (today already has a logged value, so it's settled and excluded) — that decision just wasn't exposed anywhere, so the advice sentence ("Adjust your daily avg by ±X for the rest of the week to hit target") never said which of the two it meant.

`getWeeklyRequiredDaily`'s return object gained one additive field, `startsToday: !todayHasField` (both existing return branches updated identically — no change to `requiredDaily`/`loggedSoFar`/`daysTrackedSoFar`/`daysRemaining`, which every existing caller continues to receive exactly as before). `formatAdviceSublabel` gained a matching `startsToday` parameter, and now renders `for the rest of the week (starting today)` or `for the rest of the week (starting tomorrow)` accordingly. Both call sites (`getHomeMetricSublabel`, `buildAdviceLineHtml`) were updated to pass `info.startsToday` through. This affects Home's advice text only — Nutrition's per-day planning row (§44) never calls `formatAdviceSublabel` and is unaffected.

## 47. Weekly Swings card — kcal/steps/protein switched to per-day target deviation (v7.94)

### The report

Reported against a real backup: W9's steps swing showed −2227/+1915, but the only two days that week below the 12,000 step goal were 428 and 577 short respectively — nowhere near 2227. The card's own doc comment was accurate (it computed the smallest/largest *consecutive day-to-day change*, not deviation from target), and the math checked out exactly against real data: Aug 8→9 dropped from 13,650 to 11,423, a swing of −2227. Confirmed not a bug in the existing definition — but the definition itself wasn't the useful one for three of the four columns.

### The fix

`swingOf(entries)` — smallest/largest change between consecutive chronological entries — is retained as-is and now used for **weight only**, which has no daily target to measure deviation against.

A new sibling, `devSwingOf(dates, field)`, computes smallest/largest `actual − target` across a list of dates for **kcal/steps/protein**:

```js
function devSwingOf(dates, field) {
  if (!macro) return { min: null, max: null };
  const diffs = [];
  dates.forEach(d => {
    const g = getGoalForDate(d, macro.id);
    const target = g ? g[field] : null;
    const actual = dayMap[d][field];
    if (target !== null && target !== undefined && actual !== null && actual !== undefined) {
      diffs.push(actual - target);
    }
  });
  if (diffs.length < 1) return { min: null, max: null };
  return { min: Math.min(...diffs), max: Math.max(...diffs) };
}
```

Resolves each date's own target via `getGoalForDate(date, macro.id)` — the same per-day goal lookup `buildGoalColumnHeroChart` already uses — so a goal change mid-week (e.g. a step target bump partway through) is handled correctly rather than comparing every day in the bucket against a single flat number. Returns `{min: null, max: null}` (rendered as `—` by the existing `swingStr`) when there's no active macro to resolve a target against, or no day in the bucket has both a logged value and a resolvable target.

### Verification

Re-derived W9 by hand against the real backup: steps `11572, 13487, 12442, 12274, 12872, 13650, 11423` against a 12,000 target gives per-day deviations `−428, +1487, +442, +274, +872, +1650, −577` — min/max **−577/+1650**, confirmed live in the rendered card. This now correctly surfaces "worst/best single day this week" rather than "biggest single jump between two consecutive days," which is what the card's use of the word "swing" had been misread as.

### Caption text

The line under the table (`Smallest/largest day-to-day change logged within each week.`) was replaced with one that states both definitions explicitly, since the same card now has two different meanings living side by side across its columns.

## 48. Reconciliation "get back on track" ceiling fix + revised constants (v7.94/v7.95)

### The bug

Reported: before logging today's kcal, both today and tomorrow showed a suggested target of 1,427. After logging 1,503 today (76 over that figure), tomorrow's suggestion dropped all the way to 1,216 — a much larger swing than the 76kcal overage should have produced.

Traced to the infeasible branch of `getReconciledMacroAdvice`/`getNutrDayReconciledAdvice`. Reconstructed against the real backup for the affected day (goal: 1,500kcal/224g protein, Aug 10–15 already logged):

- Pure kcal pacing (`kcalRaw`): **1,350** — a reasonable, expected pullback given the week ran slightly hot.
- Pure protein catch-up (`proteinRaw`): **285g** — protein had been under-eaten this week, so its own independent rate wants a big correction.
- `floorKcalCost` = `285×4 + 50×4 + 20×9` = **1,520** — exceeds `kcalRaw` (1,350), so the branch is flagged infeasible.
- Fallback (pre-fix): `proteinAdvice = goal.protein − 15 = 209`; `kcalAdvice = 209×4 + 50×4 + 20×9` = **1,216** — returned unconditionally, with no relationship to `kcalRaw` at all.

The root problem: feasibility is tested using `proteinRaw` (285g, the full uncapped catch-up rate), but the fallback's actual protein number is the much smaller capped figure (209g in this example). Those two numbers can diverge enough that the capped figure's true cost (1,216) ends up *cheaper* than `kcalRaw` (1,350) — meaning the compromise was actually affordable within the normal pacing budget all along, yet the fallback discarded `kcalRaw` entirely and hands back a number lower than plain pacing already called for. The function's own prior doc comment claimed the opposite would always hold ("kcal will land above its own ideal catch-up rate this week as a result") — true whenever the floor cost happens to exceed `kcalRaw`, but not guaranteed, and this case is the counter-example.

### The fix

```js
const proteinAdvice = goal.protein - RECONCILE_PROTEIN_MAX_DROP;
const floorCost = (proteinAdvice * 4) + (RECONCILE_CARBS_FLOOR * 4) + (RECONCILE_FATS_FLOOR * 9);
const kcalCeiling = goal.kcal + RECONCILE_KCAL_MAX_OVERSHOOT;
const kcalAdvice = Math.min(kcalCeiling, Math.max(kcalRaw, floorCost));
```

`kcalAdvice` is now clamped on both sides:
- **Floor**: never below `kcalRaw` — the fallback can raise kcal above plain pacing to accommodate a reduced-but-still-real protein target, but can never recommend eating *less* than pacing alone already called for.
- **Ceiling**: never above `goal.kcal + RECONCILE_KCAL_MAX_OVERSHOOT` (75kcal) — a genuinely large protein shortfall can no longer push the kcal figure arbitrarily far past target on a single day; protein may land short of its own capped number if the ceiling binds first, since kcal outranks protein in the priority order.

`RECONCILE_PROTEIN_MAX_DROP` tightened from 15g to 10g below the flat goal, and a new `RECONCILE_KCAL_MAX_OVERSHOOT = 75` constant added, both per direct request. Applied identically to both parallel copies (`getReconciledMacroAdvice` for Home, `getNutrDayReconciledAdvice` for Nutrition's per-day planning row, §44) — they're kept as intentionally separate implementations (see each function's own header comment) so both needed the same edit independently.

A stale hardcoded warning string in `openHomeMetricAdvice` (`"...protein is capped 15g below goal..."`) was still quoting the old constant verbatim after it changed to 10g — fixed to interpolate `RECONCILE_PROTEIN_MAX_DROP`/`RECONCILE_KCAL_MAX_OVERSHOOT` directly rather than hardcoding either number again. A second stale comment reference (`buildAdviceLineHtml`'s header, "e.g. protein capped 15g under") was also corrected.

### Verification

Re-derived the affected day against the real backup with the new constants: `proteinAdvice = 224 − 10 = 214`; `floorCost = 214×4 + 50×4 + 20×9 = 1,236`; `kcalCeiling = 1,500 + 75 = 1,575`; `kcalAdvice = min(1575, max(1350, 1236)) = 1350`. Confirmed live in the Home advice modal against the real backup — the modal now reads "hit 1,350 today to bring the week to target" / "Hit 214g today," in place of the previous 1,216/209.
