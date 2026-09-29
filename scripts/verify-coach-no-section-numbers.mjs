#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-no-section-numbers.mjs — BLOC Coach's sections carry no
// number badge (Coach v0.1, TECHNICAL §139)
//
// THE RULE: a section is its title, an optional right slot and its sublabel.
// No Coach screen numbers its sections ("01", "02" in an outlined badge).
//
// 🚨 THE TRAP: a screen ported from a design that numbers its sections
//    brings `numberSections()`, `<Section n={n.list} …>` and a `.sec-n` span
//    with it. So `Section` has no `n` prop and there is no `numberSections`
//    to call, and this fails if either returns anywhere in coach/src, or if
//    the `.sec-n` style or markup does.
// Control: a numbered screen and a numbered Section are caught.
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
function files(dir, re) {
  return readdirSync(join(repo, dir)).flatMap(f => {
    const p = `${dir}/${f}`;
    return statSync(join(repo, p)).isDirectory() ? files(p, re) : re.test(f) ? [p] : [];
  });
}
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

// What a badge looks like in source: the helper, the prop, the markup, the style.
function badges(src) {
  const s = strip(src);
  const hits = [];
  if (/\bnumberSections\b/.test(s)) hits.push('numberSections');
  if (/<Section\b[^>]*\sn=\{/.test(s)) hits.push('<Section n=…>');
  if (/\bsec-n\b/.test(s)) hits.push('.sec-n');
  if (/padStart\(2,\s*'0'\)/.test(s) && /\bSection\b/.test(s)) hits.push('a zero-padded section number');
  return hits;
}

const src = files('coach/src', /\.(tsx?|css)$/);
const found = src.flatMap(f => badges(read(f)).map(h => `${f}: ${h}`));
check(`no section number badge anywhere in coach/src (${src.length} files)`, found.length === 0, found.join('; '));

const layout = strip(read('coach/src/components/ui/layout.tsx'));
const sig = /export function Section\(\{([^}]*)\}/.exec(layout);
check('Section takes no `n` prop', !!sig && !/\bn\b/.test(sig[1]), sig ? sig[1] : 'Section not found');

// The built CSS and JS too: what the site serves.
const dist = files('coach/dist', /\.(js|css)$/);
const distHits = dist.filter(f => /\bsec-n\b/.test(read(f)));
check(`the served build has no .sec-n (${dist.length} files)`, dist.length > 0 && distHits.length === 0, distHits.join(', '));

// Control: the numbered shapes are caught.
const numberedScreen = `const n = numberSections(['list']);\n<Section n={n.list} i={2} title="Your clients" sub="…">`;
const numberedSection = `<span className="sec-n" aria-hidden="true">{String(n).padStart(2, '0')}</span><h2>{title}</h2> // Section`;
check('control: a numbered screen (numberSections, <Section n=…>) is caught', badges(numberedScreen).length >= 2);
check('control: numbered Section markup (.sec-n) is caught', badges(numberedSection).includes('.sec-n'));

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
