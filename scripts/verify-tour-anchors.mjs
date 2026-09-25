#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-tour-anchors.mjs
//
// THE BUG THIS PREVENTS: a redesign quietly orphaning the tours (v8.16 →
// fixed v8.17).
//
// The tour engine SKIPS a step whose target is missing or empty — correctly,
// because a real account may simply have nothing there yet. The cost is that
// a renamed or deleted id produces no error anywhere: the step just stops
// appearing. And a target that survives but CHANGES MEANING is worse. After
// v8.16, `progress-body` still resolved — it had become the 770px Insights
// card — so seven Progress steps in a row spotlighted the same wall of text
// while their copy described a check-in, two plans and a cycle review that
// had all moved into sections and sheets of their own. Every anchor
// "resolved"; the tour was wrong from end to end.
//
// This asserts, against the shipped index.html:
//   1. every target a tour builder names exists as an id in the markup;
//   2. the Mini-Tours run the SAME builders as the Demo Tour, not copies —
//      two hand-maintained lists are how both broke identically;
//   3. no step writes to state the v8.16 redesign deleted (insightsIndex,
//      _aiAdviceBodyOpen, _blocAdviceSectionsOpen, _nextCycleAdviceSectionsOpen)
//      and no step targets the whole Insights card;
//   4. the tooltip swaps its dots for a count on long tours — at 35 steps the
//      dot row pushed Back/Next off the tooltip and the Demo Tour could not
//      be advanced;
//   5. the engine re-finds a target replaced during its 220ms settle delay —
//      Plan's step chart repaints via outerHTML every 2s, and the detached
//      node measured 0×0, ringing the screen's top-left corner (v8.17 UAT).
//
// 🚨 Reads the REAL source. The controls at the end break each property and
// assert the suite then FAILS. A check that cannot fail proves nothing.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failures = 0;
const ok   = m => console.log('  ✓ ' + m);
const bad  = m => { failures++; console.log('  ✗ ' + m); };
const check = (cond, m) => cond ? ok(m) : bad(m);

function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const BUILDERS = ['buildHomeTourSteps', 'buildProgressTourSteps', 'buildPlanTourSteps',
                  'buildTrainTourSteps', 'buildFuelTourSteps'];
const MINI = {
  startHomeMiniTour: 'buildHomeTourSteps', startProgressMiniTour: 'buildProgressTourSteps',
  startPlanMiniTour: 'buildPlanTourSteps', startTrainMiniTour: 'buildTrainTourSteps',
  startNutritionMiniTour: 'buildFuelTourSteps',
};
// Ids rendered from a template, per item. The step names one concrete
// instance; the markup carries the template.
const TEMPLATED = {
  'checkin-plan-sustainable': 'id="checkin-plan-${key}"',
  'checkin-plan-aggressive':  'id="checkin-plan-${key}"',
  'home-metric-card-kcal':    'id="home-metric-card-${m.field}"',
  'meal-menu-btn-Dinner':     'id="meal-menu-btn-${meal}"',
};
// Prefixes a step resolves at run time (it cannot know which exercise or
// phase in advance) — the template must exist for the lookup to find anything.
const DYNAMIC = {
  'prog-selector-': 'id="prog-selector-${macro.id}-${exId}"',
  'locked-notice-': 'id="locked-notice-${macro.id}-${exId}"',
  '.ex-card':       'id="ex-card-${macro.id}-${exId}"',
  '.phase-row':     'id="phase-row-${g.macroGoalID}"',
};
const DELETED_STATE = ['insightsIndex', '_aiAdviceBodyOpen', '_blocAdviceSectionsOpen', '_nextCycleAdviceSectionsOpen'];

function targetsOf(body) {
  const out = new Set();
  for (const m of body.matchAll(/targetId:\s*'([^']+)'/g)) out.add(m[1]);
  for (const m of body.matchAll(/step\.targetId\s*=[^;]*/g))
    for (const s of m[0].matchAll(/'([a-z][a-z0-9-]+)'/g)) out.add(s[1]);
  return [...out];
}

function run(src, label) {
  const fails = [];
  const c = (cond, m) => { if (!cond) fails.push(m); };

  const all = [];
  for (const b of BUILDERS) {
    const body = extract(src, b);
    c(!!body, `${b}() exists`);
    if (!body) continue;
    for (const t of targetsOf(body)) {
      all.push(t);
      const markup = TEMPLATED[t] || `id="${t}"`;
      c(src.includes(markup), `${b}: target "${t}" exists in the markup (${markup})`);
    }
    for (const [needle, markup] of Object.entries(DYNAMIC))
      if (body.includes(needle)) c(src.includes(markup), `${b}: run-time lookup "${needle}" has its template ${markup}`);
    for (const d of DELETED_STATE) c(!body.includes(d), `${b}: writes no deleted state (${d})`);
    c(!/targetId:\s*'progress-body'/.test(body), `${b}: does not spotlight the whole Insights card`);
  }
  c(all.length >= 30, `the builders name at least 30 targets (found ${all.length})`);

  const demo = extract(src, 'buildDemoTourSteps');
  for (const b of BUILDERS) c(!!demo && demo.includes(`...${b}(true)`), `the Demo Tour runs ${b}(true)`);

  for (const [fn, b] of Object.entries(MINI)) {
    const body = extract(src, fn);
    c(!!body && body.includes(b) && !body.includes('targetId'), `${fn}() runs ${b} and carries no step list of its own`);
  }

  const tip = extract(src, '_renderTourTooltipContent');
  c(!!tip && /total > TOUR_MAX_DOTS/.test(tip) && tip.includes('tour-progress-count'),
    'long tours show a step count instead of one dot per step');

  // A target replaced during the settle delay (Plan's step chart repaints via
  // outerHTML every 2s) measures 0×0 at (0,0) unless it is looked up again.
  const pos = extract(src, '_positionTourStep');
  c(!!pos && /if \(!target\.isConnected\) target = document\.getElementById\(step\.targetId\)/.test(pos),
    '_positionTourStep() re-resolves a target that was replaced before it is measured');

  if (label) return fails.length;
  fails.forEach(bad);
  if (!fails.length) ok(`every assertion passed against the shipped source (${all.length} targets)`);
  return fails.length;
}

console.log('\nTours — anchors, one step list per page, no deleted state');
run(source, null);

console.log('\nControls — each must FAIL the suite above');
check(run(source.replace('id="home-measure-row"', 'id="home-measurements"'), 'control') > 0,
  'renaming a spotlighted id in the markup is caught');
check(run(source.replace("targetId: 'progress-checkin'", "targetId: 'progress-body'"), 'control') > 0,
  'pointing a step back at the whole Insights card is caught');
check(run(source.replace(
  "function startHomeMiniTour()      { _startMiniTour('home',      buildHomeTourSteps); }",
  "function startHomeMiniTour()      { startTour([{ targetId: 'home-hero-wrap', title: 'x', body: 'x' }]); }"), 'control') > 0,
  'a Mini-Tour with its own copied step list is caught');
check(run(source.replace('total > TOUR_MAX_DOTS', 'false'), 'control') > 0,
  'one dot per step on a 35-step tour is caught');
check(run(source.replace('if (!target.isConnected) target = document.getElementById(step.targetId) || target;', ''), 'control') > 0,
  'measuring a detached (repainted) target is caught');

console.log('');
if (failures) {
  console.log(`FAIL — ${failures} problem${failures === 1 ? '' : 's'}\n`);
  process.exit(1);
}
console.log('All checks passed.\n');
