# BLOC — Technical Documentation

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [File Structure](#2-file-structure)
3. [State Model](#3-state-model)
4. [Data Persistence](#4-data-persistence)
5. [Navigation & Screen System](#5-navigation--screen-system)
6. [Modal System](#6-modal-system)
7. [Module: Plan](#7-module-plan)
8. [Module: Train](#8-module-train)
9. [Module: Body](#9-module-body)
10. [Module: Nutrition](#10-module-nutrition)
11. [Module: Goals](#11-module-goals)
12. [Module: Home](#12-module-home)
13. [Module: Settings & Data Management](#13-module-settings--data-management)
14. [Module: Rest Timer](#14-module-rest-timer)
15. [Exercise Library](#15-exercise-library)
16. [Progression Logic](#16-progression-logic)
17. [External APIs](#17-external-apis)
18. [Design System](#18-design-system)
19. [Function Reference](#19-function-reference)
20. [Key Algorithms](#20-key-algorithms)
21. [Known Limitations & Future Considerations](#21-known-limitations--future-considerations)

---

## 1. Architecture Overview

BLOC is a single-file Progressive Web App (`index.html`) with no build toolchain, no framework, and no backend. The entire application — HTML structure, CSS, and JavaScript — is contained within one file.

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
│  Fonts: Google Fonts CDN                │
│  Food data: Open Food Facts API         │
└─────────────────────────────────────────┘
```

**Key constraints this design imposes:**
- All state must be serialisable to JSON (for `localStorage`)
- No module imports — all functions are global
- Rendering is manual DOM manipulation (no virtual DOM)
- Every screen re-renders fully on navigation; there is no partial diffing

---

## 2. File Structure

The file is organised into clearly commented sections in this order:

```
<head>
  CSS custom properties (design tokens)
  Global reset & base styles
  Layout (app shell, content scroll area)
  Navigation bar
  Typography
  Cards
  Buttons
  Inputs
  Badges, tags, progress bars
  Modals
  Toggles
  Log set rows
  Progression chips
  Pie chart
  Week selector (week-strip)
  Day tabs
  Fill suggested animation (@keyframes inputFlash)
  Empty state
  Nutrition-specific styles

<body>
  #app
    #content
      Screens (home, plan, train, body, goals, settings, nutrition)
    #nav (bottom navigation bar)
  
  Modals (outside #content to avoid stacking context issues):
    modal-macro       — new macrocycle
    modal-edit-macro  — edit macrocycle
    modal-exercise    — add/edit exercise
    modal-custom-exercise — create custom exercise
    modal-body-log    — log body weight / steps
    modal-nutr-add    — nutrition entry chooser
    modal-nutr-barcode — barcode lookup
    modal-nutr-manual — manual food entry
    modal-nutr-serving — serving size selector
    modal-nutr-previous — previous meals picker
    modal-nutr-edit-entry — edit a logged food entry
    modal-nutr-edit-log — legacy nutrition edit
    modal-add-goal    — add/edit goal
    modal-timer       — rest timer
    modal-confirm     — custom confirm dialog

<script>
  State declaration & persistence (save/load)
  Navigation (showScreen, openModal, closeModal)
  Macrocycle helpers (getMacroDurationWeeks, getMacroEndDate, etc.)
  Macrocycle CRUD (createMacrocycle, saveEditMacro, deleteMacrocycle, copyMacrocycle)
  Exercise CRUD (openAddExercise, saveExercise, deleteExercise)
  Progression logic (getWeekSets, getWeekWeight, getWeekReps, getMyorepProgression)
  Render: Home
  Render: Plan
  Render: Train
  Training log (logSet, fillSuggested, clearExerciseLogs, toggleSetDone)
  Render: Body
  Render: Nutrition (full nutrition module)
  Render: Settings
  Data export/import (exportData, importData, clearAllData)
  Exercise library (DEFAULT_LIBRARY, getLibrary, populateExerciseSelect)
  Render: Goals
  Utility (formatDate, getISOWeek, getLocalToday, getLocal7Days)
  Custom confirm modal
  Rest timer (playBeep, buildPicker, countdown, stopwatch)
  Modal swipe-down initialisation
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
  nutritionLogs:     [],   // Array<NutritionLog>  (legacy)
  goals:             [],   // Array<Goal>
  customLibrary:     [],   // Array<LibraryEntry>
  nutritionMeals:    {},   // Record<date, MealDay>
  nutritionQuickLog: {},   // Record<date, MacroTotals>
  foodLibrary:       [],   // Array<FoodItem>
  currentMacroId:    null, // string | null
  currentWeek:       1,    // number
  currentDay:        'push', // string
  currentEditContext: null, // {week, day, editIdx} | null
};
```

### Type Definitions

#### Macrocycle
```js
{
  id:               string,   // 'macro_' + Date.now()
  name:             string,
  weeks:            number,   // number of mesocycles
  weeksPerMeso:     number,   // calendar weeks per mesocycle
  sessionsPerWeek:  number,
  start:            string,   // ISO date 'YYYY-MM-DD'
  goal:             string,   // free text goal description
  targetBw:         number | null,  // lbs
  goalType:         'loss' | 'gain' | 'maintenance',
  splitType:        'ppl' | 'fullbody' | 'custom',
  days:             string[], // e.g. ['push','pull','legs'] or ['session0','session1']
  dayLabels:        Record<string, string>, // e.g. {push:'Push', pull:'Pull', legs:'Legs'}
  useMicrocycles:   boolean,
}
```

#### Exercise
```js
{
  name:        string,
  reps:        string,   // e.g. '10', '8–12'
  setsStart:   number,   // sets in week 1
  setsEnd:     number,   // sets in final week
  startWeight: number,   // kg
  type:        'standard' | 'myorep' | 'myomatch',
  isHeavyLeg:  boolean,  // applies higher progression rate
}
```

Exercises are stored in `state.exercises` under a composite key:

```
key = macroId + '_' + week + '_' + dayKey
```

Where `dayKey` is:
- Without microcycles: `'push'`, `'pull'`, `'legs'`, `'session0'`, etc.
- With microcycles: `'pushm1'`, `'pushm2'`, `'pullm1'`, etc.

Exercises are always stored against **week 1** as the template. All other weeks read from week 1 and apply progression calculations at render time.

#### SetLog
```js
// key = macroId + '_' + week + '_' + dayKey + '_' + exIdx + '_' + setIdx
{
  weight: string,  // as entered by user
  reps:   string,
  done:   boolean,
}
```

There is also a progression type key stored per exercise per session:
```
key = macroId + '_prog_' + week + '_' + dayKey + '_' + exIdx
value = 'weight' | 'reps'
```

#### BodyLog
```js
{
  date:   string,  // 'YYYY-MM-DD'
  weight: number,  // lbs
  steps:  number,
}
```

#### NutritionLog (legacy)
```js
{
  date:    string,
  kcal:    number,
  protein: number,
  carbs:   number,
  fats:    number,
}
```
This was the original simple daily nutrition log. It is preserved for backward compatibility. New entries use `nutritionMeals` instead.

#### MealDay
```js
// state.nutritionMeals[date] = MealDay
{
  Breakfast: FoodEntry[],
  Lunch:     FoodEntry[],
  Dinner:    FoodEntry[],
  Snacks:    FoodEntry[],
}
```

#### FoodEntry
```js
{
  id:      string,   // 'food_' + Date.now()
  name:    string,
  kcal:    number,
  protein: number,
  carbs:   number,
  fats:    number,
  serving: number,   // grams
  source:  'library' | 'manual' | 'barcode',
}
```

#### FoodItem (food library)
```js
{
  id:             string,
  name:           string,
  per100kcal:     number,
  per100p:        number,
  per100c:        number,
  per100f:        number,
  defaultServing: number,  // grams
  source:         'barcode' | 'manual',
}
```

#### NutritionQuickLog
```js
// state.nutritionQuickLog[date] = MacroTotals
{
  kcal:    number,
  protein: number,
  carbs:   number,
  fats:    number,
}
```

#### Goal
```js
{
  macroId:   string,
  startDate: string,
  endDate:   string,
  kcal:      number | null,
  steps:     number | null,
  protein:   number | null,
  carbs:     number | null,
  fats:      number | null,
}
```

#### LibraryEntry
```js
{
  name:     string,
  bodyPart: string,
}
```

---

## 4. Data Persistence

All data is stored in `localStorage` under the key `bloc_state` as a serialised JSON string.

```js
function save() {
  localStorage.setItem('bloc_state', JSON.stringify(state));
}

function load() {
  const raw = localStorage.getItem('bloc_state');
  if (raw) {
    try { state = JSON.parse(raw); } catch(e) {}
  }
}
```

`load()` is called once on script initialisation. `save()` is called at the end of every mutation — there is no debouncing or batching.

**Storage size:** A mature instance with several macrocycles, exercise definitions, and months of logs will typically use 200–800 KB. The browser's `localStorage` limit is 5–10 MB depending on the browser.

The Settings screen displays current storage usage, computed as:
```js
new Blob([localStorage.getItem('bloc_state') || '']).size
```

### Backup Format

The full backup is the `state` object serialised directly to JSON. Filename pattern: `bloc-backup-YYYY-MM-DD.json`.

Import validation checks for the presence of `macrocycles`, `exercises`, and `trainLogs` before restoring.

---

## 5. Navigation & Screen System

The app uses a single-page architecture with CSS `display` toggling. Screens are `<div class="screen">` elements; only one has `class="screen active"` at a time.

```js
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  // Each screen triggers its own render on activation:
  if (name === 'home')      renderHome();
  if (name === 'plan')      renderPlan();
  if (name === 'train')     renderTrain();
  if (name === 'body')      renderBody();
  if (name === 'nutrition') renderNutrition();
  if (name === 'goals')     renderGoals();
  if (name === 'settings')  renderSettings();
}
```

**Screens:** `home`, `plan`, `train`, `body`, `nutrition`, `goals`, `settings`

Each screen renders fully from scratch on every visit. There is no incremental update mechanism.

---

## 6. Modal System

Modals use a CSS-based open/close system:

```css
.modal-overlay {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}
.modal-overlay.open {
  opacity: 1;
  pointer-events: all;
}
.modal-sheet {
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.modal-overlay.open .modal-sheet {
  transform: translateY(0);
}
```

```js
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
```

All modals support:
- **Swipe-down to close** — initialised by the IIFE at the bottom of the script that calls `initModal()` on each `.modal-overlay`
- **Tap backdrop to close** — a `pointerdown` listener on the overlay itself (not the sheet)
- **✕ button** — calls `closeModal(id)` explicitly

The `modal-confirm` dialog is centre-aligned rather than bottom-sheet style, achieved via inline `style="align-items:center;justify-content:center;"` on the overlay.

---

## 7. Module: Plan

### Macrocycle Lifecycle

```
createMacrocycle()
  → pushes to state.macrocycles
  → sets state.currentMacroId
  → sets state.currentDay (with or without microcycle suffix)
  → save() → renderPlan()

saveEditMacro()
  → finds existing macro by id, updates fields in-place
  → save() → renderPlan()

copyMacrocycle(id)
  → deep-copies the source macro and all its exercises
  → assigns new IDs to macro and remapped exercise keys
  → state.currentMacroId = newId
  → save() → renderPlan()

deleteMacrocycle(id)
  → double-confirms via showConfirm()
  → removes macro, all exercise entries starting with id, all trainLog entries starting with id
  → falls back currentMacroId to last remaining macro
  → save() → renderPlan()
```

### Exercise Key Scheme

Exercises are templated against week 1. When reading exercises for any other week, the code always uses:
```js
const templateKey = macroId + '_1_' + dayKey;
const exercises = state.exercises[templateKey] || [];
```

Progression is then applied at render time via `getWeekWeight()`, `getWeekReps()`, etc.

### Microcycle Day Keys

When `useMicrocycles` is true, each training day has two variants:
- `pushm1` — Push day, microcycle 1
- `pushm2` — Push day, microcycle 2

The `selectTrainDay()` function handles this by directly setting `state.currentDay` to the suffixed key when relevant.

### Macrocycle Duration

```js
function getMacroDurationWeeks(macro) {
  // Total calendar weeks = mesocycles × weeks-per-mesocycle
  return macro.weeks * (macro.weeksPerMeso || 1);
}
```

---

## 8. Module: Train

### Render Flow

```
renderTrain()
  → builds week-strip (mesocycle pills)
  → builds day-tabs
  → calls renderTrainDay(macro)

renderTrainDay(macro)
  → for each exercise in templateKey (week 1, currentDay):
      getWeekSets(ex, currentWeek, totalWeeks)    → set count
      getWeekWeight(ex, currentWeek, goalType)    → suggested weight
      getWeekReps(ex, currentWeek, progType)      → suggested reps
      getProgressionNote(ex, currentWeek, ...)    → chip label
      reads state.trainLogs for last week's actual values
      renders set log rows with input IDs: inp-w-{logKey}, inp-r-{logKey}
```

### Log Key Structure

```
logKey = macroId + '_' + week + '_' + dayKey + '_' + exIdx + '_' + setIdx
```

Example: `macro_1718000000000_3_pushm1_0_2` = macro ID, week 3, push microcycle 1, first exercise, third set.

### Fill Suggested

```js
function fillSuggested(macroId, week, day, exIdx, sets, weight, reps, btnEl) {
  // For each set: writes to state.trainLogs, updates DOM inputs directly
  // Triggers inputFlash animation on each input via classList manipulation
  // void el.offsetWidth forces reflow so animation restarts if called again
  // Button flashes amber then fades back
  // Does NOT call renderTrainDay — avoids killing the animation
}
```

### Set Done Toggle

`toggleSetDone(key)` validates that both weight and reps fields are non-empty before marking a set done. If either is missing, it briefly flashes the relevant input border red.

### Session Completion

The week-strip renders a `✓` badge on a mesocycle pill when every set of every exercise in every session of that week has `done: true`. The check iterates all microcycle variants and all exercises.

---

## 9. Module: Body

Body logs (`bodyLogs`) store a date, weight in lbs, and step count per entry.

### Render

`renderBody()` computes:
- Latest weight entry
- 7-day average weight and step count
- Week-on-week average change
- Renders all entries as a list with edit/delete

### Edit Flow

`openEditBodyLog(date)` finds the log entry for the given date and populates the modal. `saveBodyLog()` upserts (finds by date, updates in-place, or pushes a new entry) then re-renders.

---

## 10. Module: Nutrition

The nutrition module is the most complex in the app. It supports two parallel log formats for historical compatibility.

### Log Priority

When computing totals for a given date, the following priority applies:

1. `state.nutritionMeals[date]` — per-meal food entries (current format)
2. `state.nutritionQuickLog[date]` — quick-add macro totals
3. `state.nutritionLogs` — legacy simple daily log

```js
function getNutrDayLog(date) {
  // Returns unified {kcal, protein, carbs, fats} for any date
  // regardless of which storage format was used
}
```

### Daily Totals

```js
function getDayTotals(date) {
  const meals = getNutrDayMeals(date);
  // Sums across all meals, adds nutritionQuickLog if present
  return { kcal, protein, carbs, fats };
}
```

### Meal Structure

Each meal is an array of `FoodEntry` objects. Meals are: `Breakfast`, `Lunch`, `Dinner`, `Snacks`.

### Food Entry Flow

```
openNutrAdd(meal)
  └─ Choose source:
      ├─ openNutrBarcode()          → lookupNutrBarcode() → Open Food Facts API
      │                               → openNutrServingModal()
      ├─ openNutrManual()           → saveManualEntry()
      ├─ selectFromLibrary(item)    → openNutrServingModal()
      └─ copyFromYesterday()        → copies previous day's meal entries
```

### Serving Modal

`openNutrServingModal()` is shared between the barcode and library flows. It receives a `nutrPendingProduct` global:

```js
nutrPendingProduct = {
  name, brand, per100kcal, per100p, per100c, per100f, defaultServing
}
```

`updateServingPreview()` recomputes macros live as the user types a serving size:
```js
const factor = serving / 100;
kcal    = Math.round(product.per100kcal * factor);
protein = Math.round(product.per100p    * factor * 10) / 10;
// etc.
```

`confirmServing()` calls `addFoodEntry()` then `addToFoodLibrary()` to persist the food for future quick-selection.

### Food Library

```js
function addToFoodLibrary(item) {
  if (!state.foodLibrary) state.foodLibrary = [];
  const idx = state.foodLibrary.findIndex(f =>
    f.name.toLowerCase() === item.name.toLowerCase()
  );
  if (idx >= 0) {
    state.foodLibrary[idx] = item; // update
  } else {
    state.foodLibrary.push(item);  // add
  }
  save();
}
```

Foods are de-duplicated by name (case-insensitive). The most recently used definition wins on update.

### Weekly Nutrition View

`renderNutrWeekly()` builds a 7-day bar chart per macro using `buildHomeBarChart()`. It also computes a week-level average and renders a macro pie chart via `makePie()`.

### Pie Chart

`makePie(p, c, f)` generates an inline SVG pie chart from protein, carb, and fat gram values. It converts grams to kcal (protein × 4, carbs × 4, fats × 9) then to arc segments using trigonometry.

---

## 11. Module: Goals

Goals are stored as an array in `state.goals`. Each goal is associated with a macrocycle via `macroId`.

### Active Goal Resolution

```js
function getActiveGoal() {
  const macro = state.macrocycles.find(m => m.id === state.currentMacroId);
  if (!macro) return null;
  return state.goals.find(g => g.macroId === macro.id) || null;
}
```

### Goal Display

`buildGoalsHomeSection()` renders the "Today vs Goal" and "Weekly averages" cards on the Home screen. It computes:

- Daily progress bars for each tracked metric
- Weekly totals and averages for the elapsed days of the current cycle
- Remaining-day pacing calculations:

```js
const stepsNeededPerDay = Math.ceil(
  (weeklyStepsGoal - weekStepsTotal) / daysLeft
);
```

---

## 12. Module: Home

The home screen is composed of independently rendered sections, each with its own function:

| Section | Function | Data source |
|---|---|---|
| Active cycle card | `renderHome()` (inline) | `state.macrocycles`, `state.bodyLogs` |
| Body weight card + sparkline | `renderHome()` (inline) | `state.bodyLogs` |
| Steps | `renderHomeSteps()` | `state.bodyLogs` |
| Nutrition | `renderHomeNutr()` | `state.nutritionMeals`, `state.nutritionQuickLog`, `state.nutritionLogs` |
| Goals summary | `buildGoalsHomeSection()` | `state.goals`, all log sources |

### Body Weight Progress (Active Cycle Card)

The cycle card computes three values from `state.bodyLogs`:

1. **Latest weight** — most recent entry
2. **Cycle start weight** — earliest entry on or after `macro.start`
3. **Cycle delta** — `latestBw - cycleFirstBw`

```
Display: {latestBw} lbs · {delta} lbs lost/gained so far · {diff} lbs left to go
Colours: amber for current + delta, grey for left-to-go
```

### Bar Charts

`buildHomeBarChart(days, values, colour, fmtFn, today)` renders a 7-day bar chart as inline HTML. Each bar is a `div` with a percentage height. Today's bar renders at full opacity; prior days at 0.5. A vertical marker line appears at the goal threshold if a goal is set.

`buildHomeProgressBar(value, max, colour, markerColour)` renders a horizontal progress bar for the today view.

### Toggle Persistence

`homeToggle` is a module-level object `{ steps: 'today'|'avg', nutr: 'today'|'avg' }` that persists toggle state across renders within a session (not persisted to `localStorage`).

---

## 13. Module: Settings & Data Management

### Export Functions

| Function | Output | Contains |
|---|---|---|
| `exportData()` | `bloc-backup-YYYY-MM-DD.json` | Full `state` object |
| `exportLibrary()` | `bloc-exercise-library-YYYY-MM-DD.json` | `DEFAULT_LIBRARY` + `customLibrary` |
| `exportFoodLibrary()` | `bloc-food-library-YYYY-MM-DD.json` | `state.foodLibrary` |

All exports use `URL.createObjectURL(new Blob([...]))` with a programmatically clicked `<a>` element, then revoke the URL.

### Import Functions

| Function | Behaviour |
|---|---|
| `importData(event)` | Validates for `macrocycles`/`exercises`/`trainLogs`, then replaces `state` entirely |
| `importExerciseLibrary(file)` | Merges into `state.customLibrary`; skips default exercises by name |
| `importFoodLibrary(file)` | Merges into `state.foodLibrary`; upserts by name |

### Clear All Data

Double-confirms via the custom confirm modal, then resets `state` to its initial empty structure and calls `save()`.

### Storage Display

```js
const bytes = new Blob([localStorage.getItem('bloc_state') || '']).size;
// Displayed as KB, formatted to 1 decimal place
```

---

## 14. Module: Rest Timer

### State Variables

```js
let timerMode   = 'countdown';  // 'countdown' | 'stopwatch'
let cdPickerMin = 1;
let cdPickerSec = 0;
let cdInterval  = null;
let cdRemaining = 0;            // ms remaining
let cdRunning   = false;
let swInterval  = null;
let swRunning   = false;
let swElapsed   = 0;            // ms elapsed
let swLastTick  = 0;            // Date.now() reference point
```

### Drum Picker

`buildPicker(elId, count, zeroPad, initial, onPick)` creates a scrollable column of values resembling an iOS picker wheel.

- Items are 40px tall (`ITEM_H = 40`)
- The column is positioned via CSS `transform: translateY()`
- A gradient overlay fades items at top and bottom to simulate depth
- A highlight bar (border-top/bottom) marks the selected centre item
- Supports both touch (passive/non-passive event listeners) and mouse drag
- On drag end, snaps to the nearest integer value with a 150ms ease transition

Position formula:
```js
const y = -(value * ITEM_H) + (containerHeight / 2 - ITEM_H / 2);
// = -(value * 40) + (120/2 - 40/2) = -(value * 40) + 40
```

### Countdown

The countdown uses `setInterval` at 100ms. The `cdRemaining` counter decrements by 100ms on each tick. Using ceiling division in the display (`Math.ceil(ms / 1000)`) ensures `1:00` displays for the full first second rather than jumping immediately to `0:59`.

```js
function cdFormat(ms) {
  const totalSec = Math.ceil(ms / 1000);
  return Math.floor(totalSec / 60) + ':' + String(totalSec % 60).padStart(2, '0');
}
```

Colour transitions:
- `> 10s` remaining: `var(--text)` (white)
- `≤ 10s` remaining: `var(--amber)` (orange)
- Finished: `var(--accent)` (green)

### Stopwatch

The stopwatch uses `Date.now()` differencing rather than accumulating interval ticks, which prevents drift when the tab is backgrounded:

```js
swLastTick = Date.now() - swElapsed; // reference point
// on each tick:
swElapsed = Date.now() - swLastTick;
```

### Audio Alert

`playBeep()` creates a disposable `AudioContext` per alert (avoiding the need to manage a persistent context). Three sine wave oscillators are scheduled with linear gain ramps:

```js
const beepSeq = [
  { freq: 880,  start: 0,    dur: 0.12 },
  { freq: 880,  start: 0.18, dur: 0.12 },
  { freq: 1100, start: 0.36, dur: 0.22 },
];
```

The context is routed to `ctx.destination` (the default output) using the `AudioContext` graph, which operates on the audio worklet thread independently of the media session. This means the beep does not interrupt or duck music or podcast playback.

The context is closed after 1200ms to release resources.

### Icon State

The clock icon in the Train header reflects timer activity:
```js
btn.style.color = (cdRunning || swRunning) ? 'var(--accent)' : 'var(--text2)';
```

Closing the modal resets both timers and returns the icon to its default colour.

---

## 15. Exercise Library

### Default Library

`DEFAULT_LIBRARY` is a hardcoded array of 25 exercises across 7 body parts:

| Body Part | Exercises |
|---|---|
| Biceps | Cable Curls, Reverse Grip Curls, Rope Curls |
| Calves | Calf Raises |
| Chest | Cross Incline Press, Decline Press, Flat Press, Incline Press |
| Legs | Hamstring Curl, Leg Extension, Leg Press, RDL, Split Squat, Walking Lunge |
| Back | Lat Pull Machine, Lat Pulldown, Low Row, Machine Row, T-Bar Lat Pulldown, T-Bar Row |
| Shoulders | Lateral Raise |
| Triceps | Cross Cable Extensions, Push Downs, Reverse Grip Extensions, Rope Extensions, Skull Crushers |

### Custom Exercises

Custom exercises are stored in `state.customLibrary` as `{name, bodyPart}` objects.

`getLibrary()` merges and sorts both:
```js
function getLibrary() {
  return [...DEFAULT_LIBRARY, ...state.customLibrary]
    .sort((a, b) => a.bodyPart.localeCompare(b.bodyPart) || a.name.localeCompare(b.name));
}
```

`populateExerciseSelect()` groups exercises into `<optgroup>` elements by body part and appends a `Custom…` option that triggers the custom exercise modal.

The exercise library export includes both default and custom exercises (the full merged library). Import skips any exercises whose names match a default exercise (case-insensitive), ensuring defaults cannot be overwritten.

---

## 16. Progression Logic

### Set Volume

Sets scale linearly from `setsStart` to `setsEnd` across the mesocycle:

```js
function getWeekSets(ex, week, totalWeeks) {
  const t = totalWeeks > 1 ? (week - 1) / (totalWeeks - 1) : 0;
  return Math.round(ex.setsStart + t * (ex.setsEnd - ex.setsStart));
}
```

Example: `setsStart=2`, `setsEnd=5`, `totalWeeks=4`:
- Week 1: 2 sets
- Week 2: 3 sets
- Week 3: 4 sets
- Week 4: 5 sets

### Weight Progression

```js
function getWeekWeight(ex, week, progType, goalType) {
  if (progType !== 'weight') return ex.startWeight;
  const isGain = goalType === 'gain';
  const jump = ex.isHeavyLeg
    ? (isGain ? 10 : 2.5)
    : (isGain ? 5  : 1.5);
  return ex.startWeight + jump * (week - 1);
}
```

Weight increment per mesocycle (kg):

| Exercise type | Weight Loss | Strength Gain |
|---|---|---|
| Standard | +1.5 kg | +5 kg |
| Heavy leg | +2.5 kg | +10 kg |

### Rep Progression

```js
function getWeekReps(ex, week, progType) {
  if (progType !== 'reps') return ex.reps;
  // Parses the base rep count and adds (week - 1)
  // Handles both '10' and '8–12' range formats
}
```

### Myorep Progression

- **Myorep giant** (`type: 'myorep'`): Base reps + 10 per week. Weight progression also available.
- **Myomatch** (`type: 'myomatch'`): Fixed rep count, weight progression only. Used for matching a target rep performance.

### Progression Type Selection

Per exercise per session, the user can choose `weight` or `reps` progression via a toggle rendered in the train day view. The choice is persisted to `state.trainLogs` under the prog key:
```
macroId + '_prog_' + week + '_' + dayKey + '_' + exIdx
```

---

## 17. External APIs

### Open Food Facts

Used for barcode-based food lookup in the Nutrition module.

- **Endpoint:** `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
- **Method:** GET
- **Auth:** None required
- **Fields used:**
  - `product.product_name` / `product.product_name_en` — display name
  - `product.brands` — brand name
  - `product.nutriments.energy-kcal_100g` — kcal per 100g
  - `product.nutriments.proteins_100g` — protein per 100g
  - `product.nutriments.carbohydrates_100g` — carbs per 100g
  - `product.nutriments.fat_100g` — fat per 100g
  - `product.product_quantity` — whole pack size (preferred serving default)
  - `product.serving_quantity` — serving size (fallback)

**Error handling:** Network failures, missing products, and products without calorie data each display a distinct error message in the modal. No retry logic — user must re-attempt.

### Google Fonts

Loaded via `<link>` in `<head>`:
```
https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800
```

This is the only external dependency required for the app to render correctly. The app is fully functional without it (system monospace font fallback applies), but will not match the intended design.

---

## 18. Design System

All design tokens are CSS custom properties on `:root`:

### Colours

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--surface` | `#141414` | Card backgrounds |
| `--surface2` | `#1c1c1c` | Input backgrounds |
| `--surface3` | `#242424` | Toggle active backgrounds |
| `--border` | `rgba(255,255,255,0.08)` | Subtle dividers |
| `--border2` | `rgba(255,255,255,0.14)` | Input borders, card borders |
| `--text` | `#f0ede8` | Primary text |
| `--text2` | `#888880` | Secondary text |
| `--text3` | `#555550` | Tertiary / label text |
| `--accent` | `#c8f060` | Primary action, progress, kcal |
| `--accent2` | `#a8d040` | Accent pressed state |
| `--red` | `#ff5f4e` | Danger, fats |
| `--amber` | `#f5a623` | Warning, carbs, timer countdown |
| `--blue` | `#60a8f0` | Protein, informational |
| `--purple` | `#b060f0` | Steps |

### Typography

| Token | Value |
|---|---|
| `--font-display` | `'Syne', sans-serif` |
| `--font-mono` | `'DM Mono', monospace` |

Display font (Syne) is used for headings, large numbers, and exercise names. Mono font (DM Mono) is used for all body text, labels, and inputs.

### Spacing & Shape

| Token | Value |
|---|---|
| `--r` | `12px` — standard border radius |
| `--r-sm` | `8px` — small border radius |
| `--nav-h` | `72px` — bottom nav height |
| `--safe-bottom` | `env(safe-area-inset-bottom, 0px)` — iOS home indicator |

### Component Classes

| Class | Description |
|---|---|
| `.card` | Standard surface card |
| `.card-accent` | Card with accent border (active cycle) |
| `.btn` | Base button |
| `.btn-accent` | Primary filled button |
| `.btn-sm` | Small button |
| `.btn-block` | Full-width button |
| `.btn-ghost` | Borderless button |
| `.btn-danger` | Red-bordered button |
| `.badge-{colour}` | Pill badge in green/amber/red/blue/purple |
| `.tag` | Selectable filter chip |
| `.tag.active` | Selected filter chip |
| `.progress-track` / `.progress-fill` | Horizontal progress bar |
| `.set-log-row` | Training log row (set number + inputs + done button) |
| `.set-check` / `.set-check.done` | Circular done toggle |
| `.prog-chip` | Progression indicator chip |
| `.prog-up` | Green progression chip |
| `.prog-hold` | Amber hold chip |
| `.week-pill` / `.week-pill.active` | Mesocycle selector pill |
| `.day-tab` / `.day-tab.active` | Training day tab |
| `.toggle-row` / `.toggle-btn` | Segmented control |
| `.input-flash` | CSS animation class for fill-suggested feedback |

### Fill Suggested Animation

```css
@keyframes inputFlash {
  0%   { border-color: var(--border2); box-shadow: none; }
  25%  { border-color: var(--amber); box-shadow: 0 0 0 2px rgba(245,166,35,0.3); }
  60%  { border-color: var(--amber); box-shadow: 0 0 0 2px rgba(245,166,35,0.3); }
  100% { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(200,240,96,0.15); }
}
```

Applied via `classList.add('input-flash')`. A `void el.offsetWidth` reflow is forced before re-adding the class to allow the animation to restart on repeated presses.

---

## 19. Function Reference

### Persistence
| Function | Description |
|---|---|
| `save()` | Serialises `state` to `localStorage` |
| `load()` | Deserialises `state` from `localStorage` |

### Navigation
| Function | Description |
|---|---|
| `showScreen(name)` | Activates a screen and triggers its render |
| `openModal(id)` | Opens a modal by adding `.open` class |
| `closeModal(id)` | Closes a modal by removing `.open` class |

### Macrocycle
| Function | Description |
|---|---|
| `createMacrocycle()` | Reads the new macro form and pushes to state |
| `saveEditMacro()` | Updates an existing macro in-place |
| `copyMacrocycle(id)` | Deep-copies a macro and all its exercises |
| `deleteMacrocycle(id)` | Removes macro, exercises, and logs |
| `getMacroDurationWeeks(macro)` | Returns total calendar weeks |
| `getMacroEndDate(macro)` | Returns `Date` of last day |
| `getNextMacroStart()` | Returns day after the latest macro ends |
| `getMacroSummaryLabel(macro)` | Returns formatted summary string |

### Exercises
| Function | Description |
|---|---|
| `openAddExercise(week, day)` | Opens modal for new exercise |
| `openEditExercise(week, day, idx)` | Opens modal to edit existing exercise |
| `saveExercise()` | Upserts exercise from modal form |
| `deleteExercise(week, day, idx)` | Removes exercise from state |

### Progression
| Function | Description |
|---|---|
| `getWeekSets(ex, week, totalWeeks)` | Linear interpolation of set count |
| `getWeekWeight(ex, week, progType, goalType)` | Suggested weight for week |
| `getWeekReps(ex, week, progType)` | Suggested reps for week |
| `getMyorepProgression(ex, week)` | Myorep-specific rep count |
| `getProgressionNote(ex, week, progType, goalType)` | Delta label for progression chip |

### Training Log
| Function | Description |
|---|---|
| `logSet(key, field, value)` | Writes a single field to a set log entry |
| `fillSuggested(macroId, week, day, exIdx, sets, weight, reps, btnEl)` | Fills all set inputs with suggestions |
| `clearExerciseLogs(macroId, week, day, exIdx, sets)` | Clears all logs for an exercise |
| `toggleSetDone(key)` | Toggles the done state of a set |
| `selectProgType(macroId, week, day, exIdx, type)` | Saves progression type choice |

### Body
| Function | Description |
|---|---|
| `renderBody()` | Renders the Body screen |
| `openEditBodyLog(date)` | Opens edit modal for a body log entry |
| `saveBodyLog()` | Upserts a body log entry |

### Nutrition
| Function | Description |
|---|---|
| `getDayTotals(date)` | Returns summed macros for a date |
| `getNutrDayLog(date)` | Returns unified macro totals across all log formats |
| `getNutrDayMeals(date)` | Returns meal-structured entries for a date |
| `addFoodEntry(item)` | Appends a food entry to the active meal |
| `addToFoodLibrary(item)` | Upserts a food item to the food library |
| `lookupNutrBarcode()` | Fetches product data from Open Food Facts |
| `updateServingPreview()` | Recomputes macro display in serving modal |
| `confirmServing()` | Finalises a food entry from the serving modal |
| `copyFromYesterday()` | Copies previous day's meal into current date |
| `syncNutrLegacyLog(date)` | Backfills `nutritionLogs` from `nutritionMeals` for compatibility |

### Goals
| Function | Description |
|---|---|
| `getActiveGoal()` | Returns the goal for the current macrocycle |
| `saveGoal()` | Upserts a goal entry |
| `deleteGoal(macroId)` | Removes a goal |
| `buildGoalsHomeSection()` | Renders the goals summary for the Home screen |

### Settings
| Function | Description |
|---|---|
| `exportData()` | Downloads full state as JSON |
| `importData(event)` | Restores state from a JSON file |
| `clearAllData()` | Resets state to empty defaults |
| `exportLibrary()` | Downloads merged exercise library as JSON |
| `importExerciseLibrary(file)` | Merges exercise library from JSON file |
| `exportFoodLibrary()` | Downloads food library as JSON |
| `importFoodLibrary(file)` | Merges food library from JSON file |

### Rest Timer
| Function | Description |
|---|---|
| `openTimerModal()` | Opens timer modal, initialises pickers on first open |
| `closeTimerModal()` | Closes modal, resets all timer state |
| `setTimerMode(mode)` | Switches between countdown and stopwatch panels |
| `buildPicker(elId, count, zeroPad, initial, onPick)` | Constructs a drum-scroll picker |
| `countdownStart()` | Starts, pauses, or resumes the countdown |
| `countdownReset()` | Stops and resets countdown to picker view |
| `swToggle()` | Starts, pauses, or resumes the stopwatch |
| `swReset()` | Stops and resets the stopwatch to 0 |
| `playBeep()` | Plays a three-tone alert via Web Audio API |
| `updateTimerIcon()` | Updates clock icon colour to reflect active state |

### Utilities
| Function | Description |
|---|---|
| `getLocalToday()` | Returns `'YYYY-MM-DD'` in the device's local timezone |
| `getLocal7Days()` | Returns array of last 7 days as `{date, label}` objects |
| `formatDate(dateStr)` | Returns human-readable date string |
| `getISOWeek(date)` | Returns ISO week number |
| `fmtK(n)` | Formats a number as `'1.2k'` or `'1234'` |
| `showConfirm(title, msg, okLabel, callback)` | Shows custom confirm modal |

---

## 20. Key Algorithms

### Local Date Handling

The app uses a custom `getLocalToday()` to avoid UTC offset bugs common with `new Date().toISOString()`:

```js
function getLocalToday() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
```

All date comparisons use string comparison (`a.date.localeCompare(b.date)`) which is valid for ISO 8601 date strings.

### Body Weight Cycle Progress (Plan Screen)

```
startBw = earliest body log on or after macro.start
current = most recent body log (any date)
totalNeeded = |startBw - target| (for loss/gain)
achieved    = |startBw - current|
bwPct       = min(100, max(0, round(achieved / totalNeeded * 100)))
```

For maintenance, `bwPct` is hardcoded to 100 (the bar is always full; only the diff label matters).

### Progression Chip Display

The training day render reads last week's actual logged weight for each exercise. If last week had logged data, it computes the delta from last week's actual to this week's suggestion, and shows a chip:

- Green chip (`prog-up`): weight or rep increase suggested
- Amber chip (`prog-hold`): same as last week (first week, or no prior data)

---

## 21. Known Limitations & Future Considerations

### Current Limitations

| Area | Limitation |
|---|---|
| **Offline** | No service worker. Google Fonts require a network connection on first load. App logic and data are fully offline after fonts cache. |
| **Cross-device sync** | Data is device-local. No sync between phone and tablet or across browsers. |
| **Barcode scanning** | Camera-based scanning was evaluated and found unreliable in pure JavaScript without a paid SDK (Scanbot, etc.). Current implementation requires manual barcode number entry. |
| **Push notifications** | No background timer alerts when the app is backgrounded or the screen is locked. |
| **Storage limit** | `localStorage` is capped at 5–10 MB depending on the browser. Extremely large libraries or years of logs could approach this. |
| **Undo** | No undo mechanism. Deletes are double-confirmed but irreversible. |

### Architecture Considerations for Future Development

**Service Worker / Offline-first**
Adding a service worker with a cache-first strategy for fonts would make the app fully offline-capable. A `manifest.json` with `start_url`, `display: standalone`, and icon assets would also improve the PWA install experience on Android.

**Local-first Sync**
Supabase + PowerSync has been considered as a sync layer. This would require refactoring `state` into a normalised schema and replacing `localStorage` with a PowerSync-managed SQLite store. The single-file constraint would need to be relaxed for this.

**Native App**
Capacitor wrapping has been considered for App Store / Play Store deployment. The single-file architecture is compatible with Capacitor with minimal changes — the main addition would be native APIs for push notifications (timer alerts) and camera access (barcode scanning).

**Data Model Evolution**
The dual nutrition log format (`nutritionLogs` legacy + `nutritionMeals` current) is a technical debt item. A migration pass on `importData()` to normalise legacy entries into `nutritionMeals` format would simplify the `getDayTotals()` logic.
