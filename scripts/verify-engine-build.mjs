#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-engine-build.mjs — the committed engine build IS the engine source
//
// THE BUG THIS PREVENTS: the live site serving an engine nobody reviewed.
// engine/dist/bloc-engine.js is committed and published byte for byte
// (TECHNICAL §122), because BLOC has no build step on the phone, locally or
// in the golden harness. That only holds if the committed file is exactly
// what engine/src/ builds to. An edit to the source without a rebuild, or a
// hand-edit to dist/, would otherwise ship silently — every other check runs
// against dist/, so it would pass.
//
// It also guards how index.html loads it:
//   · the <script src> exists once, BEFORE the main script (which calls it);
//   · its ?v= is the first 12 hex of the build's SHA-256, so a phone never
//     pairs a new index.html with an older engine from its HTTP cache;
//   · every BlocEngine.<name> index.html calls is an export of the build (a
//     shim calling a name the build lacks throws on the phone, not here).
//
// Needs engine/node_modules: `npm ci --prefix engine` (CI does this).
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = join(repo, 'engine');
const DIST = 'engine/dist/bloc-engine.js';
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

if (!existsSync(join(engineDir, 'node_modules', '.bin', 'tsc'))) {
  console.log('FAIL: engine/node_modules is missing. Run `npm ci --prefix engine` first.');
  process.exit(1);
}

// ── 1. The source type-checks, and the committed build is a fresh build ────
const tsc = spawnSync(join(engineDir, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], { cwd: engineDir, encoding: 'utf8' });
check('engine/src type-checks (tsc, strict)', tsc.status === 0, (tsc.stdout + tsc.stderr).trim().split('\n').slice(0, 5).join('\n    '));

const rebuild = spawnSync(process.execPath, ['build.mjs', '--check'], { cwd: engineDir, encoding: 'utf8' });
check(`${DIST} is byte-identical to a fresh build of engine/src`, rebuild.status === 0, (rebuild.stdout + rebuild.stderr).trim());

const tracked = new Set(execFileSync('git', ['ls-files', 'engine'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean));
check(`${DIST} is committed (the live site serves the committed file)`, tracked.has(DIST));
check('engine/package-lock.json is committed (CI installs the same esbuild and TypeScript)', tracked.has('engine/package-lock.json'));
check('engine/node_modules is not committed', ![...tracked].some(f => f.startsWith('engine/node_modules/')));

// ── 2. index.html loads it, once, before the main script, with a current ?v= ──
const dist = readFileSync(join(repo, DIST));
const html = readFileSync(join(repo, 'index.html'), 'utf8');
const want = createHash('sha256').update(dist).digest('hex').slice(0, 12);

function tagProblems(src, hash) {
  const tags = [...src.matchAll(/<script src="engine\/dist\/bloc-engine\.js\?v=([0-9a-f]+)"><\/script>/g)];
  if (tags.length !== 1) return `expected exactly one engine <script src>, found ${tags.length}`;
  if (tags[0][1] !== hash) return `?v=${tags[0][1]} is stale: the build's hash is ${hash}`;
  // The main script is the largest inline <script> (as extract-engine.mjs defines it).
  let main = null;
  for (const m of src.matchAll(/<script>([\s\S]*?)<\/script>/g)) if (!main || m[1].length > main[1].length) main = m;
  if (!main || tags[0].index > main.index) return 'the engine loads AFTER the main script, which calls it at boot';
  return null;
}
const problem = tagProblems(html, want);
check(`index.html loads ${DIST}?v=${want} once, before the main script`, !problem, problem);

// ── 3. Every BlocEngine.<name> index.html calls is exported ────────────────
const engine = vm.runInNewContext(`${dist.toString('utf8')}\n;BlocEngine`, {});
const exported = new Set(Object.keys(engine));
const calledIn = src => [...new Set([...src.matchAll(/\bBlocEngine\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))].sort();
const called = calledIn(html);
const missing = called.filter(n => !exported.has(n));
check(`every BlocEngine.<name> index.html calls is exported (${called.length} called: ${called.join(', ')})`,
  called.length > 0 && missing.length === 0, `not exported: ${missing.join(', ')}`);
// v8.34 (§124): or a number. The RECONCILE_* constants are exported so
// index.html reads the engine's values instead of keeping a second copy. A
// primitive can't be changed through the export, but an object could be: one
// caller writing to a shared constant would change it for every other.
//
// v8.35 (§125): or a FROZEN plain object of numbers and strings.
// SAVE_DAY_TOLERANCE and HOME_METRIC_POLARITY moved with the Home badge, and
// index.html reads SAVE_DAY_TOLERANCE as `BlocEngine.SAVE_DAY_TOLERANCE`.
// Object.freeze is what makes sharing one safe: a write through the export
// then changes nothing (and throws in strict code), so every caller keeps
// seeing the same numbers. An unfrozen object, or one holding anything but
// numbers and strings (an array or object inside could still be written), is
// refused as before.
const frozenTable = v => !!v && typeof v === 'object' && !Array.isArray(v) && Object.isFrozen(v)
  && Object.values(v).every(x => (typeof x === 'number' && Number.isFinite(x)) || typeof x === 'string');
const exportOk = v => typeof v === 'function' || (typeof v === 'number' && Number.isFinite(v)) || frozenTable(v);
check('every export is a function, a finite number, or a frozen table of numbers and strings', [...exported].every(n => exportOk(engine[n])),
  [...exported].filter(n => !exportOk(engine[n])).join(', '));
check('control: an unfrozen object, a frozen object holding an object, and NaN would be refused',
  !exportOk({ kcal: 50 }) && !exportOk(Object.freeze({ a: { b: 1 } })) && !exportOk(Object.freeze([1])) && !exportOk(NaN)
  && exportOk(50) && exportOk(Object.freeze({ kcal: 50, x: 'both' })));

// ── Controls: each must FAIL ────────────────────────────────────────────
const flipped = Buffer.from(dist); flipped[flipped.length - 3] ^= 1;
const flippedHash = createHash('sha256').update(flipped).digest('hex').slice(0, 12);
check('control: a one-byte change to the build makes the ?v= stale', tagProblems(html, flippedHash) !== null);
check('control: a second engine tag fails', tagProblems(html.replace('<script src="engine/', `<script src="engine/dist/bloc-engine.js?v=${want}"></script>\n<script src="engine/`), want) !== null);
check('control: a shim calling a name the build lacks is caught',
  calledIn(html + '\nBlocEngine.notARealExport();').some(n => !exported.has(n)));
{
  // The compare really compares: point --check at a tampered copy.
  const dir = mkdtempSync(join(tmpdir(), 'bloc-engine-'));
  const tmp = join(dir, 'bloc-engine.js');
  const tampered = Buffer.from(dist); tampered[0] = 0x20;
  writeFileSync(tmp, tampered);
  const cmp = spawnSync(process.execPath, ['build.mjs', '--check', `--against=${tmp}`], { cwd: engineDir, encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  check('control: the rebuild comparison fails against a tampered copy of the build', cmp.status === 1);
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
