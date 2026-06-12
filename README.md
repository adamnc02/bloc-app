# BLOC — Training & Nutrition PWA

> A personal, offline-first Progressive Web App for structured weight training and nutrition tracking. Single HTML file. No backend. No dependencies.

![Version](https://img.shields.io/badge/version-v2.11-brightgreen) ![PWA](https://img.shields.io/badge/PWA-ready-blue) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

BLOC is a mobile-first PWA built entirely in a single `index.html` file — no build tools, no frameworks, no server. It is designed to be deployed on GitHub Pages and added to your home screen like a native app. All data is stored locally in `localStorage` and can be exported/imported as JSON at any time.

The app is structured around the concept of a **macrocycle** — a multi-week training block with defined goals, split type, and progression logic. Everything else (training logs, nutrition, body weight, steps, goals) lives within the context of an active macrocycle.

---

## Features

### Home
- Dashboard overview of your active macrocycle — name, goal, weeks remaining, and a cycle progress bar
- Body weight vs. target: current weight, total lost/gained so far in the cycle, and lbs left to goal
- Body weight sparkline (last 14 entries)
- Steps — today's count or 7-day average bar chart, with goal tracking
- Nutrition — today's or 7-day average for kcal, protein, carbs, and fats, each with its own colour-coded bar chart
- Today vs. goal summary with progress bars for all tracked metrics

### Plan
- Create and manage **macrocycles** with:
  - Name, start date, goal type (Weight Loss / Strength Gain / Maintenance)
  - Split type: **PPL** (Push/Pull/Legs), **Full Body**, or **Custom**
  - Number of mesocycles, weeks per mesocycle, sessions per week
  - Optional **microcycles** (alternating A/B sessions within a week)
  - Optional target body weight
- Per-exercise configuration: name, sets, reps, starting weight, exercise type (standard, myorep giant, myomatch), heavy leg flag
- Edit and delete macrocycles
- Body weight progress bar within the plan card, showing start → current → target

### Train
- Week and day selector to navigate your macrocycle
- Per-session exercise cards showing:
  - Last week's logged sets (weight × reps)
  - Suggested progression for the current week (weight or reps), with a progression chip showing the delta
  - Set logging with weight, reps, and a done toggle per set
  - **Fill Suggested** button — fills all sets with the suggested values in one tap, with an amber flash animation on the button and a border animation on the filled inputs
- **Rest Timer** (clock icon, top-right):
  - **Countdown** mode with an iOS-style scroll drum picker (0–59 min, 0–59 sec), defaulting to 1:00. Digits turn amber in the final 10 seconds. Three-beep audio alert on completion using the Web Audio API — does not interrupt music or podcast playback
  - **Stopwatch** mode with tenths-of-second precision
  - Closing the modal cancels and resets all timers
  - Clock icon turns accent green while a timer is running

### Body
- Log body weight (lbs) and steps per day
- 7-day average weight, week-on-week change, and entry count
- Full log of all entries with edit and delete

### Nutrition
- Per-day food logging across named meals (Breakfast, Lunch, Dinner, Snacks)
- Food lookup via barcode (manual barcode entry → Open Food Facts API) or manual entry
- Personal food library — foods are saved automatically on first entry and available for quick re-add
- **Quick Add** — log kcal, protein, carbs, and fats directly without a named food
- Daily macro totals: kcal, protein, carbs, fats with progress bars vs. goal
- Pie chart breakdown of macros by calorie contribution
- Export and import food library as JSON

### Goals
- Set daily targets per active macrocycle: steps, kcal, protein, carbs, fats
- Today vs. goal progress bars with left-to-go or over-target indicators
- Weekly average comparison across all tracked metrics
- Projected pacing — if you're behind on a weekly goal, BLOC calculates what you need per remaining day

### Settings
- Export full app data as a JSON backup
- Restore from a JSON backup (replaces all current data)
- Export and import exercise library
- Export and import food library
- Storage usage indicator
- Full data wipe (danger zone)

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
| File structure | Single `index.html` — HTML, CSS, and JS in one file |
| Storage | `localStorage` (`bloc_state` key) |
| Fonts | Google Fonts — Syne (display) and DM Mono (body) |
| Food data | Open Food Facts API (barcode lookup) |
| Audio | Web Audio API — sine wave oscillators, no audio files |
| PWA | `apple-mobile-web-app-capable` meta tags; add to home screen via Safari/Chrome share sheet |

No service worker is currently registered, meaning the app requires an internet connection on first load for fonts. All app logic and data is fully offline after that.

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
- **Motion:** subtle scale transforms on button press, sheet modal slide-up, input flash animation on Fill Suggested, timer digit colour transitions

---

## Roadmap / Known Limitations

- No service worker — fonts require an initial network request
- Barcode scanning is manual entry only (camera-based scanning in pure JS was evaluated and found unreliable without a paid SDK)
- Data is device-local; no cross-device sync (future: Supabase + PowerSync considered)
- No native push notifications for timer alerts when the app is backgrounded

---

## Version History

| Version | Notes |
|---|---|
| v2.11 | Distinct colours for all 5 home chart metrics (steps, kcal, protein, carbs, fats) |
| v2.10 | Rest timer (countdown + stopwatch), Fill Suggested animation, bodyweight cycle progress phrase |
| v2.09 | Macro/mesocycle terminology update, Goals tab, Nutrition tab rebuild |
| Earlier | Exercise library, barcode lookup, microcycle support, sparklines |

---

## License

MIT — personal use, no warranty.
