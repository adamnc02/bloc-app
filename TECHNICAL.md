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
25. [Known Limitations & Future Considerations](#25-known-limitations--future-considerations)

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
      Screens: progress, plan, train, body, nutrition, goals, settings
    #nav (floating pill bottom nav with #nav-pill highlight and 7 .nav-btn buttons)

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

<script> (early, small)
  Pre-boot iOS viewport measurement so --app-height is correct before first paint

<script> (ZXing bundle, single line, ~336KB, sets window.ZXing)

<script> (main application logic)
  iOS viewport measurement (measureEnv, setAppHeight, setSafeAreaVars, handleKeyboard)
  State declaration & load/save
  Navigation (showScreen, openModal, closeModal, positionNavPill, getPageHeroColors)
  Macrocycle helpers & CRUD, superset helpers
  Exercise CRUD
  Progression logic (exProgData, getWeekWeight, getWeekReps, getMyorepProgression)
  Render: Progress (renderProgress, hero swipe deck, chart builders)
  Render: Plan (renderPlan, session cards, superset UI, body-part volume table)
  Render: Train (renderTrain, set logging, rest timer)
  Render: Body (renderBody, BMR/TDEE calc)
  Render: Nutrition (full module — largest single module in the file)
  Barcode scanner engine (startScannerCamera, stopScannerCamera, _onScannerDetected)
  Food library (addToFoodLibrary, share/export/import)
  Render: Settings (setTheme, setMode, clearAllData)
  Data export/import
  Exercise library
  Render: Goals (renderGoals, overlap validation, macro sliders)
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
  macrocycles:       [],   // Array<Macrocycle>
  exercises:         {},   // Record<sessionKey, Array<Exercise>> — sessionKey = macroId_1_day(+microKey)
  trainLogs:         {},   // Record<string, SetLog> — see key formats below
  bodyLogs:          [],   // Array<BodyLog>  {date, weight, steps}
  nutritionLogs:     [],   // Array<NutritionLog>  (per-day summary — kept in sync by syncNutrLegacyLog() after every log change, for home screen/goals/weekly-view reads that predate nutritionMeals; not the primary source of truth but not dead either)
  goals:             [],   // Array<Goal>  {macroId, startDate, endDate, kcal, steps, protein, carbs, fats}
  customLibrary:     [],   // Array<{name, bodyPart}> — user-added exercise library entries
  nutritionMeals:    {},   // Record<date, {Breakfast:[], Lunch:[], Dinner:[], Snacks:[]}>
  nutritionQuickLog: {},   // Record<date, {kcal, protein, carbs, fats}> — overrides meal totals for that day when present
  foodLibrary:       [],   // Array<FoodItem>  {id, name, brand, per100kcal, per100p, per100c, per100f, defaultServing, source}
  recipes:           [],   // Array<Recipe>
  supersets:         {},   // Record<supersetId, {name: string|null}> — custom display name only; membership lives on the exercises themselves
  profile:           {},   // {gender, heightCm, birthday} — used for BMR/TDEE calc on the Body screen
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
  if (!state.profile)           state.profile = {};
  if (!state.theme)             state.theme = 'multi';
  document.body.setAttribute('data-theme', state.theme);
  if (!state.mode)              state.mode = 'dark';
  document.body.setAttribute('data-mode', state.mode);
}
```

There is no longer a migration pass for old `mesocycles`/`currentMesoId` key names or a positional-index-to-stable-id exercise migration — both were removed once the live data was confirmed fully migrated during a 2026 audit pass. Every exercise has always had a stable `id` and `order` field since.

### Key formats

- **`state.exercises`** keys: `` `${macroId}_1_${day}${microKey}` `` — always stored against week 1 (the template); every other week's exercise list is derived from it via the progression functions, never stored separately. `microKey` is `''`, `'m1'`, or `'m2'`.
- **`state.trainLogs`** keys, per logged set: `` `${macroId}_${week}_${day}${microKey}_${exerciseId}_${setIndex}` ``. Progression-choice keys (which of weight/reps was chosen for a given exercise/week) use a separate key shape from `getProgKey()`.
- Both formats key on the exercise's stable `id`, not a positional array index — this is deliberate, since reordering, superset regrouping, or mid-cycle exercise edits must never silently remap old logs to the wrong exercise.

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

Screen internal IDs match their nav labels exactly: `progress`, `plan`, `train`, `body`, `nutrition`, `goals`, `settings`. (Earlier versions used the internal id `home` for the Progress screen; this was renamed for clarity and no longer appears anywhere in the codebase.)

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

`showConfirm(title, message, okLabel, callback)` builds a generic two-button (Cancel / OK) confirmation using `modal-confirm`; it's also reused anywhere a simple one-off alert is needed by passing a no-op callback.

### Modal sheets and the on-screen keyboard

**How modals sit above the keyboard:**

In iOS standalone, `position: fixed` tracks `window.innerHeight`, which shrinks with the keyboard independently of `--app-height`. The `.modal-overlay` is `position: fixed; inset: 0`, so it already occupies only the visible area above the keyboard when the keyboard is open. With `display: flex; align-items: flex-end` on the overlay, the `.modal-sheet` is naturally anchored just above the keyboard — no JS is needed.

The body log modal (`modal-body-log`) is the canonical reference for this behaviour: its sheet has no inline styles, uses the base `.modal-sheet` CSS (`max-height: 92dvh; overflow-y: auto`), and its compact content always fits within the shrunken overlay.

**Modals that need a scrollable list (`modal-nutr-add`, `modal-food-lib-editor`):**

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

`fitListToKeyboard(wrapId)` measures the wrap element's distance from the top of the viewport and the current `visualViewport.height`, then sets the list's height so its bottom edge lands just above the keyboard. It's called from the shared `visualViewport.resize` handler (see §5) for both `nutr-add-list-wrap` and `food-lib-list-wrap`, plus once explicitly after each modal's own slide-in transform finishes (a `setTimeout(..., 320)` after opening), since the transform itself doesn't fire a `resize` event.

`overscroll-behavior: contain` on the list prevents scroll events from bubbling out to `#content` when the list boundary is reached.

---

## 10. Module: Progress

Rendered by `renderProgress()`.

Key sub-functions:
- `renderProgressHero()` / `renderProgressHeroDots()` / `initProgressHeroSwipe()` — the swipe deck (see §8)
- `cycleProgressMacro(dir)` / `resolveProgressMacro()` — navigate between macrocycles
- `renderProgressCharts()` — body weight sparkline, macro pie, weekly steps/kcal bars below the hero
- `setProgressNutrToggle(val)` — today/7-day toggle for the weekly bar charts
- `buildBwProgress(macro)` — start → current → target body weight progress bar
- `renderProgressNutrPies()` / `makePie(p, c, f)` — shared inline-SVG macro pie chart, also used by Nutrition

All charts (sparkline, line charts, bar charts, pies) are generated as inline SVG strings — there is no charting library.

---

## 11. Module: Plan

Rendered by `renderPlan()`.

### Macrocycle CRUD
- `saveMacro()` — creates or updates a macrocycle from the modal inputs
- `deleteMacrocycle(id)` / `copyMacrocycle(id)` — delete, or deep-clone with a new id and start date
- `getMacroSessionDayKeys(macro)` — returns every session's `day(+microKey)` combination for a macro, the shared building block for anything that needs to iterate "every session in this cycle" (progression preview, body-part volume table, etc.)

### Session cards (Week 1 template)
Each day (Push/Pull/Legs, or custom-named sessions) renders as its own collapsible card:
- `togglePlanDaySession(macroId, dayKey)` — expand/collapse; collapsed state is per-session (`planDayCollapsed`, keyed `${macroId}_${dayKey}`), defaults expanded. Collapsing only removes the exercise rows (and their drag handlers) from the DOM — drag-to-reorder is already scoped to a single day, so a collapsed card simply has nothing draggable in it until reopened.
- `renameDaySessionStart(macroId, day, spanId, currentLabel)` — tap-to-rename, following the same inline-`<input>`-swap pattern as superset renaming (`renameSupersetStart`). Writes to `macro.dayLabels[day]`, which only affects the display label — the day's position in `macro.days`, its exercises, and its logged history are all keyed by the stable day id (`push`/`pull`/`legs`/`session0`/...), never by this label.
- The header's summary line (`N exercises · N sets · Nkg volume`) sums `getWeekSets()` and volume across every exercise in the session, including every superset member individually, always using week-1 values.

### Supersets
- `openAddExerciseToSuperset(day, ssId)` — add an exercise into an existing group
- `reorderSupersetExercise(day, supersetId, fromInnerIdx, toInnerIdx)` — reorder within a group
- `unlinkSuperset(day, ssId)` — dissolve a group back into standalone exercises
- `deleteSupersetGroup(day, ssId)` — delete every exercise in a group
- `renameSupersetStart(ssId, currentName)` / `getSupersetDisplayName(ssId, members)` — custom group name, stored in `state.supersets[ssId].name`; falls back to a generated "A + B" name from member names when null
- `getSupersetBadge(n)` — the "SS" / member-count badge shown on group cards
- Regular (non-superset) drag-to-reorder is handled by `reorderExercise(day, fromSortedIdx, toSortedIdx)`, which treats each superset group as a single slot

### Progression preview ("Weeks 2+")
Grouped by **session first, then by week within** — the reverse of the original week-first layout. For each session (`day`+`microKey` combination), a collapsible card (`togglePlanSession`/`planExpandedSessions`, collapsed by default — distinct from the Week-1 template's `togglePlanDaySession`/`planDayCollapsed`, which defaults expanded) lists every exercise, and under each exercise, one row per week showing that week's sets/reps/weight target. Reps always show the exercise's starting reps for every type (standard/myorep/myomatch) — myorep's per-week reps escalation is intentionally not reflected here, only in the live Train recommendations.

### Body part volume table
- `computeBodyPartVolumeRange(macro)` — for every exercise across every session in the cycle, resolves its body part by looking name up against `getLibrary()` (built-in + custom; nothing is stored on the exercise itself), then computes two whole-cycle volume totals per body part: an all-weight-progression scenario and an all-reps-progression scenario (reusing `getWeekSets`/`getWeekWeight`/`getWeekReps`/`getMyorepProgression`/`parseRepsForVolume` — the same building blocks the progression preview and Train page use). Min/max per body part is the smaller/larger of those two totals; myomatch collapses to the same value in both scenarios since it has no reps-progression path.
- `renderBodyPartVolumeTable(macro)` — renders the result sorted by minimum volume descending. Returns an empty string (renders nothing) if the cycle has no exercises yet.

---

## 12. Module: Train

Rendered by `renderTrain()` → `renderTrainHero(macro)` (session summary + volume) → `renderTrainDay(macro)` (the exercise cards).

### Progression data
`exProgData(ex)` is the single source of truth per exercise for a given week — computed once per exercise per render and either used directly (solo exercises) or mapped across `members.map(m => exProgData(m))` (supersets, as `memberData`). It returns sets, chosen `progType`, previous week's actual weight/reps, `recommendedWeight`/`recommendedReps`, `weightJump`, and progression-inference fields (below). Solo-exercise rendering destructures the fields it needs by name; superset rendering reads them off `memberData[i]` directly — this is why a field can be genuinely used by one path and dead in the other if not double-checked.

### "Last week" progression badge inference
Shown as "Last wk: ↑ weight" / "↑ reps" / "no progression" in the exercise header (solo) or next to sets/reps in the collapsed preview row (superset members). If a progression path was explicitly chosen last week (via the Weight/Reps toggle), that's used directly. Otherwise it's inferred: compare last week's actual weight against the week before that (or the exercise's starting weight, if last week was week 1) — if it increased, "↑ weight"; else compare reps the same way — if those increased, "↑ reps"; if neither increased, "no progression". This inference exists specifically because filling sets via "Fill Suggested" and just checking them done, without ever tapping the Weight/Reps toggle, is a common real workflow that shouldn't leave the badge silently blank.

### Set rows
- Solo: `.set-row` is a CSS grid (`24px 1fr 60px 60px 40px` — set number, last-week actual for that specific set index, weight input, reps input, done checkbox). The "last week" column shows what was actually logged for that set number last week, not a repeat of the current suggestion (which is already visible via the input's placeholder).
- Superset: `.ss-set-ex-row` is `display: flex`, not a grid — member name, weight input, ×, reps input, done checkbox. The done checkbox shares `.check-done`/`.check-empty` styling with the solo grid rows, which includes `margin: 0 auto` (meant to centre it within a grid cell). In this flex context that competes with any `margin-left: auto` placed elsewhere in the row for the remaining free space — the first input has `margin-left:auto` to right-pack the row, and the checkbox's shared margin is overridden inline (`margin:0`) specifically in this template so the two auto-margins don't fight over the same free space.
- `logSet(logKey, field, value)` writes a single field; `toggleSetDone(logKey)` flips `done` with a brief red-border flash if weight/reps are missing.
- `fillSuggested(macroId, week, day, exId, sets, weightPlaceholder, repsPlaceholder)` — fills every set's inputs with the suggested values in one tap, with an amber flash animation on the button and inputs.
- `quickFillComplete(...)` / `quickFillCompleteSuperset(...)` — the food-scanner-adjacent "tick" quick-fill used on the collapsed card header, tracked per-session via a `_nutrQuickAddedThisSession`-style `Set` so the tick persists correctly within a session (name kept for historical reasons — it lives in the Train module, not Nutrition, despite the `nutr`-looking prefix on a couple of internal helper names it shares patterns with).

### Session volume
`renderTrainHero()` calls the shared `getSessionVolume(macro, week, dayKey)` rather than computing volume inline — this matters because that shared function correctly doubles weight for `trackingMode === 'perSide'` exercises, and an earlier inline duplicate here did not.

### Rest Timer
See §17 — opened via the clock icon in the Train header.

---

## 13. Module: Body

Rendered by `renderBody()`.

- `openBodyProfile()` / `saveBodyProfile()` — gender, height (cm or ft/in via `switchHeightUnit`), birthday, stored in `state.profile`. Height unit resets to ft/in on every open regardless of last-used unit (a known minor friction point, not a bug — confirmed as acceptable).
- `calcAge()`, `getActivityMultiplier()`, `calcMifflinBMR()`, `calcDynamicTDEE()` — BMR/TDEE calculation. Body weight is stored and displayed in **lbs** throughout (confirmed intentional — training weight elsewhere in the app is in kg; there is deliberately no unit toggle for body weight). `getActivityMultiplier()` averages steps across the person's *entire* logged history with no recency window — also intentional, since this multiplier only feeds the BMR/TDEE estimate and more historical data makes it more accurate, not less.
- `openEditBodyLog(idx)` / `saveInlineBodyLog()` / `saveBodyLog()` / `deleteBodyLog(date)` — body weight + steps log CRUD. The "at goal" / "no meaningful change" tolerance is standardised at ≤0.05 lbs across both the weekly-change and left-to-go hero callouts.

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

### Logging flow
- `openNutrAdd(meal, isReopen)` → `renderNutrAddList()` (search results, sourced from `getLibrary()` + food library, most-recently-logged first via `getLastNutrEntryForFood`)
- Scan → `openNutrBarcode()` → scanner engine (§21) → `_onScannerDetected` → `openNutrServingModal()`
- Manual → `openNutrManual()` → `updateManualPreview()` → `saveManualEntry()`
- Library/recipe row tap → `selectFromLibrary`/`selectFromAddList` → `openNutrServingModal()` → `updateServingPreview()` → `confirmServing()`
- `fitListToKeyboard('nutr-add-list-wrap')` keeps the search results visible above the keyboard — see §9

### Food library & recipes
- `addToFoodLibrary()`, `exportFoodLibrary()`/`importFoodLibrary()`, `shareFoodLibItem(idx)`/`shareFoodLibItemByIdx(idx)` (two active entry points — list-index-based, used from the two different list contexts they each render in), `importSharedFoodItem(file)`
- Recipe builder: `openRecipeBuilder(editId?)` → `recipeGoToIngredients()` → `renderRecipeIngredients()` → `confirmRecipeIngredient()`/`confirmRecipeManual()` → `saveRecipe()`

---

## 15. Module: Goals

Rendered by `renderGoals()`.

- `getActiveGoal()` — the goal covering today's date, regardless of macro
- `getGoalForDay(dateStr)` vs `getGoalForDate(dateStr, macroId)` — two similar-looking lookups that are both intentionally kept: the Nutrition page isn't tied to a specific macrocycle so it uses the date-only version; the Progress page's per-macro chart needs the macro-scoped version so a chart for macro A never picks up a goal that technically belongs to macro B
- `saveGoal()` — validates required fields (kcal, steps — red-border flash via the same pattern as Train's set validation if either is empty), checks `findOverlappingGoal(startDate, endDate, excludeIdx)` and blocks the save with an inline error if the new/edited range overlaps any other goal, then upserts
- **Overlap prevention**: goal periods can never overlap, across any macrocycle. A new goal's start date defaults to the day after the latest existing goal's end date (any macro); saving is blocked (not just warned) if the chosen range collides with an existing goal
- **Macro-drift lock**: `initGoalMacroSliders(existingGoal)` back-derives the protein-multiplier and carb/fat-split slider positions from an existing goal's saved grams (using today's latest bodyweight log as the divisor). `goalMacroSliderState.userTouched` tracks whether the person actually dragged a slider this session (set only by the sliders' real `oninput` handlers, never by the programmatic `.value =` set during init, since that doesn't fire `input`). On save, if the goal being edited is **active or past** (`startDate <= today`) and no slider was touched, its exact stored `protein`/`carbs`/`fats` are kept as-is rather than recomputed — otherwise editing an old goal's kcal target, weeks after your bodyweight changed, would silently drift its macros. New/upcoming goals (or any goal where a slider actually moved) always use the live computed values.
- `computeGoalMacroGrams()` — reads current slider positions and returns `{proteinG, carbG, fatG}`

---

## 16. Module: Settings

Rendered by `renderSettings()`.

- `setTheme(name)` / `setMode(mode)` — update state, set the `data-theme`/`data-mode` attribute, save, re-render the active screen
- `exportData()` / `importData(event)` — full-state JSON backup/restore, with a structural sanity check on import (`parsed.macrocycles && parsed.exercises && parsed.trainLogs` must all be present)
- `clearAllData()` — resets macrocycles/exercises/logs/goals/nutrition/foodLibrary/recipes/supersets/profile to empty, but **preserves** `theme`/`mode` (carried forward from the pre-clear state and re-applied to `<body>` immediately) since the confirm dialog only ever promises to delete tracked data, not appearance preferences. The reset object's shape is kept in exact sync with everything `load()`'s defensive defaults expect — an earlier version of this function omitted `recipes`/`supersets`/`profile` entirely, which left `state.supersets` undefined and threw on the very next superset action, since several reads of it aren't null-guarded (e.g. `state.supersets[ssId]`).
- `exportLibrary()` / `importExerciseLibrary(file)` — exercise library backup/restore (merge-by-name)

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

The exercise library (`getLibrary()`) is a merged set of built-in exercises (`DEFAULT_LIBRARY`, hardcoded, ~26 entries covering Biceps/Calves/Chest/Legs/Back/Shoulders/Triceps) and user-added custom exercises (`state.customLibrary`). Every custom exercise requires a body part at creation time (`saveCustomExercise()`, via the `modal-custom-exercise` sheet) — there is no way to add one without it. Built-in exercises cannot be deleted via the UI but can be exported. Custom exercises can be overwritten on import only if they have the same name.

Body part is never stored on an individual plan exercise (`state.exercises[...]` entries) — it's resolved on demand by looking the exercise's `name` up against `getLibrary()`. This is what powers the Plan page's body-part volume table (§11) without needing any data migration for exercises that were added before that feature existed.

---

## 20. Progression Logic

Three functions are the shared source of truth for every progression-related calculation in the app (Plan preview, Train recommendations, body-part volume table all call the same ones — this was consolidated during a 2026 audit after finding two of these had drifted into disagreeing hardcoded copies):

```js
function getWeekWeight(ex, week, progType, goalType, lossIncrement) {
  // Returns ex.startWeight unless progType === 'weight'.
  // jump = ex.isHeavyLeg ? (isGain ? 10 : 5) : (isGain ? 5 : lossIncrement)
  // return ex.startWeight + jump * (week - 1)
}

function getWeekReps(ex, week, progType) {
  // Returns ex.reps unless progType === 'reps'. +1 rep/week when active,
  // handling both single numbers and "8-10"-style ranges.
}

function getMyorepProgression(ex, week) {
  // Myomatch: fixed base reps derived from ex.reps — weight-only progression,
  // this never changes regardless of week.
  // Myorep giant: base reps + 10 * (week - 1).
}
```

`lossIncrement` is the one user-configurable input — set per macrocycle (defaults to 2.5 kg), used only for standard (non-heavy-leg) exercises on a weight-loss cycle. Every other jump size is fixed:

| Goal type | Standard exercises | Heavy leg exercises |
|---|---|---|
| Weight Loss | + configured `lossIncrement` / mesocycle | +5 kg / mesocycle |
| Strength Gain | +5 kg / mesocycle | +10 kg / mesocycle |

`exProgData(ex)` (Train page, §12) is a higher-level wrapper around these three functions that additionally layers in what was *actually logged* (as opposed to the theoretical target) for "previous week" displays and next-week recommendations.

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
| `closeModal(id)` | Removes `.open`, stops camera if applicable |
| `initModal(overlayEl)` | Attaches swipe-down-to-close and tap-outside-to-close to a modal overlay |
| `showConfirm(title, msg, okLabel, callback)` | Generic two-button confirm dialog; also reused as a plain alert |

### Macrocycle / Plan
| Function | Description |
|---|---|
| `saveMacro()` | Creates or updates a macrocycle from modal inputs |
| `deleteMacrocycle(id)` / `copyMacrocycle(id)` | Delete, or deep-clone to a new id/start date |
| `getMacroSessionDayKeys(macro)` | Every `day(+microKey)` combination in the cycle |
| `togglePlanDaySession(macroId, dayKey)` | Expand/collapse a Week-1 template session card |
| `renameDaySessionStart(macroId, day, spanId, currentLabel)` | Tap-to-rename a session's display label |
| `togglePlanSession(macroId, sessionKey)` | Expand/collapse a Weeks-2+ progression preview session card |
| `reorderExercise(day, fromSortedIdx, toSortedIdx)` | Drag-to-reorder, treating superset groups as one slot |
| `reorderSupersetExercise(day, supersetId, fromInnerIdx, toInnerIdx)` | Reorder within a superset group |
| `unlinkSuperset(day, ssId)` / `deleteSupersetGroup(day, ssId)` | Dissolve a group, or delete every exercise in it |
| `renameSupersetStart(ssId, currentName)` | Tap-to-rename a superset group |
| `computeBodyPartVolumeRange(macro)` / `renderBodyPartVolumeTable(macro)` | Cycle-wide min/max volume per body part |
| `getSessionVolume(macro, week, dayKey)` | Total logged volume for one session/week, respecting per-side tracking |

### Training
| Function | Description |
|---|---|
| `exProgData(ex)` | Full progression data object for one exercise in the current week |
| `getWeekWeight(ex, week, progType, goalType, lossIncrement)` | Theoretical target weight for a given week |
| `getWeekReps(ex, week, progType)` | Theoretical target reps for a given week |
| `getMyorepProgression(ex, week)` | Myorep/myomatch-specific reps target |
| `logSet(logKey, field, value)` | Updates a single set field in `state.trainLogs` |
| `toggleSetDone(logKey)` | Flips a set's done state; red-flashes missing weight/reps |
| `fillSuggested(macroId, week, day, exId, sets, weightPlaceholder, repsPlaceholder)` | Fills all set inputs with suggested values |
| `quickFillComplete(...)` / `quickFillCompleteSuperset(...)` | One-tap fill-and-complete from the collapsed card header |
| `getProgKey(macroId, week, day, exId)` | Key format for a progression-choice (weight vs reps) log entry |
| `selectProgType(...)` | Records which progression path was chosen for an exercise this week |

### Nutrition
| Function | Description |
|---|---|
| `getDayTotals(date)` | Aggregates kcal/protein/carbs/fats for a date (meals, or quick-log override if present) |
| `nutrPickDate(dateStr)` / `nutrShiftDate(delta)` | Set current date via picker, or shift by swipe |
| `renderNutrDiary()` | Renders per-meal food log cards |
| `openMealMenu(meal)` / `saveMealAsRecipe()` | The `···` action sheet; save-as-recipe does not auto-log |
| `openNutrServingModal()` / `updateServingPreview()` / `confirmServing()` | Serving confirm modal flow |
| `saveManualEntry()` | Saves manual food entry; converts to per-100g for the library |
| `confirmCopyFoodEntry()` | Executes copy or move; handles both single-item and whole-meal |
| `copyMealFromYesterday(meal)` | Copies previous day's meal entries into current date |
| `deleteFoodEntry(date, meal, idx)` | Removes a food entry |
| `syncNutrLegacyLog(date)` | Recomputes and upserts `state.nutritionLogs` for a date — still actively called, not dead |
| `saveEditFoodEntry()` | Saves edit; direct macros for manual, per-100g calc for barcode |
| `makePie(p, c, f)` | Generates inline SVG macro pie chart |
| `fitListToKeyboard(wrapId)` | Shrinks a modal's scrollable list to stay above the keyboard |

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

### Goals
| Function | Description |
|---|---|
| `getActiveGoal()` | Goal covering today's date, any macro |
| `getGoalForDay(dateStr)` | Goal covering a given date, any macro (Nutrition) |
| `getGoalForDate(dateStr, macroId)` | Goal covering a date, scoped to one macro (Progress) |
| `findOverlappingGoal(startDate, endDate, excludeIdx)` | First existing goal whose range overlaps the given one |
| `saveGoal()` | Validates required fields + overlap, applies the macro-drift lock, upserts |
| `initGoalMacroSliders(existingGoal)` | Sets initial slider positions; resets `userTouched` |
| `computeGoalMacroGrams()` | Reads current slider positions, returns `{proteinG, carbG, fatG}` |

### Settings
| Function | Description |
|---|---|
| `setTheme(name)` | Updates `state.theme`, sets `data-theme` on `<body>`, saves |
| `setMode(mode)` | Updates `state.mode`, sets `data-mode` on `<body>`, saves |
| `exportData()` | Downloads full state as JSON |
| `importData(event)` | Restores state from a JSON file |
| `clearAllData()` | Resets tracked data to empty defaults; preserves theme/mode |
| `exportLibrary()` | Downloads merged exercise library |
| `importExerciseLibrary(file)` | Merges exercise library from JSON |

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

---

## 25. Known Limitations & Future Considerations

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
| **Body weight units** | Body weight is lbs-only (training weight elsewhere is kg-only); no unit toggle exists for either, unlike height which has one. Confirmed intentional, not planned to change. |
| **Legacy nutrition log** | `state.nutritionLogs` (per-day summary format) predates `nutritionMeals`/`nutritionQuickLog` and isn't the primary source of truth — but it's still actively kept in sync by `syncNutrLegacyLog()` after every log change (add, edit, delete), for whichever reads still go through it. An earlier version of this document incorrectly described it as read-only/dead; it was corrected after adding inline code comments surfaced the live call sites. |

### Resolved (previously listed as open questions)

**Macrocycle/Mesocycle terminology** — an earlier version of this document flagged the internal variable names (`macro`/`meso`) as being inverted relative to strength-and-conditioning periodisation theory. A full audit specifically checked for this and found no such inversion anywhere in the current codebase or UI — the terminology throughout is consistent and correct. This note is retained here only so the concern isn't re-investigated from scratch in future.

**Dead code from earlier redesigns** — a page-by-page audit (Plan → Train → Body → Nutrition → Goals → Settings) worked through every screen looking specifically for functions, variables, and DOM targets left behind by earlier UI changes. Confirmed and removed: an old Nutrition day-badge strip and its handler, an unused nutrition macro-view toggle, a superseded recipe-builder entry point (and a dead branch it left behind in `saveRecipe()`), a superseded food-share function, and the old mesocycle-key/positional-exercise-id migration code in `load()` (confirmed the live data no longer needed it). No further known instances remain from this pass, though any future redesign should expect to leave similar residue and budget an audit pass accordingly.

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
