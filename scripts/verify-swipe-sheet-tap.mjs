#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-swipe-sheet-tap.mjs
//
// THE BUG THIS PREVENTS: a sheet's own button needing two taps. A swiped
// row's Copy opens "Copy to…" while the row is still swiped underneath. The
// page-wide touchstart that closes an open row also swallows the click that
// follows (so tapping a closed-row's content doesn't open its edit sheet) —
// and it swallowed the first tap on "Copy →" too. Delete's confirm likewise.
//
// The rule (v8.63): a touch inside an open sheet (.modal-overlay.open)
// closes the row but is NOT swallowed; a touch anywhere else still is; a tap
// on the row's own buttons is let straight through.
//
// The capture-phase touchstart handler is run in a sandbox against all three
// cases. A control runs the v8.62 handler, which must swallow the sheet tap.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

function behaviour(src) {
  const m = src.match(/document\.addEventListener\('touchstart', (function\(e\) \{[\s\S]*?\n\}), \{ passive: true, capture: true \}\);/);
  if (!m) return null;
  const out = {};
  for (const where of ['button', 'sheet', 'page']) {
    const ctx = vm.createContext({ _swipeJustClosed: false, closed: 0 });
    const actions = { contains: (t) => t.where === 'button' };
    ctx._swipeOpenWrap = { querySelector: () => actions };
    ctx._swipeCloseAll = () => { ctx.closed++; };
    vm.runInContext(`var handler = ${m[1]};`, ctx);
    const target = { where, closest: (sel) => (where === 'sheet' && sel.includes('.modal-overlay.open') ? {} : null) };
    ctx.handler({ target });
    out[where] = { swallowed: ctx._swipeJustClosed, closed: ctx.closed > 0 };
  }
  return out;
}

let failures = 0;
const check = (label, ok) => { if (!ok) failures++; console.log(`${ok ? '✓' : '✗'} ${label}`); };

const now = behaviour(readFileSync(join(repo, 'index.html'), 'utf8'));
check('the handler is found', !!now);
if (now) {
  check('a tap on the row\'s own Copy / Delete goes straight through', !now.button.swallowed && !now.button.closed);
  check('🚨 a tap inside an open sheet closes the row and is NOT swallowed', !now.sheet.swallowed && now.sheet.closed);
  check('a tap anywhere else closes the row and swallows its click', now.page.swallowed && now.page.closed);
}

let control = '';
try { control = execFileSync('git', ['show', 'ae0d0de:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { /* shallow clone */ }
if (control) {
  const old = behaviour(control);
  check('control: the v8.62 handler swallowed the sheet tap (the bug)', !!old && old.sheet.swallowed === true);
}
if (failures) { console.log(`FAIL ${failures} check(s)`); process.exitCode = 1; }
