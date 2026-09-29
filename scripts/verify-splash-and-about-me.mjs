#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-splash-and-about-me.mjs (v8.46, TECHNICAL §146)
//
// 1. THE SPLASH'S WORDS SCALE ABOUT A FIXED CENTRE. Each word flies in from a
//    0.97-scaled start pose. With `transform-box: fill-box`, WebKit takes a
//    different centre for SVG text than Chrome, so on an iPhone every word
//    started ~11 units left of where Chrome puts it, and REPEAT sat on its
//    spinning icon. Each word now scales about its own centre in the
//    drawing's units: `transform-box: view-box` and `transform-origin` = the
//    word's x and 143. Measured in Chromium and WebKit after the fix: REPEAT's
//    start pose is at the same place in both (247.4 px at 390 wide).
// 2. THE ACCOUNT IS IN ABOUT ME. The signed-in email, Change password and a
//    full-width danger Sign out, as the sheet's last control (visible during
//    the profile gate, so a new account can always leave). The sheet that
//    held them is "My data" and no longer signs anyone out.
// 3. THE PLAN BANNER'S VIEW ONLY WHEN TRAIN CAN SHOW IT. "{coach} updated your
//    plan" offered View (to Train) for a cycle that hadn't started, where Train
//    shows nothing of it. The notice names its cycle; View shows once the
//    cycle has started, worked out each time Home draws.
// Controls: a word left on fill-box, a Sign out row left in My data, and a
// View that ignores the date.
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

// ── 1. The splash ─────────────────────────────────────────────────────────
function splashWords(src) {
  const word = /#splash \.s-word \{([^}]*)\}/.exec(src);
  const out = [];
  for (const m of src.matchAll(/<text class="s-word s-w-(\w+)" x="([\d.]+)" y="150"/g)) {
    const o = new RegExp(`#splash \\.s-w-${m[1]}\\s*\\{\\s*transform-origin:\\s*([\\d.]+)px 143px;`).exec(src);
    out.push({ w: m[1], x: Number(m[2]), origin: o ? Number(o[1]) : null });
  }
  const body = word ? word[1].replace(/\/\*[\s\S]*?\*\//g, "") : "";
  return { viewBox: /transform-box:\s*view-box/.test(body) && !/fill-box/.test(body), words: out };
}
const sp = splashWords(html);
check('the splash words scale in the drawing’s own units (view-box, not fill-box)', sp.viewBox);
check(`each word’s origin is its own centre (${sp.words.map((x) => x.w).join(', ')})`, sp.words.length === 4 && sp.words.every((x) => x.origin === x.x),
  JSON.stringify(sp.words));

// ── 2. About me and My data ───────────────────────────────────────────────
const sheet = (id) => { const i = html.indexOf(`<div class="modal-overlay" id="${id}">`); return html.slice(i, html.indexOf('<div class="modal-overlay"', i + 10)); };
const about = sheet('modal-body-profile');
const data = sheet('modal-account');
check('About me holds the account: email, provider, Change password', /id="account-email-display"/.test(about) && /id="account-provider-display"/.test(about) && /id="account-change-password-btn"/.test(about));
const lastControl = [...about.matchAll(/<(button|div class="settings-row)[^>]*>/g)].pop();
check('Sign out is About me’s last control, a full-width danger button', /btn btn-danger btn-block[^>]*onclick="signOutUser\(\)"/.test(about) && !!lastControl && /signOutUser/.test(lastControl[0]));
check('Sign out carries Coach’s logout icon (the same path)', /id="about-me-sign-out"[^>]*><svg[^>]*><path d="M9 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4M16 16l4-4-4-4M20 12H9"\/>/.test(about));
check('Change password is shown with the row’s own layout (never display: block)', !/changePwBtn\.style\.display = provider === 'email' \? 'block'/.test(html));
check('My data is titled "My data" and signs no one out', /<div class="modal-title">My data<\/div>/.test(data) && !/signOutUser/.test(data) && !/account-email-display/.test(data));
check('the Settings row reads "My data"', /<div class="settings-row-text">My data\s*<div/.test(html) && !/settings-row-text">Account &amp; Data/.test(html));
check('Sign out closes About me as it goes', /closeModal\('modal-body-profile'\)/.test(html.slice(html.indexOf('async function signOutUser('), html.indexOf('async function signOutUser(') + 600)));

// ── 3. The plan banner's View ─────────────────────────────────────────────
const fnSrc = (name) => { const i = html.indexOf(`function ${name}(`); let d = 0; for (let j = html.indexOf('{', i); j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) return html.slice(i, j + 1); } return ''; };
const viewable = (src) => new Function('state', 'getLocalToday', 'getDateActiveMacroId', `${src}; return coachPlanNoticeViewable;`);
const st = { macrocycles: [{ id: 'future', start: '2026-10-12', publishedBy: 'c' }, { id: 'now', start: '2026-09-28' }] };
const v = viewable(fnSrc('coachPlanNoticeViewable'))(st, () => '2026-09-29', () => 'now');
const vCoach = viewable(fnSrc('coachPlanNoticeViewable'))({ macrocycles: [{ id: 'c1', start: '2026-09-28', publishedBy: 'c' }] }, () => '2026-09-29', () => 'c1');
check('View is offered only once the changed cycle has started',
  v({ macroId: 'future' }) === false && v({ macroId: 'now' }) === true && v({ macroId: 'gone' }) === false);
check('an old notice naming no cycle: View only when the running cycle is the coach’s (the UAT case: the client’s own is running)',
  v({}) === false && vCoach({}) === true);
check('the plan notice names its cycle, and Home asks before offering View',
  /named \? \{ macroId: named\.id \} : undefined\);/.test(html) && /plan: n => \(coachPlanNoticeViewable\(n\) \?/.test(html));

// ── Controls ──────────────────────────────────────────────────────────────
console.log('\n— controls, which must be caught —');
check('control: a word left on fill-box is caught', !splashWords(html.replace(/(#splash \.s-word \{[^}]*)transform-box: view-box;/, '$1transform-box: fill-box; transform-origin: center;')).viewBox);
check('control: a Sign out left in My data is caught', /signOutUser/.test(data + '<div class="settings-row" onclick="signOutUser()">'));

check('control: a View that ignores the date is caught', viewable('function coachPlanNoticeViewable() { return true; }')(st, () => '2026-09-29', () => 'now')({ macroId: 'future' }) === true);

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
