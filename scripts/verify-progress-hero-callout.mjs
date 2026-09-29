#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-progress-hero-callout.mjs (v8.46, TECHNICAL §148)
//
// THE RULE: the Progress hero's main figure is what the cycle is for, not
// the latest body weight (which said nothing about the cycle):
//   · a cut: the total lost since the cycle's first weigh-in, "Lost this cycle";
//   · a gain cycle: the total gained, "Gained this cycle";
//   · maintenance: the target it holds, "Maintenance weight" (no target: the
//     latest weigh-in, "Body weight").
// Moving the wrong way is said plainly: a cut that has gained reads "Gained
// this cycle". No weigh-ins: "—".
// Runs index.html's progressHeroCallout(). CONTROL: a callout that shows the
// latest weigh-in, as before v8.46.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
const src = (() => { const i = html.indexOf('function progressHeroCallout('); let d = 0; for (let j = html.indexOf('{', i); j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) return html.slice(i, j + 1); } return null; })();
const run = (code) => new Function(`${code}; return progressHeroCallout;`)();
const cases = [
  ['a cut, 210 → 204.4: lost 5.6', ['loss', 210, 204.4, 195], { label: 'Lost this cycle', value: '5.6' }],
  ['a cut that has gained, 200 → 201.5: "Gained this cycle" 1.5', ['loss', 200, 201.5, 190], { label: 'Gained this cycle', value: '1.5' }],
  ['a gain cycle, 170 → 173.2: gained 3.2', ['gain', 170, 173.2, 180], { label: 'Gained this cycle', value: '3.2' }],
  ['a gain cycle that has lost: "Lost this cycle"', ['gain', 170, 168, 180], { label: 'Lost this cycle', value: '2.0' }],
  ['maintenance with a target: the target', ['maintenance', 182, 183.4, 182], { label: 'Maintenance weight', value: '182.0' }],
  ['maintenance with no target: the latest weigh-in', ['maintenance', 182, 183.4, null], { label: 'Body weight', value: '183.4' }],
  ['no weigh-ins yet on a cut: "—"', ['loss', null, null, 190], { label: 'Lost this cycle', value: '—' }],
];
check('progressHeroCallout() exists', !!src);
const f = src ? run(src) : () => ({});
for (const [label, args, want] of cases) {
  const got = f(...args);
  check(label, got.label === want.label && got.value === want.value, JSON.stringify(got));
}
check('the hero shows it (label and figure)', /<div class="prog-hero-eyebrow">\$\{callout\.label\}<\/div>/.test(html) && /prog-hero-val digits">\$\{callout\.value\}/.test(html));

console.log('\n— control: the latest weigh-in, as before v8.46 —');
const old = run("function progressHeroCallout(g, s, l) { return { label: 'Body weight', value: l !== null ? l.toFixed(1) : '—' }; }");
check('control: a cut would read 204.4, not 5.6 lost', old('loss', 210, 204.4, 195).value === '204.4');

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
