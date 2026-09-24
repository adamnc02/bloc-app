#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-short-phase-labels.mjs
//
// THE BUG THIS PREVENTS: a chart label that says something the person didn't.
//
// Plan's nutrition-phase chart puts one label under each column — about a
// quarter of a 390px screen. Goal names are written for the phase LIST, where
// they get a whole row ("Ramp Phase 2 — Mid-climb to maintenance"), so they have
// to be shortened. Before this they were not, and ran into each other.
//
// 🚨 shortPhaseLabel() must never INVENT text. Every step removes something —
// the descriptive tail, a filler word, the words in front of a distinguishing
// number — so whatever survives is text the person actually typed. The
// tempting "improvements" here are all inventions: initialising words,
// hard-truncating mid-word without a mark, or dropping the number that is the
// only thing telling Ramp 1 from Ramp 2. The last of those is the dangerous
// one — two columns labelled "Ramp" side by side are not a cosmetic problem,
// they are a chart you cannot read.
//
// It extracts the REAL function out of index.html, with stripStepPrefix()
// which it depends on. A control at the end removes the trailing-number rule
// and asserts two phases then collide.
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

const shortSrc = extract('function shortPhaseLabel(label, max) {');
const stripSrc = extract('function stripStepPrefix(label) {');
if (!shortSrc || !stripSrc) {
  console.error('✗ FAIL: shortPhaseLabel()/stripStepPrefix() not found in index.html.');
  process.exit(1);
}
const make = (a, b) => new Function(`${a}\n${b}\nreturn shortPhaseLabel;`)();
const shortLabel = make(shortSrc, stripSrc);
const MAX = 11;

// ── The real names from Adam's own cycle ─────────────────────────────────
check('Ramp Phase 1 → Ramp 1',  shortLabel('Step 1 - Ramp Phase 1 — Gentle lift off'), 'Ramp 1');
check('Ramp Phase 2 → Ramp 2',  shortLabel('Step 2 - Ramp Phase 2 — Mid-climb to maintenance'), 'Ramp 2');
check('Ramp Phase 3 → Ramp 3',  shortLabel('Step 3 - Ramp Phase 3 — Final climb'), 'Ramp 3');
check('Maintenance Hold → M Hold', shortLabel('Step 4 - Maintenance Hold — Full TDEE'), 'M Hold');

// 🚨 The pair that forced initials rather than "just the last word". As last
// words these are "Start" and "Steps": unrelated-looking, and one is the name
// of a metric charted three buttons away.
check('Hard Cut Start → HC Start',        shortLabel('Step 3 - Hard Cut Start'), 'HC Start');
check('Hard Cut High Steps → HCH Steps',  shortLabel('Step 4 - Hard Cut High Steps'), 'HCH Steps');
check('…and the family is still visible', shortLabel('Step 3 - Hard Cut Start').startsWith('HC'), true);

// ── Short names are left alone ───────────────────────────────────────────
check('a short name is untouched', shortLabel('Cut'), 'Cut');
check('a name that just fits is untouched', shortLabel('Maintenance'), 'Maintenance');
check('an empty name does not throw', shortLabel(''), '');
check('a missing name does not throw', shortLabel(undefined), '');
// 🚨 Guards the .map() arity trap: as a map callback the second argument is the
// ARRAY INDEX, which would silently shorten every element after the first to a
// couple of characters. A width that makes no sense is ignored.
check('an index passed as max is ignored (map arity)', shortLabel('Maintenance Hold', 1), 'M Hold');
check('a real max is still honoured', shortLabel('Maintenance', 6), 'Maint\u2026');

// ── Longer shapes ────────────────────────────────────────────────────────
check('filler word dropped', shortLabel('Deficit Block'), 'Deficit');
check('Refeed Week fits as-is', shortLabel('Step 5 - Refeed Week'), 'Refeed Week');
check('Cycle Sprint → Sprint (filler)', shortLabel('Step 6 - Cycle Sprint'), 'Sprint');
check('a goal genuinely named "Step 1" keeps its name', shortLabel('Step 1'), 'Step 1');
check('first word + trailing number', shortLabel('Aggressive Deficit Block 2'), 'Aggressive 2');
// 🚨 A bare number is never the label — "2" under a column names nothing.
// Where the first word + number fits, that is the answer…
check('a long numbered phase keeps first word + number',
  shortLabel('Enormously Long Deficit Name 2'), 'Enormously 2');
// …and where even that does not fit, it truncates the WORD rather than falling
// back to the number on its own.
check('a very long numbered phase truncates the word, not to the number',
  shortLabel('Extraordinarily Long Phase Name 2'), 'Extraordin\u2026');
check('…and that result is not a bare number',
  /^\d+$/.test(shortLabel('Extraordinarily Long Phase Name 2')), false);
check('a colon counts as a tail', shortLabel('Refeed: three days at maintenance'), 'Refeed');
check('an en dash counts as a tail', shortLabel('Taper – ease off the deficit'), 'Taper');

// ── 🚨 Nothing is invented ───────────────────────────────────────────────
// Every result must be made only of characters from the original, or end in an
// ellipsis that admits it was cut.
const NAMES = [
  'Step 1 - Ramp Phase 1 — Gentle lift off', 'Maintenance Hold — Full TDEE',
  'Aggressive Deficit Block 2', 'Reverse', 'A very long single word phaaaaaase',
  'Cut', 'Refeed: three days at maintenance',
];
for (const n of NAMES) {
  const out = shortLabel(n);
  const cut = out.endsWith('…');
  const body = cut ? out.slice(0, -1) : out;
  const inOriginal = body.split(' ').every(w => n.includes(w));
  check(`"${n.slice(0, 26)}…" invents nothing`, inOriginal, true);
    // +2 of slack exists only for the "first word + number" case — see the
  // comment on rule 3 in shortPhaseLabel().
  check(`"${n.slice(0, 26)}…" fits`, out.length <= MAX + 2, true);
}

// ── 🚨 Sibling phases must stay distinguishable ──────────────────────────
const siblings = ['Ramp Phase 1 — a', 'Ramp Phase 2 — b', 'Ramp Phase 3 — c'].map(n => shortLabel(n));
check('three Ramp phases produce three DIFFERENT labels',
  new Set(siblings).size, 3);

// ── CONTROL ──────────────────────────────────────────────────────────────
// Remove the trailing-number rule and phases that depend on it must collide.
// 🚨 The Ramp names are NOT the right probe here: they come out short enough at
// the filler-word step and never reach rule 3, so they would survive its
// removal and the control would pass while proving nothing. These names are
// long enough that the number is the only thing left distinguishing them.
const DEPENDS_ON_NUMBER = [
  'Aggressive Deficit Block 1', 'Aggressive Deficit Block 2', 'Aggressive Deficit Block 3',
];
check('with the number rule, three long siblings stay distinct',
  new Set(DEPENDS_ON_NUMBER.map(n => shortLabel(n))).size, 3);

const mutated = shortSrc.replace(/if \(words\.length > 1 && lastIsNumber\) \{[\s\S]*?\n  \}/, '');
if (mutated === shortSrc) {
  console.log('✗ FAIL: control could not find the trailing-number rule to remove.');
  failures++;
} else {
  const broken = make(mutated, stripSrc);
  check('CONTROL: without the number rule, they become indistinguishable',
    new Set(DEPENDS_ON_NUMBER.map(n => broken(n))).size < 3, true);
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
