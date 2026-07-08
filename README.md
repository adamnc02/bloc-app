# BLOC — Training & Nutrition PWA

> A personal, offline-first Progressive Web App for structured weight training and nutrition tracking. Single HTML file. No backend. No dependencies.

![Version](https://img.shields.io/badge/version-v6.00-brightgreen) ![PWA](https://img.shields.io/badge/PWA-ready-blue) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

BLOC is a mobile-first PWA built entirely in a single `index.html` file — no build tools, no frameworks, no server. It is designed to be deployed on GitHub Pages and added to your home screen like a native app. All data is stored locally in `localStorage` and can be exported/imported as JSON at any time.

The app is structured around the concept of a **macrocycle** — a multi-week training block with defined goals, split type, and progression logic. Everything else (training logs, nutrition, body weight, steps, goals) lives within the context of an active macrocycle.

---

## Visual Design

### Typography
Inter is the sole typeface throughout, used for all display text, numbers, labels, and body content. The font is loaded from Google Fonts on first load and cached by the browser.

### Colour Palette
The default dark palette uses a blue-tinted navy (`--bg: #0f1620`) with layered dark surface tokens. Light mode is toggled via `[data-mode="light"]` on the `<body>` element, which reverses surfaces and text into a blue-tinted light scheme. Accent and hero colours are intentionally left unchanged in both modes so each page's identity colour stays consistent.

Semantic colours — `--red`, `--amber`, `--blue`, `--purple`, `--ice-blue`, `--accent` — are used for progress indicators, schedule status pills, progression chips, and callout cards.

### Themes
Nine colour themes are available, each setting a two-stop gradient (`--hero-1` / `--hero-2`) used by every page's hero card:

| Theme | Hero colour |
|---|---|
| **Multi** (default) | Each page gets a distinct colour — Progress=turquoise, Plan=blue, Train=yellow, Body=teal, Nutrition=amber, Goals=red |
| **Teal** | Teal (`#1D9E75`) |
| **Blue** | Blue (`#378ADD`) |
| **Amber** | Amber (`#EF9F27`) |
| **Turquoise** | Turquoise (`#2BC7C4`) |
| **Yellow** | Yellow (`#E8D44D`) |
| **Red** | Red (`#E24B4A`) |
| **Purple** | Purple (`#7F77DD`) |
| **Mono** | Dark grey (`#4a4a48`) |

Theme and mode are stored in `state.theme` and `state.mode`, persisted in localStorage, and applied as `data-theme` and `data-mode` attributes on `<body>` at startup.

### Hero Cards
Every page has a gradient hero card at the top (`linear-gradient(150deg, var(--hero-1), var(--hero-2))`), with decorative radial overlays for depth. Hero cards carry a subtle `::before` radial highlight and an `::after` noise texture. They display the page's primary stat or summary — the value, a label, callout chips, and a progress bar where relevant.

A small **Active Cycle status pill** appears in the corner of the hero card on applicable pages, showing the current cycle's schedule status with a solid heat-map colour.

### Nav Bar
The navigation bar is a **floating pill** anchored to the bottom of the app shell. It contains seven buttons: Progress, Plan, Train, Body, Nutrition, Goals, Settings.

Navigation icons are custom SVGs: Progress=bar chart, Plan=four squares, Train=barbell, Body=person silhouette, Nutrition=fork and knife, Goals=bullseye target, Settings=cog.

A single `#nav-pill` highlight element is positioned and sized by `positionNavPill()` using `requestAnimationFrame`. It slides and morphs between buttons with a spring-curve CSS transition, producing a liquid bubble animation on every screen change. The pill colour is read from the active page's hero gradient via a temporary DOM probe, so the pill always matches the hero card exactly regardless of theme.

Active buttons reveal their text label via a `max-width` + `opacity` transition; inactive buttons show the icon only.

### Edge Fades
Gradient strips are pinned to the top and bottom of the app shell (matching `--app-height`). They fade scrolling content into the background colour so content is never hard-clipped at the safe-area boundary. They use `rgba(var(--bg-rgb), 0)` rather than `transparent` to avoid the grey-fade artifact in some browsers.

---

## Screens

### Progress
- Displays data for the active macrocycle, with left/right arrows to cycle through past macrocycles
- **Swipeable hero deck** — five slides with touch/mouse swipe and dot pagination:
  1. Cycle overview — name, goal, split, weeks remaining, progress bar
  2. Body weight — anchored to the live active cycle, with a day-index-aligned overlay comparing against past cycles at the same point in their timeline
  3. Volume — weekly training volume line chart
  4. Steps vs goal — bar chart for the current week
  5. Kcal vs goal — bar chart for the current week
- Tapping the hero deck opens the **Cycle History** modal, listing all past macrocycles with dates and goal types
- Below the hero: body weight sparkline, weekly macro pie chart, weekly steps and kcal bar charts with today/7-day toggle

### Plan
- Create and manage **macrocycles** with:
  - Name, start date, goal type (Weight Loss / Strength Gain / Maintenance)
  - Split type: **PPL** (Push/Pull/Legs), **Full Body**, or **Custom** (freely named sessions)
  - Number of mesocycles (weeks), optional microcycles (alternating A/B sessions within a week)
  - Optional target body weight, configurable weight-loss increment per mesocycle
- Sessions (Push/Pull/Legs/custom) are shown as individually **collapsible, renameable cards** — tap the header to expand/collapse, tap the name to rename in place. The header always shows a live summary: exercise count, total sets, and total week-1 volume across every exercise in that session (including supersets)
- Per-exercise configuration: name, sets, reps, starting weight, exercise type (standard, myorep giant, myomatch), heavy leg flag, per-side vs total-on-bar tracking, minimum weight increment
- **Supersets** — link two or more exercises into a group with a shared badge and optional custom name; reorder within or across a group by drag; unlink an individual exercise or the whole group back into standalone exercises
- Drag-to-reorder exercises, including moving in/out of superset groups — this ordering drives the exercise order on the Train page
- Edit, copy, and delete macrocycles — tap the macrocycle card to edit; swipe left to reveal copy and delete buttons
- Body weight progress bar within the plan card, showing start → current → target
- **Weeks 2+ progression preview** — collapsible, grouped by session (not by week): expanding a session shows every exercise's sets/reps/weight target broken down week-by-week across the whole cycle
- **Body part volume table** — below the progression preview, one row per body part (resolved by looking up each exercise's name against the exercise library), showing the cycle's total minimum and maximum training volume for that body part, sorted by minimum descending. Min/max reflects whichever theoretical progression path (all-weight vs all-reps) produces less/more total volume; myorep match sets are weight-only either way, so their min and max are identical
- Schedule-status pills with solid heat-map colours indicating where each session falls in the cycle

### Train
- Week and day selector to navigate the macrocycle
- Per-session exercise cards showing:
  - A "Last wk: ↑ weight" / "↑ reps" badge in the header, inferred from whichever explicitly-chosen progression path was used last week — or, if none was explicitly chosen, backfilled by comparing last week's actual weight/reps against the week before; shows "no progression" if neither increased
  - Last week's logged sets (weight × reps) shown directly in each set row, replacing what used to be a redundant repeat of the current week's suggested value
  - Suggested progression for the current week (weight or reps), with a progression chip showing the delta
  - Set logging with weight, reps, and a done toggle per set
  - **Fill Suggested** button — fills all sets with suggested values in one tap, with an amber flash animation
  - Superset cards show the same last-week badge and progression data per member, plus each member's exercise type badge, consolidated into a compact per-exercise summary line rather than a full per-set breakdown
- **Rest Timer** (clock icon, top-right):
  - **Countdown** mode with an iOS-style scroll drum picker (0–59 min, 0–59 sec), defaulting to 1:00. Digits turn amber in the final 10 seconds. Three-beep audio alert on completion via the Web Audio API — does not interrupt music or podcast playback
  - **Stopwatch** mode with tenths-of-second precision
  - Closing the modal cancels and resets all timers
  - Clock icon turns accent green while a timer is running

### Body
- Tap to select gender, which drives which BMR formula inputs are shown
- Log body weight (lbs) and steps per day
- Weekly change, "left to go" toward the cycle's target weight, and entry count — both use the same ≤0.05 lbs tolerance for "no meaningful change" / "at goal"
- BMR/TDEE (Mifflin-St Jeor) calculated from profile + activity level, with activity level derived from your all-time average logged steps (intentionally unscoped — more historical data makes the estimate more accurate, not less)
- Full log of all entries — tap to edit; swipe left to reveal delete button

### Nutrition
- Per-day food logging across named meals (Breakfast, Lunch, Dinner, Snacks)
- Hero card: tap to open a date picker, or swipe left/right to step one day at a time. A quick-add button in the corner lets you log the day's totals directly (kcal/protein/carbs/fats), overriding whatever's in the meal logs below for that day's totals
- Food lookup via:
  - **Scan Barcode** — live camera scanning using the native `BarcodeDetector` API (Safari 17+, Chrome 83+) with automatic ZXing JS fallback. Camera launches immediately on tap. Manual barcode entry available below the viewfinder as a fallback. Looks up the scanned code against the Open Food Facts API
  - **Manual entry** — enter name and direct per-serving macros (kcal, protein, carbs, fats)
  - **Recipe** — pick a saved recipe from the food library
  - **Food library** — search previously used foods, sorted by most recently logged
- Serving confirmation modal showing grams and servings fields, live macro preview, and (for recipes) a full ingredient breakdown. This modal (and the food library editor) use a taller sheet whose internal list independently shrinks to stay above the keyboard, rather than the sheet itself resizing
- Swipe-to-copy from yesterday — an animated swipe strip under each meal shows the previous day's items and copies them on a one-third-width swipe right
- Meal ellipsis menu (`···`) — copy or move an entire meal to any date and meal target, or save the whole meal as a new recipe (this only creates the recipe from the meal's current ingredients — it does not automatically log that recipe anywhere)
- Per-item interactions — tap a food entry to edit it; swipe left to reveal copy and delete buttons. Small print shown per item (brand, serving size) varies by source: recipes show serving count, everything else shows brand where known
- Daily macro panel and daily kcal card with progress vs. the active goal
- 7-day weekly tab with bar charts and macro pie chart
- Personal **food library** — foods saved automatically on first entry; recipes stored with brand "My Recipe"
- **Recipe builder** — multi-step: name and servings, then add ingredients by barcode scan or manual entry. Reachable from the food library ("My Recipes" in Settings) or from a meal's ellipsis menu

### Goals
- Set daily targets per macrocycle: steps, kcal, protein, carbs, fats. Kcal and steps are required — the input border flashes red if you try to save without them
- Goal periods **cannot overlap** — a new goal defaults to starting the day after the latest existing goal ends (across every macrocycle), and saving is blocked with an inline error if the dates collide with any existing goal
- Macro sliders (protein g/lb multiplier, carb/fat split) back-derive their starting position from an existing goal's saved grams when editing. For a goal that's already **active or past**, saving preserves the exact macros already stored unless you explicitly drag a slider — it won't silently drift just because your bodyweight has changed since the goal was created. New/upcoming goals always compute live from current bodyweight
- Today vs. goal progress bars with left-to-go or over-target indicators
- Weekly average comparison across all tracked metrics
- Projected pacing — if you're behind on a weekly goal, BLOC calculates what you need per remaining day
- Tap a goal card to edit; swipe left to reveal delete button

### Settings
- Export full app data as a JSON backup
- Restore from a JSON backup (replaces all current data)
- **Theme selector** — nine colour swatches; selecting one updates the `data-theme` attribute on `<body>` immediately
- **Dark / Light mode** toggle — updates the `data-mode` attribute on `<body>` immediately
- **Exercise library** — export and import (merges by name; default exercises cannot be overwritten)
- **Food library** — Export / Import (whole library JSON); Import recipe (single shared item file, including recipe ingredients); Edit library (tap row to edit, swipe left to reveal share and delete); My Recipes (tap row to edit recipe builder, swipe left to delete)
- Storage usage indicator
- Full data wipe (danger zone) — clears macrocycles, exercises, logs, and nutrition data, but preserves your theme/mode preference, since the confirmation dialog only ever promised to delete tracked data

---

## Barcode Scanning

BLOC uses a two-tier detection strategy, chosen automatically at runtime:

1. **Native `BarcodeDetector`** (Safari 17+, Chrome 83+) — zero-overhead, runs on-device
2. **ZXing JS** (bundled, ~336KB) — pure-JS fallback for older browsers

The camera launches immediately when "Scan Barcode" is tapped. On detection the viewfinder corners flash white, the device vibrates, and the barcode is looked up against Open Food Facts automatically. A manual entry field below the viewfinder serves as a final fallback. The camera stops as soon as a product is found or the modal is closed.

---

## Progression Logic

BLOC automatically calculates suggested weights and reps week-over-week based on the macrocycle goal type. The weight-loss increment is user-configurable per macrocycle (defaults to 2.5 kg); the weight-gain increment and both heavy-leg increments are fixed:

| Goal type | Standard exercises | Heavy leg exercises |
|---|---|---|
| Weight Loss | + your configured increment / mesocycle | +5 kg / mesocycle |
| Strength Gain | +5 kg / mesocycle | +10 kg / mesocycle |

For rep progression, 1 rep is added per week to each set.

**Exercise types:**
- **Standard** — weight or rep progression, chosen per exercise per week
- **Myorep giant** — weight or rep progression (giant-set reps add +10/week when reps is chosen)
- **Myomatch** — fixed reps, weight progression only

This same weight-jump formula is shared by the Plan page's progression preview and the Train page's live recommendations, so both always agree.

---

## Architecture

| Concern | Approach |
|---|---|
| File structure | Single `index.html` — HTML, CSS, and JS in one file, one main `<script>` block (plus a separate `<script>` tag holding the bundled ZXing library) |
| Storage | `localStorage` (`bloc_state` key) |
| Fonts | Google Fonts — Inter (all weights) |
| Food data | Open Food Facts API (barcode lookup) |
| Barcode scanning | Native `BarcodeDetector` API → ZXing JS bundle (bundled, ~336KB inline) |
| Audio | Web Audio API — sine wave oscillators, no audio files |
| PWA | `apple-mobile-web-app-capable`, `viewport-fit=cover` meta tags; add to home screen via Safari/Chrome share sheet |
| iOS viewport | `measureEnv()` DOM probe reads actual safe-area inset values; `--app-height` CSS var set via `window.visualViewport.height`; `#nav` positioned as `absolute` inside `#app` rather than `position: fixed` |

No service worker is registered, meaning the app requires an internet connection on first load for fonts. All app logic and data is fully offline after that.

---

## Deployment

The app is designed to be deployed as a GitHub Pages site from a single `index.html` at the repo root.

1. Fork or clone this repo
2. Push `index.html` to the `main` branch
3. Enable GitHub Pages in repo Settings → Pages → Source: `main` / `/ (root)`
4. Visit your Pages URL and use your browser's **Add to Home Screen** option to install as a PWA

---

## Data & Backup

All data lives in your browser's `localStorage`. It is not synced to any server.

**It is strongly recommended to export a JSON backup regularly** via Settings → Export JSON backup, and store it in a safe location (e.g. iCloud Files, Google Drive).

To restore: Settings → Restore from backup → select your `.json` file.

---

## Known Limitations

- No service worker — fonts require an initial network request
- Data is device-local; no cross-device sync
- No native push notifications for timer alerts when the app is backgrounded
- `localStorage` is capped at 5–10 MB; extremely large food libraries or years of logs could approach this
- Body weight is tracked in lbs while training weight is tracked in kg — an intentional, but non-obvious, split (there's no unit toggle for body weight)

---

## Version History

Recent versions (v5.26 onward) reflect a page-by-page legacy audit pass — removing dead code left over from earlier redesigns, fixing bugs found along the way, and adding a handful of features that came up during the audit. Selected highlights below; see in-file version badge for the exact current build.

| Version | Notes |
|---|---|
| v6.00 | Inline comments added throughout entire code base |
| v5.44 | Settings: "Clear all data" now preserves theme/mode and resets every field `load()` expects (previously left `state.supersets` undefined, a live crash risk) |
| v5.42–5.43 | Goals: overlap prevention between goal periods; active/past goals no longer silently drift their macros from bodyweight changes; required-field validation on kcal/steps |
| v5.41 | Nutrition: removed several functions and one dead code branch left over from earlier redesigns (old day-badge strip, an unused macro-view toggle, an unused recipe-builder entry point) |
| v5.33–5.39 | Plan: body part cycle volume table, session rename/collapse, progression preview redesigned to group by session instead of week. Train: last-week progression data and badges reorganised into the header/set rows; several bug fixes (per-side volume calc, badge inference logic, superset row alignment) |
| v5.16–5.32 | Progress: weight chart rebuilt to anchor on the live active cycle with a day-index-aligned comparison overlay; macrocycle state management overhaul; superset/tri-set feature fully implemented |
| v5.08 | iOS standalone viewport fixed via `measureEnv()` DOM probe + `--app-height`; nine themes with per-page hero colours; dark/light mode toggle; floating pill nav; Progress screen with 5-slide swipeable hero deck |
| v3.08 | Swipe-left gestures on all list rows, tap-to-edit, yesterday strip, edit modal defaults grams to RSS |
| v3.03 | Camera barcode scanning (BarcodeDetector + ZXing fallback), auto-start camera, manual edit mode |
| v3.01 | Meal ellipsis menu, swipe-to-copy from yesterday, recipe builder from nutrition log, SVG icons, Fill Suggested animations |
| v2.12 | Recipe builder, food library editor, rest timer, food library export/import |
| v2.10 | Home page overhaul — Today/7-day toggle with animated bar charts |
| v2.09 | Full nutrition page rebuild — date picker, day badges, kcal summary, macro panel, barcode/manual/library/quick-add |

---

## License

MIT — personal use, no warranty.
