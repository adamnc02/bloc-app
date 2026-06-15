# BLOC — Training & Nutrition PWA

> A personal, offline-first Progressive Web App for structured weight training and nutrition tracking. Single HTML file. No backend. No dependencies.

![Version](https://img.shields.io/badge/version-v3.04-brightgreen) ![PWA](https://img.shields.io/badge/PWA-ready-blue) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

BLOC is a mobile-first PWA built entirely in a single `index.html` file — no build tools, no frameworks, no server. It is designed to be deployed on GitHub Pages and added to your home screen like a native app. All data is stored locally in `localStorage` and can be exported/imported as JSON at any time.

The app is structured around the concept of a **macrocycle** — a multi-week training block with defined goals, split type, and progression logic. Everything else (training logs, nutrition, body weight, steps, goals) lives within the context of an active macrocycle.

---

## Features

### Home
- Dashboard overview of your active macrocycle — name, goal, weeks remaining, and a cycle progress bar
- Body weight vs. target: current weight, 7-day average, and week-on-week change (compared to the prior 7-day average)
- Body weight sparkline (last 14 entries)
- Steps — today's count or 7-day average bar chart, each with a toggle, goal tracking, and insight phrase
- Nutrition — today's or 7-day average for kcal, protein, carbs, and fats, each with its own colour-coded bar chart and goal comparison
- Today vs. goal summary with progress bars for all tracked metrics and weekly pacing calculations

### Plan
- Create and manage **macrocycles** with:
  - Name, start date, goal type (Weight Loss / Strength Gain / Maintenance)
  - Split type: **PPL** (Push/Pull/Legs), **Full Body**, or **Custom**
  - Number of mesocycles, weeks per mesocycle, sessions per week
  - Optional **microcycles** (alternating A/B sessions within a week)
  - Optional target body weight
- Per-exercise configuration: name, sets, reps, starting weight, exercise type (standard, myorep giant, myomatch), heavy leg flag
- Edit, copy, and delete macrocycles — tap the macrocycle card to edit; swipe left to reveal copy and delete buttons (vertically stacked)
- Body weight progress bar within the plan card, showing start → current → target
- Exercise rows — tap to edit; swipe left to reveal delete button

### Train
- Week and day selector to navigate your macrocycle
- Per-session exercise cards showing:
  - Last week's logged sets (weight × reps)
  - Suggested progression for the current week (weight or reps), with a progression chip showing the delta
  - Set logging with weight, reps, and a done toggle per set
  - **Fill Suggested** button — fills all sets with suggested values in one tap, with an amber flash animation on the button and a border glow animation on the filled inputs
- **Rest Timer** (clock icon, top-right):
  - **Countdown** mode with an iOS-style scroll drum picker (0–59 min, 0–59 sec), defaulting to 1:00. Digits turn amber in the final 10 seconds. Three-beep audio alert on completion via the Web Audio API — does not interrupt music or podcast playback
  - **Stopwatch** mode with tenths-of-second precision
  - Closing the modal cancels and resets all timers
  - Clock icon turns accent green while a timer is running

### Body
- Log body weight (lbs) and steps per day
- 7-day average weight, week-on-week change, and entry count
- Full log of all entries — tap to edit; swipe left to reveal delete button

### Nutrition
- Per-day food logging across named meals (Breakfast, Lunch, Dinner, Snacks)
- Date navigation via a 7-day badge strip and a date picker
- Food lookup via:
  - **Scan Barcode** — live camera scanning using the native `BarcodeDetector` API (Safari 17+) with automatic ZXing JS fallback for older browsers. Camera launches immediately on tap. Manual barcode entry available below the viewfinder as a fallback. Looks up the scanned code against the Open Food Facts API
  - **Manual entry** — enter name and direct per-serving macros (kcal, protein, carbs, fats)
  - **Recipe** — open the recipe builder directly from the log screen
  - **Food library** — search previously used foods, sorted by most recently logged
- **Quick Add** — log kcal, protein, carbs, and fats directly without a named food, overriding meal items for that day's totals
- Serving confirmation modal showing grams and servings fields, live macro preview, and (for recipes) a full ingredient breakdown
- Swipe-to-copy from yesterday — an animated swipe strip under each meal shows the previous day's items and copies them on a one-third-width swipe right. The strip shows full text (no truncation)
- Meal ellipsis menu (`···`) — copy or move an entire meal to any date and meal target via a bottom action sheet
- Per-item interactions — tap a food entry to edit it; swipe left to reveal copy and delete buttons. Edit modal defaults the gram amount to the food's RSS (recommended serving size) where available. Manual entries show direct kcal/protein/carbs/fats inputs instead of grams/servings
- Daily macro panel with g / ± / % toggle for protein, carbs, and fats
- Daily kcal card with progress bar vs. goal
- 7-day weekly tab with bar charts and a macro pie chart
- Personal **food library** — foods saved automatically on first entry; recipes stored with brand "My Recipe"
- **Recipe builder** — multi-step: name and servings, then add ingredients by barcode scan or manual entry. Barcode ingredients store per-1g values for editing; manual ingredients store per-serving totals. Ingredients are individually editable and deletable
- Export, import, and share individual food library items as JSON

### Goals
- Set daily targets per macrocycle: steps, kcal, protein, carbs, fats
- Today vs. goal progress bars with left-to-go or over-target indicators
- Weekly average comparison across all tracked metrics
- Projected pacing — if you're behind on a weekly goal, BLOC calculates what you need per remaining day
- Tap a goal card to edit; swipe left to reveal delete button

### Settings
- Export full app data as a JSON backup
- Restore from a JSON backup (replaces all current data)
- **Exercise library** — export and import (merges by name; default exercises cannot be overwritten)
- **Food library** — Export / Import (whole library JSON); Import recipe (single shared item file, including recipe ingredients); Edit library (tap row to edit, swipe left to reveal share and delete); My Recipes (tap row to edit recipe builder, swipe left to delete)
- Storage usage indicator
- Full data wipe (danger zone)

---

## Barcode Scanning

BLOC uses a two-tier detection strategy, chosen automatically at runtime:

1. **Native `BarcodeDetector`** (Safari 17+, Chrome 83+) — zero-overhead, runs on the GPU
2. **ZXing JS** (bundled, ~336KB) — pure-JS fallback for older browsers

The camera launches immediately when "Scan Barcode" is tapped. On detection the viewfinder corners flash white, the device vibrates, and the barcode is looked up against Open Food Facts automatically. A manual entry field below the viewfinder serves as a final fallback. The camera stops as soon as a product is found or the modal is closed.

---

## Progression Logic

BLOC automatically calculates suggested weights and reps week-over-week based on the macrocycle goal type:

| Goal type | Standard exercises | Heavy leg exercises |
|---|---|---|
| Weight Loss | +1.5 kg / mesocycle | +2.5 kg / mesocycle |
| Strength Gain | +5 kg / mesocycle | +10 kg / mesocycle |

For rep progression, 1 rep is added per week to each set.

**Exercise types:**
- **Standard** — weight or rep progression
- **Myorep giant** — +10 reps per week (weight progression also available)
- **Myomatch** — fixed reps, weight progression only

---

## Architecture

| Concern | Approach |
|---|---|
| File structure | Single `index.html` — HTML, CSS, and JS in one file, one `<script>` block |
| Storage | `localStorage` (`bloc_state` key) |
| Fonts | Google Fonts — Syne (display) and DM Mono (body) |
| Food data | Open Food Facts API (barcode lookup) |
| Barcode scanning | Native `BarcodeDetector` API → ZXing JS bundle (bundled, ~336KB) |
| Audio | Web Audio API — sine wave oscillators, no audio files |
| PWA | `apple-mobile-web-app-capable` meta tags; add to home screen via Safari/Chrome share sheet |

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

## Design

- **Colour palette:** near-black background (`#0a0a0a`) with layered dark surfaces, a yellow-green accent (`#c8f060`), amber, blue, red, and purple for semantic colour coding
- **Typography:** Syne (headings, numbers) and DM Mono (body, labels)
- **Motion:** subtle scale transforms on button press, sheet modal slide-up, swipe-to-dismiss on all modals, Fill Suggested input flash, swipe-to-copy animation on yesterday strip, barcode viewfinder scan line and corner pulse animations

---

## Roadmap / Known Limitations

- No service worker — fonts require an initial network request
- Data is device-local; no cross-device sync (future: Supabase + PowerSync considered)
- No native push notifications for timer alerts when the app is backgrounded

---

## Version History

| Version | Notes |
|---|---|
| v3.04 | Swipe-left gestures on all list rows (plan, body, nutrition, goals, food library, recipes), tap-to-edit on all rows, deleteBodyLog, yesterday strip wraps text, edit modal defaults grams to RSS
| v3.03 | Camera barcode scanning (BarcodeDetector + ZXing fallback), camera auto-starts on modal open, manual edit mode for manual nutrition log entries |
| v3.01 | Meal ellipsis menu (copy/move entire meal), swipe-to-copy from yesterday, per-item copy icon, recipe builder from nutrition log, recipe ingredients in serving modal, SVG icons throughout, food library item sharing (Web Share API + JSON export), Fill Suggested animations |
| v2.12 | Recipe builder (barcode + manual ingredients, per-1g storage), food library editor, rest timer, food library export/import |
| v2.10 | Home page overhaul — Today/7-day toggle with animated bar charts for steps and all nutrition metrics |
| v2.09 | Full nutrition page rebuild — date picker, day badges, kcal summary, macro panel with g/±/% toggle, meal diary with barcode/manual/library/quick-add flows |
| Earlier | Exercise library, barcode lookup, microcycle support, sparklines, macrocycle copy, Goals tab |

---

## License

MIT — personal use, no warranty.
