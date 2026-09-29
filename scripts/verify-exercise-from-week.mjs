#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-exercise-from-week.mjs (v8.46, TECHNICAL §147)
//
// THE BUG IT PREVENTS: an exercise that joins a plan part-way through a
// cycle (a coach's swap, or one added later) has no logs of its own, so its
// target came from the plan's theory: starting weight + one increment per
// mesocycle SINCE WEEK 1. Swapped in at mesocycle 5 with 40 kg, its first
// target was 50 kg, and its sets were already part-way to peak.
//
// THE RULE: the exercise carries `fromWeek`, the mesocycle week it joined.
// That week is its week 1: the starting weight, reps and sets are its first
// targets, increments count from there, and its sets rise from starting to
// peak over the weeks it has. Without fromWeek nothing changes.
//
// Runs the built engine: the leaves, then Train's own target function on the
// demo with a late exercise added. CONTROL: the same exercise without
// fromWeek gets the week-1-based target.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log('✓ ' + label);
  else { failures++; console.log('✗ ' + label + (detail ? `\n    ${detail}` : '')); }
}
await import('./engine-global.mjs');
const E = globalThis.BlocEngine;

const late = { id: 'ex_late', name: 'Incline Press', startWeight: 40, reps: '10', setsStart: 3, setsEnd: 5, type: 'standard', fromWeek: 5 };
const early = { ...late, fromWeek: undefined };

check('the week it joins is its week 1: the starting weight', E.getWeekWeight(late, 5, 'weight', 'loss', '2.5') === 40);
check('  then one increment per mesocycle from there (week 7: +2)', E.getWeekWeight(late, 7, 'weight', 'loss', '2.5') === 45);
check('  starting sets in its first week, peak at the cycle’s last', E.getWeekSets(late, 5, 7) === 3 && E.getWeekSets(late, 7, 7) === 5);
check('  reps progression counts from there too', E.getWeekReps(late, 6, 'reps', 'loss') === '11');
check('  a giant set’s reps too', E.getGiantSetProgression({ ...late, type: 'giant', reps: '20' }, 6, 'loss') === '30');
check('no fromWeek: unchanged (week 5 is start + 4 increments)', E.getWeekWeight(early, 5, 'weight', 'loss', '2.5') === 50 && E.getWeekSets(early, 1, 7) === 3);

// Train's own target, on the demo, for a late exercise with no logs.
const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
const s = E.normaliseState(demo);
const m = s.macrocycles[0];
const key = Object.keys(s.exercises).find((k) => k.startsWith(`${m.id}_1_`));
const dayKey = key.slice(`${m.id}_1_`.length);
s.exercises[key] = [...s.exercises[key], { ...late, order: 999, supersetId: null, supersetOrder: null, trackingMode: 'total', category: 'weight' }];
const cache = () => { const c = {}; return { get: (k) => c[k], set: (k, v) => { c[k] = v; } }; };
const t = E.getWeekTargets(s, cache(), m, 5, dayKey, late);
check(`Train's target for it in week 5: 40 kg, ${late.setsStart} sets (got ${JSON.stringify(t.weightTargets)})`, parseFloat(t.weightTargets[0]) === 40 && t.weightTargets.length === 3);

console.log('\n— control: the same exercise without fromWeek —');
const c = E.getWeekTargets(s, cache(), m, 5, dayKey, early);
check(`control: it gets the week-1-based target (${JSON.stringify(c.weightTargets)})`, parseFloat(c.weightTargets[0]) > 40);

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
