#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-review-clock.mjs — Review judges a client at THEIR local
// today, never a clock (Coach v0.2–v0.3, TECHNICAL §140, §141)
//
// THE RULE: everything in coach/src/review/ and coach/src/ai/ (the AI tools'
// rules and runner) takes `today` as a parameter: the
// client's calendar date from their uploaded `tz` (lib/clientState.ts →
// localDateIn). The screens pass it in; the model never reads a clock.
//
// 🚨 THE TRAP: `new Date()` or `Date.now()` inside the model gives the coach's
//    date. A coach in London at 08:00 on Monday is looking at a client in
//    Auckland whose Monday is already over, so the week, the "finished"
//    weeks and the verdict all shift by a day, silently, for some clients
//    only. And the vitest cases, which pin the date, can't see it.
// Every engine call about a client passes `{ today }` in the client's zone.
// Control: a model file that reads `Date.now()`, `new Date()` or the
//    coach's zone is caught.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = 'coach/src/review';
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** Every way the model could read "now" for itself. */
function clocks(src) {
  const s = strip(src);
  const hits = [];
  if (/\bDate\.now\s*\(/.test(s)) hits.push('Date.now()');
  if (/\bnew Date\s*\(\s*\)/.test(s)) hits.push('new Date()');
  if (/\bperformance\.now\s*\(/.test(s)) hits.push('performance.now()');
  if (/\.now\s*\(\s*\)/.test(s) && /\brepo\b/.test(s)) hits.push('repo.now()');
  if (/resolvedOptions\(\)\.timeZone/.test(s)) hits.push("the coach's own zone");
  if (/\btoLocalDateStr\s*\(\s*new Date/.test(s)) hits.push('toLocalDateStr(new Date…)');
  return hits;
}

// ai/transport.ts is the browser's fetch and key, not a rule; it reads no clock either, so it's checked too.
const model = [dir, 'coach/src/ai'].flatMap(d => readdirSync(join(repo, d)).filter(f => /\.ts$/.test(f) && !/\.test\.ts$/.test(f)).map(f => `${d}/${f}`));
check(`the review model and the AI tools have files to check (${model.length})`, model.length >= 9, model.join(', '));
const found = model.flatMap(f => clocks(readFileSync(join(repo, f), 'utf8')).map(h => `${f}: ${h}`));
check('no review model or AI tools file reads a clock or the coach\'s zone', found.length === 0, found.join('; '));

// The screens hand the model the client's today, never the coach's.
const review = readFileSync(join(repo, 'coach/src/coach/client/ReviewTab.tsx'), 'utf8');
check('Review passes the client\'s today into the model (c.clientToday)', /reviewFor\([^)]*c\.clientToday/.test(review));
const panel = readFileSync(join(repo, 'coach/src/coach/client/AiPanel.tsx'), 'utf8');
check('the AI tools run at the Review model\'s today, the client\'s (today = m.today)', /const today = m\.today;/.test(panel) && /runTool\(\{[\s\S]*?\btoday\b/.test(panel) && !/runTool\(\{[^}]*repo\.now/.test(panel));
const summary = readFileSync(join(repo, 'coach/src/data/summary.ts'), 'utf8');
check('the Clients row judges at the client\'s today (localDateIn with their tz)', /localDateIn\(snap\.tz,\s*nowMs\)/.test(summary) && /reviewFor\([^)]*clientToday/.test(summary));

// Control: the clock reads are caught.
check('control: Date.now() is caught', clocks('const today = toISO(Date.now());').length === 1);
check('control: new Date() is caught', clocks('const t = new Date();').includes('new Date()'));
check("control: the coach's zone is caught", clocks('localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, x)').length === 1);
check('control: a date built from a string is allowed', clocks("Date.parse(`${a}T00:00:00Z`); new Date(iso + 'T00:00:00')").length === 0);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
