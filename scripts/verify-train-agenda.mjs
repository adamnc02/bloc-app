#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-train-agenda.mjs
//
// WHAT IT PROTECTS (v8.26, TECHNICAL §115): Train → Change session as a WEEK AGENDA, and Edit cycle living in
// Plan → Tools instead of the page header.
//
// 🚨 THE TRAPS:
//   · A unit is a REAL calendar week only when a mesocycle runs over two weeks
//     with microcycles (m1 = first week, m2 = second). With one-week
//     mesocycles both microcycles share a week and one card holds both — then
//     the sessions are told apart as A/B, never the old "M1/M2" jargon.
//   · A partial trailing extension mesocycle has no M2 (isMesoMicroValid): no
//     card for a week that was never generated.
//   · "Up next" must be getNextIncompleteSession() — the same answer Home's Up
//     next gives — and a part-logged session is NOT done.
//   · One tap selects week AND session and closes the sheet (the old sheet
//     took two taps, and the first kept the sheet open).
//   · v8.59 (§174): ONE week open at a time. The viewed week starts open (else
//     up next's, else this week's), opening a week closes the one before, and
//     the opened week's header goes to the top of the week list. The list is
//     rebuilt on every toggle, so its scroll position resets to 0 unless it is
//     carried over: before v8.59 each tap threw the list back to its first
//     week, with several weeks left open. Control: v8.58's toggle (9fae4d3).
//
// Extracts the real functions from index.html. A control shows the v8.25
// builder (d7d70cf) is the old pill strip with no dates.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import './engine-global.mjs'; // v8.33 (§123): extracted functions may be shims calling BlocEngine

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');
const oldHtml = execFileSync('git', ['show', 'd7d70cf:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let failures = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function extract(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) { console.error(`✗ FAIL: ${marker} not found.`); process.exit(1); }
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

const FNS = ['getTrainAgendaUnits', 'getNextIncompleteSession', 'getAllMacroSessions', 'getWeekSets', 'isMesoMicroValid',
  'getMacroEffectiveMesoCount', 'getMacroExtensionInfo', 'isDeloadUnit', 'getDeloadUnitKey', 'toLocalDateStr',
  'selectTrainSession', 'buildTrainPickerHTML', 'trainAgendaDate'];
function build(src, fns) {
  return new Function(`
    let state = null, today = null, trainManualSelect = false, trainAgendaOpen = null;
    const calls = { save: 0, closed: [], rendered: 0 };
    const save = () => { calls.save++; };
    const closeModal = id => calls.closed.push(id);
    const renderTrain = () => { calls.rendered++; };
    const getLocalToday = () => today;
    const engineCtx = () => ({ today: getLocalToday() }); // v8.35 (§125): the shims pass it to the engine
    const document = { getElementById: () => null };
    ${fns.map(n => extract(src, `function ${n}(`)).join('\n')}
    return {
      set: (s, t) => { state = s; today = t; trainAgendaOpen = null; calls.save = 0; calls.closed = []; calls.rendered = 0; },
      get: () => ({ state, trainManualSelect }), calls,
      ${fns.join(', ')}
    };`)();
}
const E = build(html, FNS);

const ex = (id) => ({ id, name: id, setsStart: 2, setsEnd: 2 });
function mkState({ wpm = 2, micro = true, weeks = 3, ext = 0, logs = {}, deloads = {}, cw = 1, cd = 'pullm1' }) {
  const macro = { id: 'mc', name: 'Cut', start: '2026-06-08', weeks, weeksPerMeso: wpm, useMicrocycles: micro, days: ['pull', 'legs'], dayLabels: { pull: 'Pull', legs: 'Legs' }, extensionWeeks: ext };
  const exercises = {};
  const keys = micro ? ['pullm1', 'legsm1', 'pullm2', 'legsm2'] : ['pull', 'legs'];
  keys.forEach(k => { exercises['mc_1_' + k] = [ex('e_' + k)]; });
  return { macro, st: { macrocycles: [macro], exercises, trainLogs: logs, deloads, currentWeek: cw, currentDay: cd } };
}
const done = (logs, w, k, n = 2) => { for (let s = 0; s < n; s++) logs[`mc_${w}_${k}_e_${k}_${s}`] = { done: true }; return logs; };

// ── Two-week mesocycles with microcycles: one card per calendar week ─────
{
  const logs = {};
  ['pullm1', 'legsm1', 'pullm2', 'legsm2'].forEach(k => done(logs, 1, k));
  done(logs, 2, 'pullm1', 1); // part-logged
  const { macro, st } = mkState({ logs, cw: 2, cd: 'pullm1' });
  st.deloads[E.getDeloadUnitKey(macro, 3, 'pullm1')] = true;
  E.set(st, '2026-06-24');
  const { units } = E.getTrainAgendaUnits(macro);
  check('3 two-week mesocycles → 6 calendar-week cards', units.map(u => u.key), ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2']);
  const u21 = units.find(u => u.key === '2-1');
  check('MC 2 week 1 is 22 Jun – 28 Jun', [u21.start, u21.end], ['2026-06-22', '2026-06-28']);
  check('MC 2 week 2 is 29 Jun – 5 Jul', [units[3].start, units[3].end], ['2026-06-29', '2026-07-05']);
  check('"This week" is the card today falls in', units.filter(u => u.isThisWeek).map(u => u.key), ['2-1']);
  check('MC 1 cards are all done', [units[0].doneCount, units[1].doneCount], [2, 2]);
  const pull = u21.sessions.find(s => s.label === 'Pull');
  check('a part-logged session is partial, not done, with its set counts', [pull.partial, pull.done, pull.doneSets, pull.sets], [true, false, 1, 2]);
  check('Up next = getNextIncompleteSession (MC 2 · Pull, week 1)', units.flatMap(u => u.sessions).filter(s => s.upNext).map(s => s.week + ':' + s.dayKey), ['2:pullm1']);
  check('Viewing marks the session Train is showing', units.flatMap(u => u.sessions).filter(s => s.viewing).map(s => s.dayKey + '@' + s.week), ['pullm1@2']);
  check('a deload week is flagged on its card only', units.filter(u => u.isDeload).map(u => u.key), ['3-1']);
  check('two-week cards need no A/B: labels are plain session names', u21.sessions.map(s => s.label), ['Pull', 'Legs']);
  E.set(st, '2026-06-24');
  const out = E.buildTrainPickerHTML(macro);
  check('the sheet shows real dates and the week-of-mesocycle line', /22 Jun – 28 Jun/.test(out) && /MC 2 · week 1 of 2/.test(out), true);
  check('one week starts open: the viewed one', (out.match(/aria-expanded="true"/g) || []).length, 1);
  check('no old pill strip or M1/M2 tabs', /week-pill|day-tab| M1<| M2</.test(out), false);
}

// ── One-week mesocycles with microcycles: one card per MC, A/B ───────────
{
  const { macro, st } = mkState({ wpm: 1, weeks: 2, cw: 1, cd: 'pullm1' });
  E.set(st, '2026-06-09');
  const { units } = E.getTrainAgendaUnits(macro);
  check('one-week mesocycles → one card per MC', units.map(u => [u.key, u.start, u.end]), [['1-12', '2026-06-08', '2026-06-14'], ['2-12', '2026-06-15', '2026-06-21']]);
  check('…holding both microcycles, told apart as A/B (never M1/M2)', units[0].sessions.map(s => s.label), ['Pull · A', 'Legs · A', 'Pull · B', 'Legs · B']);
}

// ── No microcycles ───────────────────────────────────────────────────────
{
  const { macro, st } = mkState({ wpm: 1, micro: false, weeks: 2, cw: 1, cd: 'pull' });
  E.set(st, '2026-06-09');
  const { units } = E.getTrainAgendaUnits(macro);
  check('no microcycles → one card per MC with plain session names', units.map(u => u.sessions.map(s => s.dayKey + ':' + s.label).join(',')), ['pull:Pull,legs:Legs', 'pull:Pull,legs:Legs']);
}

// ── A partial trailing extension mesocycle has no second week ────────────
{
  const { macro, st } = mkState({ weeks: 2, ext: 1, cw: 1, cd: 'pullm1' });
  E.set(st, '2026-06-09');
  const { units, total } = E.getTrainAgendaUnits(macro);
  check('a 1-week extension on 2-week mesocycles adds MC 3 week 1 only', [total, units.map(u => u.key)], [3, ['1-1', '1-2', '2-1', '2-2', '3-1']]);
}

// ── v8.59: one week open, and the opened week at the top of the list ─────
{
  // Viewing MC 3 week 1, this week MC 2 week 1, up next MC 1: three different weeks.
  const { macro, st } = mkState({ cw: 3, cd: 'pullm1' });
  E.set(st, '2026-06-24');
  const out = E.buildTrainPickerHTML(macro);
  const opened = [...out.matchAll(/data-unit="([^"]+)">\s*<button class="agenda-head"[^>]*aria-expanded="true"/g)].map(m => m[1]);
  check('viewing, this week and up next all differ: only the viewed week starts open', opened, ['3-1']);
}
function agendaToggle(src) {
  // The list is a stub: 6 units 100px apart (an open one 200px taller), 400px
  // of list showing, scrollTop clamped as a browser clamps it, and rebuilt
  // (scrollTop 0, padding reset) by every render, as the real innerHTML is.
  const UNITS = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2'];
  const fresh = () => ({ _top: 0, clientHeight: 400, offsetTop: 40, style: {},
    get scrollHeight() { return 600 + (parseInt(this.style.paddingBottom) || 0) + (this._open ? 200 : 0); },
    get scrollTop() { return this._top; },
    set scrollTop(v) { this._top = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight)); },
    querySelector(sel) { const m = sel.match(/data-unit="([^"]+)"/); const i = m ? UNITS.indexOf(m[1]) : -1;
      return i < 0 ? null : { offsetTop: 40 + i * 100 + (this._open && UNITS.indexOf(this._open) < i ? 200 : 0) }; } });
  let list = fresh();
  const body = ['toggleTrainAgendaUnit', 'scrollAgendaUnitToTop'].filter(n => src.includes(`function ${n}(`)).map(n => extract(src, `function ${n}(`)).join('\n');
  const api = new Function('document', `
    let trainAgendaOpen = null, renders = 0;
    const renderTrainSessionPicker = () => { renders++; __rebuild(); };
    ${body}
    return { toggle: k => toggleTrainAgendaUnit(k), open: () => trainAgendaOpen, set: v => { trainAgendaOpen = v; }, renders: () => renders };`);
  const doc = { getElementById: id => (id === 'train-session-picker' ? list : null) };
  globalThis.__rebuild = () => { const o = api0.open(); list = fresh(); list._open = o instanceof Set ? [...o][0] : o; };
  const api0 = api(doc);
  return { api: api0, list: () => list };
}
for (const [label, src, expectPass] of [['now', html, true], ['v8.58 (control)', execFileSync('git', ['show', '9fae4d3:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 << 20 }), false]]) {
  const { api, list } = agendaToggle(src);
  const isNew = typeof api.set === 'function' && /scrollAgendaUnitToTop/.test(src);
  api.set(isNew ? '2-1' : new Set(['2-1']));
  list().scrollTop = 120;
  api.toggle('3-1');
  const o1 = api.open(); const openNow = o1 instanceof Set ? [...o1] : [o1];
  const r = [openNow, list().scrollTop];
  api.toggle('3-1');
  const o2 = api.open(); const r2 = [o2 instanceof Set ? [...o2] : [o2], list().scrollTop];
  api.toggle('3-2');
  const r3 = [list().scrollTop, parseInt(list().style.paddingBottom) || 0];
  const ok = JSON.stringify(r) === JSON.stringify([['3-1'], 400]) && JSON.stringify(r2) === JSON.stringify([[''], 200]) && JSON.stringify(r3) === JSON.stringify([500, 108]);
  if (expectPass) {
    check('opening MC 3 week 1 (scrolled to 120) closes MC 2 week 1 and puts its header at the top of the list (400)', r, [['3-1'], 400]);
    check('closing it again closes all and keeps the list where it was, as far as the shorter list allows (400 → its new bottom, 200)', r2, [[''], 200]);
    check('the last week reaches the top too: the 100px shortfall becomes bottom padding (8 + 100), scrollTop 500', r3, [500, 108]);
  } else {
    check('CONTROL: v8.58\'s toggle keeps several weeks open and resets the list to the top', ok, false);
  }
}

// ── One tap: week + session, sheet closes ────────────────────────────────
{
  const { macro, st } = mkState({ cw: 1, cd: 'pullm1' });
  E.set(st, '2026-06-09');
  E.selectTrainSession(3, 'legsm2');
  check('selectTrainSession sets the week AND the session, closes the sheet, re-renders',
    [E.get().state.currentWeek, E.get().state.currentDay, E.get().trainManualSelect, E.calls.closed, E.calls.rendered, E.calls.save],
    [3, 'legsm2', true, ['modal-train-session'], 1, 1]);
}

// ── Plan: Edit cycle lives in Tools ──────────────────────────────────────
const header = extract(html, 'function renderPlanHeader(');
const tools = extract(html, 'function renderPlanTools(');
check('the Plan header has no edit button any more', /openEditMacro|icon-btn/.test(header), false);
check('Tools opens with Edit cycle, before Extend and New cycle',
  tools.indexOf('Edit cycle') > -1 && tools.indexOf('Edit cycle') < tools.indexOf('Extend cycle') && tools.indexOf('Extend cycle') < tools.indexOf('New cycle')
  && /openEditMacro\('\$\{macro\.id\}'\)/.test(tools), true);
check('the Tools tour step mentions Edit cycle', /title: 'Edit, extend, or start again'/.test(html), true);

// ── CONTROL: v8.25's sheet was the pill strip with no dates ──────────────
const oldBuilder = extract(oldHtml, 'function buildTrainPickerHTML(');
check('CONTROL: the v8.25 builder used the MC pill strip and M-tabs, with no dates', /week-pill/.test(oldBuilder) && /' M' \+ mc/.test(oldBuilder) && !/toLocaleDateString/.test(oldBuilder), true);

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nALL CHECKS PASS');
process.exit(failures ? 1 : 0);
