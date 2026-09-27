#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-engine-leaves.mjs — the pure leaves moved into the engine in v8.34
// give exactly what they gave before
//
// THE BUG THIS PREVENTS: a function that moved "unchanged" and didn't. The
// plausible ways, all silent in the UI until a number is off:
//   · a shim that drops or reorders an argument (getWeekWeight without its
//     weightIncrement still returns a weight, just the 2.5 default's);
//   · a TypeScript port that "tidies" a falsy test, a regex or a template
//     literal (the prompts are behaviour: §118);
//   · the new EngineContext not reaching macroRange/findMacroClash, so an
//     unstarted cycle's range ends from the wrong "today".
// v8.34 (TECHNICAL §124, PROMPT-03 Phase 2 step 3) moved 43 functions and
// four constants behind
// same-named shims. The golden harness (§118) reaches most of them only
// through larger functions, and not every branch (a partial extension
// mesocycle, each of resolveNextCycleOverride's outcomes).
//
// So this runs the REAL v8.33 functions (git show 8598830, with v8.33's own
// engine build) and today's index.html shims + build side by side, and
// requires identical output, key order included, for:
//   · every case in scripts/engine-cases.mjs (the same inputs
//     verify-engine-pure.mjs uses), and the arguments afterwards;
//   · every day of 2026 and 2027 through the date leaves;
//   · every demo exercise × week 1–16 × progression type × goal type ×
//     increment through the progression leaves;
// in London, New York and Auckland, each in its own process (TZ is fixed
// once per process).
//
// Controls (London), each must move an output: the getWeekWeight shim
// without weightIncrement, and a macroRange shim given the wrong today.
//
// v8.35 (§125, PROMPT-03 Phase 2 steps 4–6): the functions that READ THE STATE
// moved too, and BLOC's shims pass `state` and engineCtx(). For those, the
// "before" is v8.34 (8c6451c), and every STATE_CASES entry in
// engine-cases.mjs runs through BLOC's own call on both sides, on a fresh
// state, on the real clock and on the Demo Tour's anchor: the result, the
// state afterwards, the save() count, the page globals and any HTML written
// must be identical. Controls: a getActiveGoal shim given the wrong today, and
// Home's "bad" badge mapped to green.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';
import { LEAF_CASES, CTX_LAST, STATE_CASES } from './engine-cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const V833 = '8598830';
// v8.35 (§125): the state readers (steps 4–6) are compared with the last
// version in which they were still index.html's own code: v8.34.
const V834 = '8c6451c';
const ZONES = ['Europe/London', 'America/New_York', 'Pacific/Auckland'];
const NAMES = Object.keys(LEAF_CASES);

const VARIANTS = {
  current: s => s,
  dropArg: s => s.replace('return BlocEngine.getWeekWeight(ex, week, progType, goalType, weightIncrement);',
    'return BlocEngine.getWeekWeight(ex, week, progType, goalType);'),
  wrongToday: s => s.replace('return BlocEngine.macroRange(m, engineCtx());', "return BlocEngine.macroRange(m, { today: '2000-01-03' });"),
  // v8.35 (§125): a state reader's shim handed the wrong "today", and the
  // Home badge's "bad" mapped to the wrong colour (callers test the colour).
  staleGoal: s => s.replace('return BlocEngine.getActiveGoal(state, engineCtx());', "return BlocEngine.getActiveGoal(state, { today: '2000-01-03' });"),
  badColour: s => s.replace("bad: 'var(--red)' };", "bad: 'var(--green)' };"),
};

// ── Child: one timezone, one variant ─────────────────────────────────────
if (process.env.BLOC_LEAVES_CHILD) {
  const variant = process.env.BLOC_LEAVES_CHILD;
  const git = path => execFileSync('git', ['show', `${V833}:${path}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
  const git34 = path => execFileSync('git', ['show', `${V834}:${path}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
  const oldSrc = mainScript(git('index.html'));
  const curSrc = mainScript(readFileSync(join(repo, 'index.html'), 'utf8'));
  const newSrc = VARIANTS[variant](curSrc);
  if (variant !== 'current' && newSrc === curSrc) {
    console.log(JSON.stringify({ error: `variant ${variant} did not apply` })); process.exit(0);
  }
  const engineOf = dist => vm.runInNewContext(`${dist}\n;BlocEngine`, {});
  const OLD_ENGINE = engineOf(git('engine/dist/bloc-engine.js'));
  const NEW_ENGINE = engineOf(readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8'));

  const RealDate = Date;
  const fixedAt = today => {
    const ms = new RealDate(today + 'T12:00:00').getTime();
    return class extends RealDate {
      constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
      static now() { return ms; }
    };
  };
  const build = (src, engine) => {
    const { decls } = indexTopLevel(src);
    const parts = closure(decls, NAMES);
    const body = `${parts.map(p => p.text).join('\n')}
      return { ${NAMES.map(n => `${n}: () => ${n}`).join(', ')} };`;
    return D => new Function('Date', 'BlocEngine', body)(D, engine);
  };
  const makeOld = build(oldSrc, OLD_ENGINE), makeNew = build(newSrc, NEW_ENGINE);

  // Ordered, lossless: keys in their own order, undefined/NaN/Infinity/Date spelled out.
  const ser = v => {
    if (v === undefined) return 'undefined';
    if (typeof v === 'number' && !Number.isFinite(v)) return String(v);
    if (v && typeof v.getTime === 'function' && Object.prototype.toString.call(v) === '[object Date]') return `D:${v.getTime()}`;
    if (Array.isArray(v)) return `[${v.map(ser).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).map(k => `${JSON.stringify(k)}:${ser(v[k])}`).join(',')}}`;
    return JSON.stringify(v);
  };
  const call = (E, name, args) => {
    const f = E[name]();
    try { return ser(typeof f === 'function' ? f(...args) : f); } catch (e) { return `threw ${e.constructor.name}: ${e.message}`; }
  };

  let runs = 0, diffs = 0, throws = 0;
  const firstDiffs = [], firstThrows = [];
  const compare = (label, name, mkArgs, today = '2026-08-02') => {
    const D = fixedAt(today);
    const O = makeOld(D), N = makeNew(D);
    const a1 = mkArgs(), a2 = mkArgs();
    const o = call(O, name, a1) + ' | args ' + ser(a1);
    const n = call(N, name, a2) + ' | args ' + ser(a2);
    runs++;
    // Both sides throwing alike would "agree" and prove nothing: no case throws.
    if (o.startsWith('threw') || n.startsWith('threw')) { throws++; if (firstThrows.length < 3) firstThrows.push(`${label}: ${o.slice(0, 120)} / ${n.slice(0, 120)}`); }
    if (o !== n) {
      diffs++;
      if (firstDiffs.length < 3) firstDiffs.push(`${label}\n      v8.33: ${o.slice(0, 220)}\n      now:   ${n.slice(0, 220)}`);
    }
  };

  // A control needs only the section its variant touches (a leaf shim or a
  // state reader's), so each runs just that one.
  const only = process.env.BLOC_LEAVES_ONLY || '';
  if (only !== 'state') {
  // 1. Every shared case. BLOC's macroRange/findMacroClash shims keep the old
  //    signature, so their ctx is dropped and becomes the clock's today.
  for (const [name, cases] of Object.entries(LEAF_CASES)) {
    if (!cases.length) { compare(`${name} (constant)`, name, () => []); continue; }
    cases.forEach((mk, i) => {
      if (CTX_LAST.has(name)) {
        const today = mk().at(-1).today;
        compare(`${name} #${i + 1}`, name, () => mk().slice(0, -1), today);
      } else compare(`${name} #${i + 1}`, name, mk);
    });
  }

  // 2. The date leaves, every day of 2026 and 2027.
  for (let d = new RealDate(2026, 0, 1); d <= new RealDate(2027, 11, 31); d.setDate(d.getDate() + 1)) {
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const name of ['snapToNextMonday', 'getDayBefore', 'getHomeIsoDow']) compare(`${name}(${s})`, name, () => [s]);
    for (const n of [-30, -7, -1, 1, 7, 30]) compare(`shiftDateStr(${s}, ${n})`, 'shiftDateStr', () => [s, n]);
    for (const b of ['2026-03-29', '2026-10-25', '2027-03-28', '2027-10-31']) compare(`dayDiff(${s}, ${b})`, 'dayDiff', () => [s, b]);
  }

  // 3. The progression leaves, over every exercise in the demo data.
  const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
  const exercises = Object.values(demo.exercises).flat().filter(Boolean);
  for (const ex of exercises) {
    for (let week = 1; week <= 16; week++) {
      compare(`getWeekSets(${ex.id}, ${week})`, 'getWeekSets', () => [structuredClone(ex), week, 12]);
      for (const goalType of ['loss', 'gain', 'maintenance', undefined]) {
        compare(`getGiantSetProgression(${ex.id}, ${week}, ${goalType})`, 'getGiantSetProgression', () => [structuredClone(ex), week, goalType]);
        for (const progType of ['weight', 'reps', 'none']) {
          compare(`getWeekReps(${ex.id}, ${week}, ${progType}, ${goalType})`, 'getWeekReps', () => [structuredClone(ex), week, progType, goalType]);
          for (const inc of ['2.5', '5', 1.25, undefined]) {
            compare(`getWeekWeight(${ex.id}, ${week}, ${progType}, ${goalType}, ${inc})`, 'getWeekWeight', () => [structuredClone(ex), week, progType, goalType, inc]);
          }
        }
      }
    }
  }

  }
  if (only !== 'leaves') {
  // 4. v8.35 (§125): the functions that read the state, through BLOC's own
  //    call. v8.34's index.html (with v8.34's engine) and today's, each built
  //    ONCE with a settable clock, and each case run on a fresh state in both:
  //    the result, the state afterwards, the save() count, the page globals
  //    the case names and any HTML written must all be identical. Every case
  //    runs twice: on the real clock, and with the Demo Tour's anchor set
  //    (the clock a year away), because BLOC's "today" comes from either.
  const stateNames = [...new Set(Object.entries(STATE_CASES).flatMap(([n, cs]) => cs.map(mk => { const c = mk(); return c.bloc ? (c.bloc.fn || n) : null; })).filter(Boolean))];
  const HANDLES = ['state', '_tourAnchorDate', 'progressViewMacroId', '_nextCycleOverride', '_nextCyclePreviewMacroId', '_homeHeroCache'];
  const clock = { ms: 0 };
  const ClockDate = class extends RealDate {
    constructor(...a) { if (a.length === 0) super(clock.ms); else super(...a); }
    static now() { return clock.ms; }
  };
  const buildStateSide = (src, engine) => {
    const { decls } = indexTopLevel(src);
    const parts = closure(decls, stateNames, new Set(['save']));
    const have = new Set(parts.map(p => p.name));
    const handles = HANDLES.filter(h => have.has(h));
    const body = `
      let __saves = 0;
      function save() { __saves++; }
      ${parts.map(p => p.text).join('\n')}
      return {
        fns: { ${stateNames.join(', ')} },
        get: { ${handles.map(h => `${h}: () => ${h}`).join(', ')} },
        set: { ${handles.map(h => `${h}: v => { ${h} = v; }`).join(', ')} },
        saves: () => __saves, reset: () => { __saves = 0; },
      };`;
    return new Function('Date', 'document', 'BlocEngine', body);
  };
  const OLD34_ENGINE = engineOf(git34('engine/dist/bloc-engine.js'));
  const makeDoc = () => { const els = {}; return { els, body: { setAttribute() {} }, getElementById: id => (els[id] ||= { id, innerHTML: '' }) }; };
  const docOld = makeDoc(), docNew = makeDoc();
  const O34 = buildStateSide(mainScript(git34('index.html')), OLD34_ENGINE)(ClockDate, docOld, OLD34_ENGINE);
  const N34 = buildStateSide(newSrc, NEW_ENGINE)(ClockDate, docNew, NEW_ENGINE);
  const runState = (E, doc, name, c, tour) => {
    for (const k of Object.keys(doc.els)) delete doc.els[k];
    E.reset();
    clock.ms = new RealDate((tour ? '2031-01-15' : c.today) + 'T12:00:00').getTime();
    E.set.state(c.s);
    if (E.set._tourAnchorDate) E.set._tourAnchorDate(tour ? c.today : null);
    for (const h of HANDLES.slice(2)) if (E.set[h]) E.set[h](null);
    for (const [g, v] of Object.entries(c.bloc.globals || {})) E.set[g](v);
    let out;
    try { out = ser(E.fns[c.bloc.fn || name](...c.bloc.args)); } catch (e) { out = `threw ${e.constructor.name}: ${e.message}`; }
    // The state as save() would write it: JSON.stringify, key order and all
    // (and native, so ~9,000 of them stay fast).
    const after = JSON.stringify(E.get.state());
    const reads = (c.bloc.read || []).map(g => ser(E.get[g]())).join(' | ');
    const html = Object.values(doc.els).map(el => `${el.id}=${el.innerHTML}`).join(' | ');
    return `${out} || state ${after} || saves ${E.saves()} || read ${reads} || html ${html}`;
  };
  for (const [name, cases] of Object.entries(STATE_CASES)) {
    if (!cases.length) {
      // A constant: the engine's value against v8.34's own declaration.
      const { decls } = indexTopLevel(mainScript(git34('index.html')));
      const d = decls.get(name);
      const oldVal = d ? new Function(`${d.text}\nreturn ${name};`)() : undefined;
      runs++;
      if (ser(oldVal) !== ser(NEW_ENGINE[name])) { diffs++; firstDiffs.push(`${name} (constant): v8.34 ${ser(oldVal)} now ${ser(NEW_ENGINE[name])}`); }
      continue;
    }
    cases.forEach((mk, i) => {
      if (!mk().bloc) return; // engine only: verify-engine-pure checks it
      for (const tour of [false, true]) {
        const o = runState(O34, docOld, name, mk(), tour);
        const n = runState(N34, docNew, name, mk(), tour);
        runs++;
        if (o.startsWith('threw') || n.startsWith('threw')) { throws++; if (firstThrows.length < 3) firstThrows.push(`${name} #${i + 1}: ${o.slice(0, 120)} / ${n.slice(0, 120)}`); }
        if (o !== n) {
          diffs++;
          if (firstDiffs.length < 3) {
            let k = 0; while (k < o.length && o[k] === n[k]) k++;
            firstDiffs.push(`${name} #${i + 1}${tour ? ' (tour)' : ''} differs at char ${k}\n      v8.34: …${o.slice(Math.max(0, k - 80), k + 140)}\n      now:   …${n.slice(Math.max(0, k - 80), k + 140)}`);
          }
        }
      }
    });
  }

  }

  console.log(JSON.stringify({ runs, diffs, firstDiffs, throws, firstThrows }));
  process.exit(0);
}

// ── Parent: every zone, then the controls ─────────────────────────────────
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
// Every child is independent (its own zone or variant, its own process), so
// they run in parallel: the sweep waits for the slowest, not for the sum.
function run(zone, variant, only = '') {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, TZ: zone, BLOC_LEAVES_CHILD: variant, BLOC_LEAVES_ONLY: only } });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', () => {
      try { resolve(JSON.parse(stdout.trim().split('\n').pop())); }
      catch { resolve({ error: (stderr || stdout).trim().split('\n').slice(0, 3).join(' / ') }); }
    });
  });
}

const [zones, drop, wrong, stale, colour] = await Promise.all([
  Promise.all(ZONES.map(zone => run(zone, 'current'))),
  run('Europe/London', 'dropArg', 'leaves'),
  run('Europe/London', 'wrongToday', 'leaves'),
  run('Europe/London', 'staleGoal', 'state'),
  run('Europe/London', 'badColour', 'state'),
]);
ZONES.forEach((zone, k) => {
  const r = zones[k];
  check(`${zone}: v8.33 and the engine agree on all ${NAMES.length} leaves, and v8.34 and today on all ${Object.keys(STATE_CASES).length} state readers (${r.runs || 0} runs)`, !r.error && r.runs > 10000 && r.diffs === 0,
    r.error || (r.firstDiffs || []).join('\n    '));
  check(`${zone}: no run threw, on either side`, !r.error && r.throws === 0, (r.firstThrows || []).join('\n    '));
});
check(`control: a getWeekWeight shim that drops weightIncrement is caught (${drop.diffs || 0} runs differ)`, !drop.error && drop.diffs > 0, drop.error);
check(`control: a macroRange shim given the wrong today is caught (${wrong.diffs || 0} runs differ)`, !wrong.error && wrong.diffs > 0, wrong.error);
check(`control: a getActiveGoal shim given the wrong today is caught (${stale.diffs || 0} runs differ)`, !stale.error && stale.diffs > 0, stale.error);
check(`control: Home's "bad" badge mapped to green is caught (${colour.diffs || 0} runs differ)`, !colour.error && colour.diffs > 0, colour.error);

// ── v8.35 (§125): computeHomeWeek's weekClosed, which BLOC never passes ──
// Coach judges a client's PAST week with it. There is no v8.34 to compare
// with, so check what it means: judged from any day of a week, a closed week
// equals Home's own judgment on that week's Sunday whenever Sunday is logged
// (its fields then have no day left, so Home already treats the week as over).
// And the reason it exists: with Sunday NOT logged, Home's own Sunday
// judgment is still in pace mode (Sunday counts as a day left) — the closed
// judgment isn't, which the control below requires.
{
  const E = vm.runInNewContext(`${readFileSync(join(repo, 'engine', 'dist', 'bloc-engine.js'), 'utf8')}\n;BlocEngine`, {});
  const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));
  const judged = w => w.metrics.map(m => `${m.field}:${m.avg}:${m.badge.label}:${m.badge.status}:${m.badge.weekOver}`).join(' ');
  let weeks = 0, same = 0;
  for (let d = new Date('2026-06-08T12:00:00'); d <= new Date('2026-08-02T12:00:00'); d.setDate(d.getDate() + 7)) {
    const monday = d.toLocaleDateString('en-CA');
    const sunday = E.shiftDateStr(monday, 6);
    const natural = judged(E.computeHomeWeek(demo, { today: sunday }));
    const fromEachDay = [0, 1, 2, 3, 4, 5, 6].map(k => judged(E.computeHomeWeek(demo, { today: E.shiftDateStr(monday, k) }, { weekClosed: true })));
    weeks++;
    if (fromEachDay.every(x => x === natural)) same++;
  }
  check(`weekClosed: a closed week, judged from any of its days, equals Home's own Sunday judgment (${same} of ${weeks} demo weeks, Sunday logged)`, weeks >= 8 && same === weeks);
  const sundayGone = structuredClone(demo);
  sundayGone.bodyLogs = sundayGone.bodyLogs.filter(l => l.date !== '2026-07-26');
  sundayGone.nutritionLogs = sundayGone.nutritionLogs.filter(l => l.date !== '2026-07-26');
  delete sundayGone.nutritionMeals['2026-07-26'];
  const open = E.computeHomeWeek(sundayGone, { today: '2026-07-26' });
  const closed = E.computeHomeWeek(sundayGone, { today: '2026-07-22' }, { weekClosed: true });
  check('control: with Sunday unlogged, Home on Sunday still judges the week in pace mode, and weekClosed does not',
    open.metrics.every(m => !m.badge.weekOver) && closed.metrics.filter(m => m.badge.status !== 'noData').every(m => m.badge.weekOver)
    && closed.metrics.some(m => m.badge.status !== 'noData'));
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
