#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-goal-edit-keeps-macro.mjs
//
// THE BUG THIS PREVENTS: editing a goal period silently re-links it to a
// different macrocycle (reported 2026-09-25, fixed in v8.19 — TECHNICAL §95).
//
// openEditGoal() builds the Macrocycle <select> with the goal's own macro
// marked `selected`, then calls openModal('modal-add-goal'). openModal then
// REBUILT the same options from scratch with nothing selected, and a <select>
// with no selected option shows — and returns as .value — its FIRST option.
// saveGoal() reads the macroId straight off that dropdown, so any save from
// an edit (even one that changed only kcal) moved the goal to
// state.macrocycles[0]. Nothing on screen says it happened unless you look at
// the dropdown before tapping Save.
//
// 🚨 Every edit entry point goes through that one rebuild — openEditGoal,
// chooseExtendLastGoal (the "extend last goal" choice) and the goal queue's
// truncation step — so the fix lives in openModal, not in each caller.
//
// This extracts the REAL openEditGoal, openModal's goal block and saveGoal out
// of index.html and runs them together against a <select> stub that behaves
// like a browser's (no `selected` option → the first one wins). A control at
// the end restores the pre-v8.19 rebuild and asserts the suite then FAILS —
// without that, a passing run proves nothing.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'index.html'), 'utf8');

// ── Brace-matched extraction, from `marker` onward (searching from `from`) ──
function extractFrom(marker, from = 0) {
  const start = source.indexOf(marker, from);
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
function extractUnique(marker) {
  const first = source.indexOf(marker);
  if (first !== -1 && source.indexOf(marker, first + 1) !== -1) {
    console.error(`✗ FAIL: ${marker} is defined more than once in index.html.`);
    process.exit(1);
  }
  return extractFrom(marker);
}

const openEditSrc = extractUnique('function openEditGoal(macroGoalID) {');
const saveGoalSrc = extractUnique('function saveGoal() {');
const openModalAt = source.indexOf('function openModal(id) {');
// The first goal block after openModal's signature is openModal's own;
// closeModal has a second one further down.
const goalBlockSrc = openModalAt === -1 ? null : extractFrom("if (id === 'modal-add-goal') {", openModalAt);
for (const [name, s] of [['openEditGoal', openEditSrc], ['saveGoal', saveGoalSrc], ["openModal's modal-add-goal block", goalBlockSrc]]) {
  if (!s) {
    console.error(`✗ FAIL: ${name} not found in index.html.`);
    console.error('  It was renamed or restructured. Update this script deliberately — do not delete the check.');
    process.exit(1);
  }
}

// ── A <select> that behaves like the browser's ───────────────────────────
function makeSelect() {
  const sel = { options: [], selectedIndex: -1 };
  Object.defineProperty(sel, 'innerHTML', {
    set(html) {
      sel.options = [...html.matchAll(/<option value="([^"]*)"( selected)?>/g)].map(m => ({ value: m[1], selected: !!m[2] }));
      const s = sel.options.findIndex(o => o.selected);
      sel.selectedIndex = sel.options.length ? (s === -1 ? 0 : s) : -1;
    },
  });
  Object.defineProperty(sel, 'value', {
    get() { return sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].value : ''; },
    set(v) { sel.selectedIndex = sel.options.findIndex(o => o.value === v); },
  });
  return sel;
}

// ── Run one edit → save round trip in a fresh world ──────────────────────
function editAndSave(goalBlock, { goalId, changeMacroTo, kcal } = {}) {
  const state = {
    macrocycles: [
      { id: 'm1', name: 'Cut A' },
      { id: 'm2', name: 'Cut B' },
      { id: 'm3', name: 'Maintain' },
    ],
    goals: [
      { macroId: 'm1', macroGoalID: 'm1_g1', startDate: '2026-07-01', endDate: '2026-07-31', kcal: 1800, steps: 9000, protein: 180, carbs: 150, fats: 55, _blocLabel: 'Step 1 - A' },
      { macroId: 'm2', macroGoalID: 'm2_g1', startDate: '2026-09-01', endDate: '2026-09-30', kcal: 1600, steps: 10000, protein: 170, carbs: 120, fats: 50, _blocLabel: 'Step 1 - B' },
      { macroId: 'm3', macroGoalID: 'm3_g1', startDate: '2026-11-01', endDate: '2026-11-30', kcal: 2200, steps: 8000, protein: 170, carbs: 250, fats: 70, _blocLabel: 'Step 1 - M' },
    ],
  };
  const els = {};
  const el = (id) => (els[id] ||= id === 'goal-macro-select' ? makeSelect() : { value: '', style: {}, dataset: {}, textContent: '' });
  const renumbered = [];
  const scope = {
    state,
    document: { getElementById: el },
    today: '2026-09-26',
    getLocalToday: () => '2026-09-26',
    toLocalDateStr: (d) => d.toISOString().slice(0, 10),
    prefillGoalLabelForSelectedMacro: () => {},
    requestAnimationFrame: () => {},
    initGoalMacroSliders: () => {},
    findOverlappingGoal: () => null,
    formatDate: (d) => d,
    computeGoalMacroGrams: () => ({ proteinG: 1, carbG: 1, fatG: 1 }),
    goalMacroSliderState: { userTouched: false },
    generateMacroGoalID: (m) => `${m}_new`,
    renumberMacroGoalSteps: (m) => renumbered.push(m),
    save: () => {},
    closeModal: () => {},
    renderPlanGoalsSection: () => {},
    setTimeout: () => {},
  };
  const openModalSrc = `function openModal(id) {\n${goalBlock}\n}`;
  const names = Object.keys(scope);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, `${openModalSrc}\n${openEditSrc}\n${saveGoalSrc}\nreturn { openEditGoal, saveGoal };`);
  const api = factory(...names.map((n) => scope[n]));

  el('modal-add-goal');
  api.openEditGoal(goalId);
  const shownInDropdown = el('goal-macro-select').value;
  if (changeMacroTo) el('goal-macro-select').value = changeMacroTo;
  if (kcal) el('goal-kcal-input').value = String(kcal);
  api.saveGoal();
  const saved = state.goals.find(g => g.macroGoalID === goalId);
  return { shownInDropdown, saved, renumbered, count: state.goals.length };
}

let failures = 0;
function check(name, got, want) {
  if (got === want) console.log(`✓ ${name}`);
  else { console.log(`✗ FAIL: ${name} — expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); failures++; }
}

function suite(goalBlock, quiet = false) {
  const log = console.log;
  if (quiet) console.log = () => {};
  const before = failures;
  // The reported case: a goal in a macrocycle that is NOT first in the list.
  let r = editAndSave(goalBlock, { goalId: 'm2_g1', kcal: 1650 });
  check('edit a goal in the 2nd macrocycle: dropdown shows its own macro', r.shownInDropdown, 'm2');
  check('…and after saving a kcal-only edit it still belongs to m2', r.saved.macroId, 'm2');
  check('…the kcal edit itself was saved', r.saved.kcal, 1650);
  check('…no goal added or lost', r.count, 3);
  r = editAndSave(goalBlock, { goalId: 'm3_g1' });
  check('edit a goal in the 3rd macrocycle, save unchanged: still m3', r.saved.macroId, 'm3');
  r = editAndSave(goalBlock, { goalId: 'm1_g1' });
  check('edit a goal in the 1st macrocycle: still m1 (the case that always looked fine)', r.saved.macroId, 'm1');
  // A deliberate move is still allowed, and both macros get renumbered.
  r = editAndSave(goalBlock, { goalId: 'm2_g1', changeMacroTo: 'm3' });
  check('deliberately moving a goal to m3 is honoured', r.saved.macroId, 'm3');
  check('…and both the new and the old macrocycle are renumbered', r.renumbered.sort().join(','), 'm2,m3');
  if (quiet) console.log = log;
  return failures - before;
}

console.log('— Real code —');
suite(goalBlockSrc);

// ── Control: the pre-v8.19 rebuild must make the suite fail ──────────────
const oldRebuild = goalBlockSrc
  .replace(" + (m.id === editingMacroId ? ' selected' : '')", '')
  .replace('if (editingMacroId) sel.value = editingMacroId;', '');
const realFailures = failures;
const controlFailures = suite(oldRebuild, true);
failures = realFailures;
if (oldRebuild === goalBlockSrc) {
  console.log('✗ FAIL: control could not restore the old rebuild — the fix lines changed; update the control');
  failures++;
} else if (controlFailures === 0) {
  console.log('✗ FAIL: control — with the old rebuild restored the suite still passed, so it is not testing the bug');
  failures++;
} else {
  console.log(`✓ control: the pre-v8.19 rebuild fails ${controlFailures} check(s), as it should`);
}

if (failures) { console.log(`\n✗ ${failures} failure(s)`); process.exit(1); }
console.log('\nAll checks passed.');
