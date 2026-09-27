#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-rpe-sync.mjs
//
// WHAT IT PROTECTS (v8.20, TECHNICAL §104; migration 0018): state.rpe
// reaches the exercise_ratings mirror (what the GDPR export reads), and
// macro.rpe reaches macrocycles.rpe.
//
// 🚨 THE TRAPS:
//   · The table's CHECK allows exactly one of rpe (1–10) or skipped. A row
//     carrying both, or neither, fails the whole exercise_ratings insert —
//     and syncTable() has already deleted the old rows by then, so the
//     mirror silently loses every rating. So every row must be one or the
//     other, and a skip is never sent as a number.
//   · The key has no set index and ids contain underscores (demo exercise
//     ids even contain the dayKey), so it is parsed against the known
//     exercise ids, never split on '_'.
//   · exercise_ratings references exercises, so its job must run after the
//     exercises job (parents before children, TECHNICAL §59).
//   · macrocycles.rpe must be sent as a real boolean; an absent macro.rpe is
//     false (off), matching the column's default.
//
// Extracts the real functions from index.html. A control shows that a naive
// split-on-underscore parser gets the demo ids wrong.
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
function extract(marker) {
  const start = source.indexOf(marker);
  if (start === -1) { console.error(`✗ FAIL: ${marker} not found in index.html.`); process.exit(1); }
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  return null;
}

const FNS = ['syncBuildExerciseIdContext', 'syncParseRpeKey', 'syncRowsExerciseRatings', 'syncRowsMacrocycles'];
const lib = new Function(`
  let state = null;
  ${FNS.map(n => extract(`function ${n}(`)).join('\n')}
  return { setState: s => { state = s; }, ${FNS.join(', ')} };
`)();

// Demo-shaped ids: the macro id and the exercise ids both contain underscores,
// and the exercise ids contain the dayKey itself.
const MID = 'macro_1780859905961';
const ex = (day, i) => ({ id: `ex_${MID}_1_${day}_${i}`, name: `Ex ${day} ${i}`, order: i });
const state = {
  macrocycles: [
    { id: MID, name: 'Cut', days: ['session0', 'session1'], useMicrocycles: true, rpe: true, start: '2026-06-08', weeks: 7 },
    { id: 'macro_2', name: 'Old', days: ['push'], useMicrocycles: false, start: '2026-01-05', weeks: 4 },
  ],
  exercises: {
    [`${MID}_1_session0m1`]: [ex('session0m1', 0), ex('session0m1', 1), ex('session0m1', 10)],
    [`${MID}_1_session1m2`]: [ex('session1m2', 0)],
    ['macro_2_1_push']: [{ id: 'bench', name: 'Bench', order: 0 }],
  },
  rpe: {
    [`${MID}_3_session0m1_ex_${MID}_1_session0m1_0`]: { rpe: 7 },
    [`${MID}_3_session0m1_ex_${MID}_1_session0m1_10`]: { rpeSkipped: true },
    [`${MID}_12_session1m2_ex_${MID}_1_session1m2_0`]: { rpe: 10 },
    ['macro_2_2_push_bench']: { rpe: 4 },
    ['macro_2_2_push_deleted_ex']: { rpe: 5 },                 // exercise no longer exists
    [`${MID}_3_session0m1_ex_${MID}_1_session0m1_1`]: {},      // neither — never sent
    ['macro_2_3_push_bench']: { rpe: 11 },                     // out of range, not skipped — never sent
  },
};
lib.setState(state);
const ctx = lib.syncBuildExerciseIdContext();
const rows = lib.syncRowsExerciseRatings('u1', ctx);
const byKey = Object.fromEntries(rows.map(r => [`${r.exercise_id}@${r.week}`, r]));

check('four syncable ratings become rows; orphaned, empty and out-of-range ones do not', rows.length, 4);
check('a rating → rpe set, skipped false', byKey[`ex_${MID}_1_session0m1_0@3`],
  { user_id: 'u1', macrocycle_id: MID, exercise_id: `ex_${MID}_1_session0m1_0`, week: 3, day_key: 'session0m1', rpe: 7, skipped: false });
check('a skip → rpe null, skipped true (never a number)', byKey[`ex_${MID}_1_session0m1_10@3`].rpe === null && byKey[`ex_${MID}_1_session0m1_10@3`].skipped === true, true);
check('exercise _0 and _10 are told apart (suffix match is anchored)', !!byKey[`ex_${MID}_1_session0m1_0@3`] && !!byKey[`ex_${MID}_1_session0m1_10@3`], true);
check('a two-digit mesocycle parses', byKey[`ex_${MID}_1_session1m2_0@12`]?.week, 12);
check('day_key carries the microcycle', byKey[`ex_${MID}_1_session1m2_0@12`]?.day_key, 'session1m2');
check('a plain (no microcycle) cycle parses', byKey['bench@2'] && byKey['bench@2'].day_key === 'push' && byKey['bench@2'].macrocycle_id === 'macro_2', true);
check('every row satisfies the table CHECK: exactly one of rpe / skipped',
  rows.every(r => (r.rpe !== null) !== r.skipped && (r.rpe === null || (r.rpe >= 1 && r.rpe <= 10))), true);

const macroRows = lib.syncRowsMacrocycles('u1');
check('macrocycles.rpe: true → true', macroRows[0].rpe, true);
check('macrocycles.rpe: absent → false (off), a real boolean', macroRows[1].rpe, false);

const push = extract('async function pushStateToSupabase(');
const order = [...push.matchAll(/\['([a-z_]+)',/g)].map(m => m[1]);
check('exercise_ratings syncs after exercises (parent before child)', order.indexOf('exercise_ratings') > order.indexOf('exercises') && order.indexOf('exercises') >= 0, true);
check('syncRowsMacrocycles carries the 0018-must-be-live warning', /migration 0018\. 🚨 That migration must be LIVE before this ships/.test(extract('function syncRowsMacrocycles(')), true);

// CONTROL: a naive parser that splits the key on '_' cannot find the week.
const naive = key => { const p = key.split('_'); return { macroId: p[0], week: parseInt(p[1], 10) }; };
const n = naive(`${MID}_3_session0m1_ex_${MID}_1_session0m1_0`);
check('CONTROL: a split-on-underscore parser gets the demo key wrong', n.macroId !== MID || n.week !== 3, true);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
