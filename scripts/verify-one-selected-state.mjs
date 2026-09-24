#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-one-selected-state.mjs
//
// THE RULE THIS HOLDS: there is exactly ONE way to say "this one is selected".
//
// Adam, v8.16 UAT: "do a full sweep for toggles/switches and use the same
// design for all." Before that sweep the app had four different answers — a
// --surface3 fill, a solid --accent fill, a 20%-accent tint with an accent
// border, and an outline-only accent — spread across .toggle-btn, .week-pill,
// .day-tab and .step-btn. Each looked deliberate on its own screen.
//
// The one answer is: a solid var(--accent) fill with var(--on-accent) text,
// on an unselected ground of var(--inset).
//
// 🚨 This is the kind of rule that decays one call site at a time, and every
// individual regression looks reasonable in isolation — which is why it is a
// test and not a comment. If a variant is ever genuinely wanted, change this
// script deliberately rather than letting it drift.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// The declaration block for one selector, e.g. ".toggle-btn.active { … }".
function rule(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = source.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

const SELECTED = [
  '.toggle-btn.active',
  '.week-pill.active, .day-tab.active',
  '.step-btn-on',
];

for (const sel of SELECTED) {
  const body = rule(sel);
  if (body === null) {
    console.log(`✗ FAIL: no rule found for ${sel} — it was renamed or removed.`);
    failures++;
    continue;
  }
  check(`${sel} fills with var(--accent)`, /background:\s*var\(--accent\)/.test(body), true);
  // A tint or an outline is the old language, and is what this forbids.
  check(`${sel} is not a tint`, /color-mix/.test(body), false);
  check(`${sel} is not transparent`, /background:\s*transparent/.test(body), false);
}

// The unselected ground is the darkest surface, so a toggle reads as a well.
for (const sel of ['.toggle-row', '.week-pill, .day-tab', '.step-btn']) {
  const body = rule(sel);
  if (body === null) { console.log(`✗ FAIL: no rule for ${sel}`); failures++; continue; }
  check(`${sel} sits on var(--inset)`, /background:\s*var\(--inset\)/.test(body), true);
}

// 🚨 No second opinion. The `.acc` escape hatch existed for two call sites and
// is exactly how a single design becomes two again.
check('no .toggle-row.acc variant survives',
  /\.toggle-row\.acc/.test(source), false);
check('no markup still asks for the .acc variant',
  /class="toggle-row acc/.test(source), false);

// ── CONTROL ──────────────────────────────────────────────────────────────
// Reintroduce a tinted selected state and the suite must start failing.
const mutated = source.replace('.toggle-btn.active { background: var(--accent);',
                               '.toggle-btn.active { background: color-mix(in srgb, var(--accent) 20%, transparent);');
if (mutated === source) {
  console.log('✗ FAIL: control could not find .toggle-btn.active to mutate.');
  failures++;
} else {
  const m = mutated.match(/\.toggle-btn\.active\s*\{([^}]*)\}/);
  check('CONTROL: a tinted selected state IS detected',
    /color-mix/.test(m[1]), true);
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
