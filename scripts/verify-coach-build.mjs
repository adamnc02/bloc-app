#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-build.mjs — the served BLOC Coach IS the build of coach/src
// (Coach v0.1, TECHNICAL §139; the engine's rule, §122, applied to Coach)
//
// coach/dist/ is COMMITTED and is what /bloc-app/coach/ serves, byte for byte
// (scripts/publish-files.txt maps coach/dist/ => coach/). The trap is the
// engine's: editing coach/src without rebuilding, which every other check
// would pass. So this:
//   1. type-checks coach/ (tsc, strict; it also type-checks the engine source
//      Coach imports),
//   2. runs Coach's vitest cases,
//   3. rebuilds into a temporary folder and requires the SAME files with the
//      SAME bytes as the committed coach/dist/,
//   4. checks the build carries coach/package.json's version.
// Control: the committed build with one byte changed must be caught.
//
// Needs coach/node_modules: CI runs `npm ci --prefix coach` first.
// Fix a failure: `npm run build` in coach/, and commit dist/ with the source.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const coach = join(repo, 'coach');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${String(detail).split('\n').slice(0, 8).join('\n    ')}`);
}
if (!existsSync(join(coach, 'node_modules', 'vite'))) {
  console.error('✗ FAIL: coach/node_modules is missing. Run `npm ci --prefix coach` first.');
  process.exit(1);
}
const run = (bin, args) => {
  try { return { ok: true, out: execFileSync(process.execPath, [join(coach, 'node_modules', ...bin), ...args], { cwd: coach, encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` }; }
};

function tree(dir) {
  const out = new Map();
  const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else out.set(relative(dir, p), readFileSync(p)); } };
  if (existsSync(dir)) walk(dir);
  return out;
}
function differs(a, b) {
  const names = new Set([...a.keys(), ...b.keys()]);
  return [...names].filter(n => !a.has(n) || !b.has(n) || !a.get(n).equals(b.get(n))).sort();
}

// 1–2. Types and unit tests.
const tsc = run(['typescript', 'bin', 'tsc'], ['-p', 'tsconfig.json']);
check('coach/ type-checks (tsc strict, including the engine source it imports)', tsc.ok, tsc.out);
const vt = run(['vitest', 'vitest.mjs'], ['run']);
check('Coach\'s vitest cases pass', vt.ok, vt.out);

// 3. Rebuild and compare.
const tmp = mkdtempSync(join(tmpdir(), 'coach-build-'));
try {
  const b = run(['vite', 'bin', 'vite.js'], ['build', '--outDir', tmp, '--emptyOutDir', '--logLevel', 'error']);
  check('coach/ builds', b.ok, b.out);
  const fresh = tree(tmp), committed = tree(join(coach, 'dist'));
  const d = differs(fresh, committed);
  check(`coach/dist is exactly a fresh build of coach/src (${fresh.size} files)`, b.ok && fresh.size > 0 && d.length === 0,
    `differs: ${d.join(', ')} — run \`npm run build\` in coach/ and commit dist/`);
  const tracked = execFileSync('git', ['ls-files', 'coach/dist'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean).map(f => relative('coach/dist', f));
  const untracked = [...committed.keys()].filter(f => !tracked.includes(f));
  check('every file in coach/dist is committed (CI and the site see only committed files)', untracked.length === 0, untracked.join(', '));

  // 4. The version.
  const version = JSON.parse(readFileSync(join(coach, 'package.json'), 'utf8')).version;
  const js = [...fresh.entries()].filter(([n]) => n.endsWith('.js')).map(([, v]) => v.toString('utf8')).join('\n');
  check(`the build carries Coach's version, v${version} (coach/package.json)`, new RegExp(`["'\`]v${version.replace(/\./g, "\\.")}["'\`]`).test(js));

  // Control: one changed byte in the committed build is caught.
  const doctored = new Map(committed);
  const first = [...doctored.keys()].find(n => n.endsWith('.js'));
  if (first) { const buf = Buffer.from(doctored.get(first)); buf[buf.length - 2] ^= 1; doctored.set(first, buf); }
  check('control: a committed build with one byte changed is caught', !!first && differs(fresh, doctored).includes(first));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
