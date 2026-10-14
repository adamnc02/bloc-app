#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-next-week-weight.mjs — Set next week's weight, on a maintenance cycle
// (v8.59, TECHNICAL §174)
//
// THE GAP THIS CLOSES, AND THE TRAPS IN IT:
//   · A maintenance cycle has no progression: next session suggests what was
//     logged this one, so an exercise found too easy could not be moved on.
//     The expanded card's "Set next week's weight" stores one weight on the
//     next session's progression entry (`plannedWeight`), and that session
//     suggests it on every set. Reps are untouched.
//   · It must be ONE answer everywhere. Train's set boxes and figure
//     (computeExerciseProgression), the week's compliance target
//     (computeRawSuggestedTargets → getWeekTargets) and Home's Up next
//     (getSessionPreviewTarget) are three paths; a planned weight read by one
//     and not another is §106's Home-vs-Train disagreement again.
//   · A week's target, once cached, is never recomputed. A weight set after
//     next week's target was cached would be suggested but not judged against,
//     so saving drops that week's cached entry.
//   · It is maintenance-only, and only where last week's actual would have been
//     the source: a deload still takes 60% of last week, and a loss cycle
//     ignores a stray value.
//   · Not with effort ratings on. With ratings on, a maintenance cycle takes the
//     cut/gain easy step after a compliant week rated 6 or lower (2× the
//     increment; heavy-leg 1.5× of 5 kg), and stays flat otherwise (7–8, 9+, a
//     skip, a miss), so the ratings move the weight: the button is gone and a
//     stored planned weight is ignored. With ratings off, maintenance stays flat.
//   · Offered only where it can be read: expanded, maintenance, not cardio, not
//     the cycle's last session, not when this or the next session is a deload,
//     and not once the next session has a set logged.
//
// Control: v8.58's engine and index.html (commit 9fae4d3) must fail: the
// engine ignores the stored weight and there is no button.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTrain, trainCards } from './train-harness.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL = '9fae4d3';
const git = f => execFileSync('git', ['show', `${CONTROL}:${f}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
const DEMO = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
const DAY = 'session1m1';

function run(label, html, engineSrc) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const T = buildTrain(html, engineSrc);
  const { fns, doc, E } = T;
  const pk = (macro, week, exId) => macro.id + '_prog_' + week + '_' + DAY + '_' + exId;
  const cache = s => ({ get: k => (s.progressionTargets || {})[k], set: (k, v) => { (s.progressionTargets ||= {})[k] = v; } });

  // Leg Press (standard, per side) on session1m1: weeks 3+ cleared, week 3
  // logged at 60 × 8 on every set, no locks, no deloads.
  const fresh = (goalType = 'maintenance') => {
    const s = structuredClone(DEMO);
    const macro = s.macrocycles[0];
    macro.goalType = goalType;
    const ex = s.exercises[macro.id + '_1_' + DAY][2];
    for (const k of Object.keys(s.trainLogs)) if (/_(3|4|5|6|7)_session1m1_/.test(k)) delete s.trainLogs[k];
    s.progressionLocks = {}; s.progressionTargets = {}; s.deloads = {};
    for (let i = 0; i < E.getWeekSets(ex, 3, macro.weeks); i++) s.trainLogs[`${macro.id}_3_${DAY}_${ex.id}_${i}`] = { weight: '60', reps: '8', done: true };
    s.currentMacroId = macro.id; s.currentDay = DAY; s.currentWeek = 3;
    T.setState(s);
    for (const k of Object.keys(T.expanded())) delete T.expanded()[k];
    return { s, macro, ex };
  };
  const plan = (s, macro, ex, week, v) => { s.trainLogs[pk(macro, week, ex.id)] = { plannedWeight: v }; };
  const prog = (s, macro, ex, week) => E.computeExerciseProgression(s, cache(s), macro, week, DAY, ex);
  const all = (arr, v) => arr.length > 0 && arr.every(x => x === v);

  // ── 1. The engine: one answer on every path ──────────────────────────
  {
    const { s, macro, ex } = fresh();
    check('no planned weight: week 4 suggests week 3\'s 60 on every set', all(prog(s, macro, ex, 4).weightPlaceholders, '60.0'), true);
    plan(s, macro, ex, 4, '62.5');
    const p = prog(s, macro, ex, 4);
    check('planned 62.5: Train\'s set boxes suggest 62.5 on every set', all(p.weightPlaceholders, '62.5'), true);
    check('planned 62.5: the card\'s figure (weightPlaceholder) and recommendedWeight', [p.weightPlaceholder, p.recommendedWeight], ['62.5', 62.5]);
    check('planned 62.5: reps are untouched (8 on every set)', all(p.repsPlaceholders, '8'), true);
    check('planned 62.5: the week\'s compliance target (computeRawSuggestedTargets)', all(E.computeRawSuggestedTargets(s, cache(s), macro, 4, DAY, ex).weightTargets, '62.5'), true);
    check('planned 62.5: getWeekTargets (fresh cache) agrees', all(E.getWeekTargets(s, cache(s), macro, 4, DAY, ex).weightTargets, '62.5'), true);
    s.currentWeek = 3;
    const home = fns.getSessionPreviewTarget ? fns.getSessionPreviewTarget(macro, 4, DAY, ex) : null;
    check('planned 62.5: Home\'s Up next (getSessionPreviewTarget) agrees', home && home.weight, '62.5');
    for (let i = 0; i < E.getWeekSets(ex, 4, macro.weeks); i++) s.trainLogs[`${macro.id}_4_${DAY}_${ex.id}_${i}`] = { weight: '62.5', reps: '8', done: true };
    check('week 4 logged at 62.5 is compliant (judged against the planned weight)', E.getWeekComplianceResult(s, cache(s), macro, 4, DAY, ex).compliant, true);
    check('week 5 carries the 62.5 that was logged (nothing planned for it)', all(prog(s, macro, ex, 5).weightPlaceholders, '62.5'), true);
  }
  {
    const { s, macro, ex } = fresh();
    plan(s, macro, ex, 4, '0');
    check('a planned 0 is a real weight', all(prog(s, macro, ex, 4).weightPlaceholders, '0.0'), true);
    for (const bad of ['', '  ', 'abc', '-5']) {
      plan(s, macro, ex, 4, bad);
      check(`a planned ${JSON.stringify(bad)} is none (60 stays)`, all(prog(s, macro, ex, 4).weightPlaceholders, '60.0'), true);
    }
  }
  {
    const { s, macro, ex } = fresh('loss');
    const before = prog(s, macro, ex, 4).weightPlaceholders.join('|');
    plan(s, macro, ex, 4, '62.5');
    check('a loss cycle ignores a stored planned weight', prog(s, macro, ex, 4).weightPlaceholders.join('|'), before);
  }
  {
    const { s, macro, ex } = fresh();
    plan(s, macro, ex, 4, '62.5');
    s.deloads[E.getDeloadUnitKey(macro, 4, DAY)] = true;
    check('a deload week takes 60% of last week, not the planned weight', prog(s, macro, ex, 4).weightPlaceholder !== '62.5' && prog(s, macro, ex, 4).isDeloadSession, true);
  }

  // ── 1b. Effort ratings on a maintenance cycle ────────────────────────
  {
    // Week 3 logged exactly at its own target, so it is compliant; rated `r`.
    const rated = (ex, r, opts = {}) => {
      const { s, macro } = fresh();
      macro.rpe = opts.rpeOn !== false;
      for (const k of Object.keys(s.trainLogs)) if (k.startsWith(`${macro.id}_3_${DAY}_${ex.id}_`)) delete s.trainLogs[k];
      const t = E.getWeekTargets(s, cache(s), macro, 3, DAY, ex);
      s.progressionTargets = {};
      for (let i = 0; i < E.getWeekSets(ex, 3, macro.weeks); i++) {
        const w = t.weightTargets[i] ?? t.weightTargets.at(-1), rp = t.repsTargets[i] ?? t.repsTargets.at(-1);
        s.trainLogs[`${macro.id}_3_${DAY}_${ex.id}_${i}`] = { weight: opts.miss && i === 0 ? String(parseFloat(w) - 5) : String(w), reps: String(rp), done: true };
      }
      s.rpe = { [`${macro.id}_3_${DAY}_${ex.id}`]: r };
      return { s, macro, w3: parseFloat(s.trainLogs[`${macro.id}_3_${DAY}_${ex.id}_1`].weight) };
    };
    const list = DEMO.exercises[DEMO.macrocycles[0].id + '_1_' + DAY];
    const light = list.find(e => !e.isHeavyLeg && e.category !== 'cardio' && e.type === 'standard');
    const heavy = list.find(e => e.isHeavyLeg && e.type === 'standard');
    const set2 = (s, macro, ex) => parseFloat(prog(s, macro, ex, 4).weightPlaceholders[1]);
    const step = (ex, r, opts) => { const { s, macro, w3 } = rated(ex, r, opts); return Math.round((set2(s, macro, ex) - w3) * 100) / 100; };
    const inc = parseFloat(DEMO.macrocycles[0].weightIncrement || '2.5');
    check(`ratings on, maintenance, rated 5 and compliant: ${light.name} steps up 2× the increment (${2 * inc} kg)`, step(light, { rpe: 5 }), 2 * inc);
    check(`ratings on, maintenance, rated 5 and compliant: ${heavy.name} (heavy leg) steps up 7.5 kg`, step(heavy, { rpe: 5 }), 7.5);
    check('…and the target it is judged against agrees (computeRawSuggestedTargets)', (() => { const { s, macro, w3 } = rated(light, { rpe: 5 }); return parseFloat(E.computeRawSuggestedTargets(s, cache(s), macro, 4, DAY, light).weightTargets[1]) - w3; })(), 2 * inc);
    for (const [why, r, opts] of [['rated 7', { rpe: 7 }], ['rated 9', { rpe: 9 }], ['skipped', { rpeSkipped: true }], ['rated 5 but a set missed', { rpe: 5 }, { miss: true }], ['rated 5, ratings off', { rpe: 5 }, { rpeOn: false }]]) {
      check(`maintenance, ${why}: flat`, step(light, r, opts), 0);
    }
    {
      const { s, macro } = rated(light, { rpe: 9 });
      check('maintenance, rated 9: no "hold" step kind (so no Holding tag)', E.computeRpeStepKind(s, cache(s), macro, 4, DAY, light), 'none');
    }
    {
      const { s, macro, w3 } = rated(light, { rpe: 7 });
      s.trainLogs[pk(macro, 4, light.id)] = { plannedWeight: String(w3 + 20) };
      check('ratings on: a stored planned weight is ignored', set2(s, macro, light), w3);
      s.currentWeek = 3; T.expanded()[`${macro.id}_3_${DAY}_${light.id}`] = true; fns.renderTrainDay(macro);
      const c = trainCards(doc).find(x => x.includes(`id="ex-card-${macro.id}-${light.id}"`)) || '';
      check('ratings on: no "Set next week\'s weight" button', /ex-next-wt-btn/.test(c), false);
    }
  }

  // ── 2. BLOC: the button, the sheet, the cache ────────────────────────
  const btnOf = (macro, ex) => {
    const c = trainCards(doc).find(x => x.includes(`id="ex-card-${macro.id}-${ex.id}"`)) || '';
    const m = c.match(/<button class="btn btn-accent btn-block ex-next-wt-btn"[^>]*>([^<]*)<\/button>/);
    return m ? m[1].trim() : null;
  };
  const render = (s, macro, ex, week, open = true) => {
    s.currentWeek = week;
    T.expanded()[`${macro.id}_${week}_${DAY}_${ex.id}`] = open;
    fns.renderTrainDay(macro);
    return btnOf(macro, ex);
  };
  {
    const { s, macro, ex } = fresh();
    check('maintenance, week 3, expanded: a filled accent "Set next week\'s weight" button', render(s, macro, ex, 3), "Set next week's weight");
    check('collapsed: no button', render(s, macro, ex, 3, false), null);
    // A cached target for week 4 that predates the planned weight (the trap).
    // The demo data ships such entries, and a post-deload walk-back writes
    // them; on a loss or gain cycle, visiting the week does.
    const cacheKey = `${macro.id}_${DAY}_${ex.id}_w4`;
    s.progressionTargets[cacheKey] = { weightTargets: ['72.5', '72.5', '72.5', '72.5'], repsTargets: ['8', '8', '8', '8'] };
    const cachedBefore = !!(s.progressionTargets || {})[cacheKey];
    render(s, macro, ex, 3);
    if (fns.openNextWeightSheet) fns.openNextWeightSheet(macro.id, ex.id);
    check('the sheet opens', T.opened(), ['modal-next-weight']);
    check('its hint is this week\'s set-1 weight, and the label says per side', [doc.els['next-weight-input'] && doc.els['next-weight-input'].placeholder, doc.els['next-weight-label'] && doc.els['next-weight-label'].textContent], ['60', 'Weight (kg per side)']);
    if (doc.els['next-weight-input']) doc.els['next-weight-input'].value = '62.5';
    if (fns.saveNextWeight) fns.saveNextWeight();
    check('Save stores "62.5" as week 4\'s plannedWeight', (s.trainLogs[pk(macro, 4, ex.id)] || {}).plannedWeight, '62.5');
    check('Save drops week 4\'s cached target (it was cached before)', [cachedBefore, !!(s.progressionTargets || {})[cacheKey]], [true, false]);
    check('the button then reads "Next week: 62.5 kg per side"', btnOf(macro, ex), 'Next week: 62.5 kg per side');
    if (fns.openNextWeightSheet) fns.openNextWeightSheet(macro.id, ex.id);
    check('reopened, the box holds 62.5', doc.els['next-weight-input'] && doc.els['next-weight-input'].value, '62.5');
    if (doc.els['next-weight-input']) doc.els['next-weight-input'].value = '-5';
    if (fns.saveNextWeight) fns.saveNextWeight();
    check('a negative weight is refused (nothing changes)', (s.trainLogs[pk(macro, 4, ex.id)] || {}).plannedWeight, '62.5');
    if (fns.clearNextWeight) fns.clearNextWeight();
    check('"Use last week\'s weight instead" removes it (and the empty entry)', s.trainLogs[pk(macro, 4, ex.id)] || null, null);
  }
  {
    const { s, macro, ex } = fresh('loss');
    check('a loss cycle has no button', render(s, macro, ex, 3), null);
  }
  {
    const { s, macro, ex } = fresh();
    s.trainLogs[`${macro.id}_4_${DAY}_${ex.id}_0`] = { weight: '60', reps: '8', done: true };
    check('no button once next week has a set logged', render(s, macro, ex, 3), null);
  }
  {
    const { s, macro, ex } = fresh();
    s.deloads[E.getDeloadUnitKey(macro, 4, DAY)] = true;
    check('no button when the next session is a deload', render(s, macro, ex, 3), null);
  }
  {
    const { s, macro, ex } = fresh();
    s.deloads[E.getDeloadUnitKey(macro, 3, DAY)] = true;
    check('no button in a deload session', render(s, macro, ex, 3), null);
  }
  {
    const { s, macro, ex } = fresh();
    check('no button on the cycle\'s last session', render(s, macro, ex, E.getMacroEffectiveMesoCount(macro)), null);
  }
  {
    const { s, macro } = fresh();
    const list = s.exercises[macro.id + '_1_' + DAY];
    list[0].supersetId = 'ss_v'; list[0].supersetOrder = 0; list[1].supersetId = 'ss_v'; list[1].supersetOrder = 10;
    s.supersets = Object.assign({}, s.supersets, { ss_v: { name: null } });
    s.currentWeek = 3; T.expanded()[`${macro.id}_ss_3_${DAY}_ss_v`] = true;
    fns.renderTrainDay(macro);
    const ss = trainCards(doc).find(c => c.startsWith('<div class="card ex-card ex-card-ss')) || '';
    const labels = [...ss.matchAll(/ex-next-wt-btn"[^>]*>([^<]*)<\/button>/g)].map(m => m[1].trim());
    check('a superset has one button per member, each naming it', labels, [`Set next week's weight · ${list[0].name}`, `Set next week's weight · ${list[1].name}`]);
  }
  return failures;
}

const failures = run('now', readFileSync(join(repo, 'index.html'), 'utf8'), readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8'));

console.log(`\n— control: v8.58 (${CONTROL}), which must fail —`);
const orig = console.log; const lines = []; console.log = s => lines.push(String(s));
let cf;
try { cf = run('v8.58', git('index.html'), git('engine/dist/bloc-engine.js')); } finally { console.log = orig; }
const failed = lines.filter(l => l.startsWith('✗'));
const want = [/Train's set boxes suggest 62\.5/, /compliance target/, /Home's Up next/, /a filled accent/, /drops week 4's cached target/, /steps up 2× the increment/];
const missing = want.filter(re => !failed.some(l => re.test(l)));
if (cf > 0 && !missing.length) console.log(`✓ control: v8.58 fails ${cf} checks, including Train, the target, Home, the button and the cache`);
else { console.log(`✗ control: v8.58 should fail Train, the target, Home, the button and the cache (${cf} failed; missing ${missing.join(', ')})`); process.exitCode = 1; }

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
