#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-save-anim-shape.mjs
//
// THE BUG THIS PREVENTS: a container that quietly clips its own content.
//
// playLogSaveAnimation() swipes an absolutely-positioned panel across a row to
// confirm a save. Three elements anchor it: #home-weight-row, #home-steps-row
// (both .log-row-anim) and #home-meas-anim-wrap.
//
// Those anchors used to carry `overflow: hidden` + `border-radius`, so the
// PANEL would be rounded while it swiped. It also meant the anchor clipped its
// own ordinary content along that curve, permanently. In the Measurements sheet
// the first thing inside is the "WAIST (IN)" label, sitting in the top-left
// corner — and the top-left of the W was sliced off. Nothing in the label's own
// styling could explain it, because nothing in the label was wrong. Adam's
// words: "a really quiet bug".
//
// 🚨 BOTH HALVES OF THE FIX ARE INVISIBLE IN NORMAL USE, which is why they are
// tested rather than trusted:
//   · the clip only shows on one glyph, in one sheet;
//   · the rounding it was there for only shows during a 0.6s animation, right
//     after a save, which nobody is looking at closely.
// Undo either and nothing looks obviously broken.
//
// The radius belongs on the PANELS (both are inset:0, so rounding them is
// identical to rounding the box) and the anchors clip nothing. The swipe is a
// scaleX from transform-origin:right, so it never leaves the box and there was
// never anything to clip.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, '..', 'index.html'), 'utf8');

// 🚨 Every lookup below runs over COMMENT-STRIPPED source. This file's own
// subject is heavily commented, and those comments NAME the selectors — so a
// regex for `.log-row-anim` matched the sentence "see .log-row-anim for the bug
// that caused" sitting above a DIFFERENT rule, and reported that rule's body as
// this one's. It did, on the first run; the same mistake as
// verify-sheet-fill-order.mjs and, before it, verify-dev-bypass-real-data.mjs
// (TECHNICAL.md §91). A probe must not be able to read its own prose.
const source = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')      // CSS and JS block comments
  .replace(/^[ \t]*\/\/.*$/gm, '')        // JS line comments
  .replace(/<!--[\s\S]*?-->/g, '');       // HTML comments

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function rule(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{]*\\{([^}]*)\\}');
  const m = source.match(re);
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
}

// ── The panels carry the radius ──────────────────────────────────────────
for (const sel of ['.log-save-overlay', '.log-save-flash']) {
  const body = rule(sel);
  if (body === null) { console.log(`✗ FAIL: no rule for ${sel}`); failures++; continue; }
  check(`${sel} rounds itself`, /border-radius:\s*var\(--r-tile\)/.test(body), true);
  check(`${sel} still covers the row`, /inset:\s*0/.test(body), true);
}

// ── The anchors clip nothing ─────────────────────────────────────────────
const anim = rule('.log-row-anim');
if (anim === null) { console.log('✗ FAIL: no rule for .log-row-anim'); failures++; }
else {
  check('.log-row-anim does not clip', /overflow:\s*hidden/.test(anim), false);
  check('.log-row-anim has no radius to clip along', /border-radius/.test(anim), false);
  // It still has to be a positioning context, or the panels escape the row.
  check('.log-row-anim is still position:relative', /position:\s*relative/.test(anim), true);
}

// The measurements wrapper carries its style inline.
const wrap = source.match(/<div id="home-meas-anim-wrap"([^>]*)>/);
if (!wrap) { console.log('✗ FAIL: #home-meas-anim-wrap not found'); failures++; }
else {
  check('#home-meas-anim-wrap does not clip', /overflow:\s*hidden/.test(wrap[1]), false);
  check('#home-meas-anim-wrap has no radius to clip along', /border-radius/.test(wrap[1]), false);
  check('#home-meas-anim-wrap is still position:relative', /position:\s*relative/.test(wrap[1]), true);
}

// ── The animation still targets all three ────────────────────────────────
for (const id of ['home-weight-row', 'home-steps-row', 'home-meas-anim-wrap']) {
  check(`playLogSaveAnimation still drives #${id}`,
    source.includes(`playLogSaveAnimation('${id}'`), true);
}

// ── CONTROL ──────────────────────────────────────────────────────────────
// Put the clip back on the anchor and the check must fire.
const mutated = source.replace('.log-row-anim { position: relative; }',
                               '.log-row-anim { position: relative; overflow: hidden; border-radius: var(--r-tile); }');

if (mutated === source) {
  console.log('✗ FAIL: control could not find .log-row-anim to mutate.');
  failures++;
} else {
  const m = mutated.match(/\.log-row-anim[^{]*\{([^}]*)\}/);
  check('CONTROL: a clipping anchor IS detected', /overflow:\s*hidden/.test(m[1]), true);
}

console.log('');
if (failures) {
  console.log(`✗ ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('✓ All checks passed.');
