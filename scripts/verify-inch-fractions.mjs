#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-inch-fractions.mjs
//
// THE BUG THIS PREVENTS: printing a measurement nobody took.
//
// Inches are ENTERED as a whole number plus ¼ / ½ / ¾, and the design reference
// shows them read back the same way — "31¼", not "31.25". fmtInch() does that.
//
// 🚨 The fallback to a decimal is the part that matters. A measurement entered
// in CENTIMETRES is stored as cmToIn(), an arbitrary decimal: 83cm is 32.677in.
// Rounding that to the nearest quarter and printing "32¾" would show a figure
// the person never measured and cannot reproduce on a tape — a data
// misrepresentation wearing a formatting change's clothes. Only a value that
// genuinely IS a quarter may be drawn as one.
//
// That is easy to "simplify" away later, because a nearest-quarter round looks
// tidier and every inch-entered value still passes. The cm cases below are the
// ones that catch it.
//
// It extracts the REAL fmtInch() out of index.html. A control at the end
// replaces the tolerance test with an unconditional round and asserts the
// suite then fails.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function extract(marker) {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  if (source.indexOf(marker, start + 1) !== -1) {
    console.error(`✗ FAIL: ${marker} is defined more than once.`);
    process.exit(1);
  }
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

const MARKER = 'function fmtInch(val) {';
const fnSource = extract(MARKER);
if (!fnSource) {
  console.error('✗ FAIL: fmtInch() not found in index.html.');
  console.error('  It was renamed or restructured. Re-point this script rather than');
  console.error('  deleting the check — the cm cases below are the reason it exists.');
  process.exit(1);
}

const make = src => new Function(`${src}; return fmtInch;`)();
const fmt = make(fnSource);

// ── Entered in inches: whole + quarter ───────────────────────────────────
check('a whole number keeps no fraction', fmt(32), '32');
check('32.25 → 32¼', fmt(32.25), '32¼');
check('32.5 → 32½',  fmt(32.5),  '32½');
check('32.75 → 32¾', fmt(32.75), '32¾');
check('31.25 → 31¼ (the reference\'s own example)', fmt(31.25), '31¼');
check('a bare quarter has no leading zero', fmt(0.25), '¼');
check('zero is zero', fmt(0), '0');

// ── Float noise from `whole + 0.25` must still read as a quarter ─────────
check('32.2500000001 → 32¼', fmt(32 + 0.25 + 1e-10), '32¼');
check('31.999999 → 32, not 31 with a glyph', fmt(31.999999), '32');

// ── 🚨 Entered in CENTIMETRES: never snapped to a quarter ────────────────
const cmToIn = cm => cm / 2.54;
check('83cm (32.677in) stays decimal', fmt(cmToIn(83)), '32.68');
check('85cm (33.465in) stays decimal', fmt(cmToIn(85)), '33.46');
check('81cm (31.89in) stays decimal',  fmt(cmToIn(81)), '31.89');
check('a value a hair off a quarter stays decimal', fmt(32.26), '32.26');
// 🚨 The tolerance is 0.005in — about a tenth of a millimetre, well under any
// tape's precision — so a cm value that lands THAT close to a quarter is
// genuinely that quarter and is drawn as one. 80cm is 31.496in, four
// thousandths of an inch off a half. This is the boundary working, not leaking:
// the check above it (81cm, 31.89in) is the nearest cm value that does not.
check('80cm (31.496in) IS a half, to any real precision', fmt(cmToIn(80)), '31\u00BD');

// ── Negatives and empties ────────────────────────────────────────────────
check('a negative quarter keeps its sign', fmt(-1.5), '−1½');
check('null is an em dash', fmt(null), '—');
check('undefined is an em dash', fmt(undefined), '—');
check('a non-number is an em dash', fmt('abc'), '—');

// ── CONTROL ──────────────────────────────────────────────────────────────
// Remove the "is it actually a quarter" tolerance test — i.e. snap everything
// to the nearest quarter — and the cm cases must start failing.
const mutated = fnSource.replace(/if \(Math\.abs\(frac - quarters \/ 4\) > 0\.005\) \{[\s\S]*?\n  \}/, '');
if (mutated === fnSource) {
  console.log('✗ FAIL: control could not find the quarter-tolerance test to remove.');
  console.log('  Re-point this control at whatever now decides a value IS a quarter.');
  failures++;
} else {
  const snapped = make(mutated);
  check('CONTROL: without the tolerance test, 83cm is wrongly drawn as a fraction',
    snapped(cmToIn(83)), '32¾');
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
