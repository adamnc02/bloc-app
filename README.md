# BLOC — Training & Nutrition PWA

> A personal, offline-first Progressive Web App for structured weight training and nutrition tracking. Single HTML file. No backend. No dependencies.

![Version](https://img.shields.io/badge/version-v7.54-brightgreen) ![PWA](https://img.shields.io/badge/PWA-ready-blue) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

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
| **Multi** (default) | Each page gets a distinct colour — Home=purple, Progress=turquoise, Plan=blue, Train=yellow, Nutrition=amber |
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
The navigation bar is a **floating pill** anchored to the bottom of the app shell. It contains six buttons: Home, Progress, Plan, Train, Nutrition, Settings. (Body and Goals were folded into Settings and Plan respectively in v7.40–v7.52 — see below — and no longer have their own nav entries.)

Navigation icons are custom SVGs: Home=roof/house, Progress=bar chart, Plan=four squares, Train=barbell, Nutrition=fork and knife, Settings=cog.

A single `#nav-pill` highlight element is positioned and sized by `positionNavPill()` using `requestAnimationFrame`. It slides and morphs between buttons with a spring-curve CSS transition, producing a liquid bubble animation on every screen change. The pill colour is read from the active page's hero gradient via a temporary DOM probe, so the pill always matches the hero card exactly regardless of theme.

Active buttons reveal their text label via a `max-width` + `opacity` transition; inactive buttons show the icon only.

### Edge Fades
Gradient strips are pinned to the top and bottom of the app shell (matching `--app-height`). They fade scrolling content into the background colour so content is never hard-clipped at the safe-area boundary. They use `rgba(var(--bg-rgb), 0)` rather than `transparent` to avoid the grey-fade artifact in some browsers.

---

## Screens

### Home (new in v7.31–v7.34; log boxes reworked in v7.53)
The default landing screen — a single-glance summary of the week plus inline log boxes, replacing Progress as the first tab.
- **Weekly hero card** — this week's (Mon–Sun) average kcal/protein/carbs/steps vs. the active goal's targets, each with an On track / Falling behind / Exceeding badge. Badge colour follows metric-specific polarity rather than a single rule: kcal is bad in both directions (under *or* over tolerance); protein and steps are only bad when under (exceeding is fine — more isn't penalised); carbs (and, by the same convention, fats elsewhere in the app) are only bad when over. A sublabel appears **only when an adjustment is actually needed** — "Adjust your daily avg by ±X for the rest of the week to hit target" on any day but the week's last, collapsing automatically (no special-cased branch) into an exact "Hit X today" figure on the final day, since the same remaining-budget formula degenerates to a single-day answer when only one day of the week is left
- **Upcoming goal banner** — appears only when the *next genuinely different* goal (compared by target values, not just the next chronologically-scheduled entry — a macrocycle's future weeks are often pre-scheduled as identical continuations that shouldn't count as "a new goal") starts within 6 days. Shows what's changing vs. the currently active goal (only the fields that actually differ), tapping through to Plan and briefly flashing that goal's row there
- **Inline log boxes (reworked in v7.53)** — reinstates the original Body-page "disappearing input" pattern rather than the icon-triggered mini-modals used briefly in v7.31–v7.52:
  - **Weight** and **steps** each show a plain input box every day; the box disappears the moment that field is logged for today, and reappears the next day
  - **Measurements** works on its own cycle rather than a daily one — the waist/hip form only appears once **4 days** have passed since the last logged measurement (or immediately, if none have ever been logged), accompanied by a warning banner ("It has been 4 days since you last recorded your measurements."), and stays visible — not just for "today" — until a fresh measurement is logged, at which point the 4-day countdown restarts from that new date. The form itself (unit toggle between inches/cm, quarter-inch picker) is the same one previously behind a modal, now inlined directly into the screen
  - Boxes stack vertically rather than sitting side by side as icons, and only take up space when there's actually something to log
- **"Edit today's logs"** link below the log boxes, routing to Settings → Profile → Body logs → today's own entry (see the Settings section below)
- **Planned food today** — today's planned recipes (by serving count) and non-recipe items (by grams), ordered by first meal appearance (Breakfast → Lunch → Dinner → Snacks), tapping through to Nutrition
- **Next session** — a single-row-per-exercise preview (name, sets × reps, suggested weight) of the next incomplete training session, titled with the actual session name, tapping through to Train

### Progress
- Displays data for the active macrocycle, with left/right arrows to cycle through past macrocycles
- **Swipeable hero deck** — five slides with touch/mouse swipe and dot pagination:
  1. Cycle overview — name, goal, split, weeks remaining, progress bar
  2. Body weight — anchored to the live active cycle, with a day-index-aligned overlay comparing against past cycles at the same point in their timeline
  3. Volume — weekly training volume line chart
  4. Steps vs goal — bar chart for the current week
  5. Kcal vs goal — bar chart for the current week
- Tapping the hero deck opens the **Cycle History** modal, listing all past macrocycles with dates and goal types
- **Insights swipe deck** — a second, separate swipeable card stack directly below the hero (dot-paginated, no text labels under the dots): **Progress** (latest weight, 7-day average, weekly change, and — as of v7.28 — the trend/plateau signal card inline, right below the weight header, with the peak-loss/gain window callout pushed down below it), **Metabolism** (Mifflin BMR, log-based TDEE, calorie target, goal-weight ETA), and **Next cycle** (the recommendation engine described below)
- **Next cycle recommendation engine** — a fully deterministic recommendation for what to do once the active cycle ends, with an optional AI second opinion:
  - **Direction logic** — a cut recommends a maintenance bridge next; a bulk recommends a cut next (no bridge needed — a surplus doesn't cause the same adaptive suppression a deficit does); a maintenance bridge continues in whichever direction the cycle *before* it was heading (cut→bulk, bulk→cut), or offers a choice between the two if there's no history to determine one automatically. A short, mild cut (or a short bulk with a mild rate/surplus) instead recommends simply extending the current cycle — **and also computes the "normal logic" alternative it would have recommended otherwise**, shown as a small secondary option with its own "Build this instead" button, so extending is never a dead end
  - **Weekly kcal ramp** — a step-and-hold table (not a smooth curve) that continues from wherever the current cycle's plan actually left off, not recent adherence noise, stepping toward TDEE (the bridge case) or a computed steady-state target (a cut/bulk-direction case) a few weeks at a time, clamped to a computed safety floor
  - **Sustainable weight range** — a floor (for cuts) and ceiling (for bulks) derived from past maintenance cycles that held stable for 3+ weeks, with a conservative fallback when no such history exists yet
  - **Optional target weight / deadline** — checked against the sustainable range (hard boundary) and a 1.5%→1%/0.5% taper curve (pace boundary); an unsafe combination shows the shortfall plainly and offers two one-tap alternatives (nearest safe date for the stated weight, or nearest safe weight for the stated date)
  - **Maintenance TDEE-discrepancy flag** — mid-way through an active maintenance bridge, compares your actual recent intake/weight trend against the bridge's planned target and offers a one-tap recalibration of every not-yet-started goal if they've meaningfully diverged
  - **"Build this plan next"** — launches the same sequential goal-queue flow as the mid-cycle AI advice card below, with a macrocycle-creation step prepended
  - **BLOC second opinion** — within 3 weeks of the active cycle ending, an optional separate AI call reviews the same data (plus the engine's own floor/ceiling/taper/recalibration numbers) and either confirms the deterministic plan or proposes a refined one. Returns one plan normally; two when there's an unresolved target-weight/deadline conflict (one preserving each); or two — "sustainable" and "aggressive" — when no deadline was given for a cut or bulk (a bulk's aggressive variant only ever pushes kcal harder, never shortens the cycle — patience is the point). During a continuation, the call is framed around the "normal logic" alternative rather than the extension itself, with the model asked to explicitly weigh extending vs switching in its narrative. Daily step count is only ever varied as a lever during a cut; bulk and maintenance goals always get a flat 8,000 steps/day, applied client-side rather than requested from the model. Accepted plans route through the exact same goal-queue flow as the deterministic path
- Below the hero: body weight sparkline, weekly macro pie chart, weekly steps and kcal bar charts with today/7-day toggle
- **Goal period summary rows (v7.28)** — below the Statistics section, a compact row per goal period belonging to the selected cycle, ordered by start date, each showing its "Step N - label" name, date range, and every non-zero target. The goal covering today gets a green left accent; the next upcoming goal gets a red left accent plus a countdown subtitle — "Next up: starting in N days" while more than a week out, switching to "Next up: starting `<Weekday>`" from the Tuesday before it starts onward
- **Weekly tables — swipeable stack (v6.12; expanded to 3 cards in v7.28)** — a second swipe deck, dot-paginated the same way as the hero deck but with no text labels:
  1. **Weekly summary** — one row per calendar week showing weight delta and average kcal/steps/protein. The weight delta compares **this week's average weight to the last week (with any data)'s average weight** — not a single day-to-day comparison — since two noisy daily readings can make a genuine plateau look like a steady loss (or vice versa)
  2. **Swings (new in v7.28)** — smallest/largest consecutive day-to-day change within each week, one column each for weight, kcal, steps, and protein (e.g. `−1.5lbs/+2.4lbs`), formatted with thousand-separators. Previously weight-only and embedded in the summary table; split out into its own slide so all four tracked metrics get the same volatility view
  3. **Measurements** — same week-bucket layout for waist/hip, only including weeks with at least one measurement logged; values shown are the most recent measurement logged that week, and deltas compare against the last known value from the most recent prior week with data (carried forward across empty weeks)
- **Trend insights card (v7.00; moved inside the Insights deck in v7.28)** — a goalType-branched deterministic signal card. Detects plateau (≥2 consecutive weeks of ≤0.5 lbs/week change on a loss cycle), caloric drift from baseline, undereating on a gain cycle, weight instability on maintenance. Shows a signal pill, headline, stat tiles, and a drift visualisation (baseline avg → recent avg). Baseline anchors on weeks 1–2 by default; slides forward to weeks 3–4 on loss cycles where early weeks show anomalously fast loss (>2% bodyweight/week), since glycogen/digestive clearance inflates those drops
- **AI advice card (v7.00)** — when a plateau or sustained imbalance is detected and an Anthropic API key is saved (Settings → AI Advice), an "Ask BLOC for advice" button appears. Tapping it calls `claude-sonnet-4-6` with your weekly data, safety floor (log-based BMR × 0.80), protein minimum (1g/lb bodyweight), a condensed history of every prior check-in this cycle (including any accepted revisions and why), and completed cycle rollup. The response is shown as a collapsible card with two recommendation paths (Sustainable and Aggressive), each with a sequence of goal periods. Choosing a path launches the **goal queue flow** — the current goal's end date is adjusted, upcoming goals for the cycle are cleared, and the recommended goals are opened for review and saving one by one. A 2-week cooldown prevents repeated calls
  - **Challenge this advice (v7.24)** — a single follow-up per advice response: "Challenge this →" swaps in a text box, and BLOC replies with an acknowledgment (admits a mistake or defends the original call), a fully revised Sustainable/Aggressive pair, and a diff view showing exactly which steps changed. Accept or decline before choosing a plan. If the revision is a minor correction (e.g. one field tightened), the original headline/reasoning stay put with the acknowledgment shown as a small note underneath; if BLOC substantially changes its read of the situation, the headline and reasoning are replaced outright rather than leaving a stale explanation next to a very different plan. Whichever way it goes, your next check-in this cycle is briefed on both the original and revised numbers so it never repeats advice you've already pushed back on

### Plan
- Create and manage **macrocycles** with:
  - Name, start date, goal type (Weight Loss / Strength Gain / Maintenance)
  - **Start date must be a Monday (v7.28)** — enforced on both creation and edits; a non-Monday date blocks the save with a flashed red field and an inline error, since every deload-week, mesocycle-date, and calendar-week calculation in the app assumes week 1 starts on one. The suggested default start date is automatically snapped forward to the next Monday
  - Split type: **PPL** (Push/Pull/Legs), **Full Body**, or **Custom** (freely named sessions)
  - Number of mesocycles (weeks), optional microcycles (alternating A/B sessions within a week)
  - Optional target body weight, a configurable weight increment per mesocycle (available for any goal type, not just weight-loss cycles)
  - **Sessions per week is calculated automatically** from whichever split you build below it, live-updating as you add/remove sessions — not a separate number to keep in sync yourself
- Sessions (Push/Pull/Legs/custom) are shown as individually **collapsible, renameable cards** — tap the header to expand/collapse, tap the name to rename in place. The header always shows a live summary: exercise count, total sets, and total week-1 volume across every exercise in that session (including supersets)
  - **Auto-collapse (v7.40)** — a session with at least one exercise defined starts collapsed each time you arrive at the Plan tab; an empty session stays expanded (nothing to hide yet). Manually toggling a session, or opening its add/edit-exercise modal, overrides the default until you next navigate away from Plan and back, at which point the override resets and the default rule reapplies
- Per-exercise configuration: name, sets, reps, starting weight, exercise type (**Standard**, **Giant Set**, **Pause Set**, **Drop Set**), heavy leg flag, per-side vs total-on-bar tracking, minimum weight increment
  - **Drop Set** exercises plan a starting weight *and* (as of v6.09) a reps target for the main set, same as any other type — only the drop portion has no target and is logged to failure live, starting in week 1
  - **Last logged reference** — when adding or editing an exercise, a note below the exercise name shows what you actually logged last time for that exercise (per set type, if you've trained it more than one way — e.g. separate lines for a standard-set history and a giant-set history), and new exercises prefill their reps/weight/tracking-mode defaults from it automatically. Purely a planning aid — never affects any calculation, and always overridable
- **Supersets** — link two or more exercises into a group with a shared badge and optional custom name; reorder within or across a group by drag; unlink an individual exercise or the whole group back into standalone exercises. Drop sets can't be added to or linked into a superset
- Drag-to-reorder exercises, including moving in/out of superset groups — this ordering drives the exercise order on the Train page
- Edit, copy, and delete macrocycles — tap the macrocycle card to edit; swipe left to reveal copy and delete buttons
- Body weight progress bar within the plan card, showing start → current → target
- **Weeks 2+ progression preview** — collapsible, grouped by session (not by week): expanding a session shows every exercise's sets/reps/weight target broken down week-by-week across the whole cycle
- **Body part volume table** — below the progression preview, one row per body part (resolved by looking up each exercise's name against the exercise library), showing the cycle's total minimum and maximum training volume for that body part, sorted by minimum descending. Min/max reflects whichever theoretical progression path (all-weight vs all-reps) produces less/more total volume; pause sets are weight-only either way, so their min and max are identical. Drop sets contribute their main set's projected volume like any other exercise; only the drop portion doesn't contribute, since it has no plan-time target to project from
- Schedule-status pills with solid heat-map colours indicating where each session falls in the cycle

### Goals (moved into Plan in v7.40 — no longer its own screen)
- Below the macrocycle hero card, a **Goals section** lists every goal period belonging to the current macro, in the same row style Progress's cycle-goals list uses — a "+ Build goals" button opens the same goal modal that used to live on the standalone Goals screen. The section is collapsible (expanded by default), each row taps to edit and swipes to delete
- **Dismissible create-goal prompt** — saving or editing a macrocycle with no goal linked yet offers to add one via a Cancel/Add-goal confirm dialog; declining is a no-op, not a blocker
- **Delete button** added directly to the goal modal itself (previously deletion was swipe-only from the Goals list)
- Set daily targets per macrocycle: steps, kcal, protein, carbs, fats. Kcal and steps are required — the input border flashes red if you try to save without them
- Goal periods **cannot overlap** — a new goal defaults to starting the day after the latest existing goal ends (across every macrocycle), and saving is blocked with an inline error if the dates collide with any existing goal
- Macro sliders (protein g/lb multiplier, carb/fat split) back-derive their starting position from an existing goal's saved grams when editing. For a goal that's already **active or past**, saving preserves the exact macros already stored unless you explicitly drag a slider — it won't silently drift just because your bodyweight has changed since the goal was created. New/upcoming goals always compute live from current bodyweight
- Progress's own goal-period summary rows (see below) are now restricted to active + upcoming only — full history, including past goals, lives here on Plan

### Train
- Week and day selector to navigate the macrocycle — day-tab pills are grouped **one row per real calendar week**, so a 2-week mesocycle shows a separate row for each microcycle, while a 1-week mesocycle (even one that still uses microcycles) stays on a single row
- **Calendar week dates on the hero (v7.28)** — the hero card shows the real date range (e.g. `28 Jul – 3 Aug`) for whichever mesocycle + microcycle is currently selected, fanned out from the macrocycle's start date — a forward-planning aid for lining deload weeks up against upcoming goal periods without counting weeks by hand
- **Deload weeks** — mark the currently-selected week (or, for a 2-week mesocycle, the specific microcycle you're viewing) as a deload via a toggle on the hero card. All weights for that week drop to 60% of last logged, rounded to each exercise's own increment; reps stay the same. The session immediately following a deload automatically reverts to your last genuine numbers with progression suggestions hidden, so one deload never permanently resets your baseline — normal progression resumes the week after that. The hero also shows how many weeks it's been since your last deload, once you've done one
- Per-session exercise cards showing:
  - A "Last wk: ↑ weight" / "↑ reps" badge in the header, inferred from whichever explicitly-chosen progression path was used last week — or, if none was explicitly chosen, backfilled by comparing last week's actual weight/reps against the week before; shows "no progression" if neither increased. Replaced by a "deload" badge during deload weeks, and hidden during the week right after one
  - Last week's logged sets (weight × reps) shown directly in each set row, replacing what used to be a redundant repeat of the current week's suggested value
  - Suggested progression for the current week (weight or reps), with a progression chip showing the delta. **Each set gets its own suggestion** (v6.09), carried forward from that same set number the last time you trained this exercise — so if you had to drop the weight on a later set in a session, that adjustment carries into next mesocycle's suggestion for that set specifically, rather than every set inheriting whatever happened on set 1. A newly-added set (from a plan that ramps sets up over the cycle) simply inherits the previous week's final set's suggestion
  - Set logging with weight, reps, and a done toggle per set
  - **Fill Suggested** button — fills every set with its own suggested values in one tap, with an amber flash animation
  - Superset cards show the same last-week badge and progression data per member, plus each member's exercise type badge, consolidated into a compact per-exercise summary line rather than a full per-set breakdown. Drop sets can't be superset members
  - **Drop Set** exercises expand into one block per set, each containing a Main row and a Drop row, sharing one done-checkbox — a set isn't complete until both halves are logged. The main set now has a real reps target like any other exercise type (v6.09); only the drop row shows "to failure", since the drop is always a reduction in weight taken to failure and its reps are only ever discovered live
- **Exercise history** — completing a set (via the checkbox or the one-tap fill-and-complete shortcut) remembers your weight/reps/tracking-mode for that exercise and set type, which is what powers the Last Logged reference and defaults on the Plan page. Deload-week completions are deliberately never recorded, so a reduced week can't skew future suggestions. This always reads from set 1 specifically, regardless of which set you interacted with or which sets got filled by a quick-fill shortcut — a later set's adjusted numbers can never override what set 1's own suggestion should be next time
- **Quick fill + complete** — a one-tap shortcut on the collapsed exercise card that fills every set with its suggested values and marks them all done. Drop sets get the same shortcut (v6.10) — previously there was no quick-complete option for them at all, since there was no main-set reps target to suggest; it now fills weight, reps, drop weight, and drop reps, same as any other exercise type
- **Rest Timer** (clock icon, top-right):
  - **Countdown** mode with an iOS-style scroll drum picker (0–59 min, 0–59 sec), defaulting to 1:00. Digits turn amber in the final 10 seconds. Three-beep audio alert on completion via the Web Audio API — does not interrupt music or podcast playback
  - **Stopwatch** mode with tenths-of-second precision
  - Closing the modal cancels and resets all timers
  - Clock icon turns accent green while a timer is running

### Body (folded into Settings in v7.51 — no longer its own screen)
Reached via Settings → Profile card → **Body logs**, which opens a modal containing just the grouped log list described below (the weight chart, inline "log weigh-in" card, and measurement reminder that used to sit above it were all removed in v7.51 along with the computation that fed them — that data is now only ever entered via the log-entry modal itself, not a standing form). Home's "Edit today's logs" shortcut deep-links straight through Settings into **today's own entry** in this modal — an existing entry opens for editing, or a blank one defaulting to today if nothing's logged yet.
- Log body weight (lbs) and steps per day, tap an entry to edit, swipe left to reveal delete
- **Waist/hip measurements (v6.12)** — optional entries logged alongside weight/steps in the same edit modal. Input unit toggles between inches (whole number + a quarter-inch picker — 0/¼/½/¾) and centimetres (single decimal field); everything is stored internally in inches, so switching units later never corrupts historical entries
- Gender/height/birthday (driving the BMR formula) now live in their own **About me** modal, opened directly from Settings → Profile, separate from the log list
- BMR/TDEE (Mifflin-St Jeor) calculated from profile + activity level, with activity level derived from your all-time average logged steps (intentionally unscoped — more historical data makes the estimate more accurate, not less)
- **Monthly grouping (v6.11)** — any month collapses into a single tappable "Mmm YYYY" group once its entries have both weight and steps filled in, showing entry count and average weight; tap to expand. Entries missing either field always stay visible individually, regardless of month — so if your steps take a day to sync, that entry won't get buried inside a collapsed group right when you're most likely to want to finish filling it in. Groups sort newest month first

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
- **Recipe builder** — multi-step: name and servings, then add ingredients by barcode scan, manual entry, or (v6.12) **Food Library search** — the same search-and-select modal used for regular meal logging, reused in an ingredient-adding context: the Recipes/Manual/Scan Barcode action row is hidden, quick-add and tap-to-edit-serving both add straight to the recipe instead of logging to a meal, and the search list stays open (or reopens) after each addition so several ingredients can be added in a row. Reachable from the food library ("My Recipes" in Settings) or from a meal's ellipsis menu
- **Sample Day Library (new in v7.25)** — save a whole day of logging for reuse later, and pull it back onto a new date in one tap:
  - **Save prompt** — appears below the hero on any day whose totals land close to that day's own goal targets and has a recipe logged for Dinner: "On target for your goal — save this day to pre-fill later?" Tapping it stores every meal from that day into a library, grouped by goal. Once saved, the prompt is replaced by a "✓ Saved to library" pill inside the hero card itself
  - **Fill Day** — next to Quick Add in the hero's corner, opens a picker of previously saved days for the current goal (or any goal with sufficiently similar targets, even one that's never had a day saved under it) and copies every meal from the chosen day onto the current date, with a confirm-to-overwrite warning if the date already has logs
  - **Dinner-entry prompt (new in v7.53)** — logging anything into Dinner, on any date whose goal already has a matching saved library, triggers a "There is an approved day already saved for this meal and this goal — want to fill the whole day?" prompt. Accepting fills the entire day from the most recently saved match — the same mechanism Fill Day itself uses, so it overwrites everything logged for that date, including the item just added. Declining just closes the prompt and leaves the entry as logged. This checks on every item added to Dinner, not just the first
  - **Goal linking** — a saved day's library is scoped to whichever goal created it, then automatically grows to include any other goal (now, or discovered later) whose kcal/protein/carbs/fats land close enough to count as "the same kind of day" — so a similar goal weeks later can immediately draw on an older goal's saved library
  - **Settings → Nutrition → Sample libraries** — a screen (reached only from Settings) listing every saved library: a bold pill for the goal that originated it, subtler pills for every other goal currently linked to it, and its saved days as swipeable rows (tap to relabel, swipe to delete)

### Goals
See **Goals**, now under the **Plan** section above — Goals was folded into Plan in v7.40 and is no longer its own screen or nav-bar entry.

### Settings (redesigned across v7.50–v7.52)
A list of collapsible cards, each expanded by default except Danger Zone:
- **About this app** — tappable row (name + version badge); opens a modal showing storage usage
- **Profile** card — App preferences (Dark/Light mode + the nine theme swatches, moved here from their own top-level section), About me (gender/height/birthday for the BMR formula), Body logs (the grouped log list described above), Linked services → API Key (the optional Anthropic key that powers "Ask BLOC for advice" — moved here from an old standalone "AI Advice" section; still stored separately in `localStorage`, still never included in JSON exports)
- **Nutrition** card — My Recipes (accent-tinted, first), Sample libraries (the Sample Day Library management screen described above), View/edit food library, Export food library, Import food library, Import recipe
- **Exercise** card — View/edit library, Export, Import
- **Backup** — Export JSON backup, always visible, not behind a button
- **Danger Zone** card — **collapsed by default**, unlike every other card on the page, since these are the two genuinely destructive actions: Import JSON backup (replaces all current data) and Clear all data (wipes everything but preserves theme/mode, since the confirm dialog only ever promises to delete tracked data). Clear all data keeps its solid red fill; restore-from-backup keeps red text on the app's normal button style, since it's recoverable by re-importing your last export
- Every card's buttons are visually identical (icon + label, no descriptive text, no nested cards) — the two-tier primary/secondary button hierarchy from v6.10 was dropped in this redesign in favour of one consistent button style throughout
- **Modal stacking** — buttons that open their own modal (App preferences, About me, Body logs, Linked services → API key, Sample libraries → a saved day's editor) stack on top of whatever's already open rather than closing it, so backing out returns you to exactly where you were. The three buttons that lead into the pre-existing Food Library, My Recipes, and Exercise Library editors are the deliberate exception — those have their own substantial modal chains built around a fixed stacking order, so those three still close the Settings screen's card view first rather than layering on top of it

---

## Barcode Scanning

BLOC uses a two-tier detection strategy, chosen automatically at runtime:

1. **Native `BarcodeDetector`** (Safari 17+, Chrome 83+) — zero-overhead, runs on-device
2. **ZXing JS** (bundled, ~336KB) — pure-JS fallback for older browsers

The camera launches immediately when "Scan Barcode" is tapped. On detection the viewfinder corners flash white, the device vibrates, and the barcode is looked up against Open Food Facts automatically. A manual entry field below the viewfinder serves as a final fallback. The camera stops as soon as a product is found or the modal is closed.

---

## Progression Logic

BLOC automatically calculates suggested weights and reps week-over-week based on the macrocycle goal type. The weight increment is user-configurable per macrocycle for any goal type (defaults to 2.5 kg); the heavy-leg increments are fixed:

| Goal type | Standard exercises | Heavy leg exercises |
|---|---|---|
| Weight Loss | + your configured increment / mesocycle | +5 kg / mesocycle |
| Strength Gain | + your configured increment / mesocycle | +10 kg / mesocycle |

For rep progression, 1 rep is added per week to each set.

**Exercise types:**
- **Standard** — weight or rep progression, chosen per exercise per week
- **Giant Set** — weight or rep progression (giant-set reps add +10/week when reps is chosen)
- **Pause Set** — fixed reps, weight progression only
- **Drop Set** — a real reps target is planned for the main set, same as any other type (added in v6.09; previously no rep target was ever planned). Only the drop portion has no target and is logged to failure live, starting in week 1. Once there's a prior week to compare against, progression applies identically to both, and — since v6.09 — is suggested per set rather than uniformly from set 1

**Per-set suggestions (v6.09):** each set's suggested weight/reps is now carried forward from that same set number the last time you trained the exercise, rather than every set copying whatever set 1 did. So if you had to drop the weight partway through a session, that adjustment carries forward correctly into the next mesocycle for that specific set — the other sets still progress normally from their own numbers. A newly-added set (from a plan that adds sets partway through the cycle) inherits the previous week's final set's suggestion.

**Deload weeks** temporarily override all of this: every exercise's weight drops to 60% of last logged (rounded to that exercise's own increment), reps stay the same, and progression suggestions are hidden for the deload week itself and the single session right after it — which instead reverts to your last genuine numbers so the deload never permanently resets your baseline.

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
| Keyboard type per field (v7.54) | `inputmode="numeric"` (whole numbers: steps, reps, waist/hip whole-inch pickers, barcode entry, height ft/in, mesocycle count) or `inputmode="decimal"` (weight, kcal/macros, grams/servings, cm measurements) set field-by-field after a full audit of every input in the app — independent of each field's `type` attribute, so existing validation is untouched |

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

All data lives in your browser's `localStorage`. It is not synced to any server. A backup includes everything — macrocycles, exercises, training logs, deload markers, exercise history, nutrition, body weight, and goals.

**It is strongly recommended to export a JSON backup regularly** via Settings → Export JSON backup, and store it in a safe location (e.g. iCloud Files, Google Drive).

To restore: Settings → Danger Zone → Import JSON backup → select your `.json` file.

---

## Known Limitations

- No service worker — fonts require an initial network request
- Data is device-local; no cross-device sync
- No native push notifications for timer alerts when the app is backgrounded
- `localStorage` is capped at 5–10 MB; extremely large food libraries or years of logs could approach this
- Body weight is tracked in lbs while training weight is tracked in kg — an intentional, but non-obvious, split (there's no unit toggle for body weight itself). Waist/hip measurements (v6.12), by contrast, do have an inches/cm input toggle — internally always stored in inches
- Drop Set exercises' main set now contributes to the Plan page's *theoretical* volume projections (Week-1 session summary, body-part volume table) like any other exercise, as of v6.09 — only the drop portion still doesn't, since it has no plan-time target to project from. Real logged volume was never affected either way
- Sample Day Library: once a goal formally links to a library (by having a day saved under it), that link is permanent — there's no path that removes it later even if the goal's targets are subsequently edited to fall well outside the library's tolerance band. See `TECHNICAL.md` §28/§29 for the full detail, plus the `Infinity`/JSON storage gotcha (fixed v7.30) that's worth reading before extending this feature

---

## Version History

Recent versions (v5.26 onward) reflect a page-by-page legacy audit pass — removing dead code left over from earlier redesigns, fixing bugs found along the way, and adding a handful of features that came up during the audit. Selected highlights below; see in-file version badge for the exact current build.

| Version | Notes |
|---|---|
| v7.54 | **Numeric keyboard pass** — `inputmode` set on every relevant field across the app (66 fields) so the right keypad shows instead of the full qwerty keyboard: whole-number keypad for steps, reps, waist/hip whole-inch entry, barcode manual entry, height ft/in, and mesocycle count; decimal keypad for weight, kcal/macros, grams/servings, and cm measurements. Driven by a full field-by-field audit rather than a blanket rule, since a few fields (Train's reps field, notably) are `type="text"` rather than `type="number"` to allow non-numeric entries, and needed the same treatment without changing their underlying validation |
| v7.53 | **Home log boxes reinstated as inline "disappearing input" cards**, replacing the icon-triggered mini-modals from v7.31–v7.52 — weight/steps show a plain input daily until logged; measurements now runs on its own 4-day cycle (not daily) with a warning banner, staying visible until a fresh measurement resets the countdown. The three modals this replaced were removed. **Nutrition**: logging anything into Dinner now checks for a matching Sample Day Library entry and offers to fill the whole day from it (same mechanism as the Fill Day button), checked on every Dinner addition |
| v7.50–v7.52 | **Settings — full redesign, iterated live across three passes.** Body and Goals nav tabs removed entirely (folded into Settings and Plan respectively — see below). Final structure: a list of collapsible cards (Profile, Nutrition, Exercise, expanded by default; Danger Zone, collapsed by default) each showing their buttons directly inline, no nested cards or description text. Profile card: App preferences (Mode/Theme, moved out of their own top-level section), About me, Body logs (the old standalone Body screen, trimmed down to just its grouped log list — the weight chart, inline log-form, and measurement reminder were removed along with ~200 lines of now-dead computation that fed only them), Linked services → API Key (moved from the old "AI Advice" section). Nutrition card: My Recipes, Sample libraries, View/edit/export/import food library, Import recipe. Exercise card: view/edit/export/import. Modals opened from these cards stack rather than closing their parent (own z-index tier), except the three that lead into the pre-existing Food Library/Recipes/Exercise Library modal chains, which still close their parent first to avoid rendering behind their own children. Home's "Edit today's logs" now opens Settings → Body logs → today's specific entry directly, via a new `openTodaysBodyLogModal()` |
| v7.40–v7.41 | **Goals folded into Plan — no longer its own screen.** Plan gained a collapsible Goals section (same row styling as Progress's cycle-goals list) with its own "+ Build goals" button, swipe-to-delete, and a dismissible "add a goal?" nudge on saving a macrocycle with none linked. Delete button added to the goal modal itself. Progress's own goal list restricted to active + upcoming only (full history now lives on Plan). Session cards on Plan's Week-1 template now auto-collapse once they have at least one exercise (previously always expanded by default), resetting to that default each fresh visit to the tab; manually toggling, or opening add/edit-exercise for a session, overrides the default until the next visit |
| v7.31–v7.34 | **New Home screen — the app's default landing tab**, ahead of Progress. Weekly hero card (kcal/protein/carbs/steps vs. active goal, metric-specific badge polarity, adjustment sublabel that only shows when needed); upcoming-goal banner (fires only on a genuine target change within 6 days, comparing old vs. new); three quick-log icon tiles (weight/measure/steps) that disappear once logged; planned-food-today and next-session previews. Nav bar reordered to Home/Progress/Plan/Train/Nutrition/Settings |
| v7.30 | Settings: `clearAllData()` now also resets `state.sampleDays` — previously omitted, the same class of oversight as the historical `supersets`/`profile` gap (never crashed anything, since `load()`'s defensive default silently backfilled it, but "Clear all data" left the Sample Day Library quietly intact) |
| v7.30 | **Critical Sample Day Library fix.** `range.proteinMax` was stored as the real JS value `Infinity` ("no upper bound on protein") — `JSON.stringify()` silently turns `Infinity` into `null`, and since every save round-trips state through JSON, this corrupted almost immediately after the feature shipped, silently breaking every match check that depended on it (both the linked-goal pill display and Fill Day discovery). Diagnosed against a real exported backup rather than synthetic numbers. Fixed with a JSON-safe sentinel (`Number.MAX_SAFE_INTEGER`) going forward, defensive `null`/`undefined`-tolerant comparisons everywhere a range is checked, and a one-time migration on load that repairs any already-corrupted saved library |
| v7.29 | Sample Day Library: a goal can now show as "linked" — and be used for Fill Day — purely because its own targets fall within an existing library's tolerance band, even before anyone has saved a single day under it specifically. Previously, linking only ever happened retroactively, at the moment a day was actually saved under a new goal |
| v7.25–v7.28 | **Sample Day Library — new feature**, plus a Progress/Train/Plan pass built alongside it. *Nutrition*: save a day close to its own goal's targets (with a recipe logged for Dinner) into a library grouped by goal; Fill Day copies a saved day's meals onto any date; Settings → Profile → Nutrition Libraries manages every saved library (relabel/delete, linked-goal pills). *Progress*: the Phase 1 trend/plateau card moved from its own standalone card into the Insights deck's first card, directly below the weight header; new goal-period summary rows (green accent for the active goal, red + countdown subtitle for the next upcoming one) below Statistics; the weekly table stack split its Swing column out into its own third card, covering weight/kcal/steps/protein instead of weight alone, with thousand-separator formatting. *Train*: the hero card now shows the real calendar week date range for the selected mesocycle/microcycle. *Plan*: macrocycles can now only start on a Monday — blocked (not just warned) on both creation and edits, since deload-week and calendar-date math throughout the app assumes it |
| v7.22–v7.24 | **"Challenge this advice" — mid-cycle AI advice only, single-reply.** One challenge opportunity per advice response: sends the original prompt + prior response + your challenge text back to the model, which returns an acknowledgment, a fully revised Sustainable/Aggressive pair, and (new) an `isSignificantRevision` flag. Diff view pairs each original step against its revised counterpart (added/removed steps called out separately) for both plans. Decline discards the revision entirely — the challenge affordance doesn't reappear on that advice instance either way. Accept branches on significance: a minor correction keeps the original headline/narrative in place with the acknowledgment shown as an italic subtitle; a significant one (the model's own read of the situation genuinely changed) replaces the headline/narrative outright rather than leaving stale reasoning next to a very different plan. `state.blocAdvice.priorAdviceThisCycle` now accumulates a condensed history of every check-in this cycle — including original-vs-revised numbers and the acknowledgment for any accepted challenge — so a later ask is never blind to what's already been tried. Unrelated bundled fix: the Next Cycle second-opinion's "available within 3 weeks" line is now a live countdown to that 3-week eligibility mark (weeks, then days under 2 weeks out) instead of a static message |
| v7.20–v7.21 | **Next Cycle — Phase 4 (LLM second opinion) shipped.** New prompt + API call, separate from the mid-cycle "Ask BLOC for advice" feature — its own `state.nextCycleAdvice` slot, its own 3-week-from-cycle-end gate, no shared cooldown. Schema returns a variable-length `plans[]` array rather than a fixed sustainable/aggressive pair: one plan normally; two, keyed to each side of an unresolved deadline conflict; or two — "sustainable"/"aggressive" — when no deadline was given for a cut or bulk, with a hard client-side check preventing a bulk's aggressive variant from ever running shorter than its sustainable one. Every plan must self-declare (or inherit) its exact intended length and fill it precisely — a mismatch is rejected outright, not silently accepted. Daily steps are only ever requested from the model during a cut; bulk/maintenance goals are force-set to 8,000 flat afterward regardless of what came back. Accepted plans route through the exact same macro-creation + goal-queue pipeline as the deterministic path. **v7.21** additionally teaches the deterministic engine to compute a "normal logic" alternative whenever it recommends simply extending the current cycle (continuing a cut → the maintenance bridge it would have recommended instead; continuing a bulk → the cut) — shown as a secondary option with its own build button, and fed to the LLM call as explicit context so its narrative weighs extending vs switching directly rather than only describing the switch in isolation |
| v7.05–v7.19 | **Next Cycle Recommendation Engine — Phases 1–3 shipped.** Phase 1: deterministic duration×depth matrix recommending a maintenance bridge after a cut (or continuing the cut, if it was short and mild) or a cut after a bulk (or continuing the bulk, if it was short with a mild rate/surplus); reverse-diet and step-and-hold direction ramps anchored to the current cycle's last planned goal rather than recent actual intake; "Build this plan next" launches the existing goal-queue flow with a macrocycle-creation step prepended. Phase 2: optional target-weight/deadline input, checked against a sustainable-weight floor/ceiling (hard boundary) and a 1.5%→1%/0.5% taper curve (pace boundary), with two one-tap alternatives offered on a pace conflict. Phase 3: mid-bridge TDEE-discrepancy recalibration flag surfaced on the existing trend-insights card, comparing a locally-scoped implied TDEE against the bridge's planned target over the most recent stable weeks |
| v7.00 | **AI Advice — Phase 1 (deterministic) + Phase 2 (LLM).** Progress: new trend insights card below the Insights deck — goalType-branched signal detection (plateau-creep, drift-warning, gain-deficit, etc.), per-week caloric drift visualisation, plateau detection at ≥0.5 lbs/week threshold. Historical rollup archives completed macrocycles (avgKcal/protein/carbs, startBw/endBw, waist/hip, plateau weeks, signals) capped at 10 cycles. AI advice card with Anthropic API integration (direct browser access via `anthropic-dangerous-direct-browser-access` header, model `claude-sonnet-4-6`, max 8,000 tokens): eligibility gates on intervention-warranting signals only; safety floor from log-based BMR × 0.80; protein minimum at 1g/lb bodyweight; partial-week flagging in prompt; 2-week cooldown from call date. Advice card has collapsible narrative, pre/post-choice plan layout (selected plan visible, unchosen plan collapsed). **Goal queue flow**: "Use plan" launches sequential modal — truncation step (edit-mode with explicit field override), LLM goal steps (new-goal mode), `_goalQueueAdvancing` flag prevents closeModal from aborting queue between steps, `_blocLabel` written to saved goals for reliable date cross-referencing. **Plan**: Maintenance added as third goalType — no load/reps progression suggested, progression selector hidden, last-week badge suppressed, set-count spacing and deloads unchanged. Bodyweight-relative pace warning on target BW field (1%/week loss, 0.5%/week gain ceiling). Schedule-status pill now has maintenance branch (weight stability ±2 lbs). **Body**: measurement reminder pill below weight chart — appears after 6 days without a waist/hip log, taps to open body log modal. API key stored separately in `localStorage` (`bloc_api_key`), never exported in state backups |
| v6.12 | Body: new waist/hip measurement tracking (inches/cm input toggle, hero callouts, weekly deltas). Progress: weekly summary and measurements tables merged into a single swipeable dot-paginated stack; weight delta recalculated as this-week-average vs last-week-average instead of a single-day-to-single-day comparison, and a new Swing column shows the week's smallest/largest day-to-day change. Nutrition: recipe builder's "Add ingredients" screen gained a Food Library search option, reusing the same search modal as meal logging but routed to add ingredients instead of log a meal, including a modal z-index fix so it correctly layers above the recipe builder screen it's opened from |
| v6.11 | Body: Recent Entries now groups any month's completed logs (weight + steps both filled in) into a collapsible "Mmm YYYY" summary, sorted newest first; incomplete entries always stay visible individually regardless of month, so a steps-sync lag never buries an entry you still need to finish |
| v6.10 | Settings: consolidated Exercise + Food library management into one "Libraries" section with a consistent two-tier button layout; new in-app **Exercise Library Editor** (view/edit/delete custom exercises; built-ins read-only); Danger Zone reorganised — Restore-from-backup moved in alongside Clear-all-data, the latter now styled with a solid red fill matching Export's visual weight |
| v6.09 | Train: progression suggestions are now computed **per set** (from that same set number's previous mesocycle, not uniformly from set 1) instead of one flat figure for the whole exercise — a newly-added set inherits the previous week's final set. Fill Suggested, quick-fill, and quick-fill-complete all updated to match. Drop Set exercises gained a real main-set reps target (previously none at all) — the drop portion still has no target and is still discovered live. Quick-fill-complete is now available for drop sets too (previously no shortcut existed for them). As a side effect, drop sets' main set now contributes to the Plan page's theoretical volume projections |
| v6.08 | Train: one-tap "quick fill + complete" now also records exercise history, matching the checkbox path (deload weeks still excluded either way) |
| v6.07 | Exercise history recording excludes deload weeks, so a reduced week can never become the reference for "last logged" or a new plan's defaults |
| v6.06 | New **exercise history** — completing a set remembers weight/reps/tracking-mode per exercise + set type, powering a "Last logged" reference and auto-filled defaults in the Plan exercise modal. Set-type rename, at the data level: Myorep Giant Set → Giant Set, Myorep Matching → Pause Set. Every stored `type` value, function, and variable renamed to match, not just labels |
| v6.05 | New **Drop Set** exercise type — main weight planned, everything else logged to failure live; one Main/Drop row pair per set in Train |
| v6.04 | Plan: "sessions per week" is now calculated live from your split instead of typed in separately |
| v6.03 | Train: day-tab pills grouped by real calendar week instead of by microcycle; deload status pill text tightened |
| v6.02 | Deload: fixed reversion logic for the session(s) immediately following a deload on a 2-week mesocycle; overall progress badge and "not a deload week" placeholder text cleaned up |
| v6.01 | New **deload weeks** — mark a week/microcycle as deload, all weights reduce to 60% with automatic reversion the following session. Weight increment field generalised to any goal type (was loss-cycles-only) |
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
