#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-progress-ai-independence.mjs
//
// THE BUG THIS PREVENTS: one of Progress's three AI features silently hiding
// another.
//
// BLOC has three AI features on Progress — the mid-cycle check-in, the cycle
// review, and build-next-cycle. Before v8.16 they shared ONE slot, filled by
// priority:
//
//     buildFinalWeekCardHTML()  →  buildCycleReviewCardHTML()
//                               →  buildAiAdviceCardHTML() fused into Insights
//
// The consequences were invisible from any screen, because the slot always had
// something in it. The mid-cycle check-in disappeared for the whole of a
// cycle's FINAL WEEK — the week you would most want to check in — because the
// final-week card outranked it. And once a cycle ended, its review took the
// slot permanently and the check-in never came back.
//
// 🚨 Each feature now owns a section and renders on its own eligibility. The
// failure this guards against is a future edit reintroducing a gate: an early
// return, an `if (!macro.review)`, or a shared container that one section
// overwrites. None of that shows up as an error — the page just quietly stops
// offering something.
//
// 🚨 It parses the REAL renderProgress() and the REAL section renderers out of
// index.html rather than keeping a copy of the rules, because a copy passes
// forever while the shipped code drifts. Two controls at the end mutate the
// extracted source — reintroducing a priority chain, and gating one section on
// another's state — and assert the suite then FAILS. Without them, a passing
// run proves nothing.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

let failures = 0;
const ok   = m => console.log('  ✓ ' + m);
const bad  = m => { failures++; console.log('  ✗ ' + m); };
const check = (cond, m) => cond ? ok(m) : bad(m);

// Pulls one top-level function's source out of index.html by brace matching,
// so what is asserted on is the shipped text, not a transcription of it.
function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

const SECTIONS = {
  checkin:   'renderProgressCheckin',
  lastCycle: 'renderProgressLastCycle',
  nextCycle: 'renderProgressNextCycle',
};

function run(src, label) {
  const localFailures = [];
  const localCheck = (cond, m) => { if (!cond) localFailures.push(m); };

  const renderProgress = extract(src, 'renderProgress');
  localCheck(!!renderProgress, 'renderProgress() exists');

  // 1. All three section renderers are called, and unconditionally — no `if`
  //    on the same line, which is how a priority chain reappears.
  for (const [key, fn] of Object.entries(SECTIONS)) {
    const line = (renderProgress || '').split('\n').find(l => l.includes(fn + '('));
    localCheck(!!line, `renderProgress() calls ${fn}()`);
    localCheck(!!line && !/\b(if|\?|&&|\|\|)\b/.test(line.replace(fn + '(', '')),
      `${fn}() is called unconditionally`);
  }

  // 2. Each section writes to its OWN container. A shared container is the
  //    other way one feature silently replaces another.
  const containers = {
    checkin:   'progress-checkin',
    lastCycle: 'progress-last-cycle',
    nextCycle: 'progress-next-cycle',
  };
  for (const [key, fn] of Object.entries(SECTIONS)) {
    const body = extract(src, fn);
    localCheck(!!body, `${fn}() exists`);
    localCheck(!!body && body.includes(`'${containers[key]}'`),
      `${fn}() writes to #${containers[key]}`);
    // No section may reach into another's container.
    for (const [otherKey, otherId] of Object.entries(containers)) {
      if (otherKey === key) continue;
      localCheck(!body || !body.includes(`'${otherId}'`),
        `${fn}() does not write to #${otherId}`);
    }
  }

  // 3. No section's own render is gated on another feature's stored state.
  //    The check-in must not consult macro.review; the review must not consult
  //    state.blocAdvice or state.nextCycleAdvice; and so on.
  const foreignState = {
    checkin:   ['macro.review', 'state.nextCycleAdvice'],
    lastCycle: ['state.blocAdvice', 'state.nextCycleAdvice'],
    nextCycle: ['macro.review', 'state.blocAdvice'],
  };
  for (const [key, fn] of Object.entries(SECTIONS)) {
    const body = extract(src, fn);
    for (const expr of foreignState[key]) {
      localCheck(!body || !body.includes(expr),
        `${fn}() does not read ${expr}`);
    }
  }

  // 4. The superseded priority chain is gone for good. These three builders
  //    WERE the chain; a reference to any of them means it is back.
  // Comments are stripped first: the removal notes name both builders, and a
  // raw text count cannot tell a note from a call.
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const gone of ['buildFinalWeekCardHTML(', 'buildCycleReviewCardHTML(']) {
    const calls = code.split(gone).length - 1;
    localCheck(calls === 0, `${gone.slice(0, -1)}() has no call sites`);
  }

  // 5. §3.6: the no-key state dims but never disables. A `disabled` attribute
  //    on an AI action is a dead end that explains nothing.
  for (const [key, fn] of Object.entries(SECTIONS)) {
    const body = extract(src, fn);
    localCheck(!body || !/\bdisabled\b/.test(body.replace(/\/\/[^\n]*/g, '')),
      `${fn}() sets no disabled attribute on its AI action`);
  }

  if (label) {
    // Control run: report whether it failed, do not print every line.
    return localFailures.length;
  }
  localFailures.forEach(bad);
  if (!localFailures.length) ok('every assertion passed against the shipped source');
  return localFailures.length;
}

console.log('\nProgress AI sections — independence');
run(source, null);

// ── Controls ─────────────────────────────────────────────────────────────
// Each reintroduces one of the two shapes of the original bug and asserts the
// suite notices. A check that cannot fail is not a check.
console.log('\nControls — each must FAIL the suite above');

const controlChain = source.replace(
  /(\n\s*)renderProgressCheckin\(macro\);/,
  '$1if (!macro.review) renderProgressCheckin(macro);');
check(run(controlChain, 'control') > 0,
  'a priority chain (check-in gated on there being no review) is caught');

const controlShared = source.replace(
  "document.getElementById('progress-last-cycle')",
  "document.getElementById('progress-checkin')");
check(run(controlShared, 'control') > 0,
  'two sections sharing one container is caught');

console.log('');
if (failures) {
  console.log(`FAIL — ${failures} problem${failures === 1 ? '' : 's'}\n`);
  process.exit(1);
}
console.log('All checks passed.\n');
