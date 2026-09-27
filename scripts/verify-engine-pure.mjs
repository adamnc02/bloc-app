#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-engine-pure.mjs — the engine never writes to its input, and never
// reads the clock
//
// THE BUGS THIS PREVENTS: Coach running BLOC's engine over a client's
// uploaded state and quietly changing it; and Coach evaluating a client in
// New York against the COACH's "today" in London (deep dive §2b).
//
// The first: Before PROMPT-03 Phase 2 the
// engine wrote while it read (deep dive §3, H1–H8): getWeekTargets filled
// progressionTargets on first read, evaluateProgressionLock wrote locks and
// saved, ensureStateDefaults filled `state` in place. In BLOC that is how the
// app works; in Coach it would invent targets and locks the client never
// evaluated. So every function in engine/ is pure, and the BLOC shims do the
// writing (TECHNICAL §122).
//
// How: every export of the COMMITTED build runs over the demo state wrapped
// in a write-trapping Proxy, which records any set, defineProperty or delete
// at any depth, and refuses it. A Proxy, not Object.freeze: a write to a
// frozen object from sloppy-mode code is silently ignored, so a freeze-based
// test would pass while the function computed from a write that never
// landed. The Proxy sees the attempt either way.
//
// The second: "today" reaches the engine only as a parameter (EngineContext,
// from the clock step, v8.33). So every case also runs in a context whose `new Date()` (no
// arguments) and `Date.now()` throw. `new Date(str)` stays real: turning a
// date string into a Date is arithmetic, not a clock read.
//
// 🚨 Every export must have a case below, or this fails. Moving a function
//    into the engine means adding its case here in the same change.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { LEAF_CASES } from './engine-cases.mjs';

process.env.TZ = 'Europe/London';
const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

const DIST = readFileSync(join(repo, 'engine/dist/bloc-engine.js'), 'utf8');
const E = vm.runInNewContext(`${DIST}\n;BlocEngine`, {});
// The same build, in a context where reading the clock throws.
const CLOCK_TRAP = `{
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...a) { if (a.length === 0) throw new Error('read the clock: new Date()'); super(...a); }
    static now() { throw new Error('read the clock: Date.now()'); }
  };
}`;
const loadTrapped = dist => vm.runInNewContext(`${CLOCK_TRAP}\n${dist}\n;BlocEngine`, {});
const EC = loadTrapped(DIST);
const demo = () => JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));

// Wraps `target` so that any write, at any depth, is recorded in `writes` and
// NOT applied. Children are wrapped on read, once each (so identity holds).
function guard(target, writes, path = 'input') {
  const seen = new WeakMap();
  const wrap = (t, p) => {
    if (t === null || typeof t !== 'object') return t;
    // A Date can't be proxied (its methods check the real object); a write
    // to one (setDate) is caught by the before/after JSON comparison instead.
    if (Object.prototype.toString.call(t) === '[object Date]') return t;
    if (seen.has(t)) return seen.get(t);
    const px = new Proxy(t, {
      get: (o, k, r) => wrap(Reflect.get(o, k, r), `${p}.${String(k)}`),
      set: (o, k) => { writes.push(`set ${p}.${String(k)}`); return true; },
      defineProperty: (o, k) => { writes.push(`define ${p}.${String(k)}`); return true; },
      deleteProperty: (o, k) => { writes.push(`delete ${p}.${String(k)}`); return true; },
      setPrototypeOf: o => { writes.push(`setPrototypeOf ${p}`); return true; },
    });
    seen.set(t, px);
    return px;
  };
  return wrap(target, path);
}

// ── The cases: export name → argument lists (each a function, so every run
//    gets a fresh copy). Cover the branches that WRITE in the old code. ────
const at = s => new Date(s); // a real Date for an argument: parsing, not a clock read
const ctx = today => ({ today });
const macroOf = () => demo().macrocycles[0];
const CASES = {
  // v8.33 (§123): the clock step. Dates around both 2026 UK clock changes.
  toLocalDateStr: [() => [at('2026-03-29T00:30:00')], () => [at('2026-10-25T23:59:59')]],
  getHomeWeekStart: [() => ['2026-08-02'], () => ['2026-03-29'], () => ['2026-10-26']],
  getWeekDates: [() => ['2026-10-19'], () => ['2026-03-23']],
  getSundayAfterWeeks: [() => ['2026-03-02', 6], () => ['2026-10-05', 13]],
  getMondayAfter: [() => ['2026-10-25'], () => ['2026-03-29']],
  getNextMonday: [() => [ctx('2026-08-02')], () => [ctx('2026-08-03')], () => [ctx('2026-10-24')]],
  getMacroDurationWeeks: [() => [macroOf()], () => [{ id: 'x' }], () => [{ id: 'x', weeks: 3, weeksPerMeso: 2, extensionWeeks: 3 }]],
  // No start: the engine must take "today" from ctx, never the clock.
  getMacroEndDate: [() => [macroOf(), ctx('2026-08-02')], () => [{ id: 'x', weeks: 4 }, ctx('2026-08-02')]],
  normaliseState: [
    () => [demo()],
    () => [{}],                                                        // every default
    () => [{ sampleDays: [{ range: { proteinMax: null } }, { range: {} }, { id: 'x' }], profile: { gender: 'm' },
      mode: '', nextCycleAdviceHistory: 'not an array' }],             // the repair, the nested profile default, falsy mode
  ],

  // v8.34 (§124): step 3, the pure leaves. Shared with verify-engine-leaves.mjs,
  // which runs the same inputs through v8.33's functions and today's shims.
  ...LEAF_CASES,
};

const exported = Object.keys(E).sort();
const uncovered = exported.filter(n => !CASES[n]);
check(`every engine export has a case (${exported.length}: ${exported.join(', ')})`,
  uncovered.length === 0, `no case for: ${uncovered.join(', ')} — add one to CASES`);
const stale = Object.keys(CASES).filter(n => !exported.includes(n));
check('every case names a real export', stale.length === 0, stale.join(', '));

for (const [name, argSets] of Object.entries(CASES)) {
  if (typeof E[name] !== 'function') continue;
  argSets.forEach((mk, i) => {
    const args = mk();
    const before = JSON.stringify(args);
    const writes = [];
    let threw = null;
    try { E[name](...args.map((a, j) => guard(a, writes, `arg${j}`))); } catch (e) { threw = e.message; }
    check(`${name} #${i + 1}: never writes to its input`, writes.length === 0 && threw === null && JSON.stringify(args) === before,
      threw ? `threw: ${threw}` : writes.slice(0, 5).join(', '));
    let clock = null;
    try { EC[name](...mk()); } catch (e) { clock = e.message; }
    check(`${name} #${i + 1}: never reads the clock`, clock === null || !/read the clock/.test(clock), clock);
  });
}

// ── Control: the OLD in-place ensureStateDefaults (v8.31) must be caught ────
{
  const old = execFileSync('git', ['show', '3fb1c3f:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
  const start = old.indexOf('function ensureStateDefaults() {');
  const text = old.slice(start, old.indexOf('\n}\n', start) + 2);
  const run = new Function('state', 'document', `${text}\nensureStateDefaults();`);
  const writes = [];
  // The refused writes leave sampleDays undefined, so it throws partway; the
  // writes recorded before that are the point.
  try { run(guard({}, writes, 'state'), { body: { setAttribute() {} } }); } catch { /* expected */ }
  check(`control: the v8.31 in-place ensureStateDefaults is caught writing (${writes.length} writes)`, writes.length >= 10);
}

// ── Control: a function that reads the clock must be caught ────────────────
{
  const leaky = loadTrapped(DIST.replace('return s;\n', 'new Date();\n    return s;\n'));
  let clock = null;
  try { leaky.normaliseState({}); } catch (e) { clock = e.message; }
  check('control: a normaliseState that calls new Date() is caught reading the clock', /read the clock/.test(clock || ''));
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
