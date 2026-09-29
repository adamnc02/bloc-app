#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-new-cycle-sheet.mjs (v8.46, TECHNICAL §149)
//
// BLOC's New cycle sheet has BLOC Coach's layout. The trap in rebuilding it:
// its code reads the old fields by id (createMacrocycle, validateMacroPace,
// the Monday and clash checks, the sheet's reset in openModal, and the
// "Build this plan next" pre-fill), so a field dropped or renamed fails
// silently (getElementById returns null, or a value reads as ''). Every id
// those functions read must exist in the sheet; Goal and Weeks per
// mesocycle are hidden inputs behind segments, so no tour step may
// spotlight them; RPE stays in Plan ▸ Tools, not in this sheet.
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
const fn = (name) => { const i = html.indexOf(`function ${name}(`); let d = 0; for (let j = html.indexOf('{', i); j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) return html.slice(i, j + 1); } return ''; };
const sheetOf = (src) => { const i = src.indexOf('<div class="modal-overlay" id="modal-macro">'); return src.slice(i, src.indexOf('<!-- Edit Macrocycle -->', i)); };
const readers = ['createMacrocycle', 'validateMacroPace', 'onMacroGoalTypeChange', 'syncMacroMesocyclesFromGate', 'onMacroTargetWeeksChange', 'fillNextCycleMacroModal', 'selectMacroOpt', 'syncMacroForm', 'stepMacroMesos', 'updateSessionsPerWeekPreview', 'renderCustomSessions'];
const openBranch = (() => { const s = fn('openModal'); const i = s.indexOf("if (id === 'modal-macro')"); return s.slice(i, s.indexOf("document.getElementById(id).classList.add('open')", i)); })();
const ids = new Set();
for (const src of [...readers.map(fn), openBranch]) {
  for (const m of src.matchAll(/getElementById\('([a-z0-9-]+)'\)/g)) ids.add(m[1]);
  for (const m of src.matchAll(/getElementById\(prefix \+ '(-[a-z0-9-]+)'\)/g)) ids.add('macro' + m[1]);
  for (const m of src.matchAll(/getElementById\('(split|micro)-opt-'\s*\+\s*v\)/g)) for (const v of m[1] === 'split' ? ['ppl', 'fullbody', 'custom'] : ['yes', 'no']) ids.add(`${m[1]}-opt-${v}`);
}
const relevant = [...ids].filter((id) => /^(macro-|split-|micro-|custom-|weight-increment-row)/.test(id) && !/^macro-(overview|extend|clash-sheet)/.test(id));
const missing = (sheet) => relevant.filter((id) => !new RegExp(`id="${id}"`).test(sheet));
const sheet = sheetOf(html);
check(`every id the New cycle code reads is in the sheet (${relevant.length})`, relevant.length > 15 && missing(sheet).length === 0, missing(sheet).join(', '));
check('Goal and Weeks per mesocycle are hidden inputs behind segments', /type="hidden" id="macro-goal-type-input"/.test(sheet) && /type="hidden" id="macro-weeks-per-meso-input"/.test(sheet)
  && /data-goal="maintenance"/.test(sheet) && /data-wpm="2"/.test(sheet));
check('no tour step spotlights a hidden input', !/targetId: '(macro-goal-type-input|macro-weeks-per-meso-input)'/.test(html) && /targetId: 'macro-goal-seg'/.test(html));
check('effort ratings (RPE) stay in Plan ▸ Tools, not this sheet', !/rpe/i.test(sheet.replace(/<!--[\s\S]*?-->/g, '')));
check('the sheet redraws after its reset and the AI pre-fill', /syncMacroForm\(\); \/\/ v8\.46 \(§149\)\s*\n\s*\}\s*\n\s*document\.getElementById\(id\)\.classList\.add\('open'\)/.test(html) && /syncMacroForm\(\); \/\/ v8\.46 \(§149\): the goal and length segments follow the pre-fill/.test(fn('fillNextCycleMacroModal')));

console.log('\n— control: the sheet with one field removed —');
check('control: a missing field is caught', missing(sheet.replace('id="macro-weight-increment-input"', 'id="x"')).includes('macro-weight-increment-input'));

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
