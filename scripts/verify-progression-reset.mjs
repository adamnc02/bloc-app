#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-progression-reset.mjs (v8.52, TECHNICAL §161)
//
// THE RULES IT PROTECTS:
//   · A coach resets an exercise by sending new starting numbers with
//     `fromWeek` set to the next unlogged week. From that week the exercise
//     starts again: that week's target is the new starting numbers, a lock
//     from before it no longer applies, the walk back to a compliant week
//     stops there, and the week before it gives no RPE step. Weeks before it
//     are history and keep their targets.
//   · Effort ratings drive progression on a coach's cycle exactly as on a
//     Solo one (rpeDrivesProgression is isRpeOn).
//
// 🚨 THE TRAP: §147's `fromWeek` alone only moves the PLANNED targets. An
// exercise with logs "progresses from what was lifted", so without this rule
// a reset's new starting weight is ignored and the old lock keeps its target.
//
// A synthetic coach's cycle on the demo state: an exercise logged for three
// weeks, the third a miss (locked at 55 kg), then reset at week 4 to
// 40 kg × 12, 2 sets. CONTROL: v8.51's engine (6352acc) fails the reset rows
// and the coach-cycle RPE row; an exercise with no reset gives identical
// targets and lock decisions in both engines.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL = '6352acc';
const engineOf = src => { const ctx = {}; vm.runInNewContext(src + '\n;this.BlocEngine = BlocEngine;', ctx); return ctx.BlocEngine; };
const NOW = engineOf(readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8'));
const OLD = engineOf(execFileSync('git', ['show', `${CONTROL}:engine/dist/bloc-engine.js`], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26 }));
const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const newCache = () => { const c = {}; return { get: k => c[k], set: (k, v) => { c[k] = v; } }; };

const DK = 'd1';
const BASE = { id: 'exR', name: 'Flat Press', startWeight: 50, reps: '10', setsStart: 3, setsEnd: 3, type: 'standard', category: 'weight',
  trackingMode: 'total', order: 0, supersetId: null, supersetOrder: null };
const RESET = { ...BASE, startWeight: 40, reps: '12', setsStart: 2, setsEnd: 4, fromWeek: 4 };

function world(E, { coach = true, rpe = true } = {}) {
  const s = E.normaliseState(clone(demo));
  const m = { id: 'mR', name: 'Reset block', start: '2026-10-05', weeks: 8, weeksPerMeso: 1, sessionsPerWeek: 1, goalType: 'loss',
    weightIncrement: '2.5', days: [0], rpe, ...(coach ? { publishedBy: 'coach-1' } : {}) };
  s.macrocycles.push(m);
  s.exercises[`mR_1_${DK}`] = [BASE];
  const log = (w, weight, reps, n = 3) => { for (let i = 0; i < n; i++) s.trainLogs[`mR_${w}_${DK}_exR_${i}`] = { weight: String(weight), reps: String(reps), done: true }; };
  log(1, 50, 10); log(2, 52.5, 10); log(3, 50, 8);
  s.progressionLocks = { ...(s.progressionLocks || {}), [`mR_${DK}_exR`]: { weightTargets: ['55.0', '55.0', '55.0'], repsTargets: ['10', '10', '10'], sets: 3, lockedAtWeek: 3 } };
  return { s, m, log };
}

function run(E) {
  const r = {};
  {
    const { s, m } = world(E);
    s.exercises[`mR_1_${DK}`] = [RESET];
    const t4 = E.getWeekTargets(s, newCache(), m, 4, DK, RESET);
    r.target4 = [t4.weightTargets, t4.repsTargets];
    const p4 = E.computeExerciseProgression(s, newCache(), m, 4, DK, RESET, { lockComingIn: s.progressionLocks[`mR_${DK}_exR`], prevWasLocked: true });
    r.card4 = { w: p4.weightPlaceholders, r: p4.repsPlaceholders, locked: p4.isLocked, start: !!p4.progressionStart, prev: p4.prevActualWeight };
    r.history3 = E.getWeekTargets(s, newCache(), m, 3, DK, RESET).weightTargets;
  }
  {
    const { s, m, log } = world(E);
    s.exercises[`mR_1_${DK}`] = [RESET];
    log(4, 35, 12, 2); // below the new target: the first week is never judged
    r.lock4 = E.computeLockTransition(s, newCache(), m, 4, DK, RESET);
  }
  {
    const { s, m, log } = world(E);
    s.exercises[`mR_1_${DK}`] = [RESET];
    log(4, 40, 12, 2);
    r.target5 = E.getWeekTargets(s, newCache(), m, 5, DK, RESET).weightTargets[0];
    r.lastCompliantBefore5 = E.getLastCompliantWeek(s, newCache(), m, DK, RESET, 5);
    r.lastCompliantBefore3 = E.getLastCompliantWeek(s, newCache(), m, DK, RESET, 3);
    const sets5 = E.getWeekSets(RESET, 5, 8);
    log(5, 40, 12, sets5); // a miss after the reset
    const miss = E.computeLockTransition(s, newCache(), m, 5, DK, RESET);
    r.lock5miss = miss && miss.set ? miss.set.lockedAtWeek : miss;
    log(5, 42.5, 12, sets5); // compliant
    const ok5 = E.computeLockTransition(s, newCache(), m, 5, DK, RESET);
    r.lock5ok = ok5 && ok5.clear ? 'clear' : ok5;
  }
  {
    const { s, m, log } = world(E);
    s.exercises[`mR_1_${DK}`] = [RESET];
    s.rpe = { ...(s.rpe || {}), [E.getRpeKey('mR', 3, DK, 'exR')]: { rpe: 5 }, [E.getRpeKey('mR', 4, DK, 'exR')]: { rpe: 5 } };
    log(4, 40, 12, 2);
    r.rpe4 = E.computeRpeStepKind(s, newCache(), m, 4, DK, RESET);
    r.rpe5 = E.computeRpeStepKind(s, newCache(), m, 5, DK, RESET);
  }
  // No reset: the targets and lock decisions weeks 2–6 (compared across engines).
  {
    const { s, m, log } = world(E, { coach: false });
    log(4, 55, 10); log(5, 57.5, 10); log(6, 50, 10);
    const cache = newCache();
    r.plain = [2, 3, 4, 5, 6].map(w => [E.getWeekTargets(s, cache, m, w, DK, BASE).weightTargets, E.computeLockTransition(s, cache, m, w, DK, BASE)]);
  }
  r.drives = E.rpeDrivesProgression({ id: 'x', rpe: true, publishedBy: 'coach-1' });
  return r;
}

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log('✓ ' + label);
  else { failures++; console.log('✗ ' + label + (detail ? `\n    got ${JSON.stringify(detail)}` : '')); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ROWS = [
  ['the reset week\'s target is the new starting numbers: 40 kg × 12, 2 sets', r => eq(r.target4, [['40.0', '40.0'], ['12', '12']]), r => r.target4],
  ['Train shows them there, not locked, not last week\'s numbers, flagged progressionStart', r => eq(r.card4, { w: ['40.0', '40.0'], r: ['12', '12'], locked: false, start: true, prev: null }), r => r.card4],
  ['the reset week is never judged, even below target', r => r.lock4 === null, r => r.lock4],
  ['the week after progresses from it (42.5), not from the old lock (55)', r => r.target5 === '42.5', r => r.target5],
  ['the walk back to a compliant week stops at the reset week', r => r.lastCompliantBefore5 === 4, r => r.lastCompliantBefore5],
  ['a miss after the reset sets a fresh lock, at that week', r => r.lock5miss === 5, r => r.lock5miss],
  ['a compliant week after the reset clears the stale lock', r => r.lock5ok === 'clear', r => r.lock5ok],
  ['the week before the reset gives no RPE step', r => r.rpe4 === 'none', r => r.rpe4],
  ['a coach\'s cycle takes the Solo step from a rating (5 → easy)', r => r.rpe5 === 'easy', r => r.rpe5],
  ['rpeDrivesProgression is true on a coach\'s cycle with ratings on', r => r.drives === true, r => r.drives],
  ['history keeps its target: week 3 is still the lock\'s 55 kg', r => eq(r.history3, ['55.0', '55.0', '55.0']), r => r.history3],
];

const now = run(NOW);
for (const [label, test, got] of ROWS) check(label, test(now), got(now));

console.log(`\n— control: v8.51 (${CONTROL}) —`);
const old = run(OLD);
const mustFail = [0, 1, 3, 8, 9];
const oldFails = ROWS.map(([, test]) => !test(old));
check(`control: v8.51 fails the reset week, the card, the week after, the coach's step and the switch (${mustFail.length} rows)`,
  mustFail.every(i => oldFails[i]), ROWS.filter((_, i) => oldFails[i]).map(([l]) => l));
check('control: v8.51 passes the history row (it is unchanged)', !oldFails[10]);
check('history before the reset: the same week-3 target and walk back as v8.51',
  eq([now.history3, now.lastCompliantBefore3], [old.history3, old.lastCompliantBefore3]),
  { now: [now.history3, now.lastCompliantBefore3], old: [old.history3, old.lastCompliantBefore3] });
check('an exercise with no reset: identical targets and lock decisions to v8.51, weeks 2–6', eq(now.plain, old.plain),
  { now: now.plain, old: old.plain });

// BLOC's own two readers of the rule (index.html).
const html = readFileSync(join(repo, 'index.html'), 'utf8');
const oldHtml = execFileSync('git', ['show', `${CONTROL}:index.html`], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26 });
const preview = src => { const i = src.indexOf('function getSessionPreviewTarget('); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };
const homeReads = src => /BlocEngine\.progressionStartWeek\(ex\)/.test(preview(src)) && /BlocEngine\.lockAppliesFrom\(lock, ex\)/.test(preview(src));
const cardTag = src => /d\.progressionStart && macro\.publishedBy \? `<span class="ex-tag"[^`]*>New starting point from \$\{coachEsc\(coachFirstName\(\)\)\}<\/span>`/.test(src);
check('Home\'s next-session target reads the reset (start week, stale lock) as Train does', homeReads(html));
check('the card says "New starting point from {coach}" in a coach\'s reset week', cardTag(html));
check('control: v8.51\'s index.html has neither', !homeReads(oldHtml) && !cardTag(oldHtml));

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
