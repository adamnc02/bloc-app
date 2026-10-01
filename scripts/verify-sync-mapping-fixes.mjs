#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-sync-mapping-fixes.mjs
//
// WHAT IT PROTECTS (v8.36, TECHNICAL §128, with
// migration 0025): four things the mirror got wrong, each silent.
//   1. macrocycles.use_microcycles — the app reads an unset useMicrocycles
//      as ON (`!== false`); the sync sent `!!`, mirroring it as OFF.
//      extension_weeks was never sent at all, so an extended cycle's length
//      was wrong in the mirror and the GDPR export.
//   2. exercise_logs — a cleared weight or reps box stores '', which
//      `numeric` refuses. ONE such set failed the WHOLE exercise_logs push,
//      on every retry (syncTable() has already deleted the old rows).
//   3. bloc_checkins — keyed (user_id, id) since 0025. PostgREST's
//      onConflict must name exactly the key's columns, or every check-in
//      upsert is refused.
//   4. Delete my data / Close my account — the user's `client-media` files
//      (coach-visible photos, 0024) can only be removed through the Storage
//      API (MIGRATION-LESSONS §70), and must be removed BEFORE the erase.
//      Storage's list() is not recursive: a folder comes back as an entry
//      with no id, so a flat list would miss every file in a sub-folder.
//   5. One push at a time. Two overlapping pushes interleave their
//      delete-then-insert per table: 409 "duplicate key … macrocycles_pkey"
//      (on a reload), and a late macrocycles delete
//      cascades away the other push's freshly written children.
//
// Extracts the real functions from index.html. CONTROL: the same checks on
// v8.35 (d789154), which must fail each of the four.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const current = readFileSync(join(repo, 'index.html'), 'utf8');

function extract(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return null;
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  return null;
}

// A fake Storage bucket: `files` is a list of full paths. list() answers the
// way Supabase does — one level, folders as { name, id: null } — and pages.
function fakeStorage(files) {
  const removed = [];
  const calls = [];
  const bucket = (name) => ({
    async list(prefix, { limit = 100, offset = 0 } = {}) {
      calls.push(['list', name, prefix]);
      const seen = new Map();
      for (const f of files) {
        if (!f.startsWith(prefix + '/')) continue;
        const rest = f.slice(prefix.length + 1);
        const [head, ...more] = rest.split('/');
        if (!seen.has(head)) seen.set(head, more.length ? { name: head, id: null } : { name: head, id: 'obj_' + head });
      }
      return { data: [...seen.values()].slice(offset, offset + limit), error: null };
    },
    async remove(paths) { calls.push(['remove', name, paths.length]); removed.push(...paths); return { error: null }; },
  });
  return { storage: { from: bucket }, removed, calls };
}

async function run(source, label) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const FNS = ['syncNumOrNull', 'syncParseTrainLogKey', 'syncRowsMacrocycles', 'syncRowsExerciseLogs', 'syncBlocCheckin',
    'listClientMediaPaths', 'deleteAllClientMedia'];
  const bodies = FNS.map(n => extract(source, `${n.startsWith('sync') && n !== 'syncBlocCheckin' ? '' : 'async '}function ${n}(`));
  const missing = FNS.filter((n, i) => !bodies[i]);
  const lib = new Function('supabaseRef', `
    let state = null; let supabase = null; const save = () => {};
    ${bodies.filter(Boolean).join('\n')}
    return {
      setState: s => { state = s; }, setSupabase: s => { supabase = s; },
      ${FNS.map((n, i) => `${n}: ${bodies[i] ? n : 'null'}`).join(', ')}
    };
  `)();

  // 1. macrocycles
  lib.setState({ macrocycles: [
    { id: 'm_unset', name: 'A', weeks: 4, weeksPerMeso: 2, sessionsPerWeek: 3, start: '2026-09-07', days: [], dayLabels: {} },
    { id: 'm_off', name: 'B', useMicrocycles: false, extensionWeeks: 2, weeks: 4, weeksPerMeso: 2, sessionsPerWeek: 3, start: '2026-11-02', days: [], dayLabels: {} },
    { id: 'm_odd', name: 'C', useMicrocycles: true, extensionWeeks: '3', weeks: 4, weeksPerMeso: 2, sessionsPerWeek: 3, start: '2027-01-04', days: [], dayLabels: {} },
    { id: 'm_neg', name: 'D', extensionWeeks: -1, weeks: 4, weeksPerMeso: 2, sessionsPerWeek: 3, start: '2027-03-01', days: [], dayLabels: {} },
  ] });
  const mr = lib.syncRowsMacrocycles('u1');
  check('an unset useMicrocycles is mirrored ON, as the app reads it', mr[0].use_microcycles, true);
  check('an explicit false stays off', mr[1].use_microcycles, false);
  check('extension_weeks is sent: unset → 0, 2 → 2, "3" → 3, -1 → 0 (the column CHECKs ≥ 0)',
    mr.map(r => r.extension_weeks), [0, 2, 3, 0]);

  // 2. exercise_logs
  const ctx = { ex_1: { macroId: 'm_unset', day: 'session0', microcycle: 'm1' } };
  lib.setState({ macrocycles: [], trainLogs: {
    'm_unset_1_session0m1_ex_1_0': { weight: '', reps: '8', done: true },
    'm_unset_1_session0m1_ex_1_1': { weight: 40, reps: '', done: false },
    'm_unset_1_session0m1_ex_1_2': { weight: 0, reps: '60 reps', done: true },
  } });
  const lr = lib.syncRowsExerciseLogs('u1', ctx);
  check("a cleared weight box ('') is sent as null, not ''", lr[0].weight, null);
  check("a cleared reps box ('') is sent as null", lr[1].reps, null);
  check('real values pass through, including 0 and text reps', [lr[2].weight, lr[2].reps, lr[0].reps], [0, '60 reps', '8']);

  // 3. bloc_checkins
  let sent = null;
  lib.setSupabase({ from: () => ({ async upsert(row, opts) { sent = { row, opts }; return { error: null }; } }) });
  lib.setState({ blocAdvice: { id: 'chk_1', storedAt: '2026-09-20', response: { signal: 'on_track' } } });
  if (lib.syncBlocCheckin) await lib.syncBlocCheckin('u1');
  check("the check-in upserts on 'user_id,id' (0025's key)", sent && sent.opts, { onConflict: 'user_id,id' });

  // 4. client-media
  check('deleteAllClientMedia() exists', missing.filter(n => /ClientMedia/.test(n)), []);
  if (lib.deleteAllClientMedia) {
    const files = ['u1/checkins/2026-09-20/front.jpg', 'u1/checkins/2026-09-20/side.jpg', 'u1/reviews/m1/before.jpg', 'u1/loose.jpg',
      ...Array.from({ length: 1203 }, (_, i) => `u1/bulk/p${i}.jpg`), 'u2/checkins/x.jpg'];
    const fake = fakeStorage(files);
    lib.setSupabase(fake);
    await lib.deleteAllClientMedia('u1');
    check('every one of the user\'s files is removed, sub-folders and a >1000-file folder included',
      fake.removed.slice().sort(), files.filter(f => f.startsWith('u1/')).sort());
    check('nothing outside {uid}/ is touched', fake.removed.filter(f => !f.startsWith('u1/')), []);
    check("only the 'client-media' bucket is used", [...new Set(fake.calls.map(c => c[1]))], ['client-media']);
    check('removes go in batches of at most 1000', fake.calls.filter(c => c[0] === 'remove').every(c => c[2] <= 1000), true);
  }
  // 5. One push at a time (the sign-in full sync and a
  // boot save()'s debounced flush overlapped, 409 on macrocycles_pkey).
  const wrapper = extract(source, 'function pushStateSerialised(');
  check('pushStateSerialised() exists', !!wrapper, true);
  if (wrapper) {
    const W = new Function(`
      let active = 0, maxActive = 0, runs = 0, stateVersion = 0; const seen = [];
      async function pushStateToSupabase(userId) {
        active++; maxActive = Math.max(maxActive, active); runs++; seen.push(stateVersion);
        await new Promise(r => setTimeout(r, 20));
        active--; if (runs === 1 && globalThis.__failFirst) throw new Error('boom');
      }
      let _pushRunning = null, _pushQueued = null;
      ${wrapper}
      return { push: pushStateSerialised, bump: () => stateVersion++, stats: () => ({ maxActive, runs, seen }) };
    `)();
    const first = W.push('u1'); W.bump();
    const queued = [W.push('u1'), W.push('u1'), W.push('u1')];
    await Promise.all([first, ...queued]);
    const st = W.stats();
    check('overlapping requests never run two pushes at once', st.maxActive, 1);
    check('three requests during a push share ONE follow-up push (2 runs in all)', st.runs, 2);
    check('the follow-up reads the state as it is when it starts, not when it was asked for', st.seen, [0, 1]);
    const after = W.push('u1'); await after;
    check('a request after both finish starts a fresh push', W.stats().runs, 3);
    // CONTROL: without the wrapper, the same timing overlaps.
    const N = new Function(`
      let active = 0, maxActive = 0;
      async function pushStateToSupabase() { active++; maxActive = Math.max(maxActive, active); await new Promise(r => setTimeout(r, 20)); active--; }
      return { push: pushStateToSupabase, max: () => maxActive };
    `)();
    await Promise.all([N.push(), N.push()]);
    check('control: calling the push directly overlaps (what v8.35 did)', N.max(), 2);
    // A failed push must not block the queue.
    globalThis.__failFirst = true;
    const F = new Function(`
      let runs = 0;
      async function pushStateToSupabase() { runs++; await new Promise(r => setTimeout(r, 5)); if (runs === 1) throw new Error('boom'); }
      let _pushRunning = null, _pushQueued = null;
      ${wrapper}
      return { push: pushStateSerialised, runs: () => runs };
    `)();
    const f1 = F.push('u1').catch(e => e.message); const f2 = F.push('u1').then(() => 'ok', e => e.message);
    check('a failed push reports its error, and the queued one still runs', [await f1, await f2, F.runs()], ['boom', 'ok', 2]);
    delete globalThis.__failFirst;
  }
  // Code lines only: every comment that mentions it is a // line.
  const directCalls = source.split('\n')
    .filter(l => !l.trim().startsWith('//') && /(^|[^\w])pushStateToSupabase\(/.test(l)).length;
  // One definition + the wrapper's call.
  check('nothing calls pushStateToSupabase() except the wrapper', directCalls, 2);

  for (const fn of ['handleDeleteMyData', 'handleCloseAccount']) {
    const body = extract(source, `function ${fn}(`) || '';
    const media = body.indexOf('deleteAllClientMedia(userId)');
    const erase = body.indexOf("rpc('gdpr_erase_user_data'");
    check(`${fn} removes client-media files BEFORE the erase`, media !== -1 && erase !== -1 && media < erase, true);
  }
  return failures;
}

const failures = await run(current, 'v8.36');

// CONTROL: v8.35 must fail all four.
// No skip: a control that quietly doesn't run is a check that always passes.
// CI checks out full history for exactly this (pages.yml, fetch-depth: 0).
const control = execFileSync('git', ['show', 'd789154:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
{
  console.log('\n— control: v8.35 (d789154), which must fail —');
  const orig = console.log; const lines = []; console.log = (s) => lines.push(String(s));
  let cf;
  try { cf = await run(control, 'v8.35'); } finally { console.log = orig; }
  const failed = (re) => lines.some(l => l.startsWith('✗') && re.test(l));
  const want = [/pushStateSerialised\(\) exists/, /unset useMicrocycles/, /extension_weeks/, /cleared weight/, /user_id,id/, /deleteAllClientMedia\(\) exists/, /handleDeleteMyData removes/, /handleCloseAccount removes/];
  const missed = want.filter(re => !failed(re));
  if (missed.length || !cf) { console.log(`✗ control: v8.35 did not fail ${missed.map(String).join(', ') || 'anything'}`); process.exitCode = 1; }
  else console.log(`✓ control: v8.35 fails all ${want.length} (${cf} checks in all)`);
}

if (failures) { console.log(`\nFAIL: ${failures} check(s)`); process.exitCode = 1; }
else console.log('\nAll checks pass.');
