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

BLOC is a single-file Progressive Web App (`index.html`) with no build toolchain, no framework, and no backend. The entire application — HTML structure, CSS, and JavaScript — is contained within one file with a single `<script>` block.

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
- Rendering is manual DOM manipulation (no virtual DOM)
- Every screen re-renders fully on navigation; there is no partial diffing
- The ZXing barcode library (~336KB minified) is bundled inline in the `<script>` block, setting `window.ZXing`

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
  Log set rows
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
      Screens: home (Progress), plan, train, body, nutrition, goals, settings
    #nav (floating pill bottom nav with #nav-pill highlight and 7 .nav-btn buttons)

  Modals (appended after #app):
    modal-cycle-history   — past macrocycles list (tapped from Progress hero)
    modal-macro           — new macrocycle
    modal-edit-macro      — edit macrocycle
    modal-add-goal        — add/edit goal
    modal-custom-exercise — create custom exercise
    modal-exercise        — add/edit exercise
    modal-body-log        — log body weight / steps
    modal-nutr-date       — date picker for Nutrition hero tap
    modal-nutr-add        — nutrition log chooser (Scan Barcode / Manual / Recipe / Library)
    modal-nutr-barcode    — camera barcode scanner with manual fallback
    modal-nutr-serving    — serving size confirm (shows recipe ingredients for recipes)
    modal-nutr-previous   — food library search
    modal-nutr-manual     — manual food entry
    modal-nutr-edit       — edit a logged food entry
    modal-nutr-quick      — quick-add daily macro totals
    modal-timer           — rest timer (countdown + stopwatch)
    modal-food-lib-editor — browse and edit the food library
    modal-food-lib-entry  — edit a single food library entry
    modal-recipe-step1    — recipe builder step 1: name and servings
    modal-recipe-ingredients — recipe builder step 2: ingredient list
    modal-recipe-barcode  — camera barcode scanner for recipe ingredient
    modal-recipe-serving  — serving confirm for recipe ingredient
    modal-recipe-manual   — manual entry for recipe ingredient
    modal-recipe-edit-ingredient — edit an existing recipe ingredient
    modal-recipe-list     — My Recipes list with Create new, Edit, Delete
    modal-nutr-copy-entry — copy or move a food entry or entire meal to another date/meal
    modal-confirm         — custom confirm dialog (centre-aligned)

<script>
  ZXing barcode library bundle (~336KB, sets window.ZXing)
  iOS viewport measurement (measureEnv, setAppHeight, setSafeAreaVars)
  State declaration & load/save
  Navigation (showScreen, openModal, closeModal, positionNavPill, getPageHeroColors)
  Macrocycle helpers & CRUD
  Exercise CRUD
  Progression logic
  Render: Progress/Home (renderHome, renderProgressHero, initProgressHeroSwipe, etc.)
  Render: Plan
  Render: Train + training log functions
  Render: Body
  Render: Nutrition (full module)
  Barcode scanner engine (startScannerCamera, stopScannerCamera, _onScannerDetected)
  Food library (addToFoodLibrary, share/export/import)
  Render: Settings (setTheme, setMode)
  Data export/import
  Exercise library
  Render: Goals
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
  exercises:         {},   // Record<string, Array<Exercise>>
  trainLogs:         {},   // Record<string, SetLog>
  bodyLogs:          [],   // Array<BodyLog>
  nutritionLogs:     [],   // Array<NutritionLog>  (legacy — kept for compatibility)
  goals:             [],   // Array<Goal>
  customLibrary:     [],   // Array<LibraryEntry>
  nutritionMeals:    {},   // Record<date, MealDay>
  nutritionQuickLog: {},   // Record<date, MacroTotals>
  foodLibrary:       [],   // Array<FoodItem>
  recipes:           [],   // Array<Recipe>
  currentMacroId:    null, // string | null
  currentWeek:       1,
  currentDay:        'push',
  currentEditContext: null,
  theme:             'multi',  // string — persisted, applied as data-theme on <body>
  mode:              'dark',   // 'dark' | 'light' — persisted, applied as data-mode on <body>
};
```

`load()` is called once on startup. After parsing localStorage, it runs a migration pass:

```js
// Migration: old key names
if (state.mesocycles && !state.macrocycles) { state.macrocycles = state.mesocycles; }
if (state.currentMesoId && !state.currentMacroId) { state.currentMacroId = state.currentMesoId; }

// Defensive defaults
if (!state.macrocycles)       state.macrocycles = [];
if (!state.recipes)           state.recipes = [];
if (!state.foodLibrary)       state.foodLibrary = [];
if (!state.theme)             state.theme = 'multi';
if (!state.mode)              state.mode = 'dark';
// ... etc.
```

After load, the theme and mode are applied:
```js
document.body.setAttribute('data-theme', state.theme);
document.body.setAttribute('data-mode', state.mode);
```

---

## 4. Data Persistence

`save()` calls `localStorage.setItem('bloc_state', JSON.stringify(state))` after every mutation. There is no debouncing or batching — every user action that changes state triggers a synchronous save.

---

## 5. iOS Viewport & App Height

### The problem
On iOS in standalone PWA mode, `window.innerHeight` and `100dvh` are unreliable on first paint — they report a stale pre-keyboard/pre-chrome value. `position: fixed` nav bars anchored to the viewport get stuck using the wrong offset until a real scroll gesture forces a recompute. Locking `html`/`body` scroll to prevent rubber-banding (using `overflow: hidden`) removes the scroll gesture that used to trigger the recompute, leaving the nav permanently misplaced.

### The solution: `measureEnv()` DOM probe

A tiny hidden element (`position: fixed; top: 0; left: 0; width: 1px; height: 1px`) is appended to the DOM at runtime. After two `requestAnimationFrame` ticks (to let WebKit settle), its `getBoundingClientRect()` or `window.visualViewport.height` is read to get the true available height. CSS custom properties are set from the measured values:

```js
function measureEnv(prop) {
  // Reads env() variables via a temporary DOM element
  // Returns numeric pixel value
}

function setAppHeight() {
  const measured = window.visualViewport
    ? window.visualViewport.height
    : window.innerHeight;
  const h = measured + measureEnv('safe-area-inset-top');
  document.documentElement.style.setProperty('--app-height', h + 'px');
}

function setSafeAreaVars() {
  document.documentElement.style.setProperty(
    '--safe-bottom', measureEnv('safe-area-inset-bottom') + 'px'
  );
  document.documentElement.style.setProperty(
    '--safe-top', measureEnv('safe-area-inset-top') + 'px'
  );
}
```

`setAppHeight()` is called immediately on load and again on `window.resize` and `visualViewport.resize`.

### Layout wiring

Every size-sensitive element uses `var(--app-height, 100dvh)` as a fallback-safe override:

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

`#nav` is `position: absolute` inside `#app` (which is `position: relative`), **not** `position: fixed`. This means the nav simply follows normal CSS layout within `#app`'s box, which is already sized correctly by `--app-height`. There is no viewport-relative positioning for WebKit to get wrong.

```css
#nav {
  position: absolute;
  left: 50%;
  bottom: calc(var(--safe-bottom) - 6px);
  transform: translateX(-50%);
  /* floating pill styles ... */
}
```

The `nav.style.bottom` is also updated via JS using `measureEnv('safe-area-inset-bottom')` so the floating pill always clears the home indicator on notched devices.

---

## 6. Navigation & Screen System

```js
function showScreen(name) {
  // Deactivates all .screen elements, activates the named one
  // Calls the relevant render function
  // Calls positionNavPill() via rAF
}
```

Screen internal IDs: `home` (Progress), `plan`, `train`, `body`, `nutrition`, `goals`, `settings`. Note that the Progress screen uses the internal ID `home` for legacy reasons.

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
[data-theme="multi"] [data-page="home"]      { --hero-1: #2BC7C4; --hero-2: #0B4F4E; }
[data-theme="multi"] [data-page="plan"]      { --hero-1: #378ADD; --hero-2: #0C447C; }
[data-theme="multi"] [data-page="train"]     { --hero-1: #E8D44D; --hero-2: #6B5A0A; }
[data-theme="multi"] [data-page="body"]      { --hero-1: #1D9E75; --hero-2: #085041; }
[data-theme="multi"] [data-page="nutrition"] { --hero-1: #EF9F27; --hero-2: #633806; }
[data-theme="multi"] [data-page="goals"]     { --hero-1: #E24B4A; --hero-2: #6B1414; }
```

`setTheme(name)` and `setMode(mode)` update `state.theme` / `state.mode`, call `save()`, set `data-theme`/`data-mode` on `<body>`, and call `positionNavPill()` to re-match the pill colour.

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

The Progress screen renders a 5-slide swipeable deck inside `#progress-hero-wrap > #progress-hero-card`. All slides are fixed to the height of slide 0 via `--hero-fixed-h` (a JS-set CSS variable measured from slide 0's rendered height). Slides with less content centre-align vertically.

```css
#progress-hero-wrap .hero-card {
  min-height: var(--hero-fixed-h, auto);
}
```

Slides:
- 0: Active cycle overview — name, goal, split badge, weeks remaining, progress bar
- 1: Body weight — 7-day average, WoW delta, rolling line chart (SVG inline)
- 2: Weekly volume — line chart
- 3: Steps vs goal — bar chart for current week
- 4: Kcal vs goal — bar chart for current week

`renderProgressHero()` renders the current slide into `#progress-hero-card`. `renderProgressHeroDots()` updates the dot indicator below the card.

`initProgressHeroSwipe()` attaches `touchstart`/`touchmove`/`touchend` (and mouse equivalents) to `#progress-hero-wrap`. A swipe of more than 30% of the card width triggers `progressHeroIndex` to advance or retreat and calls `renderProgressHero()`. The deck is guarded against concurrent gesture handling via `_progressHeroBusy` and a `_progressHeroGestureId` counter.

`cycleProgressMacro(dir)` and `resolveProgressMacro()` handle navigating between macrocycles when the user taps the left/right arrows on the hero.

---

## 9. Modal System

All modals are `.modal-overlay` divs appended after `#app`. Each wraps a `.modal-sheet` with `data-modal` set to the overlay's id. On `DOMContentLoaded`, `initModal(overlayEl)` is called on every overlay to attach:
- **Swipe-down to close** — `touchstart`/`touchmove`/`touchend` on the sheet; a downward swipe of ≥80px triggers `closeModal()`
- **Tap-outside to close** — click on the overlay background (not the sheet) calls `closeModal()`

`openModal(id)` adds `.active` to the overlay. `closeModal(id)` removes it and stops any running camera stream if the closed modal was a barcode scanner.

---

## 10. Module: Progress

The Progress screen (internal id: `home`) is rendered by `renderHome()`.

Key sub-functions:
- `renderProgressHero()` — builds the active hero slide
- `renderProgressHeroDots()` — updates dot pagination
- `initProgressHeroSwipe()` — attaches swipe gesture handlers
- `cycleProgressMacro(dir)` — advances/retreats the displayed macrocycle
- `resolveProgressMacro()` — returns the currently-displayed macrocycle object
- `renderHomeSteps()` / `renderHomeNutr()` — render the steps and nutrition sections below the hero
- `renderHome()` calls `renderProgressHero()` and all sub-section renderers

Progress charts are generated as inline SVG strings using a simple path-drawing helper. The body weight sparkline, line charts, and bar charts are all SVG.

---

## 11. Module: Plan

Rendered by `renderPlan()`.

Key operations:
- `saveMacro()` — creates or updates a macrocycle
- `deleteMacro(id)` — removes a macrocycle and all its exercises/logs
- `copyMacro(id)` — deep-clones a macrocycle with a new id and start date
- `togglePlanWeek(macroId, week)` — expands/collapses an exercise list week
- `openExerciseModal(macroId, week, day, exIdx?)` — opens the exercise add/edit sheet

---

## 12. Module: Train

Rendered by `renderTrain()`.

Key operations:
- `toggleTrainPicker()` — shows/hides the week/day selector
- `logSet(macroId, week, day, exIdx, setIdx, field, value)` — updates a single set field in `state.trainLogs`
- `fillSuggested(macroId, week, day, exIdx)` — fills all set inputs with suggested values, triggers CSS flash animation
- `getSuggested(macro, ex, week)` — returns the suggested weight/reps object for this exercise/week
- `getLastWeekLog(macroId, week, day, exIdx)` — returns the previous week's log row for display

---

## 13. Module: Body

Rendered by `renderBody()`.

Key operations:
- `saveBodyLog()` — upserts a body log entry
- `deleteBodyLog(idx)` — removes an entry
- `openBodyLog(idx?)` — opens the log modal pre-filled for edit or blank for new

---

## 14. Module: Nutrition

Rendered by `renderNutrition()`. This is the largest module.

Key sub-functions:
- `nutrPickDate(dateStr)` — sets the current nutrition date and re-renders
- `getDayTotals(date)` — aggregates kcal/protein/carbs/fats from `nutritionMeals` and `nutritionQuickLog`
- `renderNutrDiary()` — renders the per-meal food log cards
- `renderNutrWeekly()` — renders 7-day bar charts (macro pie chart is now on Progress screen)
- `openNutrServingModal()` — opens serving confirm; shows recipe ingredients if recipe
- `updateServingPreview()` — recomputes macro display live as grams/servings change
- `confirmServing()` — finalises entry; saves to food library
- `saveManualEntry()` — saves a manual food entry; converts to per-100g for library
- `openCopyFoodEntry(date, meal, idx)` — opens copy modal for a single diary item
- `openMealMenu(meal)` — opens bottom action sheet for meal-level copy/move
- `confirmCopyFoodEntry()` — executes copy or move
- `copyMealFromYesterday(meal)` — copies previous day's meal entries
- `initYesterdaySwipes()` — attaches swipe handlers to yesterday copy strips
- `deleteFoodEntry(date, meal, idx)` — removes a food entry
- `openEditFoodEntry(date, meal, idx)` — opens edit modal; detects barcode vs manual mode
- `saveEditFoodEntry()` — saves edit; direct macros for manual, per-100g calc for barcode
- `makePie(p, c, f)` — generates inline SVG macro pie chart

---

## 15. Module: Goals

Rendered by `renderGoals()`.

Key operations:
- `getActiveGoal()` — returns the goal active on today's date
- `saveGoal()` — upserts a goal entry
- `deleteGoal(idx)` — removes a goal by index
- `buildGoalsHomeSection(goal)` — renders goals summary for the Progress screen

---

## 16. Module: Settings

Rendered by `renderSettings()`.

Key operations:
- `setTheme(name)` — updates `state.theme`, sets `data-theme` on `<body>`, saves, re-positions nav pill
- `setMode(mode)` — updates `state.mode`, sets `data-mode` on `<body>`, saves, re-positions nav pill
- `exportData()` — downloads full state as JSON
- `importData(event)` — restores state from a JSON file
- `clearAllData()` — resets state to empty defaults
- `exportLibrary()` — downloads merged exercise library
- `importExerciseLibrary(file)` — merges exercise library from JSON

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

All list rows (exercises, body log, nutrition diary, goals, food library, recipes) use the same swipe-left gesture:

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

A `closeAllSwipes()` helper closes any open row when a new swipe begins or when the user taps elsewhere.

---

## 19. Exercise Library

The exercise library is a merged set of built-in exercises (hardcoded) and user-added custom exercises (`state.customLibrary`). Built-in exercises cannot be deleted via the UI but can be exported. Custom exercises can be overwritten on import only if they have the same name.

---

## 20. Progression Logic

```js
function getSuggested(macro, ex, week) {
  // Determines suggested weight and reps for week N
  // based on the starting weight, exercise type, and macro goal
}
```

Weight progression is calculated per-mesocycle:

| Goal | Standard | Heavy leg |
|---|---|---|
| Weight Loss | +1.5 kg / mesocycle | +2.5 kg / mesocycle |
| Strength Gain | +5 kg / mesocycle | +10 kg / mesocycle |

Rep progression: +1 rep per week (for standard exercises).

Myorep giant: +10 reps per week with optional weight progression. Myomatch: fixed reps, weight only.

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

### Navigation
| Function | Description |
|---|---|
| `showScreen(name)` | Activates the named screen, calls its render function, re-positions nav pill |
| `positionNavPill()` | Reads active `.nav-btn` rect, sets `#nav-pill` left/width |
| `getPageHeroColors(name)` | DOM probe to read `--hero-1`/`--hero-2` for the named page |
| `openModal(id)` | Adds `.active` to the named modal overlay |
| `closeModal(id)` | Removes `.active`, stops camera if applicable |

### Macrocycle / Plan
| Function | Description |
|---|---|
| `saveMacro()` | Creates or updates a macrocycle from modal inputs |
| `deleteMacro(id)` | Removes macrocycle, exercises, and logs |
| `copyMacro(id)` | Deep-clones macrocycle to a new id |
| `getNextSessionDate(macro)` | Returns the ISO date string of the next scheduled session |
| `getMacroEndDate(macro)` | Calculates the end date from start + weeks |

### Training
| Function | Description |
|---|---|
| `getSuggested(macro, ex, week)` | Returns `{ weight, reps }` for this exercise/week |
| `fillSuggested(macroId, week, day, exIdx)` | Fills set inputs, triggers flash animation |
| `logSet(...)` | Updates a single set field in `state.trainLogs` |
| `getLastWeekLog(macroId, week, day, exIdx)` | Returns prior week's log for display |

### Nutrition
| Function | Description |
|---|---|
| `getDayTotals(date)` | Aggregates kcal/protein/carbs/fats for a date |
| `nutrPickDate(dateStr)` | Sets current date, re-renders nutrition |
| `renderNutrDiary()` | Renders per-meal food log cards |
| `openNutrServingModal()` | Opens serving confirm; shows recipe ingredients if recipe |
| `updateServingPreview()` | Recomputes macro display live |
| `confirmServing()` | Finalises entry from serving modal; saves to library |
| `saveManualEntry()` | Saves manual food entry; converts to per-100g for library |
| `confirmCopyFoodEntry()` | Executes copy or move; handles both single and whole-meal |
| `copyMealFromYesterday(meal)` | Copies previous day's meal entries into current date |
| `deleteFoodEntry(date, meal, idx)` | Removes a food entry |
| `saveEditFoodEntry()` | Saves edit; direct macros for manual, per-100g calc for barcode |
| `makePie(p, c, f)` | Generates inline SVG macro pie chart |

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
| `openFoodLibraryEditor()` | Opens browsable food library modal |
| `renderFoodLibEditor()` | Renders library list with search |
| `openFoodLibEntry(idx)` | Opens edit modal for a library entry |
| `saveFoodLibEntry()` | Saves edited library entry |
| `deleteFoodLibEntry(idx)` | Removes a library entry |
| `exportFoodLibrary()` | Downloads food library as JSON |
| `importFoodLibrary(file)` | Merges food library from JSON |
| `openRecipeBuilder(editId?)` | Opens builder; pre-loads existing recipe if editId given |
| `saveRecipe()` | Saves recipe to state; upserts food library |
| `deleteRecipe(id)` | Removes from `state.recipes` and `state.foodLibrary` |

### Settings
| Function | Description |
|---|---|
| `setTheme(name)` | Updates `state.theme`, sets `data-theme` on `<body>`, saves |
| `setMode(mode)` | Updates `state.mode`, sets `data-mode` on `<body>`, saves |
| `exportData()` | Downloads full state as JSON |
| `importData(event)` | Restores state from a JSON file |
| `clearAllData()` | Resets state to empty defaults |
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
| `getLocal7Days()` | Returns last 7 days as `{date, letter}` objects |
| `formatDate(str)` | Returns human-readable date string |
| `fmtK(n)` | Formats number as `'1.2k'` above 1000, else plain |
| `showConfirm(title, msg, okLabel, callback)` | Shows custom confirm modal |
| `initModal(overlayEl)` | Attaches swipe-down and tap-outside handlers |

### iOS Viewport
| Function | Description |
|---|---|
| `measureEnv(prop)` | DOM probe to read CSS `env()` values as numbers |
| `setAppHeight()` | Reads `visualViewport.height`, sets `--app-height` |
| `setSafeAreaVars()` | Sets `--safe-bottom` and `--safe-top` CSS vars |

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

Date comparisons use string comparison (`a.date.localeCompare(b.date)`) which is valid for ISO 8601 strings. Date cutoffs use `new Date(getLocalToday() + 'T00:00:00')` for local-midnight anchoring.

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
const h = heroCardEl.offsetHeight;
document.documentElement.style.setProperty('--hero-fixed-h', h + 'px');
// All subsequent slides use min-height: var(--hero-fixed-h)
```

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

### Architecture Considerations for Future Development

**Service Worker / Offline-first**
A cache-first service worker for fonts would make the app fully offline-capable. A `manifest.json` with `start_url`, `display: standalone`, and icon assets would improve the PWA install experience on Android.

**Local-first Sync**
Supabase + PowerSync has been considered as a sync layer. Would require refactoring `state` into a normalised schema and replacing `localStorage` with a PowerSync-managed SQLite store.

**Native App**
Capacitor wrapping is compatible with the single-file architecture with minimal changes. Main additions: native push notifications for timer alerts, native camera API for barcode scanning.

**Data Model Evolution**
The dual nutrition log format (`nutritionLogs` legacy + `nutritionMeals` current) is technical debt. A migration pass in `importData()` to normalise legacy entries into `nutritionMeals` would simplify `getDayTotals()`.

**Macrocycle/Mesocycle Terminology**
The S&C terminology in the codebase (variable names use `macro`/`meso`) reflects a historical inversion: what the code calls a "macrocycle" (the short training block) is technically a mesocycle in periodisation theory, and vice versa. The UI labels are correct; the internal variable names are not. A full rename pass is deferred pending a stable release.
