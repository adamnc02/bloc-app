#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-host.mjs — BLOC Coach's dev bypass is BLOC's, exactly
// (Coach v0.1, TECHNICAL §139; §82, §119; PROMPT-03 §0)
//
// THE RULE. Coach bypasses sign-in on the same hosts as BLOC, and `?auth=real`
// turns it off the same way — never on. `isLocalDevHost()` is the engine's,
// shared. `isRealAuthRequested()`/`isDevBypassActive()` live in BLOC's
// index.html, so Coach carries a copy (coach/src/lib/host.ts): a Coach PR
// must leave BLOC's served bytes unchanged, and index.html is one of them.
//
// 🚨 THE TRAPS:
//   · The copy drifting from BLOC's. This runs BLOC's two functions (from
//     index.html) and Coach's (from host.ts, types stripped) over the same
//     host × query matrix, and fails on any difference.
//   · Keying the bypass on Vite's build mode (`import.meta.env.DEV`/`MODE`)
//     — a production build previewed on a LAN IP must bypass; a dev build on
//     a public host must not. No `import.meta.env` may appear in coach/src.
//   · Coach defining its own host predicate instead of importing the engine's.
//   · A Supabase client created under the bypass.
// Controls: the two plausible wrong switches (verify-auth-real's) must
// disagree with BLOC's, so a clean comparison means something.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mainScript, indexTopLevel } from './golden/extract-engine.mjs';
import './engine-global.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(repo, f), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

let esbuild;
try { esbuild = await import(join(repo, 'engine', 'node_modules', 'esbuild', 'lib', 'main.js')); }
catch { console.error('✗ FAIL: engine/node_modules is missing. Run `npm ci --prefix engine` first.'); process.exit(1); }

// ── BLOC's functions, from index.html ────────────────────────────────────
const { decls } = indexTopLevel(mainScript(read('index.html')));
const text = n => decls.get(n).text;
const bloc = new Function(`${text('isLocalDevHost')}\n${text('isRealAuthRequested')}\n${text('isDevBypassActive')}
  return { isRealAuthRequested, isDevBypassActive };`)();

// ── Coach's, from host.ts, with the engine's predicate ───────────────────
const hostSrc = read('coach/src/lib/host.ts');
check('host.ts imports isLocalDevHost from the engine', /import \{ isLocalDevHost \} from '@engine';/.test(hostSrc));
check('host.ts defines no host predicate of its own', !/function isLocalDevHost/.test(hostSrc));
const js = (await esbuild.transform(hostSrc.replace(/^import .*$/m, '').replace(/^export /gm, ''), { loader: 'ts' })).code;
function coachAt(hostname, search) {
  return new Function('window', 'isLocalDevHost', `${js}\nreturn { isRealAuthRequested, isDevBypassActive, IS_LOCAL_DEV, IS_LOCAL_REAL_AUTH };`)(
    { location: { hostname, search } }, BlocEngine.isLocalDevHost);
}
const coach = coachAt('', '');

const LOCAL = ['localhost', '127.0.0.1', '::1', '[::1]', '127.9.9.9', 'adams-macbook.local', '10.1.2.3', '192.168.0.42', '172.20.0.5', '169.254.3.3'];
const PUBLIC = ['adamnc02.github.io', 'localhost.evil.com', '192.168.0.42.evil.com', '172.32.0.1', '8.8.8.8', 'example.com', '', 'LOCALHOST', 'xlocalhost'];
const QUERIES = ['', '?', '?auth=real', '?x=1&auth=real', '?auth=', '?auth=Real', '?auth=reall', '?tour=demo', '?authreal', '?auth%3Dreal', '?auth=bypass'];

function differences(fn) {
  const out = [];
  for (const h of [...LOCAL, ...PUBLIC]) for (const q of QUERIES)
    if (fn(h, q) !== bloc.isDevBypassActive(h, q)) out.push(`${h}${q}`);
  return out;
}
{
  const d = differences(coach.isDevBypassActive);
  check(`Coach's isDevBypassActive equals BLOC's on every case (${LOCAL.length + PUBLIC.length} hosts × ${QUERIES.length} queries)`, d.length === 0, d.slice(0, 5).join('; '));
  const r = QUERIES.filter(q => coach.isRealAuthRequested(q) !== bloc.isRealAuthRequested(q));
  check("Coach's isRealAuthRequested equals BLOC's", r.length === 0, r.join('; '));
}
{
  const bad = [];
  for (const h of [...LOCAL, ...PUBLIC]) for (const q of QUERIES) {
    const m = coachAt(h, q);
    if (m.IS_LOCAL_DEV && !BlocEngine.isLocalDevHost(h)) bad.push(`bypass on ${h}${q}`);
    if (m.IS_LOCAL_REAL_AUTH && !(BlocEngine.isLocalDevHost(h) && q.includes('auth=real'))) bad.push(`local-real on ${h}${q}`);
    if (m.IS_LOCAL_DEV && m.IS_LOCAL_REAL_AUTH) bad.push(`both on ${h}${q}`);
  }
  check("Coach's page constants: bypass only on a local host, LIVE DATA only with ?auth=real there", bad.length === 0, bad.slice(0, 4).join('; '));
}

// ── Nothing else decides it ───────────────────────────────────────────────
function tsFiles(dir) {
  return readdirSync(join(repo, dir)).flatMap(f => {
    const p = `${dir}/${f}`;
    return statSync(join(repo, p)).isDirectory() ? tsFiles(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}
const coachFiles = tsFiles('coach/src');
// Comments are stripped first: host.ts names import.meta.env.DEV to warn against it.
const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const envUse = coachFiles.filter(f => /import\.meta\.env/.test(code(f)));
check(`no Coach source reads import.meta.env (${coachFiles.length} files)`, envUse.length === 0, envUse.join(', '));
check('getSupabase() returns null under the bypass, before creating a client',
  /export function getSupabase\(\)[^{]*\{\s*if \(IS_LOCAL_DEV\) return null;/.test(read('coach/src/lib/supabase.ts')));
check('createClient is called only in lib/supabase.ts', coachFiles.filter(f => /createClient\(/.test(read(f))).join() === 'coach/src/lib/supabase.ts');

check('control: a file that keys the bypass on import.meta.env.DEV is caught',
  /import\.meta\.env/.test('export const IS_LOCAL_DEV = import.meta.env.DEV; // wrong'.replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')));

// ── Controls: each must disagree with BLOC ───────────────────────────────
check('control: a switch that ignores the host ("!auth=real → bypass") is caught',
  differences((h, q) => !bloc.isRealAuthRequested(q)).length > 0);
check('control: a switch that ORs the host test is caught',
  differences((h, q) => BlocEngine.isLocalDevHost(h) || !bloc.isRealAuthRequested(q)).length > 0);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
