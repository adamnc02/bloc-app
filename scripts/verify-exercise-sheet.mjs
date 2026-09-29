#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-exercise-sheet.mjs (v8.46, TECHNICAL §150)
//
// BLOC's Add / Edit exercise sheet has BLOC Coach's shape: the exercise is
// chosen in a search sheet (modal-ex-pick, a .kb-pinned-sheet, checked by
// verify-kb-pinned-sheets.mjs) instead of a long select, adding starts on
// that search, Category shows when adding only, and a body part is asked
// only for a name the library doesn't have (through Custom Exercise).
// The trap: the sheet's readers (saveExercise, openEditExercise, the
// category switch, the last-logged note and history defaults) read fields
// by id, so every one of them must still be there, and the exercise's name
// is the hidden ex-name-input they already read.
// Control: the sheet with one field removed is caught.
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
const fn = (name) => { const i = html.indexOf(`function ${name}(`); if (i < 0) return ''; let d = 0; for (let j = html.indexOf('{', i); j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) return html.slice(i, j + 1); } return ''; };
const sheetOf = (src, id) => { const i = src.indexOf(`<div class="modal-overlay" id="${id}">`); return src.slice(i, src.indexOf('<div class="modal-overlay"', i + 10)); };
const readers = ['saveExercise', 'openEditExercise', 'openAddExercise', 'openAddExerciseToSuperset', 'applyExCategoryVisibility', 'onExTypeChange', 'selectExMetric',
  'populateExerciseSelect', 'updateLastLoggedPreview', 'applyExerciseHistoryDefaults', 'updateLegSelectLabels', 'resetExCardioFields', 'setDropsetOptionEnabled'];
const ids = new Set();
for (const src of readers.map(fn)) for (const m of src.matchAll(/getElementById\('([a-z0-9-]+)'\)/g)) ids.add(m[1]);
for (const src of readers.map(fn)) for (const m of src.matchAll(/setSelectValue\('([a-z0-9-]+)'/g)) ids.add(m[1]);
const own = [...ids].filter((id) => /^(ex-|modal-ex-title)/.test(id));
const sheet = sheetOf(html, 'modal-exercise');
const missing = (sh) => own.filter((id) => !new RegExp(`id="${id}"`).test(sh));
check(`every id the exercise sheet's code reads is in it (${own.length})`, own.length > 20 && missing(sheet).length === 0, missing(sheet).join(', '));
check('the exercise is a hidden input behind a button that opens the search, never a select', /<input type="hidden" id="ex-name-input"/.test(sheet) && !/<select id="ex-name-input"/.test(sheet) && /onclick="openExPick\(\)"/.test(sheet));
check('adding starts on the search; the creation tour opens it without, to spotlight the sheet',
  /if \(!opts \|\| opts\.pick !== false\) openExPick\(\);/.test(fn('openAddExercise')) && /openExPick\(\);/.test(fn('openAddExerciseToSuperset')) && /openAddExercise\(1, macro\.days\[0\], \{ pick: false \}\)/.test(html));
check('Category shows when adding only', /ex-category-group'\)\.style\.display = 'none'/.test(fn('openEditExercise')) && /ex-category-group'\)\.style\.display = ''/.test(fn('openAddExercise')));
const pick = sheetOf(html, 'modal-ex-pick');
check('the search asks no body part; a new name goes through Custom Exercise, which does', !/bodypart/i.test(pick) && /modal-custom-exercise/.test(fn('addExPickCustom')) && /closeModal\('modal-ex-pick'\)/.test(fn('saveCustomExercise')));
check('saving with no exercise chosen opens the search instead', /if \(!document\.getElementById\('ex-name-input'\)\.value\.trim\(\)\) \{ openExPick\(\); return; \}/.test(fn('saveExercise')));
check('Heavy leg and Weight is sit side by side, with the increments spelled out under them', /id="ex-weight-leg-group"[\s\S]{0,400}id="ex-weight-tracking-group"/.test(sheet) && /id="ex-leg-caption"/.test(sheet) && /ex-leg-caption/.test(fn('updateLegSelectLabels')));

console.log('\n— control: the sheet with one field removed —');
check('control: a missing field is caught', missing(sheet.replace('id="ex-tracking-select"', 'id="x"')).includes('ex-tracking-select'));

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
