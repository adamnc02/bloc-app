#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-client-state-upload.mjs
//
// WHAT IT PROTECTS (v8.38, TECHNICAL §130; PROMPT-03 Phase 4c): the
// client → coach upload. BLOC Coach runs BLOC's engine on exactly what
// arrives here, so a wrong byte is a wrong number on the coach's screen.
//
// 🚨 THE TRAPS:
//   · The server (0023) refuses a rev that doesn't RISE. A new device, a
//     restore, or a second device doesn't know the last rev: ask the server,
//     and on "a newer state is already stored" go one past it and retry.
//   · state_hash is sha-256 of the UNCOMPRESSED compact JSON (what Coach
//     re-hashes after gunzip); state_gz is PostgREST's hex bytea text (\x…).
//   · Only coached clients upload. Never in the Demo Tour or under any
//     pretend "today"; never from an empty device (it would replace what the
//     coach sees with nothing); never twice for the same hash.
//   · Two uploads must never overlap (they'd pick the same rev): the same
//     one-at-a-time gate as the mirror push (§128).
//   · app_version comes from the Settings chip itself — still one place to
//     bump (§110).
//
// Runs the real functions from index.html with Node's own CompressionStream
// and WebCrypto, and gunzips what would be sent. CONTROL: v8.37 (05689a1)
// has no upload.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash as sha } from 'node:crypto';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const current = readFileSync(join(repo, 'index.html'), 'utf8');
const demo = JSON.parse(readFileSync(join(repo, 'bloc-demo-data.json'), 'utf8'));

function extract(source, name) {
  for (const marker of [`async function ${name}(`, `function ${name}(`]) {
    const start = source.indexOf(marker);
    if (start === -1) continue;
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    }
  }
  return null;
}
const FNS = ['renderSettingsHero', 'blocAppVersion', 'blocDeviceId', 'blocDeviceTz', 'clientStateMetaGet', 'clientStateMetaSet',
  'blocSha256Hex', 'blocGzip', 'blocByteaHex', 'clientStateNewestRev', 'uploadClientStateOnce', 'clientStateSerialised'];

function build(source) {
  const bodies = FNS.map(n => extract(source, n));
  if (bodies.some(b => !b)) return null;
  return new Function('env', `
    const accountSwitchBlocks = () => false; // v8.46 (§145): no other account's data here
    const localStorage = env.localStorage;
    let supabase = env.supabase, _authResolvedSession = env.session, state = env.state, _tourAnchorDate = env.anchor;
    const coachingAvailable = () => env.available;
    const isCoachedMode = () => env.coached;
    const deviceHasRealData = () => env.realData;
    const CLIENT_STATE_META_KEY = 'bloc_client_state_meta';
    const CLIENT_STATE_DEVICE_KEY = 'bloc_device_id';
    let _clientStateRunning = null, _clientStateQueued = null;
    ${bodies.join('\n')}
    return { ${FNS.join(', ')}, setState: s => { state = s; } };
  `);
}

// A fake client_state table that behaves like 0023: rev must rise.
function fakeServer(startRev = 0, opts = {}) {
  const rows = startRev ? [{ state_rev: startRev }] : [];
  const srv = { rows, inserts: [], active: 0, maxActive: 0 };
  srv.supabase = {
    from(table) {
      if (table !== 'client_state') throw new Error('unexpected table ' + table);
      return {
        select() { const c = { eq: () => c, order: () => c, limit: async () => ({ data: rows.slice().sort((a, b) => b.state_rev - a.state_rev).slice(0, 1), error: null }) }; return c; },
        async insert(row) {
          srv.active++; srv.maxActive = Math.max(srv.maxActive, srv.active);
          await new Promise(r => setTimeout(r, opts.delay || 0));
          srv.active--;
          if (rows.some(r => r.state_rev >= row.state_rev)) return { error: { message: `a newer state is already stored (rev ${row.state_rev})` } };
          rows.push(row); srv.inserts.push(row);
          return { error: null };
        },
      };
    },
  };
  return srv;
}
function envFor(srv, over = {}) {
  const store = new Map();
  return Object.assign({
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    supabase: srv.supabase, session: { user: { id: 'u1' } }, state: JSON.parse(JSON.stringify(demo)),
    anchor: null, available: true, coached: true, realData: true, store,
  }, over);
}

async function run(source, label) {
  let failures = 0;
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} [${label}] ${name}`);
    if (!ok) console.log(`    expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const factory = build(source);
  check('the upload functions exist', !!factory, true);
  if (!factory) return failures;
  const chip = (source.match(/--chip-c:var\(--accent2\);">(v[0-9.]+)</) || [])[1];

  // ── What is sent
  {
    const srv = fakeServer(0); const e = envFor(srv); const U = factory(e);
    check('a coached client with data uploads', await U.uploadClientStateOnce(), 'uploaded');
    const row = srv.inserts[0];
    const json = gunzipSync(Buffer.from(row.state_gz.slice(2), 'hex')).toString('utf8');
    check('state_gz is hex bytea text that gunzips to exactly the compact JSON of state', json === JSON.stringify(e.state), true);
    check('state_hash is the sha-256 hex of that uncompressed JSON', row.state_hash, sha('sha256').update(json).digest('hex'));
    check('the first rev on an empty server is 1', row.state_rev, 1);
    check('app_version is the Settings chip', row.app_version, chip);
    check('tz is an IANA zone', typeof row.tz === 'string' && row.tz.length > 0 && Intl.supportedValuesOf('timeZone').concat(['UTC']).includes(row.tz), true);
    check('device_id is stable on this device', [row.device_id, U.blocDeviceId()], [row.device_id, row.device_id]);
    check('the gzip is small (demo: ~14 KB, under the 5 MB cap)', Buffer.from(row.state_gz.slice(2), 'hex').length < 40000, true);
    check('the same state again: skipped, nothing sent', [await U.uploadClientStateOnce(), srv.inserts.length], ['unchanged', 1]);
    e.state.bodyLogs.push({ date: '2026-09-28', weight: 180 }); U.setState(e.state);
    check('a change: rev 2', [await U.uploadClientStateOnce(), srv.inserts.map(r => r.state_rev)], ['uploaded', [1, 2]]);
  }

  // ── The rev must rise
  {
    const srv = fakeServer(41); const e = envFor(srv); const U = factory(e);
    await U.uploadClientStateOnce();
    check('no local rev (new device / restore): one past the server\'s newest (41 → 42)', srv.inserts.map(r => r.state_rev), [42]);
    srv.rows.push({ state_rev: 50 }); // another device uploads meanwhile
    e.state.bodyLogs.push({ date: '2026-09-29', weight: 179 }); U.setState(e.state);
    check('a stale local rev is refused, then retried one past the server (51)', [await U.uploadClientStateOnce(), srv.inserts.map(r => r.state_rev)], ['uploaded', [42, 51]]);
    e.store.set('bloc_client_state_meta', JSON.stringify({ userId: 'someone-else', rev: 999, hash: 'x' }));
    e.state.bodyLogs.push({ date: '2026-09-30', weight: 178 }); U.setState(e.state);
    await U.uploadClientStateOnce();
    check("another account's local rev is ignored (asks the server: 52)", srv.inserts.map(r => r.state_rev).pop(), 52);
  }

  // ── Never
  for (const [why, over, want] of [
    ['not coached', { coached: false }, 'not-coached'],
    ['signed out / demo tour (coaching unavailable)', { available: false }, 'not-coached'],
    ['any pretend "today" (tour anchor)', { anchor: '2026-08-02' }, 'tour'],
    ['an empty device', { realData: false }, 'empty-device'],
  ]) {
    const srv = fakeServer(0); const U = factory(envFor(srv, over));
    check(`never uploads: ${why}`, [await U.uploadClientStateOnce(), srv.inserts.length], [want, 0]);
  }

  // ── One at a time
  {
    const srv = fakeServer(0, { delay: 15 }); const e = envFor(srv); const U = factory(e);
    const p1 = U.clientStateSerialised();
    e.state.bodyLogs.push({ date: '2026-10-01', weight: 177 }); U.setState(e.state);
    const rest = [U.clientStateSerialised(), U.clientStateSerialised(), U.clientStateSerialised()];
    await Promise.all([p1, ...rest]);
    check('overlapping requests never insert at once', srv.maxActive, 1);
    check('three waiting requests share one follow-up (2 uploads, revs 1 and 2, nothing refused)', srv.inserts.map(r => r.state_rev), [1, 2]);
  }

  // ── Wiring
  const body = n => extract(source, n) || '';
  check('every save() schedules it (markSyncDirty)', /scheduleClientStateUpload\(\)/.test(body('markSyncDirty')), true);
  check('a new link uploads at once', /requestClientStateUpload\('linked'\)/.test(body('coachAgreeAndLink')), true);
  check('sign-in and resume upload once the link is re-checked', /requestClientStateUpload\('resume'\)/.test(body('maybeRefreshCoachLink')), true);
  check('the trigger is gated on isCoachedMode() and goes through the gate',
    [/isCoachedMode\(\)/.test(body('requestClientStateUpload')), /clientStateSerialised\(\)/.test(body('requestClientStateUpload'))], [true, true]);
  for (const fn of ['handleDeleteMyData', 'handleCloseAccount'])
    check(`${fn} forgets the local rev (the erase removed the rows)`, /removeItem\('bloc_client_state_meta'\)/.test(body(fn)), true);
  const direct = source.split('\n').filter(l => !l.trim().startsWith('//') && /(^|[^\w])uploadClientStateOnce\(/.test(l)).length;
  check('nothing calls uploadClientStateOnce() except the gate (definition + 1)', direct, 2);
  return failures;
}

const failures = await run(current, 'v8.38');

const control = execFileSync('git', ['show', '05689a1:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
{
  console.log('\n— control: v8.37 (05689a1), which must fail —');
  const orig = console.log; const lines = []; console.log = (s) => lines.push(String(s));
  let cf;
  try { cf = await run(control, 'v8.37'); } finally { console.log = orig; }
  if (cf > 0 && lines.some(l => l.startsWith('✗') && /the upload functions exist/.test(l))) console.log('✓ control: v8.37 has no client_state upload');
  else { console.log('✗ control: v8.37 did not fail'); process.exitCode = 1; }
}

if (failures) { console.log(`\nFAIL: ${failures} check(s)`); process.exitCode = 1; }
else console.log('\nAll checks pass.');
