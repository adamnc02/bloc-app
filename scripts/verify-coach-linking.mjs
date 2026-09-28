#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-linking.mjs
//
// WHAT IT PROTECTS (v8.37, TECHNICAL §129; PROMPT-03 Phase 4b, with
// migration 0026): linking to a coach, the only door from a client's data
// to someone else.
//
// 🚨 THE TRAPS:
//   · Nothing may link before "Agree and link". The consent screen names the
//     coach through peek_invite(), which only reads; redeem_invite() — the
//     client's consent — is called exactly once, from that button, with the
//     photo choice made on that screen (off unless turned on).
//   · The link is cached per ACCOUNT, outside `state`. A cache written for
//     another account (or restored with a backup) must read as "no coach".
//   · The mode question is for NEW ACCOUNTS only (Adam, 2026-09-28): a new
//     device whose account has a cloud backup is an existing user on a new
//     phone and restores silently, as before; if the backup list fails, it
//     falls back to the Demo Tour, as before. An invite link always opens
//     the code step.
//   · On a first run, leaving the flow without linking means Solo: the Demo
//     Tour starts, exactly as it would have without the question.
//   · ?invite= is captured before sign-in, kept through it, and removed from
//     the address bar — without dropping any other parameter (?auth=real).
//   · Photo consent: a failed save puts the switch back. Unlink calls
//     revoke_coach with the coach's id and forgets the cached link.
//
// Extracts the real functions from index.html. CONTROL: v8.36 (c2be73a)
// has none of this.
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
function extractConst(source, name) {
  const start = source.indexOf(`const ${name} =`);
  if (start === -1) return null;
  const end = source.indexOf(';\n', start);
  return source.slice(start, end + 1);
}

const FNS = ['coachNormaliseCode', 'coachFormatCode', 'coachInitials', 'coachEsc', 'coachLinkGet', 'coachLinkSet', 'coachLinkClear',
  'isCoachedMode', 'coachingAvailable', 'refreshCoachLink', 'updateSettingsCoachingRow', 'captureInviteFromUrl', 'pendingInviteGet',
  'pendingInviteClear', 'startFirstRun', 'openCoachLink', 'closeCoachLink', 'coachFlowSet', 'coachLinkErrorText',
  'coachCheckCode', 'coachAgreeAndLink', 'renderCoachLink', 'coachChoiceContinue',
  'renderSettingsCoaching', 'coachingStatus', 'setCoachPhotoConsent', 'confirmUnlinkCoach', 'unlinkCoach'];
const CONSTS = ['COACH_LINK_KEY', 'COACH_INVITE_KEY', 'COACH_INVITE_MAX_AGE_MS', 'COACH_SHARED'];

function build(source) {
  const bodies = FNS.map(n => extract(source, `async function ${n}(`) || extract(source, `function ${n}(`));
  const consts = CONSTS.map(n => extractConst(source, n));
  if (bodies.some(b => !b) || consts.some(c => !c)) return null;
  return new Function('env', `
    const { localStorage, history, window, document } = env;
    let supabase = null, _authResolvedSession = null, state = { profile: {} };
    let _coachFlow = null;
    const log = env.log;
    const openModal = id => log.push(['open', id]);
    const closeModal = id => log.push(['close', id]);
    const fetchDemoDataIfNewUser = v => log.push(['demo', v]);
    const maybeOpenProfileGate = () => log.push(['gate']);
    const demoTourIsRunning = () => env.tour;
    const listSnapshots = async () => { if (env.listFails) throw new Error('offline'); return env.snapshots; };
    const playLinkSplash = l => log.push(['splash', l.coachName]);
    const requestClientStateUpload = r => log.push(['upload', r]); // v8.38 (§130)
    const requestPublicationPull = r => log.push(['pull', r]); // v8.39 (§131)
    const syncPublicationChannel = () => log.push(['channel']);
    const applyCoachedChrome = () => {};                   // v8.40 (§132)
    const afterCoachLinkEnded = () => log.push(['ended']); // v8.40 (§132): verify-coached-hides.mjs covers it
    const redrawProgressUnderCoaching = () => log.push(['redraw']); // v8.41 (§135)
    const showConfirm = (t, m, ok, cb) => { log.push(['confirm', t]); env.confirmCb = cb; };
    const setTimeout = (fn) => fn();
    ${consts.join('\n')}
    ${bodies.join('\n')}
    return {
      set: (k, v) => { if (k === 'supabase') supabase = v; if (k === 'session') _authResolvedSession = v; },
      flow: () => _coachFlow,
      ${FNS.join(', ')}
    };
  `);
}

function env() {
  const store = new Map();
  const els = new Map();
  const document = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, { id, innerHTML: '', textContent: '', style: {} });
      return els.get(id);
    },
  };
  const e = {
    log: [], tour: false, snapshots: [], listFails: false, calls: [],
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    history: { replaceState: (a, b, url) => { e.url = url; } },
    window: { location: { search: '?auth=real&invite=abcd-efgh', pathname: '/bloc-app/', hash: '#x' } },
    document, els, store,
  };
  return e;
}
// A fake Supabase: rpc() answers from `answers`, and records every call.
function fakeSupabase(e, answers, rows = {}) {
  return {
    async rpc(name, args) {
      e.calls.push([name, args]);
      const a = answers[name];
      return typeof a === 'function' ? a(args) : (a || { data: null, error: null });
    },
    from(table) {
      const q = { table, filters: [] };
      const chain = {
        select() { return chain; },
        eq(c, v) { q.filters.push([c, v]); return chain; },
        async maybeSingle() { e.calls.push(['from', table, q.filters]); return { data: rows[table] ?? null, error: null }; },
      };
      return chain;
    },
  };
}
const SESSION = { user: { id: 'u1', email: 'kim@example.com' } };
const SAM = { data: { coach_id: 'coach-1', coach_name: 'Sam', business_name: 'Sam Lee Coaching', expires_at: '2026-10-05' }, error: null };

async function run(source, label) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const factory = build(source);
  check('the coaching functions exist', !!factory, true);
  if (!factory) return failures;

  // ── ?invite= capture
  {
    const e = env(); const L = factory(e);
    L.captureInviteFromUrl();
    check('?invite= is stored normalised', JSON.parse(e.store.get('bloc_pending_invite')).code, 'ABCDEFGH');
    check('…and removed from the address bar, keeping ?auth=real and the hash', e.url, '/bloc-app/?auth=real#x');
    e.store.set('bloc_pending_invite', JSON.stringify({ code: 'ABCDEFGH', at: Date.now() - 8 * 864e5 }));
    check('an invite older than 7 days is dropped', [L.pendingInviteGet(), e.store.has('bloc_pending_invite')], [null, false]);
  }

  // ── The cached link is per account
  {
    const e = env(); const L = factory(e);
    L.set('session', SESSION);
    e.store.set('bloc_coach_link', JSON.stringify({ userId: 'someone-else', coachId: 'coach-9', coachName: 'X' }));
    check("another account's cached link reads as no coach", [L.coachLinkGet(), L.isCoachedMode()], [null, false]);
    e.store.set('bloc_coach_link', JSON.stringify({ userId: 'u1', coachId: 'coach-1', coachName: 'Sam' }));
    check("this account's reads as coached", L.isCoachedMode(), true);
    L.set('session', null);
    check('signed out: no coach', L.isCoachedMode(), false);
  }

  // ── First run: who gets the question
  const firstRun = async (setup) => {
    const e = env(); const L = factory(e);
    L.set('session', SESSION); L.set('supabase', fakeSupabase(e, {}));
    setup(e);
    await L.startFirstRun(e.isNew);
    return { log: e.log, step: L.flow() && L.flow().step, flow: L.flow() };
  };
  let r = await firstRun(e => { e.isNew = true; e.snapshots = []; });
  check('a new account (no backup): the mode question, and no Demo Tour yet', [r.step, r.log.some(l => l[0] === 'demo')], ['choice', false]);
  r = await firstRun(e => { e.isNew = true; e.snapshots = ['2026-09-27']; });
  // v8.40 (§133): no Demo Tour either. checkSnapshotZero()'s restore owns this
  // case; a tour started alongside it raced the restore and could stop it saving.
  check('an existing account on a new phone (has a backup): not asked, and no Demo Tour (the restore handles it)', [r.step, r.log], [null, []]);
  r = await firstRun(e => { e.isNew = true; e.listFails = true; });
  check("can't tell (backup list failed): not asked, as before", [r.step, r.log], [null, [['demo', true]]]);
  r = await firstRun(e => { e.isNew = false; });
  check('a returning device: nothing', [r.step, r.log], [null, []]);
  r = await firstRun(e => { e.isNew = false; e.store.set('bloc_pending_invite', JSON.stringify({ code: 'ABCDEFGH', at: Date.now() })); });
  check('an invite link opens the code step, filled in, on any device', [r.step, r.flow && r.flow.code, r.flow && r.flow.fromLink], ['code', 'ABCD-EFGH', true]);
  r = await firstRun(e => { e.isNew = true; e.snapshots = []; e.tour = true; });
  check('never during the Demo Tour', r.step, null);

  // ── Leaving a first run means Solo
  {
    const e = env(); const L = factory(e);
    L.set('session', SESSION); L.set('supabase', fakeSupabase(e, {}));
    L.openCoachLink({ step: 'choice', firstRun: true });
    L.coachFlowSet({ choice: 'solo' }); L.coachChoiceContinue();
    check('first run → Solo → the Demo Tour starts', e.log.filter(l => l[0] === 'demo'), [['demo', true]]);
    const e2 = env(); const L2 = factory(e2);
    L2.set('session', SESSION); L2.set('supabase', fakeSupabase(e2, {}));
    L2.openCoachLink({ step: 'choice', firstRun: true });
    L2.coachFlowSet({ choice: 'coach' }); L2.coachChoiceContinue();
    check('first run → I have a coach → the code step, no Demo Tour', [L2.flow().step, e2.log.some(l => l[0] === 'demo')], ['code', false]);
    L2.closeCoachLink();
    check('…closing it there means Solo after all: the Demo Tour starts', e2.log.filter(l => l[0] === 'demo'), [['demo', true]]);
  }

  // ── Code → consent → link
  {
    const e = env(); const L = factory(e);
    L.set('session', SESSION);
    L.set('supabase', fakeSupabase(e, { peek_invite: SAM, redeem_invite: SAM }));
    e.store.set('bloc_pending_invite', JSON.stringify({ code: 'ABCDEFGH', at: Date.now() }));
    L.openCoachLink({ step: 'code', code: 'abcd-efgh', fromLink: true });
    await L.coachCheckCode();
    check('the code is checked with peek_invite, normalised', e.calls.map(c => c[0] + ':' + (c[1] && c[1].p_code)), ['peek_invite:ABCDEFGH']);
    check('…which leads to the consent screen, naming the coach', [L.flow().step, L.flow().coach.name], ['consent', 'Sam']);
    check('nothing has linked yet: no redeem, no cached link', [e.calls.some(c => c[0] === 'redeem_invite'), L.isCoachedMode()], [false, false]);
    const html = e.els.get('coach-link-body').innerHTML;
    check('the consent screen says "What Sam will see" and lists all five shared things',
      [/What Sam will see/.test(html), ['Training', 'Nutrition', 'Weight', 'Measurements', 'Check-ins'].every(t => html.includes(`<b>${t}</b>`))], [true, true]);
    check('progress photos start OFF', L.flow().photos, false);
    L.coachFlowSet({ photos: true });
    await L.coachAgreeAndLink();
    const redeems = e.calls.filter(c => c[0] === 'redeem_invite');
    check('Agree and link redeems ONCE, with the photo choice', redeems.map(c => c[1]), [{ p_code: 'ABCDEFGH', p_photo_consent: true }]);
    const link = L.coachLinkGet();
    check('the link is cached for this account', link && [link.userId, link.coachId, link.coachName, link.photoConsent], ['u1', 'coach-1', 'Sam', true]);
    check('the invite is used up, the splash plays, and the flow shows "linked"',
      [e.store.has('bloc_pending_invite'), e.log.some(l => l[0] === 'splash'), L.flow().step], [false, true, 'linked']);
    if (/requestClientStateUpload\(/.test(extract(source, 'async function coachAgreeAndLink(') || ''))
      check('v8.38: a new link starts the client_state upload, once', e.log.filter(l => l[0] === 'upload'), [['upload', 'linked']]);
    if (/requestPublicationPull\(/.test(extract(source, 'async function coachAgreeAndLink(') || ''))
      check('v8.39: a new link pulls publications and opens the channel', [e.log.filter(l => l[0] === 'pull'), e.log.some(l => l[0] === 'channel')], [[['pull', 'linked']], true]);
  }

  // ── Refusals
  {
    const e = env(); const L = factory(e);
    L.set('session', SESSION);
    L.set('supabase', fakeSupabase(e, { peek_invite: { data: null, error: { message: "That code isn't valid" } } }));
    L.openCoachLink({ step: 'code', code: 'ZZZZ-ZZZZ' });
    await L.coachCheckCode();
    check('a bad code stays on the code step with the plain message', [L.flow().step, L.flow().error],
      ['code', 'That code isn’t valid or has expired. Ask your coach to send a new one.']);
    L.set('supabase', fakeSupabase(e, { peek_invite: SAM, redeem_invite: { data: null, error: { message: "That code isn't valid" } } }));
    await L.coachCheckCode();
    await L.coachAgreeAndLink();
    check('a code that died between the peek and Agree goes back to the code step, not linked',
      [L.flow().step, !!L.flow().error, L.isCoachedMode()], ['code', true, false]);
    L.openCoachLink({ step: 'code', code: 'ABCD-EF' });
    const before = e.calls.length;
    await L.coachCheckCode();
    check('a code shorter than 8 characters is never sent', e.calls.length, before);
  }

  // ── Settings → Coaching: photo consent and Unlink
  {
    const e = env(); const L = factory(e);
    L.set('session', SESSION);
    e.store.set('bloc_coach_link', JSON.stringify({ userId: 'u1', coachId: 'coach-1', coachName: 'Sam', photoConsent: false }));
    // After a failed save the app re-reads the link; the server still has it, photos off.
    const server = { coach_clients: { coach_id: 'coach-1', photo_consent: false, linked_at: '2026-09-28T10:00:00Z' }, coach_profiles: { display_name: 'Sam', business_name: null } };
    L.set('supabase', fakeSupabase(e, { set_photo_consent: { data: null, error: { message: 'network' } } }, server));
    await L.setCoachPhotoConsent(true);
    check('a failed photo-consent save puts it back to off', L.coachLinkGet().photoConsent, false);
    if (label === 'now') check('v8.41: …and Progress under the sheet is redrawn both times (the change, then the revert)',
      e.log.filter(l => l[0] === 'redraw').length, 2);
    await new Promise(r => setImmediate(r));
    L.set('supabase', fakeSupabase(e, { set_photo_consent: { data: true, error: null }, revoke_coach: { data: true, error: null } }, server));
    await L.setCoachPhotoConsent(true);
    check('a saved one sticks, sent with the coach id', [L.coachLinkGet().photoConsent, e.calls.filter(c => c[0] === 'set_photo_consent').pop()[1]],
      [true, { p_coach_id: 'coach-1', p_consent: true }]);
    L.confirmUnlinkCoach();
    check('Unlink asks first', e.log.filter(l => l[0] === 'confirm').map(l => l[1]), ['Unlink from Sam?']);
    await e.confirmCb();
    check('…then revokes with the coach id and forgets the link',
      [e.calls.filter(c => c[0] === 'revoke_coach').map(c => c[1]), L.isCoachedMode()], [[{ p_coach_id: 'coach-1' }], false]);
    if (label === 'now') check('v8.40: …and removes the coach\'s plan, once', e.log.filter(l => l[0] === 'ended').length, 1);
  }

  // ── The server wins: a link ended elsewhere is forgotten on refresh
  {
    const e = env(); const L = factory(e);
    L.set('session', SESSION);
    e.store.set('bloc_coach_link', JSON.stringify({ userId: 'u1', coachId: 'coach-1', coachName: 'Sam' }));
    L.set('supabase', fakeSupabase(e, {}, { coach_clients: null }));
    await L.refreshCoachLink();
    check('a link the coach ended is forgotten on the next check', L.isCoachedMode(), false);
    const q = e.calls.find(c => c[0] === 'from');
    check('…which asks only for this account\'s ACTIVE link', q && q[2], [['client_id', 'u1'], ['status', 'active']]);
    if (label === 'now') check('v8.40: a link the coach ended removes the plan too, once', e.log.filter(l => l[0] === 'ended').length, 1);
    // …but a phone that was never linked has nothing to remove: a Solo user's
    // own cycles are never touched by a refresh.
    const e2 = env(); const L2 = factory(e2);
    L2.set('session', SESSION);
    L2.set('supabase', fakeSupabase(e2, {}, { coach_clients: null }));
    await L2.refreshCoachLink();
    if (label === 'now') check('v8.40: an unlinked phone\'s refresh removes nothing', e2.log.filter(l => l[0] === 'ended').length, 0);
  }
  return failures;
}

const failures = await run(current, 'now');

// CONTROL: v8.36 has no linking at all.
const control = execFileSync('git', ['show', 'c2be73a:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
{
  console.log('\n— control: v8.36 (c2be73a), which must fail —');
  const orig = console.log; const lines = []; console.log = (s) => lines.push(String(s));
  let cf;
  try { cf = await run(control, 'v8.36'); } finally { console.log = orig; }
  if (cf > 0 && lines.some(l => l.startsWith('✗') && /the coaching functions exist/.test(l))) console.log('✓ control: v8.36 has no coaching functions');
  else { console.log('✗ control: v8.36 did not fail'); process.exitCode = 1; }
}

if (failures) { console.log(`\nFAIL: ${failures} check(s)`); process.exitCode = 1; }
else console.log('\nAll checks pass.');
