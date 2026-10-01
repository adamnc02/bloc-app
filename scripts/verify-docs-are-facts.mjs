#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-docs-are-facts.mjs
//
// THE RULE THIS PROTECTS (v8.55, TECHNICAL §167): the repo's documentation,
// code comments and verify headers state facts about the app. They name no
// person, quote no one, and point at no working file outside the repo: the
// build rounds' working files (prompts, design notes, mockups) are deleted
// when a round ships, and a pointer to one is a dead end. Why the code is shaped the way it
// is belongs in the comment, as the reason itself.
//
// Every tracked text file is scanned (built output and the golden data
// excepted). ALLOWED lists the few lines where a name is the fact: the Close
// my account confirmation tells the person who processes the request.
//
// Controls: the TECHNICAL.md of v8.54 (5edafdd), before the pass, must fail,
// and a planted line must be caught in each kind of file.
// ═══════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Built from parts, so this file doesn't flag itself.
const NAME = 'Ad' + 'am';
const BANNED = new RegExp(`\\b${NAME}\\b|${'PROM' + 'PT'}-\\d|[Dd]eep ${'di' + 've'}|[Ww]ire${'fra' + 'me'}`);
const ALLOWED = [
  { file: 'index.html', text: `Once ${NAME} processes that request` },
];
const SKIP = /(^|\/)dist\/|^scripts\/golden\/engine-golden\.json$|\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|pdf)$/;

function hits(file, src) {
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (!BANNED.test(line)) return;
    if (ALLOWED.some((a) => a.file === file && line.includes(a.text))) return;
    out.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
  return out;
}

const files = execFileSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).split('\n').filter((f) => f && !SKIP.test(f));
check('the scan covers the docs, the app, the engine, Coach and the scripts, this file included',
  ['README.md', 'TECHNICAL.md', 'index.html', 'engine/src/targets.ts', 'coach/src/main.tsx', 'scripts/verify-push.mjs', 'scripts/verify-docs-are-facts.mjs'].every((f) => files.includes(f)), true);

const found = files.flatMap((f) => hits(f, readFileSync(join(repo, f), 'utf8')));
for (const h of found) console.log(`    ${h}`);
check('no tracked file names a person or points at a build round\'s working files', found.length, 0);
check('every allowed line still exists (a stale allowance is removed, not kept)',
  ALLOWED.every((a) => readFileSync(join(repo, a.file), 'utf8').includes(a.text)), true);

// ── Controls ───────────────────────────────────────────────────────────────
try {
  const old = execFileSync('git', ['show', '5edafdd:TECHNICAL.md'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 });
  check('control: v8.54\'s TECHNICAL.md fails', hits('TECHNICAL.md', old).length > 100, true);
} catch {
  check('control: v8.54\'s TECHNICAL.md is reachable (fetch-depth: 0)', false, true);
}
check('control: a planted comment is caught in code',
  hits('engine/src/x.ts', `// v9 (${NAME}, 2026-10-01): keep it`).length, 1);
check('control: a pointer to a round\'s prompt is caught',
  hits('README.md', `See ${'PROM' + 'PT'}-04 for why.`).length, 1);
check('control: a design-note pointer is caught (the phrases are built from parts here)',
  [hits('README.md', `See the deep ${'di' + 've'} §2.`).length, hits('README.md', `the wire${'fra' + 'me'}'s card`).length], [1, 1]);
check('control: the allowance is for its own file only',
  hits('README.md', `Once ${NAME} processes that request`).length, 1);
check('control: a host name is not a person (adamnc02.github.io)',
  hits('README.md', 'https://adamnc02.github.io/bloc-app/').length, 0);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
