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
  Week selector (week-strip)
  Day tabs
  Fill suggested animation (@keyframes inputFlash)
  Empty state
  Nutrition-specific styles

<body>
  #app
    #content
      Screens: home, plan, train, body, nutrition, goals, settings
    #nav (bottom navigation bar)

  Modals (26 total, appended after #app):
    modal-macro              — new macrocycle
    modal-edit-macro         — edit macrocycle
    modal-add-goal           — add/edit goal
    modal-custom-exercise    — create custom exercise
    modal-exercise           — add/edit exercise
    modal-body-log           — log body weight / steps
    modal-nutr-add           — nutrition log chooser (Barcode / Manual / Recipe)
    modal-nutr-barcode       — barcode number entry
    modal-nutr-serving       — serving size confirm (shows recipe ingredients for recipes)
    modal-nutr-previous      — food library search
    modal-nutr-manual        — manual food entry
    modal-nutr-edit          — edit a logged food entry
    modal-nutr-quick         — quick-add daily macro totals
    modal-timer              — rest timer (countdown + stopwatch)
    modal-food-lib-editor    — browse and edit the food library
    modal-food-lib-entry     — edit a single food library entry
    modal-recipe-step1       — recipe builder step 1: name and servings
    modal-recipe-ingredients — recipe builder step 2: ingredient list
    modal-recipe-barcode     — barcode lookup for recipe ingredient
    modal-recipe-serving     — serving confirm for recipe ingredient
    modal-recipe-manual      — manual entry for recipe ingredient
    modal-recipe-edit-ingredient — edit an existing recipe ingredient
    modal-recipe-list        — My Recipes list with Create new, Edit, Delete
    modal-nutr-copy-entry    — copy or move a food entry or entire meal to another date/meal
    modal-confirm            — custom confirm dialog (centre-aligned)

<script>
  State declaration & load/save
  Navigation (showScreen, openModal, closeModal)
  Macrocycle helpers & CRUD
  Exercise CRUD
  Progression logic
  Render: Home (renderHome, renderHomeSteps, renderHomeNutr, helpers)
  Render: Plan
  Render: Train + training log functions
  Render: Body
  Render: Nutrition (full module — daily, weekly, diary, serving, library, recipes)
  Render: Settings
  Data export/import
  Exercise library
  Render: Goals
  Utilities (formatDate, getLocalToday, fmtK, showConfirm, etc.)
  Rest timer (playBeep, buildPicker, countdown, stopwatch)
  Food library editor
  Recipe builder & manager
  Modal swipe-down + tap-outside initialisation (DOMContentLoaded)
  Confirm button wiring (DOMContentLoaded)
  Timer modal swipe init (DOMContentLoaded)
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
  currentWeek:       1,    // number
  currentDay:        'push',
  currentEditContext: null,
};
```

`load()` is called once on startup. After parsing localStorage, it runs a migration pass and applies defensive defaults:

```js
// Migration: old key names
if (state.mesocycles && !state.macrocycles) { state.macrocycles = state.mesocycles; }
if (state.currentMesoId && !state.currentMacroId) { state.currentMacroId = state.currentMesoId; }

// Defensive defaults (ensures new fields exist on old data)
if (!state.macrocycles)       state.macrocycles = [];
if (!state.recipes)           state.recipes = [];
if (!state.foodLibrary)       state.foodLibrary = [];
if (!state.nutritionMeals)    state.nutritionMeals = {};
if (!state.nutritionQuickLog) state.nutritionQuickLog = {};
// etc.
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
  days:             string[],
  dayLabels:        Record<string, string>,
  useMicrocycles:   boolean,
}
```

#### Exercise
```js
{
  name:        string,
  reps:        string,
  setsStart:   number,
  setsEnd:     number,
  startWeight: number,   // kg
  type:        'standard' | 'myorep' | 'myomatch',
  isHeavyLeg:  boolean,
}
```

Exercises are stored in `state.exercises` under a composite key:
```
key = macroId + '_' + week + '_' + dayKey
```
Exercises are always templated against week 1. All other weeks read from week 1 and apply progression at render time.

#### SetLog
```js
// key = macroId + '_' + week + '_' + dayKey + '_' + exIdx + '_' + setIdx
{ weight: string, reps: string, done: boolean }
```

#### BodyLog
```js
{ date: string, weight: number, steps: number }
```

#### NutritionLog (legacy)
```js
{ date: string, kcal: number, protein: number, carbs: number, fats: number }
```
Preserved for backward compatibility. `syncNutrLegacyLog(date)` backfills this from `nutritionMeals` after every write. `getDayTotals()` reads `nutritionMeals` first (Quick Add overrides all).

#### MealDay
```js
// state.nutritionMeals[date]
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
  name:       string,
  brand:      string,
  grams:      number,   // base gram amount (or serving count for manual entries)
  servings:   number,   // multiplier applied on top of grams
  serving:    number,   // total grams logged (grams × servings)
  kcal:       number,
  protein:    number,
  carbs:      number,
  fats:       number,
  source:     'barcode' | 'manual' | 'library' | 'recipe',
  copiedFrom: string | undefined,  // date string, if copied from another day
}
```

#### FoodItem (food library)
```js
{
  id:             string,
  name:           string,
  brand:          string,   // 'My Recipe' for recipes
  barcode:        string | null,
  per100kcal:     number,   // kcal per 100g
  per100p:        number,
  per100c:        number,
  per100f:        number,
  defaultServing: number | null,   // grams (from product_quantity or serving_quantity)
  isRecipe:       boolean | undefined,
  source:         'barcode' | 'manual' | 'recipe',
}
```

All serving calculations use `per100 / 100 * grams` to avoid double-multiplication. The library always stores per-100g values regardless of source.

#### Recipe
```js
{
  id:              string,   // 'recipe_' + Date.now()
  name:            string,
  servings:        number,
  ingredients:     RecipeIngredient[],
  per_serving_kcal: number,
  per_serving_p:   number,
  per_serving_c:   number,
  per_serving_f:   number,
  total_kcal:      number,
  total_p:         number,
  total_c:         number,
  total_f:         number,
}
```

Recipes are stored in both `state.recipes` (full detail) and `state.foodLibrary` (as a FoodItem with `source: 'recipe'`, `brand: 'My Recipe'`, and `isRecipe: true`). This makes them available in the food library search without special-casing.

#### RecipeIngredient
```js
{
  name:    string,
  brand:   string,
  grams:   number,    // for barcode: actual grams. For manual: servings count
  kcal:    number,    // total for this ingredient entry
  protein: number,
  carbs:   number,
  fats:    number,
  // Barcode ingredients only — used when editing to recalculate from changed grams:
  per1kcal: number,   // kcal per 1g
  per1p:    number,
  per1c:    number,
  per1f:    number,
  source:   'barcode' | 'manual',
}
```

For **barcode ingredients**, `per1*` values are stored (= API's per100 / 100). When editing, changing grams recalculates totals as `per1kcal * grams`. For **manual ingredients**, no per-unit values are stored; the totals are entered directly as `perServing × servings`.

#### NutritionQuickLog
```js
// state.nutritionQuickLog[date]
{ kcal: number, protein: number, carbs: number, fats: number }
```

Quick log takes priority over meal items in `getDayTotals()`. It is set, edited, or cleared via the ⚡ Quick Add flow; a banner in the diary indicates when it is active.

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

#### LibraryEntry (custom exercise)
```js
{ name: string, bodyPart: string }
```

---

## 4. Data Persistence

All data is stored in `localStorage` under the key `bloc_state` as a serialised JSON string.

`save()` is called at the end of every mutation — there is no debouncing or batching. `load()` is called once on script initialisation, immediately after the state declaration.

**Storage size:** A mature instance with several macrocycles, exercise definitions, and months of logs will typically use 200–800 KB. The browser's `localStorage` limit is 5–10 MB.

The Settings screen displays current storage usage:
```js
new Blob([localStorage.getItem('bloc_state') || '']).size
```

### Backup Format

The full backup is the `state` object serialised directly to JSON. Filename: `bloc-backup-YYYY-MM-DD.json`.

Import validation checks for `macrocycles`, `exercises`, and `trainLogs` before restoring.

---

## 5. Navigation & Screen System

Single-page architecture with CSS `display` toggling. Only one screen has `class="screen active"` at a time.

```js
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
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

Each screen renders fully from scratch on every visit.

---

## 6. Modal System

Modals use CSS opacity/pointer-events toggling with a sheet slide-up transition.

```js
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
```

All modals are initialised via `initModal()`, called for each `.modal-overlay` in a `DOMContentLoaded` listener. This ensures modals appended after the script block (timer, food library, recipe modals) are covered.

`initModal()` attaches:
- **Swipe-down to close** — touch/mouse drag on the handle row, closes if dragged > 80px
- **Tap backdrop to close** — `pointerdown` on the overlay itself

The **rest timer modal** (`modal-timer`) uses a separate `DOMContentLoaded` handler because closing it calls `closeTimerModal()` (which resets timer state) rather than `closeModal()`.

The **`modal-confirm`** dialog is centre-aligned rather than bottom-sheet style, via inline `style="align-items:center;justify-content:center;"` on the overlay. Its confirm/cancel `onclick` handlers are wired in a `DOMContentLoaded` listener (not inline or at parse time) since the HTML is appended after the script block.

---

## 7. Module: Plan

### Macrocycle Lifecycle

```
createMacrocycle()
  → pushes to state.macrocycles
  → sets state.currentMacroId and state.currentDay
  → save() → renderPlan()

saveEditMacro()
  → finds existing macro by id, updates fields in-place
  → save() → renderPlan()

copyMacrocycle(id)
  → deep-copies macro and all its exercises with new IDs
  → state.currentMacroId = newId
  → save() → renderPlan()

deleteMacrocycle(id)
  → confirms via showConfirm()
  → removes macro, exercises keyed with id, trainLogs keyed with id
  → falls back currentMacroId to last remaining macro
  → save() → renderPlan()
```

### Exercise Key Scheme

Exercises are templated against week 1:
```js
const templateKey = macroId + '_1_' + dayKey;
const exercises = state.exercises[templateKey] || [];
```
Progression is applied at render time.

### Microcycle Day Keys

When `useMicrocycles` is true, day keys are suffixed: `pushm1`, `pushm2`, etc.

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
      getWeekSets(ex, currentWeek, totalWeeks)
      getWeekWeight(ex, currentWeek, goalType)
      getWeekReps(ex, currentWeek, progType)
      reads state.trainLogs for last week's actuals
      renders set log rows
```

### Log Key Structure

```
logKey = macroId + '_' + week + '_' + dayKey + '_' + exIdx + '_' + setIdx
```

Progression type is stored per exercise per session:
```
macroId + '_prog_' + week + '_' + dayKey + '_' + exIdx  →  'weight' | 'reps'
```

### Fill Suggested

`fillSuggested()` writes directly to `state.trainLogs` and updates DOM inputs without calling `renderTrainDay()`, preserving the CSS animation. A `void el.offsetWidth` reflow forces the animation to restart on repeated presses.

---

## 9. Module: Body

Body logs store a date, weight in lbs, and step count per entry.

`renderBody()` computes the latest weight, 7-day average, and week-on-week change, then renders all entries as a list.

`saveBodyLog()` upserts by date (updates in-place if found, otherwise pushes).

---

## 10. Module: Nutrition

### Architecture

The nutrition module has three log formats for historical compatibility:

| Format | Key | Priority |
|---|---|---|
| Meal diary | `state.nutritionMeals[date][meal][]` | Highest (used for all new entries) |
| Quick Add | `state.nutritionQuickLog[date]` | Overrides meal diary when present |
| Legacy | `state.nutritionLogs[]` | Read-only; backfilled by `syncNutrLegacyLog()` |

```js
function getDayTotals(date) {
  if (state.nutritionQuickLog?.[date]) return { ...quickLog, isQuick: true };
  // else sum nutritionMeals[date] across all meals
}
```

### Daily Render Flow

```
renderNutrDaily()
  → renderNutrBadges()      — 7-day badge strip
  → renderNutrKcal()        — kcal card with progress bar
  → renderNutrMacroPanel()  — protein/carbs/fats panel with g/±/% toggle
  → renderNutrDiary()       — meal sections (Breakfast, Lunch, Dinner, Snacks)
  → initYesterdaySwipes()   — attaches swipe handlers to yesterday strips
```

### Food Entry Flow

```
openNutrAdd(meal)
  └─ modal-nutr-add shows three source buttons:
      ├─ Barcode     → openNutrBarcode() → lookupNutrBarcode()
      │                → sets nutrPendingProduct → openNutrServingModal()
      ├─ Manual      → openNutrManual() → saveManualEntry()
      ├─ Recipe      → openNutrRecipeBuilder() → openRecipeBuilder()
      │                (returns to nutrition after saveRecipe())
      └─ Library list → selectFromAddList() → openNutrServingModal()
```

### nutrPendingProduct

The serving modal is driven by a global:
```js
nutrPendingProduct = {
  name, brand, barcode,
  per100kcal, per100p, per100c, per100f,  // always stored per 100g
  defaultServing,   // from product_quantity → serving_quantity → null
  source,           // 'barcode' | 'library' | 'recipe'
}
```

`updateServingPreview()` computes macros as:
```js
const total = grams * servings;
const kcalPer1 = per100kcal / 100;
kcal = Math.round(kcalPer1 * total);
```

`confirmServing()` calls `addFoodEntry()` then (if not sourced from the library) `addToFoodLibrary()`.

### Serving Modal — Recipe Ingredient Display

When `nutrPendingProduct.source === 'recipe'`, `openNutrServingModal()` looks up the recipe in `state.recipes` by name and renders its ingredient list (name, grams, kcal per ingredient) in a panel above the serving inputs. The grams input is set to 100 and locked (`readOnly`).

### Swipe-to-Copy from Yesterday

`initYesterdaySwipes()` is called after every `renderNutrDiary()` via `requestAnimationFrame`. It attaches touch and mouse listeners to each `[id^="swipe-yesterday-"]` element:

- Drag right → animated colour fill from left + text translation
- ≥ one-third of element width → triggers `copyMealFromYesterday(meal)` with a completion animation
- Less than threshold → snaps back

The element uses two internal children: `.swipe-fill` (absolute positioned fill div) and `.swipe-text` (the label).

### Meal Ellipsis Menu

A `···` button on each meal header calls `openMealMenu(meal)`, which appends a `#meal-menu-sheet` div directly to `document.body` (not managed by the modal system). It presents "Copy meal to…" and "Move meal to…". Both open `modal-nutr-copy-entry` with `nce-mode` set to `'copy'` or `'move'`.

### Copy/Move Modal (modal-nutr-copy-entry)

Used for both single-item copy and whole-meal copy/move. Hidden fields:

| Field | Description |
|---|---|
| `nce-date` | Source date |
| `nce-meal` | Source meal |
| `nce-idx` | Source item index, or `-1` for whole meal |
| `nce-mode` | `'copy'` or `'move'` |

`confirmCopyFoodEntry()` handles both modes:
- `srcIdx === -1`: copies all items from `state.nutritionMeals[srcDate][srcMeal]` to target; if mode is `'move'`, clears the source array and syncs legacy log
- `srcIdx >= 0`: copies a single item

### Food Library

```js
function addToFoodLibrary(item) {
  const idx = state.foodLibrary.findIndex(f =>
    f.name.toLowerCase() === item.name.toLowerCase()
  );
  if (idx >= 0) state.foodLibrary[idx] = item;  // update
  else state.foodLibrary.push(item);             // add
}
```

De-duplicated by name (case-insensitive). Recipes are stored with `brand: 'My Recipe'` and `source: 'recipe'`.

### Recipe Builder

Two-step flow:

**Step 1** (`modal-recipe-step1`): Recipe name and number of servings.

**Step 2** (`modal-recipe-ingredients`): Ingredient list with Barcode and Manual add buttons.

Working state is held in `recipeIngredients[]` (not persisted until `saveRecipe()`).

**Barcode ingredient flow:**
1. `openRecipeBarcode()` → `lookupRecipeBarcode()` → Open Food Facts
2. Sets `recipePendingIngredient` with `per100*` values
3. `modal-recipe-serving` → user enters grams → `confirmRecipeIngredient()`
4. Entry stored with computed totals and `per1*` values (= `per100 / 100`) for future editing

**Manual ingredient flow:**
1. `openRecipeManual()` → user enters name, servings, per-serving macros
2. `confirmRecipeManual()` → stored with `grams: servings` and computed totals (no per-unit values)

**Editing ingredients** (`editRecipeIngredient(idx)`):
- Barcode ingredients: shows grams field only; macros recalculate from stored `per1*` as `per1kcal * grams`
- Manual ingredients: shows servings field plus per-serving macro fields; totals recalculate as `perValue * servings`

**Saving** (`saveRecipe()`):
1. Computes per-serving and total macros from `recipeIngredients`
2. Upserts `state.recipes`
3. Calls `addToFoodLibrary()` with `isRecipe: true`, `brand: 'My Recipe'`, `source: 'recipe'`
4. Closes `modal-recipe-ingredients`, opens `modal-recipe-list`

### My Recipes (modal-recipe-list)

Lists all recipes with per-serving macros and a full ingredient breakdown per recipe. Provides:
- **+ Create new** (top-right) — opens the builder
- **Edit** — reopens builder pre-loaded with existing recipe data; saves back to same record
- **Delete** — removes from `state.recipes` and `state.foodLibrary`; existing nutrition logs are not affected

---

## 11. Module: Goals

Goals are stored as an array in `state.goals`. Each goal is associated with a macrocycle via `macroId`.

```js
function getActiveGoal() {
  const today = getLocalToday();
  return state.goals.find(g => g.startDate <= today && g.endDate >= today) || null;
}
```

`buildGoalsHomeSection()` renders "Today vs Goal" and "Weekly averages" on the Home screen. It computes daily progress bars, weekly totals, and remaining-day pacing:

```js
const stepsNeededPerDay = Math.ceil((weeklyStepsGoal - weekStepsTotal) / daysLeft);
```

---

## 12. Module: Home

The home screen is composed of independently rendered sections:

| Section | Function | Data source |
|---|---|---|
| Active cycle card | `renderHome()` (inline) | `state.macrocycles`, `state.bodyLogs` |
| Body weight card + sparkline | `renderHome()` (inline) | `state.bodyLogs` (local timezone cutoffs) |
| Steps | `renderHomeSteps()` | `state.bodyLogs` |
| Nutrition | `renderHomeNutr()` | `state.nutritionMeals`, `state.nutritionQuickLog` |
| Goals summary | `buildGoalsHomeSection()` | `state.goals`, all log sources |

### Body Weight (Home)

The home body weight card computes:
- **Latest weight** — most recent `bodyLogs` entry
- **7-day average** — entries within 7 local days of today
- **Week-on-week change** — avg of days 0–7 minus avg of days 7–14

All cutoffs use `getLocalToday()` to build local-timezone `Date` objects, avoiding UTC offset bugs.

`changeStr` is contextual:
- Two weeks of data → `"+0.6 lbs vs last wk"`
- Only current week data → `"No prior week data"`
- No data at all → `"No data this week"`

### Bar Charts

`buildHomeBarChart(days, values, colour, fmtFn, today)` renders a 7-day bar chart as inline HTML with explicit pixel heights:

```js
const barH = Math.max(3, Math.round((value / max) * barMaxH));
```

The tallest bar is always `barMaxH` (48px); others scale proportionally. Today's bar is full opacity; prior days are at 0.5 opacity. Value labels above bars use `fmtK()` (abbreviated); large callout values show the full number.

`buildHomeProgressBar(value, max, colour, overColour)` renders a horizontal progress bar. When `value > max`, a white marker line appears at the goal point.

### Toggle Persistence

`homeToggle = { steps: 'today'|'avg', nutr: 'today'|'avg' }` persists toggle state across renders within a session (not saved to `localStorage`).

---

## 13. Module: Settings & Data Management

### Export Functions

| Function | Output filename | Contents |
|---|---|---|
| `exportData()` | `bloc-backup-YYYY-MM-DD.json` | Full `state` object |
| `exportLibrary()` | `bloc-exercise-library-YYYY-MM-DD.json` | Merged exercise library |
| `exportFoodLibrary()` | `bloc-food-library-YYYY-MM-DD.json` | `state.foodLibrary` |

### Import Functions

| Function | Behaviour |
|---|---|
| `importData(event)` | Validates for `macrocycles`/`exercises`/`trainLogs`, replaces `state` entirely, re-applies defensive defaults |
| `importExerciseLibrary(file)` | Merges into `state.customLibrary`; skips exercises matching default names |
| `importFoodLibrary(file)` | Merges into `state.foodLibrary`; upserts by name |

### Settings Layout

The Settings screen has these cards (in order):
1. Export full data
2. Exercise library — Export / Import
3. Food library — Export / Import / Edit library / My recipes
4. Restore from backup
5. Storage usage
6. Danger zone (Clear all data)

---

## 14. Module: Rest Timer

### State Variables

```js
let timerMode   = 'countdown';
let cdPickerMin = 1;
let cdPickerSec = 0;
let cdInterval  = null;
let cdRemaining = 0;       // ms remaining
let cdRunning   = false;
let swInterval  = null;
let swRunning   = false;
let swElapsed   = 0;       // ms elapsed
let swLastTick  = 0;       // Date.now() reference point
```

### Drum Picker

`buildPicker(elId, count, zeroPad, initial, onPick)` creates a scrollable column of 40px items resembling an iOS picker wheel. Drag snaps to the nearest integer with a 150ms ease transition. A gradient overlay fades items at top/bottom.

Position formula:
```js
const y = -(value * ITEM_H) + (120/2 - ITEM_H/2);  // = -(value * 40) + 40
```

### Countdown

Uses `setInterval` at 100ms. Display uses ceiling division so `1:00` shows for the full first second. Colour transitions at 10s remaining (→ amber) and on finish (→ accent).

### Stopwatch

Uses `Date.now()` differencing to prevent drift when the tab is backgrounded:
```js
swLastTick = Date.now() - swElapsed;
swElapsed  = Date.now() - swLastTick;  // on each tick
```

### Audio Alert

`playBeep()` creates a disposable `AudioContext` per alert. Three sine wave oscillators scheduled with linear gain ramps at 880 Hz, 880 Hz, and 1100 Hz. Routes to `ctx.destination` on the audio worklet thread — does not interrupt or duck music playback. Context closed after 1200ms.

### Icon State

```js
btn.style.color = (cdRunning || swRunning) ? 'var(--accent)' : 'var(--text2)';
```

Closing the modal resets both timers and returns the icon to its default colour.

---

## 15. Exercise Library

### Default Library

`DEFAULT_LIBRARY` contains 26 exercises across 7 body parts:

| Body Part | Exercises |
|---|---|
| Back | Lat Pull Machine, Lat Pulldown, Low Row, Machine Row, T-Bar Lat Pulldown, T-Bar Row |
| Biceps | Cable Curls, Reverse Grip Curls, Rope Curls |
| Calves | Calf Raises |
| Chest | Cross Incline Press, Decline Press, Flat Press, Incline Press |
| Legs | Hamstring Curl, Leg Extension, Leg Press, RDL, Split Squat, Walking Lunge |
| Shoulders | Lateral Raise |
| Triceps | Cross Cable Extensions, Push Downs, Reverse Grip Extensions, Rope Extensions, Skull Crushers |

### Custom Exercises

Stored in `state.customLibrary` as `{name, bodyPart}`.

`getLibrary()` merges and sorts both arrays by body part then name.

Import skips exercises matching a default name (case-insensitive). Export includes the full merged library.

---

## 16. Progression Logic

### Set Volume

Linear interpolation from `setsStart` to `setsEnd`:
```js
function getWeekSets(ex, week, totalWeeks) {
  const t = totalWeeks > 1 ? (week - 1) / (totalWeeks - 1) : 0;
  return Math.round(ex.setsStart + t * (ex.setsEnd - ex.setsStart));
}
```

### Weight Progression

```js
function getWeekWeight(ex, week, progType, goalType) {
  if (progType !== 'weight') return ex.startWeight;
  const isGain = goalType === 'gain';
  const jump = ex.isHeavyLeg ? (isGain ? 10 : 2.5) : (isGain ? 5 : 1.5);
  return ex.startWeight + jump * (week - 1);
}
```

| Exercise type | Weight Loss | Strength Gain |
|---|---|---|
| Standard | +1.5 kg/mesocycle | +5 kg/mesocycle |
| Heavy leg | +2.5 kg/mesocycle | +10 kg/mesocycle |

### Rep Progression

`getWeekReps()` parses the base rep count and adds `(week - 1)`. Handles both `'10'` and `'8–12'` formats.

### Myorep Progression

- **Myorep giant** (`type: 'myorep'`): Base reps + 10 per week
- **Myomatch** (`type: 'myomatch'`): Fixed reps, weight progression only

---

## 17. External APIs

### Open Food Facts

- **Endpoint:** `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
- **Method:** GET, no auth
- **Fields used:**

| Field | Usage |
|---|---|
| `product.product_name` | Display name |
| `product.brands` | Brand label |
| `product.nutriments.energy-kcal_100g` | kcal per 100g |
| `product.nutriments.proteins_100g` | Protein per 100g |
| `product.nutriments.carbohydrates_100g` | Carbs per 100g |
| `product.nutriments.fat_100g` | Fat per 100g |
| `product.product_quantity` | Whole pack size (preferred default serving) |
| `product.serving_quantity` | Single serving size (fallback) |

**Serving size priority:** `product_quantity` → `serving_quantity` → 100g

**Product name:** Pack size is appended in brackets if available, e.g. `"Graze Flapjack (150g)"`, making the serving weight visible in all downstream views.

Used in both the nutrition diary barcode flow and the recipe builder barcode flow.

### Google Fonts

```
https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@400;600;700;800
```

Only external dependency required for correct visual rendering. System monospace fallback applies without it.

---

## 18. Design System

All design tokens are CSS custom properties on `:root`.

### Colours

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0a0a0a` | Page background |
| `--surface` | `#141414` | Card backgrounds |
| `--surface2` | `#1c1c1c` | Input backgrounds |
| `--surface3` | `#242424` | Toggle active |
| `--border` | `rgba(255,255,255,0.08)` | Subtle dividers |
| `--border2` | `rgba(255,255,255,0.14)` | Input and card borders |
| `--text` | `#f0ede8` | Primary text |
| `--text2` | `#888880` | Secondary text |
| `--text3` | `#555550` | Tertiary / label text |
| `--accent` | `#c8f060` | Primary action, progress, kcal |
| `--accent2` | `#a8d040` | Accent pressed state |
| `--red` | `#ff5f4e` | Danger, fats |
| `--amber` | `#f5a623` | Warning, carbs, timer |
| `--blue` | `#60a8f0` | Protein, informational |
| `--purple` | `#b060f0` | Steps |

### Typography

| Token | Value |
|---|---|
| `--font-display` | `'Syne', sans-serif` |
| `--font-mono` | `'DM Mono', monospace` |

Display font (Syne) used for headings and large numbers. Mono font (DM Mono) used for all body text, labels, and inputs.

### Spacing & Shape

| Token | Value |
|---|---|
| `--r` | `12px` |
| `--r-sm` | `8px` |
| `--nav-h` | `72px` |
| `--safe-bottom` | `env(safe-area-inset-bottom, 0px)` |

### Icon Convention

All interactive icons throughout the app use inline SVG (13×13px, `stroke:currentColor`). Text labels on icon-only buttons are avoided. The three standard action icons are:

| Action | Icon |
|---|---|
| Edit | Pencil (square with pen) |
| Delete | Trash can |
| Copy | Overlapping rectangles |

---

## 19. Function Reference

### Persistence
| Function | Description |
|---|---|
| `save()` | Serialises `state` to `localStorage` |
| `load()` | Deserialises `state`, runs migration, applies defensive defaults |

### Navigation
| Function | Description |
|---|---|
| `showScreen(name)` | Activates a screen and triggers its render |
| `openModal(id)` | Adds `.open` to modal overlay |
| `closeModal(id)` | Removes `.open` from modal overlay |

### Macrocycle
| Function | Description |
|---|---|
| `createMacrocycle()` | Reads form and pushes to state |
| `saveEditMacro()` | Updates existing macro in-place |
| `copyMacrocycle(id)` | Deep-copies macro and exercises |
| `deleteMacrocycle(id)` | Removes macro, exercises, and logs |
| `getMacroDurationWeeks(macro)` | Returns total calendar weeks |
| `getMacroEndDate(macro)` | Returns last day as Date |
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

### Training Log
| Function | Description |
|---|---|
| `logSet(key, field, value)` | Writes a single field to a set log entry |
| `fillSuggested(...)` | Fills all set inputs with suggestions, triggers animation |
| `clearExerciseLogs(...)` | Clears all logs for an exercise |
| `toggleSetDone(key)` | Toggles done state; validates weight and reps first |
| `selectProgType(...)` | Saves progression type (weight/reps) choice |

### Body
| Function | Description |
|---|---|
| `renderBody()` | Renders the Body screen |
| `openEditBodyLog(date)` | Opens edit modal for a body log entry |
| `saveBodyLog()` | Upserts a body log entry |

### Nutrition
| Function | Description |
|---|---|
| `getDayTotals(date)` | Returns summed macros (Quick Add overrides meal items) |
| `getNutrDayMeals(date)` | Returns meal-structured entries for a date |
| `addFoodEntry(entry)` | Appends a food entry to the active meal and date |
| `addToFoodLibrary(item)` | Upserts a food item by name |
| `openNutrServingModal()` | Opens serving confirm; shows recipe ingredients if recipe |
| `updateServingPreview()` | Recomputes macro display live |
| `confirmServing()` | Finalises entry from serving modal; saves to library |
| `saveManualEntry()` | Saves a manual food entry; converts to per-100g for library |
| `openNutrRecipeBuilder()` | Closes add modal, opens recipe builder |
| `openCopyFoodEntry(date, meal, idx)` | Opens copy modal for a single diary item |
| `openMealMenu(meal)` | Opens bottom action sheet for meal-level copy/move |
| `openMealCopyMove(mode)` | Opens copy modal for whole meal ('copy' or 'move') |
| `confirmCopyFoodEntry()` | Executes copy or move; handles both single and whole-meal |
| `copyMealFromYesterday(meal)` | Copies previous day's meal entries into current date |
| `initYesterdaySwipes()` | Attaches swipe handlers to yesterday copy strips |
| `syncNutrLegacyLog(date)` | Backfills `nutritionLogs` from `nutritionMeals` |
| `deleteFoodEntry(date, meal, idx)` | Removes a food entry |
| `openEditFoodEntry(date, meal, idx)` | Opens edit modal for a food entry |
| `saveEditFoodEntry()` | Saves edited food entry in-place |
| `renderNutrWeekly()` | Renders 7-day weekly tab with bar charts and pie |
| `makePie(p, c, f)` | Generates inline SVG macro pie chart |

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
| `recipeGoToIngredients()` | Advances to step 2 of the recipe builder |
| `renderRecipeIngredients()` | Renders working ingredient list with edit/delete icons |
| `editRecipeIngredient(idx)` | Opens edit modal; barcode vs manual logic |
| `saveRecipeIngredientEdit()` | Saves edited ingredient; recalculates from per1g if barcode |
| `removeRecipeIngredient(idx)` | Removes ingredient from working list |
| `confirmRecipeIngredient()` | Adds barcode ingredient; stores per1g values |
| `confirmRecipeManual()` | Adds manual ingredient with per-serving totals |
| `saveRecipe()` | Saves recipe to state; upserts food library |
| `openRecipeList()` | Opens My Recipes modal |
| `renderRecipeList()` | Renders recipe cards with ingredient breakdown |
| `deleteRecipe(id)` | Removes from `state.recipes` and `state.foodLibrary` |

### Goals
| Function | Description |
|---|---|
| `getActiveGoal()` | Returns goal active on today's date |
| `saveGoal()` | Upserts a goal entry |
| `deleteGoal(idx)` | Removes a goal by index |
| `buildGoalsHomeSection(goal)` | Renders goals summary for Home screen |

### Settings
| Function | Description |
|---|---|
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
| `buildPicker(...)` | Constructs a drum-scroll picker |
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
| `getLocal7Days()` | Returns last 7 days as `{date, letter}` objects |
| `formatDate(str)` | Returns human-readable date string |
| `getISOWeek(date)` | Returns ISO week number |
| `fmtK(n)` | Formats number as `'1.2k'` above 1000, else plain |
| `showConfirm(title, msg, okLabel, callback)` | Shows custom confirm modal |
| `initModal(overlayEl)` | Attaches swipe-down and tap-outside handlers |

---

## 20. Key Algorithms

### Local Date Handling

All date operations use `getLocalToday()` to avoid UTC offset bugs:

```js
function getLocalToday() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
```

Date comparisons use string comparison (`a.date.localeCompare(b.date)`) which is valid for ISO 8601 strings. Date cutoffs for home-screen stats are built from `new Date(getLocalToday() + 'T00:00:00')` to ensure local-midnight anchoring.

### Body Weight Cycle Progress (Plan Screen)

```
startBw     = earliest body log on or after macro.start
current     = most recent body log (any date)
totalNeeded = |startBw - target|
achieved    = |startBw - current|
bwPct       = clamp(0, 100, round(achieved / totalNeeded * 100))
```

### Serving Size Calculation

All serving calculations use per-100g values with a consistent pattern:
```js
const total = grams * servings;
const per1  = per100 / 100;
kcal        = Math.round(per1 * total);
```

This avoids double-multiplication bugs (e.g. applying a ×100 factor to data already expressed per 100g).

### Swipe-to-Copy Animation

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

---

## 21. Known Limitations & Future Considerations

### Current Limitations

| Area | Limitation |
|---|---|
| **Offline** | No service worker. Google Fonts require a network connection on first load. |
| **Cross-device sync** | Data is device-local. No sync between devices or browsers. |
| **Barcode scanning** | Camera-based scanning evaluated and found unreliable without a paid SDK. Manual barcode entry only. |
| **Push notifications** | No background timer alerts when the app is backgrounded or screen is locked. |
| **Storage limit** | `localStorage` capped at 5–10 MB. Extremely large libraries or years of logs could approach this. |
| **Undo** | No undo mechanism. Deletes are confirmed but irreversible. |

### Architecture Considerations for Future Development

**Service Worker / Offline-first**
A cache-first service worker for fonts would make the app fully offline-capable. A `manifest.json` with `start_url`, `display: standalone`, and icon assets would improve the PWA install experience on Android.

**Local-first Sync**
Supabase + PowerSync has been considered as a sync layer. Would require refactoring `state` into a normalised schema and replacing `localStorage` with a PowerSync-managed SQLite store.

**Native App**
Capacitor wrapping is compatible with the single-file architecture with minimal changes. Main additions: native push notifications for timer alerts, native camera for barcode scanning.

**Data Model Evolution**
The dual nutrition log format (`nutritionLogs` legacy + `nutritionMeals` current) is technical debt. A migration pass in `importData()` to normalise legacy entries into `nutritionMeals` would simplify `getDayTotals()`.

**Macrocycle/Mesocycle Terminology**
The S&C terminology in the codebase (variable names use `macro`/`meso`) reflects a historical inversion: what the code calls a "macrocycle" (the short training block) is technically a mesocycle in periodisation theory, and vice versa. The UI labels are correct; the internal variable names are not. A full rename pass on all internal identifiers and comments is deferred pending a stable release.
