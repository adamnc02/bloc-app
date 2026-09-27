#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-engine-clock.mjs — the date helpers moved into the engine give
// exactly what they gave before, in every timezone, at every time of day
//
// THE BUG THIS PREVENTS: a "pure" date function that is right in London at
// noon and wrong at 23:30, in New York, or on the night the clocks change.
// v8.33 (TECHNICAL §123) moved toLocalDateStr, the week and Monday helpers,
// getNextMonday, getMacroDurationWeeks and getMacroEndDate into the engine,
// with "today" passed in (EngineContext) instead of read from the clock.
// The golden harness (§118) only runs in Europe/London at noon, and date
// bugs live at midnight, across DST, and away from UTC.
//
// So this runs the REAL v8.31 functions (git show 3fb1c3f) and today's
// index.html shims + engine build side by side, and requires identical
// output, for:
//   · six timezones (London, New York, Lord Howe's 30-minute DST, Auckland,
//     Kolkata's +5:30, UTC), each in its own process, because TZ is fixed
//     once per process;
//   · every day from 25 Dec 2025 to 5 Jan 2028, at 00:00:30, 01:30, 12:00
//     and 23:59:59.999 local;
//   · the Demo Tour anchor on (that day) and off.
//
// 🚨 getMacroEndDate is the subtle one. With no macro.start, the old code
//    started from now(), so its Date carried the current TIME of day unless
//    the tour anchor was set. The shim keeps that; the control below is the
//    tidy "midnight" version and must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const ZONES = ['Europe/London', 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Asia/Kolkata', 'UTC'];
const SEEDS = ['toLocalDateStr', 'getLocalToday', 'getHomeWeekStart', 'getWeekDates', 'getSundayAfterWeeks',
  'getMondayAfter', 'getNextMonday', 'getMacroDurationWeeks', 'getMacroEndDate'];

// Variants of today's source for the controls: each must CHANGE some output.
const VARIANTS = {
  current: s => s,
  // The tidy shim: midnight, dropping the time of day a start-less macro carried.
  midnightShim: s => s.replace('  if (!macro.start) end.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), t.getMilliseconds());\n', ''),
  // The classic UTC mistake, in the shim that every date passes through.
  isoToLocal: s => s.replace('return BlocEngine.toLocalDateStr(d);', "return d.toISOString().split('T')[0];"),
};

// ── Child: one timezone, compare old with a variant of new ────────────────
if (process.env.BLOC_CLOCK_CHILD) {
  await import('./engine-global.mjs');
  const RealDate = Date;
  const build = src => {
    const { decls } = indexTopLevel(src);
    const parts = closure(decls, SEEDS);
    const body = `${parts.map(p => p.text).join('\n')}
      return { fns: { ${SEEDS.join(', ')} }, anchor: v => { _tourAnchorDate = v; } };`;
    return D => new Function('Date', 'BlocEngine', body)(D, globalThis.BlocEngine);
  };
  const oldSrc = mainScript(execFileSync('git', ['show', '3fb1c3f:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 }));
  const newSrc = VARIANTS[process.env.BLOC_CLOCK_CHILD](mainScript(readFileSync(join(repo, 'index.html'), 'utf8')));
  if (process.env.BLOC_CLOCK_CHILD !== 'current' && newSrc === mainScript(readFileSync(join(repo, 'index.html'), 'utf8'))) {
    console.log(JSON.stringify({ error: `variant ${process.env.BLOC_CLOCK_CHILD} did not apply` })); process.exit(0);
  }
  const makeOld = build(oldSrc), makeNew = build(newSrc);
  const fixed = ms => class extends RealDate {
    constructor(...a) { if (a.length === 0) super(ms); else super(...a); }
    static now() { return ms; }
  };
  const show = v => v instanceof RealDate ? `D:${v.getTime()}` : JSON.stringify(v);
  const MACROS = [
    { id: 'a', start: null, weeks: 4 }, { id: 'b', weeks: 3, weeksPerMeso: 2, extensionWeeks: 3 }, { id: 'c', start: 'garbage', weeks: 2 },
  ];
  let runs = 0, diffs = 0;
  const firstDiffs = [];
  for (let d = new RealDate(2025, 11, 25); d <= new RealDate(2028, 0, 5); d.setDate(d.getDate() + 1)) {
    for (const [h, mi, s, ms] of [[0, 0, 30, 0], [1, 30, 0, 0], [12, 0, 0, 0], [23, 59, 59, 999]]) {
      const inst = new RealDate(d.getFullYear(), d.getMonth(), d.getDate(), h, mi, s, ms);
      const day = `${inst.getFullYear()}-${String(inst.getMonth() + 1).padStart(2, '0')}-${String(inst.getDate()).padStart(2, '0')}`;
      for (const anchored of [false, true]) {
        const D = fixed(inst.getTime());
        const O = makeOld(D), N = makeNew(D);
        if (anchored) { O.anchor(day); N.anchor(day); }
        const out = E => {
          const f = E.fns;
          const today = f.getLocalToday();
          const ws = f.getHomeWeekStart(today);
          const r = [f.toLocalDateStr(new D()), today, f.getNextMonday(), ws, f.getWeekDates(ws),
            f.getSundayAfterWeeks(today, 1), f.getSundayAfterWeeks(ws, 6), f.getSundayAfterWeeks(ws, 13), f.getMondayAfter(today)];
          for (const m of [...MACROS, { id: 'd', start: ws, weeks: 6, weeksPerMeso: 2 }, { id: 'e', start: ws }]) {
            r.push(f.getMacroDurationWeeks(m), f.getMacroEndDate(m));
          }
          return r.map(show);
        };
        const a = out(O), b = out(N);
        runs++;
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          diffs++;
          if (firstDiffs.length < 2) {
            const i = a.findIndex((x, k) => x !== b[k]);
            firstDiffs.push(`${inst.toString()} anchored=${anchored} item ${i}: v8.31 ${a[i]} now ${b[i]}`);
          }
        }
      }
    }
  }
  console.log(JSON.stringify({ runs, diffs, firstDiffs }));
  process.exit(0);
}

// ── Parent: every zone × every variant ─────────────────────────────────────
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
function run(zone, variant) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, TZ: zone, BLOC_CLOCK_CHILD: variant }, encoding: 'utf8', maxBuffer: 16 << 20 });
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { error: (r.stderr || r.stdout).trim().split('\n').slice(0, 3).join(' / ') }; }
}

for (const zone of ZONES) {
  const r = run(zone, 'current');
  check(`${zone}: v8.31 and the engine agree (${r.runs || 0} runs: ${(r.runs || 0) / 2} instants, tour anchor on and off)`, !r.error && r.runs > 5000 && r.diffs === 0,
    r.error || r.firstDiffs.join('\n    '));
}

// Controls: each must move at least one output somewhere.
const midnight = ZONES.map(z => run(z, 'midnightShim'));
check(`control: a getMacroEndDate shim that drops the time of day is caught (${midnight.reduce((n, r) => n + (r.diffs || 0), 0)} instants differ)`,
  midnight.every(r => !r.error) && midnight.some(r => r.diffs > 0), midnight.map(r => r.error).filter(Boolean).join(' / '));
const iso = ZONES.map(z => [z, run(z, 'isoToLocal')]);
const isoMoved = iso.filter(([, r]) => r.diffs > 0).map(([z]) => z);
check(`control: toLocalDateStr via toISOString (UTC) is caught away from UTC (${isoMoved.join(', ')})`,
  iso.every(([, r]) => !r.error) && isoMoved.includes('America/New_York') && isoMoved.includes('Pacific/Auckland') && !isoMoved.includes('UTC'),
  iso.map(([, r]) => r.error).filter(Boolean).join(' / '));

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
