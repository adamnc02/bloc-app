#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-replace.mjs
//
// WHAT IT PROTECTS (v8.45, TECHNICAL §143): a coach's cycle replacing the
// client's own running cycle. BLOC holds a plan whose cycle overlaps another
// (§131). When the only overlap is the client's OWN cycle running today,
// and the coach's starts on a later Monday, the hold becomes a question on
// Home; the client ends their cycle early or keeps it.
//
// 🚨 THE TRAPS:
//   · The hold must never be loosened: nothing changes before the client
//     answers, and "Keep my cycle" changes nothing either.
//   · A cycle's length is `weeks` MESOCYCLES × weeksPerMeso + extensionWeeks.
//     Cutting inside a mesocycle the client has started would turn this
//     week into an extension week and change its targets, so that start is
//     refused and the next boundary suggested. `weeks` never becomes 0
//     (BLOC reads `weeks || 8`).
//   · Goals: the one running across the new end is cut to end on it; later
//     ones of that cycle are removed; earlier ones and every log stay.
//   · The coach's goal phases for the new cycle are held with it, and apply
//     in the same pull once the client accepts.
//   · A coach's cycle, a cycle not running today, or a second overlap is
//     never offered as a replace.
//
// Runs the real functions from index.html and the built engine on the demo
// dataset (its cycle runs 8 Jun – 13 Sep 2026 in 2-week mesocycles).
// CONTROL: v8.44 (d909ae0), which only ever holds.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const current = readFileSync(join(repo, 'index.html'), 'utf8');
const demoText = readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8');
const demo = () => JSON.parse(demoText);

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log('✓ ' + label);
  else { failures++; console.log('✗ ' + label + (detail ? `\n    ${detail}` : '')); }
}

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  return null;
}
function extractConst(source, name) {
  const start = source.indexOf(`const ${name} =`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === '[' || c === '{' || c === '(') depth++;
    else if (c === ']' || c === '}' || c === ')') depth--;
    else if (c === ';' && depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

const FNS = ['coachLedger', 'pubCopy', 'applyPlanPublication', 'invalidateUnloggedTargets', 'applyGoalsPatch',
  'applyGoalPhasesPublication', 'applyPublications', 'addCoachNotice', 'addGoalPhasesNotice'];
const NEW = ['coachReplaceAsks', 'coachReplaceOffer', 'coachReplaceHold', 'shortenCycleForReplace', 'pendingCoachReplaceAsks'];

function build(source, engine, today) {
  const bodies = FNS.map(n => extract(source, n));
  if (bodies.some(b => !b)) return null;
  const extra = NEW.map(n => extract(source, n) || `function ${n}() { return null; }`);
  const consts = ['PUB_MACRO_FIELDS', 'COACH_NOTICE_KEEP'].map(n => extractConst(source, n) || `const ${n} = 30;`);
  return new Function('env', `
    let state = env.state;
    const BlocEngine = env.engine, engineCtx = () => ({ today: ${JSON.stringify(today)} }), getLocalToday = () => ${JSON.stringify(today)};
    const findMacroClash = (c, ms, x) => env.engine.findMacroClash(c, ms, x, engineCtx());
    const getMacroDurationWeeks = m => env.engine.getMacroDurationWeeks(m);
    const coachFirstName = () => 'Sam', coachDayFmt = d => String(d), coachToolMeta = () => ({ label: 'Check-in' });
    ${consts.join('\n')}
    ${bodies.join('\n')}
    ${extra.join('\n')}
    const PUB_APPLIERS = { plan: applyPlanPublication, goal_phases: applyGoalPhasesPublication };
    return { get state() { return state; }, applyPublications, pendingCoachReplaceAsks };
  `)({ state: env0.state, engine });
}
let env0 = { state: null };

async function loadEngine() {
  await import('./engine-global.mjs');
  return globalThis.BlocEngine;
}

const OWN = 'macro_1780859905961';
const coachMacro = (start, extra = {}) => Object.assign({ id: 'coach_c1', name: 'Coach block', start, weeks: 3, weeksPerMeso: 2,
  sessionsPerWeek: 3, goalType: 'loss', splitType: 'ppl', days: ['push', 'pull', 'legs'], dayLabels: { push: 'Push', pull: 'Pull', legs: 'Legs' },
  useMicrocycles: true, rpe: true }, extra);
const planPub = (seq, start, id = 'p' + seq, extra = {}) => ({ id, seq, coach_id: 'c1', type: 'plan', created_at: null, supersedes: null,
  payload: { v: 1, macrocycle: coachMacro(start), exercises: { 'coach_c1_1_pushm1': [{ id: 'ex_a', name: 'Flat Press', bodyPart: 'Chest', setsStart: 3, setsEnd: 4, reps: '8-10', startWeight: 40, type: 'standard', order: 0 }] }, ...extra } });
const phasesPub = (seq, start) => ({ id: 'g' + seq, seq, coach_id: 'c1', type: 'goal_phases', created_at: null, supersedes: null,
  payload: { v: 1, macro_id: 'coach_c1', goals: [{ macroId: 'coach_c1', macroGoalID: 'coach_c1_g1', startDate: start, endDate: '2026-09-27', kcal: 1900, steps: 9000, protein: 180, carbs: 180, fats: 52 }] } });

const E = await loadEngine();

// ── The rule (engine) ──────────────────────────────────────────────────────
{
  const d = demo();
  const offer = (start, today, macros = d.macrocycles, cand = coachMacro(start)) => E.planReplaceOffer(cand, macros, d.goals, { today });
  const a = offer('2026-08-03', '2026-08-02');
  check('replace: own cycle running, the coach starts next Monday → 4 mesocycles, no extension, ends Sun 2 Aug',
    a && a.kind === 'replace' && a.weeks === 4 && a.extensionWeeks === 0 && a.newEnd === '2026-08-02' && a.oldEnd === '2026-09-13', JSON.stringify(a && { ...a, clash: undefined }));
  check('  goals: none cut (the running one ends 2 Aug already), the 3 later ones removed',
    a && a.trimGoals.length === 0 && a.removeGoals.map(g => g.macroGoalID).join() === `${OWN}_g20260803,${OWN}_g20260831,${OWN}_g20260907`);
  const b = offer('2026-08-10', '2026-08-02');
  check('replace a week later: 4 mesocycles + 1 week of a final mesocycle not yet begun; the goal across 9 Aug is cut',
    b && b.kind === 'replace' && b.weeks === 4 && b.extensionWeeks === 1 && b.newEnd === '2026-08-09'
    && b.trimGoals.map(g => g.macroGoalID).join() === `${OWN}_g20260803` && b.removeGoals.length === 2, JSON.stringify(b && { ...b, clash: undefined }));
  const c = offer('2026-08-10', '2026-08-04');
  check('mid-mesocycle: on Tue 4 Aug the client is in the mesocycle that 10 Aug would split → refused, 17 Aug suggested',
    c && c.kind === 'blocked' && c.reason === 'mid-meso' && c.suggest === '2026-08-17', JSON.stringify(c && { ...c, clash: undefined }));
  const e = offer('2026-08-03', '2026-08-04');
  check('a start on or before the client\'s today is refused (too soon), the next workable Monday suggested',
    e && e.kind === 'blocked' && e.reason === 'too-soon' && e.suggest === '2026-08-17');
  check('a start that isn\'t a Monday is refused', (offer('2026-08-05', '2026-08-02') || {}).reason === 'not-monday');
  const coachOwned = d.macrocycles.map(m => Object.assign({}, m, { publishedBy: 'c1' }));
  const f = offer('2026-08-10', '2026-08-02', coachOwned);
  check('a coach\'s own cycle is never replaced: refused, the Monday after it ends (14 Sep) suggested',
    f && f.reason === 'coach-cycle' && f.suggest === '2026-09-14');
  check('a cycle not running at the client\'s today (before it starts) is never replaced', (offer('2026-06-15', '2026-06-01') || {}).reason === 'not-running');
  const two = d.macrocycles.concat([{ id: 'later', name: 'Later', start: '2026-08-17', weeks: 1 }]);
  check('an overlap with a second cycle too is refused', (offer('2026-08-10', '2026-08-02', two) || {}).reason === 'other-clash');
  check('no overlap → null (nothing to offer)', offer('2026-09-14', '2026-08-02') === null);
  const short = E.planReplaceOffer(coachMacro('2026-06-15'), d.macrocycles, d.goals, { today: '2026-06-09' });
  check('weeks never 0: a one-week cut of a 2-week mesocycle already begun is refused', short && short.kind === 'blocked' && short.reason === 'mid-meso');
}

// ── The funnel (BLOC) ──────────────────────────────────────────────────────
async function scenario(source, today) {
  env0 = { state: Object.assign(demo(), { coachLedger: {}, coachNotices: [], coachReplaceAsks: {} }) };
  return build(source, E, today);
}
{
  const B = await scenario(current, '2026-08-02');
  const before = JSON.stringify({ m: B.state.macrocycles, g: B.state.goals, t: B.state.trainLogs });
  const r1 = B.applyPublications([planPub(1, '2026-08-10'), phasesPub(2, '2026-08-10')]);
  const l = B.state.coachLedger;
  check('asked: the plan is held with "Waiting for the client to end … early, on 2026-08-09."',
    l.p1 && l.p1.status === 'needs_attention' && l.p1.note === 'Waiting for the client to end “Weight Loss 2026” early, on 2026-08-09.', JSON.stringify(l.p1));
  check('  its goal phases are held with it (their cycle isn\'t on the phone yet)', l.g2 && l.g2.status === 'needs_attention');
  check('  nothing changed before an answer: cycles, goals and logs identical',
    JSON.stringify({ m: B.state.macrocycles, g: B.state.goals, t: B.state.trainLogs }) === before && !r1.changed);
  const ask = B.state.coachReplaceAsks.p1;
  check('  the ask records what the sheet shows (new end, old end, the cut and removed goals)',
    ask && ask.answer === null && ask.newEnd === '2026-08-09' && ask.oldEnd === '2026-09-13' && ask.trim.length === 1 && ask.remove.length === 2 && ask.weeks === 6);
  check('  Home has it waiting', B.pendingCoachReplaceAsks().map(a => a.id).join() === 'p1');
  B.state.coachLedger.p1.acked = true; // as if the receipt went out
  B.applyPublications([planPub(1, '2026-08-10'), phasesPub(2, '2026-08-10')]);
  check('  a second pull holds it for the same reason: no new receipt owed, the same ask',
    B.state.coachLedger.p1.acked === true && B.state.coachReplaceAsks.p1.askedAt === ask.askedAt);

  // Keep my cycle.
  B.state.coachReplaceAsks.p1.answer = 'declined';
  B.applyPublications([planPub(1, '2026-08-10'), phasesPub(2, '2026-08-10')]);
  check('Keep my cycle: still held, the receipt now "The client kept “Weight Loss 2026” (to 2026-09-13)."',
    B.state.coachLedger.p1.status === 'needs_attention' && B.state.coachLedger.p1.note === 'The client kept “Weight Loss 2026” (to 2026-09-13).');
  check('  and still nothing changed; Home no longer asks',
    JSON.stringify({ m: B.state.macrocycles, g: B.state.goals, t: B.state.trainLogs }) === before && B.pendingCoachReplaceAsks().length === 0);
}
{
  const B = await scenario(current, '2026-08-02');
  const logsBefore = JSON.stringify(B.state.trainLogs);
  B.applyPublications([planPub(1, '2026-08-10'), phasesPub(2, '2026-08-10')]);
  B.state.coachReplaceAsks.p1.answer = 'accepted';
  const r = B.applyPublications([planPub(1, '2026-08-10'), phasesPub(2, '2026-08-10')]);
  const own = B.state.macrocycles.find(m => m.id === OWN);
  const coach = B.state.macrocycles.find(m => m.id === 'coach_c1');
  check('End my cycle early: the plan applies on the next pull', B.state.coachLedger.p1.status === 'applied' && coach && coach.publishedBy === 'c1' && r.changed);
  check('  and its goal phases apply in the same pull', B.state.coachLedger.g2.status === 'applied' && B.state.goals.some(g => g.macroGoalID === 'coach_c1_g1'));
  check('  the own cycle ends Sun 9 Aug: 4 mesocycles + 1 extension week', own.weeks === 4 && own.extensionWeeks === 1
    && E.getMacroEndDate(own, { today: '2026-08-02' }) === '2026-08-09' && own.endedEarly && own.endedEarly.from === '2026-09-13');
  const og = B.state.goals.filter(g => g.macroId === OWN);
  check('  its goals: the one across 9 Aug now ends 9 Aug, the later two removed, the earlier three unchanged',
    og.length === 4 && og.find(g => g.macroGoalID === `${OWN}_g20260803`).endDate === '2026-08-09'
    && og.filter(g => g.endDate <= '2026-08-02').length === 3);
  check('  every log untouched', JSON.stringify(B.state.trainLogs) === logsBefore);
  check('  no cycle overlaps another afterwards', B.state.macrocycles.every(m => !E.findMacroClash(m, B.state.macrocycles, m.id, { today: '2026-08-02' })));
  check('  Home no longer asks', B.pendingCoachReplaceAsks().length === 0);
}
{
  // A coach's own cycle in the way: an ordinary hold, never an ask.
  const B = await scenario(current, '2026-08-02');
  B.state.macrocycles[0].publishedBy = 'c1';
  B.applyPublications([planPub(1, '2026-08-10')]);
  check('an overlap with a coach\'s cycle is held as before ("Overlaps …"), with no ask',
    B.state.coachLedger.p1.note === 'Overlaps “Weight Loss 2026” (from 2026-06-08).' && !B.state.coachReplaceAsks.p1);
}

// ── Wiring ────────────────────────────────────────────────────────────────
check('applyPlanPublication sends an overlap through coachReplaceHold', /if \(clash\) \{[\s\S]{0,200}coachReplaceHold\(pub, candidate\)/.test(extract(current, 'applyPlanPublication') || ''));
check('the sheet is data-pub-safe (it holds no copy of state)', /id="modal-coach-replace" data-pub-safe/.test(current));
check('Home\'s banner opens it, and its ✕ lasts until the next cold start', /openCoachReplace\(/.test(extract(current, 'renderHomeCoachBanner') || '')
  && /_coachBannerDismissedThisRun\.add\('replace:/.test(extract(current, 'renderHomeCoachBanner') || ''));
check('answering asks for a pull, so the held plan settles', /requestPublicationPull\(/.test(extract(current, 'answerCoachReplace') || ''));
check('unlink clears the asks', /if \(hadAsks\) state\.coachReplaceAsks = \{\}/.test(extract(current, 'removeCoachPlan') || ''));

// ── Control: v8.44 only ever holds ─────────────────────────────────────────
console.log('\n— control: v8.44 (d909ae0), which must fail —');
let old = null;
try { old = execFileSync('git', ['-C', repo, 'show', 'd909ae0:index.html'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch { /* shallow clone */ }
if (!old) console.log('  (d909ae0 not in this clone; control skipped)');
else {
  const B = await scenario(old, '2026-08-02');
  B.applyPublications([planPub(1, '2026-08-10')]);
  B.state.coachReplaceAsks.p1 = { answer: 'accepted', clashId: OWN };
  B.applyPublications([planPub(1, '2026-08-10')]);
  check('control: v8.44 never applies the plan, even with an answer', B.state.coachLedger.p1.status === 'needs_attention');
}

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
