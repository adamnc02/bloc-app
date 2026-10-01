#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-from-coach.mjs — v8.41, TECHNICAL §135
//
// THE RULES THIS PROTECTS:
//   · Progress → From your coach shows the coach's LATEST response per tool
//     (check-in / review / next cycle), from state.coachAdvice (never
//     blocAdvice, I5): byline, headline, first paragraph, scores, Read full,
//     and a note back. Read-only: no signal chip, no Build / Challenge.
//   · 🚨 A response belongs to ONE cycle (its macro_id), as Solo's check-in,
//     review and next-cycle advice do: Progress shows the viewed cycle's, and
//     the hero's cycle switch changes them (it must not show on
//     every cycle). One with no macro_id shows on all. Read full names the cycle.
//   · A republished response reads "Updated · …".
//   · A note back is one client_submissions row, kind 'note_back', naming
//     the response's publication; once sent the row says so, and the coach's
//     reply (a note_reply publication) shows under it.
//   · 🚨 A client never asks for a check-in (v8.56, §168): no Check in
//     button, sheet or `check_in` row with purpose 'check_in'. It comes due
//     on the engine's schedule; the Check-in tab says when, read-only.
//   · Only the tabs ready on the cycle show (coachTabsShown, whose rules are
//     verify-coach-logged's); none ready, the card says when the first comes.
//   · Review photos (v8.44, §142): only in answer to the coach's request (a
//     `photo_request`, verify-publications-apply.mjs), never unprompted. The
//     sheet sends before/after to client-media, then one check_in row with
//     purpose 'cycle_review' and the request_id; or Skip sends that row with
//     `skipped: true` and no photos. Either answers the request and clears its
//     banner. 🚨 Photos only while photo consent is on, read at SEND time;
//     with it off the sheet links to Settings → Coaching and still offers
//     Skip; a failed insert removes what it uploaded.
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
  'renderProgress', 'openModal', 'closeModal', 'getLocalToday', '_downsizePhotoFileToBase64', 'document', 'engineCtx',
  'coachedView', // v8.43 (§137)
  'coachTabsShown', 'coachCheckinLine', 'coachCheckinScheduleFor', // v8.56: their rules are verify-coach-logged's; here the env sets them
  'renderHomeCoachBanner']; // v8.44

function build(src) {
  const { decls } = indexTopLevel(mainScript(src));
  const seeds = ['renderProgressFromCoach', 'openCoachResponse', 'openCoachNote', 'sendCoachNote', 'coachToolKey', 'coachAdviceContent', 'applyAiResponsePublication', 'openCoachPhotoRequest', 'sendCoachReviewPhotos',
    'skipCoachReviewPhotos']; // v8.44 (§142): photos only in answer to the coach's request
  for (const s of seeds) if (!decls.has(s)) return null;
  const parts = closure(decls, seeds, new Set(STUBS));
  return new Function('env', `
    let state = env.state;
    const save = () => env.log.push(['save']);
    const coachLinkGet = () => env.link;
    const coachingAvailable = () => env.available;
    const isCoachedMode = () => !!env.link;
    const coachedView = () => !!env.link;
    const TOOLS3 = [{ key: 'check-in', tab: 'Check-in', label: 'Check-in', readFull: 'Read full check-in' },
      { key: 'cycle-review', tab: 'Review', label: 'Cycle review', readFull: 'Read full review' },
      { key: 'next-cycle', tab: 'Next cycle', label: 'Next cycle', readFull: 'Read full plan' }];
    const coachTabsShown = () => TOOLS3.filter(t => !env.tabs || env.tabs.includes(t.key));
    const coachCheckinLine = () => env.line || '';
    const coachCheckinScheduleFor = () => ({ weeksToData: env.weeksToData || 0 });
    const renderHomeCoachBanner = () => env.log.push(['banner']);
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
    return { renderProgressFromCoach, openCoachResponse, openCoachNote, sendCoachNote,
      coachToolKey, coachAdviceContent, applyAiResponsePublication, openCoachPhotoRequest, sendCoachReviewPhotos, skipCoachReviewPhotos,
      get review() { return _coachReview; } };`);
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
    check('Read full check-in (with its icon); no Check in button (v8.56); the note back is NOT on the card (v8.43: the full sheet only)',
      [/<svg[^>]*>[\s\S]*?<\/svg>Read full check-in/.test(h), h.includes('openCoachNote('), /CoachCheckin|>Check in</.test(h)], [true, false, false]);
    F.openCoachResponse('r1');
    check('…it\'s in the full sheet, with its speech-bubble icon, not the pulsing dot',
      [/<svg[^>]*>[\s\S]*?<\/svg>Send a note back/.test(env.document.getElementById('coach-response-body').innerHTML), /ai-action-dot/.test(env.document.getElementById('coach-response-body').innerHTML)], [true, false]);
    const envG = makeEnv({ line: 'Next check-in · Mon 12 Oct' });
    envG.state.coachAdvice = [advice()];
    const elG = { innerHTML: '' }; factory(envG).renderProgressFromCoach(elG, null);
    check('the Check-in tab says when the next one is due, read-only', elG.innerHTML.includes('Next check-in · Mon 12 Oct'), true);
    const envR = makeEnv({ line: 'Next check-in · Mon 12 Oct' });
    envR.state.coachAdvice = [advice({ tool: 'cycle_review', seq: 9 })];
    const elR = { innerHTML: '' }; factory(envR).renderProgressFromCoach(elR, null);
    check('…only under the Check-in tab (control: on Review it isn\'t)', elR.innerHTML.includes('Next check-in'), false);
    const envT = makeEnv({ tabs: ['check-in'] });
    envT.state.coachAdvice = [advice()];
    const elT = { innerHTML: '' }; factory(envT).renderProgressFromCoach(elT, null);
    check('only the tabs ready on the cycle show (control: Review and Next cycle absent)',
      [elT.innerHTML.includes('setFromCoachTab(\'check-in\')'), elT.innerHTML.includes('setFromCoachTab(\'cycle-review\')'), elT.innerHTML.includes('setFromCoachTab(\'next-cycle\')')], [true, false, false]);
    const envN = makeEnv({ tabs: [], weeksToData: 2 });
    const elN = { innerHTML: '' }; factory(envN).renderProgressFromCoach(elN, { id: 'm1', start: '2026-09-21', weeks: 8 });
    check('no tab ready yet: no tabs, and when the first check-in comes',
      [elN.innerHTML.includes('setFromCoachTab('), elN.innerHTML.includes('first check-in comes after about 2 more weeks')], [false, true]);
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
    factory(env).openCoachResponse('r1');
    const sheet = env.document.getElementById('coach-response-body').innerHTML;
    check('once sent, the full sheet says so, and the coach\'s reply shows under it',
      [sheet.includes('Note sent to Sam'), sheet.includes('openCoachNote('), sheet.includes('Drop to 3 sets this week.')], [true, false, true]);

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

  // ── 4. 🚨 A client never sends a check-in (v8.56, §168) ─────────────────
  {
    check('no Check in sheet or send: no openCoachCheckin / sendCoachCheckin, no modal-coach-checkin',
      /function (open|send)CoachCheckin|modal-coach-checkin/.test(src), false);
    check('…and no check_in row with purpose \'check_in\' is ever built (review photos\' purpose is cycle_review)',
      /purpose: 'check_in'/.test(src), false);
  }

  // ── 5. Photos for the cycle review: only in answer to a request (v8.44, §142)
  {
    const ending = { id: 'mE', name: 'Ending', start: '2026-09-07', weeks: 4 };
    const env = makeEnv();
    env.state.macrocycles = [ending];
    env.state.coachNotices = [{ id: 'n1', kind: 'photos', requestId: 'pr1', dismissed: false }];
    const F = factory(env);
    const reviewTab = m => { const el = { innerHTML: '' }; F.renderProgressFromCoach(el, m); return el.innerHTML; };
    env.state.coachAdvice = [advice({ responseId: 'rv', tool: 'cycle_review', macroId: 'mE', seq: 9 })];
    check('🚨 no request, no photo row: nothing is sent unprompted (v8.41–v8.43 offered it in the last 7 days)',
      [/photos for your review|openCoachPhotoRequest|Send photos/.test(reviewTab(ending))], [false]);
    env.state.coachPhotoRequests = { pr1: { macroId: 'mE', seq: 12, cancelled: false, answered: null } };
    const asked = reviewTab(ending);
    check('a request shows on the Review tab, opening the sheet for it', [asked.includes('Sam asked for photos for your review'), asked.includes("openCoachPhotoRequest('pr1')")], [true, true]);
    check('…and with no cycle to view (a client whose cycles aren\'t the coach\'s), still shows', reviewTab(null).includes("openCoachPhotoRequest('pr1')"), true);

    F.openCoachPhotoRequest('pr1');
    const sheet = env.document.getElementById('coach-review-photos-body').innerHTML;
    check('the sheet offers Send photos and Skip photos', [sheet.includes('sendCoachReviewPhotos()'), sheet.includes('skipCoachReviewPhotos()')], [true, true]);
    F.review.before.push({ base64: 'AAAA' }); F.review.after.push({ base64: 'BBBB' }, { base64: 'CCCC' });
    await F.sendCoachReviewPhotos();
    const up = env.calls.filter(c => c[0] === 'upload').map(c => c[2]);
    check('before/after go to client-media under {uid}/reviews/{folder}/', up.map(p => p.replace(/\/reviews\/[^/]+\//, '/reviews/F/')),
      ['u1/reviews/F/before-1.jpg', 'u1/reviews/F/after-1.jpg', 'u1/reviews/F/after-2.jpg']);
    const ins = env.calls.find(c => c[0] === 'insert');
    check('…then one check_in row, purpose cycle_review, naming the request, the cycle and the paths',
      [ins[2].kind, ins[2].body.purpose, ins[2].body.request_id, ins[2].body.macro_id, ins[2].body.before, ins[2].body.after, 'skipped' in ins[2].body],
      ['check_in', 'cycle_review', 'pr1', 'mE', up.slice(0, 1), up.slice(1), false]);
    check('…the request is answered, its banner gone, and the row says the photos went',
      [!!env.state.coachPhotoRequests.pr1.answered, env.state.coachNotices[0].dismissed, reviewTab(ending).includes('Photos sent to Sam for this review'), env.log.some(l => l[0] === 'close' && l[1] === 'modal-coach-review-photos')],
      [true, true, true, true]);
    F.openCoachPhotoRequest('pr1');
    check('an answered request doesn\'t open the sheet again', F.review, null);

    // Skip: no consent needed, nothing uploaded.
    const envS = makeEnv(); envS.state.macrocycles = [ending]; envS.link.photoConsent = false;
    envS.state.coachPhotoRequests = { pr2: { macroId: 'mE', seq: 13, cancelled: false, answered: null } };
    const S = factory(envS);
    S.openCoachPhotoRequest('pr2');
    const offSheet = envS.document.getElementById('coach-review-photos-body').innerHTML;
    check('with photo consent off the sheet links to Coaching and still offers Skip, not Send',
      [offSheet.includes('openCoachingPhotoConsent()'), offSheet.includes('skipCoachReviewPhotos()'), offSheet.includes('sendCoachReviewPhotos()')], [true, true, false]);
    await S.skipCoachReviewPhotos();
    const sk = envS.calls.find(c => c[0] === 'insert');
    check('Skip sends one cycle_review row marked skipped, with no photos, and answers the request',
      [envS.calls.filter(c => c[0] === 'upload').length, sk[2].body.purpose, sk[2].body.request_id, sk[2].body.skipped, sk[2].body.before, envS.state.coachPhotoRequests.pr2.answered.skipped],
      [0, 'cycle_review', 'pr2', true, [], true]);
    envS.state.coachAdvice = [advice({ responseId: 'rv', tool: 'cycle_review', macroId: 'mE', seq: 9 })];
    const skEl = { innerHTML: '' }; S.renderProgressFromCoach(skEl, ending);
    check('…and the row then says so', skEl.innerHTML.includes('You skipped photos for this review'), true);

    const envN = makeEnv(); envN.state.macrocycles = [ending];
    envN.state.coachPhotoRequests = { pr3: { macroId: 'mE', seq: 14, cancelled: false, answered: null } };
    const N = factory(envN);
    N.openCoachPhotoRequest('pr3'); N.review.before.push({ base64: 'AAAA' });
    envN.link.photoConsent = false; // withdrawn after picking
    await N.sendCoachReviewPhotos();
    check('🚨 consent OFF at send time: nothing uploaded, nothing inserted, and the error links to Coaching',
      [envN.calls.length, /openCoachingPhotoConsent/.test(N.review.error)], [0, true]);

    const envE = makeEnv({ insertError: { message: 'not your coach' } }); envE.state.macrocycles = [ending];
    envE.state.coachPhotoRequests = { pr4: { macroId: 'mE', seq: 15, cancelled: false, answered: null } };
    const E = factory(envE);
    E.openCoachPhotoRequest('pr4'); E.review.after.push({ base64: 'AAAA' });
    await E.sendCoachReviewPhotos();
    const up2 = envE.calls.filter(c => c[0] === 'upload').map(c => c[2]);
    check('a failed insert removes the photos it uploaded, answers nothing, and keeps the sheet open with the reason',
      [envE.calls.filter(c => c[0] === 'remove').map(c => c[2])[0], envE.state.coachPhotoRequests.pr4.answered, E.review && E.review.error.startsWith('Couldn’t send them')],
      [up2, null, true]);
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
