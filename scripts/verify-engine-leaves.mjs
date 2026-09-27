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
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';
import { LEAF_CASES, CTX_LAST } from './engine-cases.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const V833 = '8598830';
const ZONES = ['Europe/London', 'America/New_York', 'Pacific/Auckland'];
const NAMES = Object.keys(LEAF_CASES);

const VARIANTS = {
  current: s => s,
  dropArg: s => s.replace('return BlocEngine.getWeekWeight(ex, week, progType, goalType, weightIncrement);',
    'return BlocEngine.getWeekWeight(ex, week, progType, goalType);'),
  wrongToday: s => s.replace('return BlocEngine.macroRange(m, engineCtx());', "return BlocEngine.macroRange(m, { today: '2000-01-03' });"),
};

// ── Child: one timezone, one variant ─────────────────────────────────────
if (process.env.BLOC_LEAVES_CHILD) {
  const variant = process.env.BLOC_LEAVES_CHILD;
  const git = path => execFileSync('git', ['show', `${V833}:${path}`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
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
function run(zone, variant) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, TZ: zone, BLOC_LEAVES_CHILD: variant }, encoding: 'utf8', maxBuffer: 16 << 20 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { error: (r.stderr || r.stdout).trim().split('\n').slice(0, 3).join(' / ') }; }
}

for (const zone of ZONES) {
  const r = run(zone, 'current');
  check(`${zone}: v8.33 and the engine agree on all ${NAMES.length} leaves (${r.runs || 0} runs)`, !r.error && r.runs > 10000 && r.diffs === 0,
    r.error || (r.firstDiffs || []).join('\n    '));
  check(`${zone}: no run threw, on either side`, !r.error && r.throws === 0, (r.firstThrows || []).join('\n    '));
}

const drop = run('Europe/London', 'dropArg');
check(`control: a getWeekWeight shim that drops weightIncrement is caught (${drop.diffs || 0} runs differ)`, !drop.error && drop.diffs > 0, drop.error);
const wrong = run('Europe/London', 'wrongToday');
check(`control: a macroRange shim given the wrong today is caught (${wrong.diffs || 0} runs differ)`, !wrong.error && wrong.diffs > 0, wrong.error);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
