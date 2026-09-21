#!/usr/bin/env node
// verify-photo-review-retention — the real bug this prevents
// ───────────────────────────────────────────────────────────────────────────
// The AI photo review screen holds the result of a PAID API call. Nothing is
// saved until Save is tapped, the items live only in _photoDetectedItems, and
// there is no route back to that screen once it closes. Losing it means
// paying for another analysis.
//
// Two ways it used to vanish for free:
//   1. Dismissing the serving-size sheet by swipe-down or backdrop tap.
//      Only its ✕ (cancelNutrServing) ever handed back, and only when
//      _nutrReturnToAddList was set — every other route went nowhere.
//   2. Swiping down or tapping the backdrop on the review screen itself.
//
// Fixed in §79: returnFromNutrServing() always hands back to the screen
// underneath, and the review overlay carries data-no-dismiss so only its ✕
// (which confirms first) can close it.
//
// Runs the REAL functions and asserts the REAL markup, read out of
// index.html. Run: node scripts/verify-photo-review-retention.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

function fnSource(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name}() not found in index.html`);
  const end = html.indexOf('\n}\n', start);
  return html.slice(start, end + 3);
}

let failed = 0;
const check = (name, fn) => {
  let ok = false, detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (!ok) detail = ` (${r})`;
  } catch (e) {
    detail = ` (threw ${e.message})`;
  }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail}`);
  if (!ok) failed++;
};

// ── returnFromNutrServing: where do we land? ───────────────────────────────
// Every combination must land somewhere. In photo context it must ALWAYS be
// a screen from which the review items are still reachable.
function routeTo(context, returnToAddList) {
  const body = `
    let nutrAddContext = ${JSON.stringify(context)};
    let _nutrReturnToAddList = ${returnToAddList};
    let nutrActiveMeal = 'Lunch';
    const opened = [];
    const requestAnimationFrame = (fn) => fn();
    function openModal(id) { opened.push(id); }
    function openPhotoItemSearch() { opened.push('modal-nutr-add:photo'); }
    function openRecipeIngredientSearch() { opened.push('modal-nutr-add:recipe'); }
    function openNutrAdd() { opened.push('modal-nutr-add:meal'); }
    function renderPhotoReviewItems() { opened.push('render'); }
    ${fnSource('returnFromNutrServing')}
    returnFromNutrServing();
    return { opened, returnToAddList: _nutrReturnToAddList };
  `;
  return new Function(body)();
}

check('photo + came via the search list → back to the search list', () => {
  const r = routeTo('photo', true);
  return r.opened.includes('modal-nutr-add:photo') || r.opened.join(',');
});

check('THE BUG: photo + NOT via the list → back to the review screen', () => {
  const r = routeTo('photo', false);
  return r.opened.includes('modal-nutr-photo-review') || `landed on [${r.opened.join(',')}]`;
});

check('photo context re-renders the review list before handing back', () => {
  const r = routeTo('photo', false);
  return r.opened[0] === 'render' || r.opened.join(',');
});

check('recipe + NOT via the list → back to the ingredients screen', () => {
  const r = routeTo('recipe', false);
  return r.opened.includes('modal-recipe-ingredients') || `landed on [${r.opened.join(',')}]`;
});

check('recipe + came via the list → back to the list', () => {
  const r = routeTo('recipe', true);
  return r.opened.includes('modal-nutr-add:recipe') || r.opened.join(',');
});

check('meal context is unchanged — list if it came from one, else nothing', () => {
  const viaList = routeTo('meal', true);
  const direct = routeTo('meal', false);
  return (viaList.opened.includes('modal-nutr-add:meal') && direct.opened.length === 0)
    || `viaList=[${viaList.opened}] direct=[${direct.opened}]`;
});

check('the return-to-list flag is always consumed, never left set', () => {
  return ['photo', 'recipe', 'meal'].every(c => routeTo(c, true).returnToAddList === false)
    || 'a context left _nutrReturnToAddList true';
});

// ── discardPhotoReview: the ✕ ──────────────────────────────────────────────
function discard(items) {
  const body = `
    let _photoDetectedItems = ${JSON.stringify(items)};
    let _photoContext = { mealName: 'Gammon steak dinner' };
    const log = { confirmed: null, closed: null };
    function showConfirm(title, message, okLabel, cb) { log.confirmed = { title, message, okLabel, cb }; }
    function closeModal(id) { log.closed = id; }
    ${fnSource('discardPhotoReview')}
    discardPhotoReview();
    return { log, items: () => _photoDetectedItems };
  `;
  return new Function(body)();
}

const ONE_ITEM = [{ name: 'Gammon steak', grams: 220, kcal: 420, protein: 48, carbs: 0, fats: 24 }];

check('✕ with items on screen asks before throwing the analysis away', () => {
  const r = discard(ONE_ITEM);
  return (r.log.confirmed !== null && r.log.closed === null) || 'closed without confirming';
});

check('…and the warning says re-analysing costs', () => {
  const r = discard(ONE_ITEM);
  return /cost/i.test(r.log.confirmed.message) || `message was "${r.log.confirmed.message}"`;
});

check('…and declining keeps the items — nothing is cleared up front', () => {
  const r = discard(ONE_ITEM);
  return (r.items().length === 1 && r.log.closed === null) || 'items were cleared before the answer';
});

check('…and confirming clears them and closes', () => {
  const r = discard(ONE_ITEM);
  r.log.confirmed.cb();
  return (r.items().length === 0 && r.log.closed === 'modal-nutr-photo-review') || 'discard did not take effect';
});

check('✕ with nothing to lose closes straight away, no dialog', () => {
  const r = discard([]);
  return (r.log.confirmed === null && r.log.closed === 'modal-nutr-photo-review') || 'asked about an empty list';
});

// ── The markup/CSS invariants that make the protection real ────────────────
check('the review overlay carries data-no-dismiss', () => {
  const tag = html.match(/<div class="modal-overlay" id="modal-nutr-photo-review"[^>]*>/);
  return (tag && tag[0].includes('data-no-dismiss')) || `tag was ${tag && tag[0]}`;
});

check('its ✕ goes through the confirm, not straight to closeModal', () => {
  const start = html.indexOf('id="modal-nutr-photo-review"');
  const head = html.slice(start, start + 600);
  return (head.includes('discardPhotoReview()') && !head.includes("closeModal('modal-nutr-photo-review')"))
    || 'the ✕ still closes directly';
});

check('initModal honours data-no-dismiss before wiring either gesture', () => {
  const src = fnSource('initModal');
  const guard = src.indexOf('data-no-dismiss');
  return (guard !== -1
    && guard < src.indexOf("addEventListener('touchstart'")
    && guard < src.indexOf('modal-handle-row')) || 'the opt-out is missing or wired too late';
});

check('modal-confirm outranks every other modal tier', () => {
  const confirmZ = Number((html.match(/#modal-confirm\s*\{\s*z-index:\s*(\d+)/) || [])[1]);
  const others = [...html.matchAll(/#modal-[a-z0-9-]+(?:,\s*#modal-[a-z0-9-]+)*\s*\{\s*z-index:\s*(\d+)/g)]
    .map(m => Number(m[1]));
  const max = Math.max(...others.filter(z => z !== confirmZ));
  return confirmZ > max || `modal-confirm is ${confirmZ}, something else is ${max}`;
});

console.log(failed === 0 ? '\nDONE — all checks passed' : `\nFAIL — ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
