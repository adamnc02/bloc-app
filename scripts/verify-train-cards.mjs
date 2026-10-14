#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-train-cards.mjs — four Train card rules (v8.59, TECHNICAL §174)
//
// THE BUGS THIS PREVENTS:
//   · A drop set completed in one tap. The card's ✓ (auto-complete) filled every
//     set from its placeholders, the drop's reps included, so a drop that is
//     taken to failure was logged at last week's count. A drop set has no ✓ on
//     any cycle type, in any session; its sets are ticked by hand.
//     (v8.43 had removed it only in a drop set's first session.)
//   · ↑ Weight / ↑ Reps on a maintenance superset. A solo card hides the route
//     chips on maintenance (showProgSelector); the superset's own block did
//     not check the cycle type, so a cycle with no progression offered a choice
//     of progression.
//   · A superset card with no round counter. Every other card shows one dot per
//     set; the superset showed none. It now shows one per ROUND, filled only
//     when every member has that set ticked, and "n/N rounds".
//   · A finished card left open. Ticking the last set of an exercise or a
//     superset (a box, or the card's ✓) closes it. Only the tick that finishes
//     it: reopening a finished card, a redraw, or un-ticking leaves it alone.
//
// Each check runs on BLOC's own renderTrainDay and tick handlers, extracted
// from index.html, over the demo data. Control: v8.58's index.html and engine
// (commit 9fae4d3) must fail every one of the four.
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
  const { fns, doc } = T;

  // The demo's cycle, on session1m1, with a superset of its first two
  // exercises and a drop set added. Weeks 3+ cleared for these, no locks.
  const fresh = goalType => {
    const s = structuredClone(DEMO);
    const macro = s.macrocycles[0];
    macro.goalType = goalType;
    const list = s.exercises[macro.id + '_1_' + DAY];
    list[0].supersetId = 'ss_v'; list[0].supersetOrder = 0;
    list[1].supersetId = 'ss_v'; list[1].supersetOrder = 10;
    s.supersets = Object.assign({}, s.supersets, { ss_v: { name: null } });
    list.push({ id: 'ex_drop_v', name: 'Drop Curl', type: 'dropset', reps: '10', setsStart: 3, setsEnd: 3, startWeight: 20, order: 999, supersetId: null, supersetOrder: null });
    for (const k of Object.keys(s.trainLogs)) if (/_(3|4|5|6|7)_session1m1_/.test(k)) delete s.trainLogs[k];
    s.progressionLocks = {}; s.progressionTargets = {}; s.deloads = {};
    // the drop set's weeks 1 and 2, logged in full, so week 3 knows its drop
    for (const w of [1, 2]) for (let i = 0; i < 3; i++) s.trainLogs[`${macro.id}_${w}_${DAY}_ex_drop_v_${i}`] = { weight: '20', reps: '10', dropWeight: '12.5', dropReps: '8', done: true };
    s.currentMacroId = macro.id; s.currentDay = DAY; s.currentWeek = 3;
    T.setState(s);
    for (const k of Object.keys(T.expanded())) delete T.expanded()[k];
    return { s, macro, list };
  };
  const cardOf = (macro, exId) => trainCards(doc).find(c => c.includes(`id="ex-card-${macro.id}-${exId}"`)) || '';
  const ssCard = () => trainCards(doc).find(c => c.startsWith('<div class="card ex-card ex-card-ss')) || '';
  const isOpen = c => /^<div class="card ex-card[^"]*ex-card-open/.test(c);
  const logKey = (macro, week, exId, i) => `${macro.id}_${week}_${DAY}_${exId}_${i}`;

  // ── 1. A drop set has no ✓ ───────────────────────────────────────────
  for (const goal of ['loss', 'gain', 'maintenance']) {
    for (const week of [1, 3]) {
      const { macro } = fresh(goal);
      T.getState().currentWeek = week;
      fns.renderTrainDay(macro);
      const c = cardOf(macro, 'ex_drop_v');
      check(`drop set, ${goal} cycle, week ${week}: drawn, with no ✓ (auto-complete)`, [!!c, /ex-auto-btn/.test(c)], [true, false]);
    }
  }
  {
    // Maintenance: the demo's week-2 logs put this exercise On hold on a loss
    // cycle, and a held exercise has no ✓ by design.
    const { macro, list } = fresh('maintenance');
    fns.renderTrainDay(macro);
    check('a standard exercise still has its ✓', /ex-auto-btn/.test(cardOf(macro, list[2].id)), true);
  }
  check('quickFillCompleteDropset is gone', T.has('quickFillCompleteDropset'), false);

  // ── 2. No route chips on a maintenance superset ──────────────────────
  for (const [goal, want] of [['loss', true], ['gain', true], ['maintenance', false]]) {
    const { macro } = fresh(goal);
    T.expanded()[`${macro.id}_ss_3_${DAY}_ss_v`] = true;
    fns.renderTrainDay(macro);
    const c = ssCard();
    check(`superset, ${goal} cycle, week 3, expanded: route chips ${want ? 'shown' : 'hidden'}`, [isOpen(c), /ss-prog-toggles/.test(c)], [true, want]);
  }

  // ── 3. A superset's round dots ────────────────────────────────────────
  {
    const { s, macro, list } = fresh('loss');
    const rounds = T.E.getWeekSets(list[0], 3, macro.weeks);
    const dots = () => { const c = ssCard(); return [(c.match(/class="ex-dot(?: ex-dot-on)?"/g) || []).length, (c.match(/ex-dot-on/g) || []).length, (c.match(/(\d+\/\d+) rounds/) || [])[1] || null]; };
    fns.renderTrainDay(macro);
    check(`superset collapsed: ${rounds} round dots, none filled, "0/${rounds} rounds"`, dots(), [rounds, 0, `0/${rounds}`]);
    s.trainLogs[logKey(macro, 3, list[0].id, 0)] = { weight: '50', reps: '10', done: true };
    fns.renderTrainDay(macro);
    check('a round with one member ticked stays empty', dots(), [rounds, 0, `0/${rounds}`]);
    s.trainLogs[logKey(macro, 3, list[1].id, 0)] = { weight: '50', reps: '10', done: true };
    fns.renderTrainDay(macro);
    check('a round with every member ticked fills one dot', dots(), [rounds, 1, `1/${rounds}`]);
  }

  // ── 4. A card closes on its last set ─────────────────────────────────
  {
    const { s, macro, list } = fresh('loss');
    const solo = list[2], n = T.E.getWeekSets(solo, 3, macro.weeks);
    T.expanded()[`${macro.id}_3_${DAY}_${solo.id}`] = true;
    fns.renderTrainDay(macro);
    const seen = [];
    for (let i = 0; i < n; i++) {
      const k = logKey(macro, 3, solo.id, i);
      s.trainLogs[k] = { weight: '40', reps: '8' };
      fns.toggleSetDone(k);
      seen.push(isOpen(cardOf(macro, solo.id)));
    }
    check(`solo: open through set ${n - 1}, closed after set ${n} is ticked`, seen, [...Array(n - 1).fill(true), false]);
    fns.toggleExercise(`${macro.id}_3_${DAY}_${solo.id}`);
    fns.renderTrainDay(macro);
    check('solo: a finished card reopened stays open across a redraw', isOpen(cardOf(macro, solo.id)), true);
    const last = logKey(macro, 3, solo.id, n - 1);
    fns.toggleSetDone(last);
    check('solo: un-ticking a set leaves it open', isOpen(cardOf(macro, solo.id)), true);
    fns.toggleSetDone(last);
    check('solo: ticking it again closes it', isOpen(cardOf(macro, solo.id)), false);
  }
  {
    const { s, macro, list } = fresh('maintenance'); // no hold, so the ✓ is drawn
    const solo = list[2];
    T.expanded()[`${macro.id}_3_${DAY}_${solo.id}`] = true;
    fns.renderTrainDay(macro);
    const m = cardOf(macro, solo.id).match(/onclick="(quickFillComplete\([^"]*\))"/);
    if (m) new Function('quickFillComplete', 'event', m[1])(fns.quickFillComplete, null);
    check('solo: the card\'s ✓ closes it', [!!m, isOpen(cardOf(macro, solo.id))], [true, false]);
  }
  {
    const { s, macro, list } = fresh('loss');
    const rounds = T.E.getWeekSets(list[0], 3, macro.weeks);
    T.expanded()[`${macro.id}_ss_3_${DAY}_ss_v`] = true;
    fns.renderTrainDay(macro);
    const keys = [];
    for (let i = 0; i < rounds; i++) for (const m of [list[0], list[1]]) keys.push(logKey(macro, 3, m.id, i));
    const seen = keys.map(k => { s.trainLogs[k] = { weight: '50', reps: '10' }; fns.toggleSetDone(k); return isOpen(ssCard()); });
    check('superset: open until its last member\'s last set, then closed', [seen.slice(0, -1).every(Boolean), seen.at(-1)], [true, false]);
  }
  {
    const { s, macro } = fresh('loss');
    T.expanded()[`${macro.id}_3_${DAY}_ex_drop_v`] = true;
    fns.renderTrainDay(macro);
    for (let i = 0; i < 3; i++) {
      const k = logKey(macro, 3, 'ex_drop_v', i);
      s.trainLogs[k] = { weight: '20', reps: '10', dropWeight: '12.5', dropReps: '7' };
      fns.toggleSetDone(k);
    }
    check('drop set: closed once its last set (main and drop) is ticked', isOpen(cardOf(macro, 'ex_drop_v')), false);
  }
  return failures;
}

const failures = run('now', readFileSync(join(repo, 'index.html'), 'utf8'), readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8'));

console.log(`\n— control: v8.58 (${CONTROL}), which must fail —`);
const orig = console.log; const lines = []; console.log = s => lines.push(String(s));
let cf;
try { cf = run('v8.58', git('index.html'), git('engine/dist/bloc-engine.js')); } finally { console.log = orig; }
const failed = lines.filter(l => l.startsWith('✗'));
const want = [/drop set, maintenance cycle, week 3/, /superset, maintenance cycle/, /superset collapsed/, /solo: open through set/];
const missing = want.filter(re => !failed.some(l => re.test(l)));
if (cf > 0 && !missing.length) console.log(`✓ control: v8.58 fails ${cf} checks, including all four rules`);
else { console.log(`✗ control: v8.58 should fail all four rules (${cf} failed; missing ${missing.join(', ')})`); process.exitCode = 1; }

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
