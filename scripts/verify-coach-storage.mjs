#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-storage.mjs — BLOC Coach never touches BLOC's storage
// (Coach v0.1, TECHNICAL §139)
//
// BLOC and BLOC Coach share one origin, adamnc02.github.io, so they share
// localStorage. What this protects:
//   · Coach's Supabase session has its OWN key. supabase-js's default,
//     `sb-<ref>-auth-token`, IS BLOC's session: signing in or out of Coach
//     would sign BLOC in or out too.
//   · That key must not even LOOK like one: BLOC's pre-paint check (index.html,
//     §60) treats any `sb-*-auth-token` key as "signed in to BLOC" and skips
//     painting its sign-in gate. The regex is read from index.html itself.
//   · Every Coach key starts `blocCoach_`, and no Coach code names a
//     localStorage key by literal, or any `bloc_` key at all.
//   · Sign-out is `scope: 'local'`. supabase-js's default, 'global', revokes
//     every session the account has: BLOC's, on every phone.
// Controls: the default key, a `sb-coach-auth-token` key, a global sign-out
// and a literal `bloc_state` read must each be caught.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(repo, f), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
function tsFiles(dir) {
  return readdirSync(join(repo, dir)).flatMap(f => {
    const p = `${dir}/${f}`;
    return statSync(join(repo, p)).isDirectory() ? tsFiles(p) : /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}
const files = tsFiles('coach/src');

// ── The keys ─────────────────────────────────────────────────────────────
const storageSrc = read('coach/src/lib/storage.ts');
const keysBlock = /export const KEYS = \{([\s\S]*?)\} as const;/.exec(storageSrc);
const keys = keysBlock ? [...strip(keysBlock[1]).matchAll(/:\s*'([^']+)'/g)].map(m => m[1]) : [];
check(`storage.ts declares Coach's keys (${keys.join(', ') || 'none found'})`, keys.length > 0);
check('every Coach key starts blocCoach_', keys.every(k => k.startsWith('blocCoach_')));

const m = /return \/(\^sb-[^/]*)\/\.test\(k\)/.exec(read('index.html'));
check("BLOC's pre-paint session pattern is found in index.html", !!m);
const blocSession = m ? new RegExp(m[1]) : /^sb-.*-auth-token$/;
const looksLikeBloc = k => blocSession.test(k) || blocSession.test(`${k}-code-verifier`) || blocSession.test(`${k}-user`);
check("no Coach key (or supabase-js's -code-verifier/-user companions) matches BLOC's session pattern", !keys.some(looksLikeBloc), keys.filter(looksLikeBloc).join(', '));

// ── The client ───────────────────────────────────────────────────────────
const sb = strip(read('coach/src/lib/supabase.ts'));
check('createClient passes storageKey: KEYS.auth', /createClient\([\s\S]*?storageKey:\s*KEYS\.auth/.test(sb));

// ── Every use ────────────────────────────────────────────────────────────
const storageCalls = src => [...strip(src).matchAll(/(?:local|session)Storage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)].map(x => x[1].trim());
const literalCalls = files.flatMap(f => storageCalls(read(f)).filter(a => !/^KEYS\.\w+$/.test(a) && a !== 'key').map(a => `${f}: ${a}`));
check(`every localStorage call in coach/src names a KEYS entry (${files.length} files)`, literalCalls.length === 0, literalCalls.join('; '));
const blocKeys = files.filter(f => /['"`]bloc_[a-z_]*['"`]/.test(strip(read(f))));
check('no Coach code names a bloc_ key', blocKeys.length === 0, blocKeys.join(', '));
const clears = files.filter(f => /(?:local|session)Storage\.clear\(/.test(strip(read(f))));
check('Coach never clears storage wholesale (it would wipe BLOC)', clears.length === 0, clears.join(', '));

const signOutArgs = src => [...strip(src).matchAll(/auth\.signOut\(([^)]*)\)/g)].map(x => x[1]);
const signOuts = files.flatMap(f => signOutArgs(read(f)).map(arg => ({ f, arg })));
check(`every signOut is scope: 'local' (${signOuts.length} found)`, signOuts.length > 0 && signOuts.every(s => /scope:\s*'local'/.test(s.arg)),
  signOuts.filter(s => !/scope:\s*'local'/.test(s.arg)).map(s => s.f).join(', '));

// ── Controls: each must be caught ────────────────────────────────────────
check("control: supabase-js's default key for BLOC's project matches BLOC's pattern", looksLikeBloc('sb-pinfjcxwwbbbwfqppqsj-auth-token'));
check('control: a "sb-coach-auth-token" key would be caught', looksLikeBloc('sb-coach-auth-token'));
check('control: a default (global) sign-out is caught', signOutArgs('await sb.auth.signOut();').some(a => !/scope:\s*'local'/.test(a)));
check("control: a literal localStorage.getItem('bloc_state') is caught",
  storageCalls("localStorage.getItem('bloc_state')").some(a => !/^KEYS\.\w+$/.test(a)));

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
