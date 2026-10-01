#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-train-kg.mjs — Train's set weights read in full, and as numbers
// (v8.57 + Coach v0.17, TECHNICAL §172)
//
// THE BUGS THIS PREVENTS:
//   · The set weight box cutting its figure off. BLOC's base field rule,
//     `input:not([type=range]):not([type=file])` (0,2,1), outranks
//     `.set-input` (0,1,0), so its 14px side padding won and left 32px for the
//     figure in the 62px column: "50.0" (35px at 16px Manrope 600) was cut to
//     "50.C" on an iPhone. The check finds every rule that matches a Train set
//     box, works out which `padding` wins by specificity then source order, and
//     requires the box to keep at least 48px for its figure ("102.5" and
//     "failure" are 40 and 49px). Control: v8.56's index.html must fail.
//   · A weight shown as "25.0". The engine's targets are strings with one
//     decimal ("25.0" is a lock value, a Fill suggested value and a golden
//     output), so they stay as they are and Train formats them where it draws
//     them: BLOC's fmtKg (index.html) and Coach's setKg (coach/src/lib/format.ts)
//     must give the same answers over one table, including leaving a figure
//     being typed ("25.") alone. Control: a toFixed(1) formatter fails it.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mainScript, indexTopLevel } from './golden/extract-engine.mjs';

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

// ── 1. The set box keeps room for its figure ─────────────────────────────
// Simple compound selectors only (no combinators): enough for the rules that
// can reach <input class="set-input" type="number">.
function specificity(sel) {
  let a = 0, b = 0, c = 0;
  const s = sel.replace(/:not\(([^)]*)\)/g, (_, inner) => { const [x, y, z] = specificity(inner); a += x; b += y; c += z; return ''; });
  b += (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  c += (s.match(/^[a-z]+/i) || []).length;
  return [a, b, c];
}
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
const SET_BOX = { tag: 'input', classes: new Set(['set-input']), type: 'number' };
function matchesSetBox(sel) {
  sel = sel.trim();
  if (/[\s>+~]/.test(sel)) return false;
  const m = sel.match(/^([a-z]+)?((?:\.[\w-]+|:not\(\[type=\w+\]\))*)$/i);
  if (!m) return false;
  if (m[1] && m[1] !== SET_BOX.tag) return false;
  for (const part of m[2].match(/\.[\w-]+|:not\(\[type=\w+\]\)/g) || []) {
    if (part.startsWith('.')) { if (!SET_BOX.classes.has(part.slice(1))) return false; }
    else if (part.match(/type=(\w+)/)[1] === SET_BOX.type) return false;
  }
  return true;
}
function setBoxPadding(html) {
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  let best = null, order = 0;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    order++;
    const pad = m[2].match(/(?:^|;)\s*padding\s*:\s*([^;]+)/);
    if (!pad) continue;
    for (const sel of m[1].split(',')) {
      if (!matchesSetBox(sel)) continue;
      const sp = specificity(sel.trim());
      // Higher specificity wins; equal specificity, the later rule (this one).
      if (!best || cmp(sp, best.sp) >= 0) best = { sp, padding: pad[1].trim(), sel: sel.trim(), order };
    }
  }
  return best;
}
const sidePadding = p => { const v = p.split(/\s+/).map(parseFloat); return (v.length === 1 ? v[0] : v[1]) * 2; };
const COLUMN = 62, BORDER = 2, NEED = 48;

const now = setBoxPadding(read('index.html'));
check(`a Train set box's padding comes from ${now && now.sel} (${now && now.padding}), not the base field rule`,
  now && now.sel.includes('set-input'), now && JSON.stringify(now));
check(`the box keeps ≥ ${NEED}px for its figure in the ${COLUMN}px column`,
  now && COLUMN - BORDER - sidePadding(now.padding) >= NEED, now && `${COLUMN - BORDER - sidePadding(now.padding)}px`);
check('the grid still gives the kg column 62px', /\.set-row \{\s*display: grid;\s*grid-template-columns: 24px 1fr 62px 62px 42px;/.test(read('index.html')));

let old = null;
try { old = setBoxPadding(execFileSync('git', ['show', '96b1465:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 })); }
catch { console.log('  (control skipped: v8.56 not in this clone)'); }
if (old) check(`control: v8.56's box (${old.sel}, ${old.padding}) leaves < ${NEED}px`, COLUMN - BORDER - sidePadding(old.padding) < NEED,
  `${COLUMN - BORDER - sidePadding(old.padding)}px`);

// ── 2. fmtKg (BLOC) and setKg (Coach) agree ─────────────────────────────
const { decls } = indexTopLevel(mainScript(read('index.html')));
check('index.html defines fmtKg', decls.has('fmtKg'));
const fmtKg = new Function(`${decls.get('fmtKg').text}\nreturn fmtKg;`)();
const fmtSrc = read('coach/src/lib/format.ts');
const setKgTs = fmtSrc.match(/export function setKg[\s\S]*?\n}\n/);
check('coach/src/lib/format.ts defines setKg', !!setKgTs);
const setKg = new Function(`${(await esbuild.transform(setKgTs[0].replace(/^export /, ''), { loader: 'ts' })).code}\nreturn setKg;`)();

const TABLE = [
  ['25.0', '25'], ['25', '25'], ['22.5', '22.5'], ['22.50', '22.5'], ['23.75', '23.75'], ['102.5', '102.5'],
  ['0.0', '0'], [' 40.0 ', '40'], [25, '25'], [22.5, '22.5'], [10.000000001, '10'], [2.4999999, '2.5'], [-2.5, '-2.5'],
  ['', ''], [null, ''], [undefined, ''], ['—', '—'], ['25.', '25.'], ['.5', '.5'], ['abc', 'abc'], [NaN, ''],
];
for (const [input, want] of TABLE) {
  const b = fmtKg(input), c = setKg(input);
  check(`${JSON.stringify(input) ?? 'undefined'} → "${want}" in BLOC and Coach`, b === want && c === want, `BLOC "${b}", Coach "${c}"`);
}
const toFixed1 = v => (v === '' || v == null || isNaN(parseFloat(v))) ? String(v ?? '') : parseFloat(v).toFixed(1);
check('control: a toFixed(1) formatter fails the table', TABLE.some(([i, w]) => toFixed1(i) !== w));

// ── 3. Train draws its weights through them ──────────────────────────────
const html = read('index.html');
check('every Train weight box draws its placeholder and value through fmtKg',
  (html.match(/placeholder="\$\{fmtKg\((setWeightPh|dropWeightHint|mSetWeightPh)\)\}" value="\$\{fmtKg\(log\.(weight|dropWeight) \|\| ''\)\}"/g) || []).length === 4);
check('no Train weight box draws a raw placeholder', !/placeholder="\$\{(setWeightPh|dropWeightHint|mSetWeightPh)\}"/.test(html));
check('Fill suggested shows the formatted figure and stores the engine\'s', (html.match(/wEl\.value = fmtKg\(wVal\);/g) || []).length === 2
  && /dwEl\.value = fmtKg\(dwVal\);/.test(html) && (html.match(/state\.trainLogs\[logKey\]\.weight = wVal;/g) || []).length >= 2);
const card = read('coach/src/inperson/ExerciseLogCard.tsx');
check("Coach's set table draws its kg placeholder through setKg", /placeholder=\{setKg\(t\.weights\[k\]\)\}/.test(card));

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed.');
