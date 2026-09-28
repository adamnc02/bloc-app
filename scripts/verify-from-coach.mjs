#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-from-coach.mjs — v8.41, PROMPT-03 Phase 4e-2, TECHNICAL §135
//
// THE RULES THIS PROTECTS (proposal §4.3, §11):
//   · Progress → From your coach shows the coach's LATEST response per tool
//     (check-in / review / next cycle), from state.coachAdvice (never
//     blocAdvice, I5): byline, headline, first paragraph, scores, Read full,
//     and a note back. Read-only: no signal chip, no Build / Challenge.
//   · 🚨 A response belongs to ONE cycle (its macro_id), as Solo's check-in,
//     review and next-cycle advice do: Progress shows the viewed cycle's, and
//     the hero's cycle switch changes them (Adam, v8.41 UAT: it showed on
//     every cycle). One with no macro_id shows on all. Read full names the cycle.
//   · A republished response reads "Updated · …" (§11 Q10).
//   · A note back is one client_submissions row, kind 'note_back', naming
//     the response's publication; once sent the row says so, and the coach's
//     reply (a note_reply publication) shows under it.
//   · Check in is one client_submissions row, kind 'check_in' (feel, note,
//     photo paths). 🚨 Photos go to client-media ONLY while photo consent is on,
//     read at send time; a failed insert removes what it uploaded.
//   · Everything the coach wrote is escaped: it's text, never markup.
//
// It lifts the real functions out of index.html (the golden extractor) and
// runs them against a fake Supabase. Control: v8.40 (99273df) must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import './engine-global.mjs';
import { mainScript, indexTopLevel, closure } from './golden/extract-engine.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTROL = '99273df';

const STUBS = ['state', 'save', 'coachLinkGet', 'coachingAvailable', 'isCoachedMode', 'supabase', '_authResolvedSession',
  'renderProgress', 'openModal', 'closeModal', 'getLocalToday', '_downsizePhotoFileToBase64', 'document', 'engineCtx'];

function build(src) {
  const { decls } = indexTopLevel(mainScript(src));
  const seeds = ['renderProgressFromCoach', 'openCoachResponse', 'openCoachNote', 'sendCoachNote', 'openCoachCheckin', 'sendCoachCheckin',
    'setCoachCheckinFeel', 'coachToolKey', 'coachAdviceContent', 'applyAiResponsePublication'];
  for (const s of seeds) if (!decls.has(s)) return null;
  const parts = closure(decls, seeds, new Set(STUBS));
  return new Function('env', `
    let state = env.state;
    const save = () => env.log.push(['save']);
    const coachLinkGet = () => env.link;
    const coachingAvailable = () => env.available;
    const isCoachedMode = () => !!env.link;
    const supabase = env.supabase;
    const _authResolvedSession = { user: { id: 'u1' } };
    const renderProgress = () => env.log.push(['render']);
    const openModal = id => env.log.push(['open', id]);
    const closeModal = id => env.log.push(['close', id]);
    const getLocalToday = () => '2026-09-28';
    const engineCtx = () => ({ today: '2026-09-28' });
    const _downsizePhotoFileToBase64 = async f => ({ base64: f, mediaType: 'image/jpeg' });
    const document = env.document;
    const atob = s => Buffer.from(s, 'base64').toString('binary');
    ${parts.map(p => p.text).join('\n')}
    return { renderProgressFromCoach, openCoachResponse, openCoachNote, sendCoachNote, openCoachCheckin, sendCoachCheckin, setCoachCheckinFeel,
      coachToolKey, coachAdviceContent, applyAiResponsePublication, get checkin() { return _coachCheckin; } };`);
}

function makeEnv(over = {}) {
  const els = new Map();
  const document = {
    getElementById: id => { if (!els.has(id)) els.set(id, { id, innerHTML: '', value: '', style: {}, textContent: '', disabled: false }); return els.get(id); },
    querySelector: () => ({ textContent: '' }),
  };
  const calls = [];
  const env = {
    log: [], calls, els, document, available: true,
    link: { coachId: 'coach-1', coachName: 'Sam Rivers', photoConsent: true },
    state: { macrocycles: [], bodyLogs: [], coachAdvice: [], coachNoteReplies: {}, currentMacroId: null },
    insertError: null, uploadError: null,
  };
  env.supabase = {
    from: table => ({
      insert: row => ({ select: () => ({ single: async () => { calls.push(['insert', table, row]); return env.insertError ? { data: null, error: env.insertError } : { data: { id: 'sub-' + calls.length }, error: null }; } }) }),
    }),
    storage: { from: bucket => ({
      upload: async (path, blob, opts) => { calls.push(['upload', bucket, path, opts && opts.contentType, blob && blob.size > 0]); return { error: env.uploadError }; },
      remove: async paths => { calls.push(['remove', bucket, paths]); return { error: null }; },
    }) },
  };
  return Object.assign(env, over);
}

const advice = (over) => Object.assign({ responseId: 'r1', tool: 'check_in', macroId: null, publicationId: 'pub-1', seq: 5,
  content: { headline: 'Good week', narrative: ['First para.', 'Second para.'], kcal: 2350, steps: 9000 }, publishedAt: '2026-09-24T09:00:00Z' }, over);

async function run(label, src) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const factory = build(src);
  check('the From your coach functions exist', !!factory, true);
  if (!factory) return failures;

  // ── 1. Shapes ────────────────────────────────────────────────────────────
  {
    const F = factory(makeEnv());
    check('tool names: check_in, check-in and review all read as one of the three tools',
      ['check_in', 'check-in', 'cycle_review', 'review', 'next_cycle'].map(F.coachToolKey), ['check-in', 'check-in', 'cycle-review', 'cycle-review', 'next-cycle']);
    check('content: a narrative array, a \\n\\n string, or a bare string all become paragraphs',
      [F.coachAdviceContent({ content: { narrative: ['a', 'b'] } }).paras, F.coachAdviceContent({ content: { headline: 'h', narrative: 'a\n\nb' } }).paras,
        F.coachAdviceContent({ content: 'just text' }).paras], [['a', 'b'], ['a', 'b'], ['just text']]);
    const env = makeEnv();
    const G = factory(env);
    env.state.coachAdvice = [];
    G.applyAiResponsePublication({ id: 'p9', seq: 9, created_at: '2026-09-25T10:00:00Z', payload: { response_id: 'rX', tool: 'check_in', content: { headline: 'h' } } });
    check('an applied response keeps the publication\'s date (the byline\'s)', env.state.coachAdvice[0].publishedAt, '2026-09-25T10:00:00Z');
  }

  // ── 2. The card ──────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    env.state.coachAdvice = [advice({ responseId: 'r0', seq: 2, content: { headline: 'Older check-in', narrative: ['old'] } }), advice(),
      advice({ responseId: 'r2', tool: 'cycle_review', seq: 3, publicationId: 'pub-2', content: { headline: 'Review', narrative: ['r'] } })];
    const F = factory(env);
    const el = { innerHTML: '' };
    F.renderProgressFromCoach(el, null);
    const h = el.innerHTML;
    check('it opens on the newest response\'s tool, showing that tool\'s LATEST response',
      [h.includes('Good week'), h.includes('Older check-in')], [true, false]);
    check('byline: the coach, the tool and the publication\'s date', h.includes('Sam Rivers') && /Check-in · Thu 24 Sept?/.test(h), true);
    check('first paragraph only on the card; kcal and steps as scores', [h.includes('First para.'), h.includes('Second para.'), h.includes('2,350'), h.includes('steps a day')], [true, false, true, true]);
    check('Read full check-in, Send a note back, and Check in', [h.includes('Read full check-in'), h.includes('Send a note back'), h.includes('openCoachCheckin()')], [true, true, true]);
    check('🚨 read-only: no signal chip, no Build, no Challenge, no Ask BLOC', /chip-c|Build this|Challenge|Ask BLOC/.test(h), false);

    env.state.coachAdvice.push(advice({ responseId: 'rx', seq: 7, publicationId: 'pub-7', updated: true, content: { headline: '<img src=x onerror=alert(1)>', narrative: ['<b>x</b>'] } }));
    const F2 = factory(env); const el2 = { innerHTML: '' };
    F2.renderProgressFromCoach(el2, null);
    check('a republished response reads "Updated · …"', el2.innerHTML.includes('Updated · Check-in'), true);
    check('🚨 the coach\'s text is escaped, never markup', [el2.innerHTML.includes('<img'), el2.innerHTML.includes('&lt;img')], [false, true]);

    const env3 = makeEnv(); const F3 = factory(env3); const el3 = { innerHTML: '' };
    F3.renderProgressFromCoach(el3, null);
    check('nothing published: "Nothing shared yet."', el3.innerHTML.includes('Nothing shared yet.'), true);
  }

  // ── 2b. One cycle each ───────────────────────────────────────────────────
  {
    const A = { id: 'mA', name: 'Weight Loss 2026', start: '2026-06-22', weeks: 7 };
    const B = { id: 'mB', name: 'UAT light', start: '2026-03-02', weeks: 3 };
    const env = makeEnv();
    env.state.macrocycles = [B, A];
    env.state.coachAdvice = [
      advice({ responseId: 'a1', macroId: 'mA', seq: 5, content: { headline: 'For A', narrative: ['a'] } }),
      advice({ responseId: 'b1', macroId: 'mB', seq: 6, tool: 'cycle_review', content: { headline: 'For B', narrative: ['b'] } }),
    ];
    const F = factory(env);
    const elA = { innerHTML: '' }; F.renderProgressFromCoach(elA, A);
    const elB = { innerHTML: '' }; F.renderProgressFromCoach(elB, B);
    check('🚨 viewing cycle A shows A\'s response and not B\'s; viewing B, the reverse',
      [elA.innerHTML.includes('For A'), elA.innerHTML.includes('For B'), elB.innerHTML.includes('For B'), elB.innerHTML.includes('For A')], [true, false, true, false]);
    check('…and each opens on its own newest tool (A: Check-in, B: Review), the tab resetting on the switch',
      [/toggle-btn active[^>]*>Check-in/.test(elA.innerHTML), /toggle-btn active[^>]*>Review/.test(elB.innerHTML)], [true, true]);
    F.openCoachResponse('a1');
    check('Read full names the cycle: "For Weight Loss 2026 · 22 Jun – …"',
      /For Weight Loss 2026 · 22 Jun – /.test(env.document.getElementById('coach-response-body').innerHTML), true);

    const envN = makeEnv();
    envN.state.macrocycles = [B, A];
    envN.state.coachAdvice = [advice({ responseId: 'n1', macroId: null, seq: 1, content: { headline: 'No cycle named', narrative: ['n'] } })];
    const N = factory(envN);
    const nA = { innerHTML: '' }; N.renderProgressFromCoach(nA, A);
    const nB = { innerHTML: '' }; N.renderProgressFromCoach(nB, B);
    check('a response naming no cycle is never lost: it shows on every cycle', [nA.innerHTML.includes('No cycle named'), nB.innerHTML.includes('No cycle named')], [true, true]);
  }

  // ── 3. A note back ───────────────────────────────────────────────────────
  {
    const env = makeEnv();
    env.state.coachAdvice = [advice()];
    const F = factory(env);
    F.openCoachNote('r1');
    env.document.getElementById('coach-note-text').value = '  Knees sore on squats  ';
    await F.sendCoachNote();
    const ins = env.calls.filter(c => c[0] === 'insert');
    check('one client_submissions row: note_back, the coach, the response\'s publication, the text trimmed',
      ins.map(c => [c[1], c[2].client_id, c[2].coach_id, c[2].kind, c[2].publication_id, c[2].body.response_id, c[2].body.text]),
      [['client_submissions', 'u1', 'coach-1', 'note_back', 'pub-1', 'r1', 'Knees sore on squats']]);
    check('…remembered against the publication, saved, and the sheet closed',
      [env.state.coachNotesSent['pub-1'].submissionId, env.log.some(l => l[0] === 'save'), env.log.some(l => l[0] === 'close' && l[1] === 'modal-coach-note')],
      ['sub-1', true, true]);
    env.state.coachNoteReplies['sub-1'] = { text: 'Drop to 3 sets this week.' };
    const el = { innerHTML: '' }; factory(env).renderProgressFromCoach(el, null);
    check('once sent, the row says so, and the coach\'s reply shows under it',
      [el.innerHTML.includes('Note sent to Sam'), el.innerHTML.includes('openCoachNote('), el.innerHTML.includes('Drop to 3 sets this week.')], [true, false, true]);

    const envF = makeEnv({ insertError: { message: 'network' } });
    envF.state.coachAdvice = [advice()];
    const G = factory(envF);
    G.openCoachNote('r1'); envF.document.getElementById('coach-note-text').value = 'hi';
    await G.sendCoachNote();
    check('a failed send records nothing and says why', [!!(envF.state.coachNotesSent && envF.state.coachNotesSent['pub-1']), envF.document.getElementById('coach-note-error').textContent.startsWith('Couldn’t send it')], [false, true]);

    const envU = makeEnv(); envU.link = null; envU.state.coachAdvice = [advice()];
    const U = factory(envU); U.openCoachNote('r1'); envU.document.getElementById('coach-note-text').value = 'hi';
    await U.sendCoachNote();
    check('unlinked: nothing is sent', envU.calls.length, 0);
  }

  // ── 4. Check in ──────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    const F = factory(env);
    F.openCoachCheckin();
    F.checkin.photos.push({ base64: 'AAAA' }, { base64: 'BBBB' });
    env.document.getElementById('coach-checkin-note').value = ' Slept badly '; // the textarea is what's sent
    await F.sendCoachCheckin();
    check('no feel chosen: nothing sent', env.calls.length, 0);
    F.setCoachCheckinFeel('Tough');
    await F.sendCoachCheckin();
    const up = env.calls.filter(c => c[0] === 'upload');
    check('with consent: each photo to client-media under {uid}/checkins/{folder}/n.jpg, as JPEG',
      up.map(c => [c[1], /^u1\/checkins\/[^/]+\/[12]\.jpg$/.test(c[2]), c[3], c[4]]), [['client-media', true, 'image/jpeg', true], ['client-media', true, 'image/jpeg', true]]);
    const ins = env.calls.find(c => c[0] === 'insert');
    check('…then one check_in row with the feel, the trimmed note and those paths',
      [ins[2].kind, ins[2].coach_id, ins[2].publication_id, ins[2].body.feel, ins[2].body.note, ins[2].body.photos], ['check_in', 'coach-1', null, 'Tough', 'Slept badly', up.map(c => c[2])]);
    check('…recorded (for "Last check-in sent"), saved, and closed',
      [env.state.coachCheckinsSent.length, env.state.coachCheckinsSent[0].feel, env.log.some(l => l[0] === 'close' && l[1] === 'modal-coach-checkin')], [1, 'Tough', true]);

    const envN = makeEnv(); envN.link = { coachId: 'coach-1', coachName: 'Sam', photoConsent: false };
    const N = factory(envN);
    N.openCoachCheckin(); N.checkin.photos.push({ base64: 'AAAA' }); N.setCoachCheckinFeel('Good');
    await N.sendCoachCheckin();
    check('🚨 consent OFF at send time: no photo leaves the phone, the check-in still goes',
      [envN.calls.filter(c => c[0] === 'upload').length, envN.calls.find(c => c[0] === 'insert')[2].body.photos], [0, []]);

    const envE = makeEnv({ insertError: { message: 'not your coach' } });
    const E = factory(envE);
    E.openCoachCheckin(); E.checkin.photos.push({ base64: 'AAAA' }); E.setCoachCheckinFeel('Okay');
    await E.sendCoachCheckin();
    const up2 = envE.calls.filter(c => c[0] === 'upload').map(c => c[2]);
    check('a failed insert removes the photos it uploaded, records nothing, and keeps the form open with the reason',
      [envE.calls.filter(c => c[0] === 'remove').map(c => c[2])[0], envE.state.coachCheckinsSent, E.checkin && E.checkin.error && E.checkin.error.startsWith('Couldn’t send it')],
      [up2, undefined, true]);
  }
  return failures;
}

const failures = await run('now', readFileSync(join(repo, 'index.html'), 'utf8'));

console.log(`\n— control: v8.40 (${CONTROL}), which must fail —`);
const orig = console.log; const lines = []; console.log = s => lines.push(String(s));
let cf = 0;
try { cf = await run('v8.40', execFileSync('git', ['show', `${CONTROL}:index.html`], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })); }
finally { console.log = orig; }
if (cf > 0 && lines.some(l => /✗ .*the From your coach functions exist/.test(l))) console.log('✓ control: v8.40 has no From your coach');
else { console.log(`✗ control: v8.40 should fail (${cf} failed)`); process.exitCode = 1; }

if (failures) { console.log(`\nFAIL: ${failures} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
