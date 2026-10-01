#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-version-single-source.mjs
//
// THE BUG THIS PREVENTS: a version number nobody remembers to bump. The
// Settings hero chip sat at v8.16 through v8.17–v8.19, and the App info
// sheet's subtitle still read "version 8.19" in v8.21. The version
// appears in one place only, the hero's badge.
//
// The rule: the Settings hero chip is the ONLY version the app shows, and it
// must equal the README badge and the newest Version History row — the three
// places a release bumps together (TECHNICAL §110).
//
// Comments are stripped before searching, because every section of the code
// cites the version it arrived in ("v8.19 — …"), and that provenance is
// wanted. A control runs the v8.21 index.html, which must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');
const readme = readFileSync(join(repo, 'README.md'), 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const CHIP = /<span class="chip" style="--chip-c:var\(--accent2\);">v(\d+\.\d+)<\/span>/g;

// Remove HTML, block and line comments; keep strings and markup text.
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    // A block comment must open after whitespace or at a line start: '/*' also
    // appears inside markup (accept="image/*"), and treating that as a comment
    // swallowed everything up to the next '*/' — the control caught it.
    .replace(/(^|\s)\/\*[\s\S]*?\*\//g, '$1')
    .split('\n').map(l => l.replace(/(^|[^:"'`])\/\/.*$/, '$1')).join('\n');
}

// Every user-visible version mention outside the hero chip.
function strayVersions(src) {
  const code = stripComments(src).replace(CHIP, '');
  const hits = [];
  for (const re of [/\bv\d+\.\d{2}\b/g, /\bversion\s+\d+\.\d+/gi]) {
    for (const m of code.matchAll(re)) hits.push(m[0]);
  }
  return hits;
}

const chips = [...html.matchAll(CHIP)].map(m => m[1]);
check('the Settings hero chip appears exactly once', chips.length, 1);
const chip = chips[0];
check('no other version is shown anywhere in the app (comments excepted)', strayVersions(html), []);

const badge = (readme.match(/badge\/version-v(\d+\.\d+)-/) || [])[1];
check('README badge = hero chip', badge, chip);
const topRow = (readme.match(/## Version History[\s\S]*?\n\| v(\d+\.\d+) \|/) || [])[1];
check('newest README Version History row = hero chip', topRow, chip);

// CONTROL: v8.21 still said "version 8.19" in the App info sheet.
const v821 = execFileSync('git', ['show', '510ac57:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
check('CONTROL: v8.21\'s App info subtitle ("version 8.19") is caught', strayVersions(v821).some(h => /version 8\.19/i.test(h)), true);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
