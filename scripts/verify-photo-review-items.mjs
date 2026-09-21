#!/usr/bin/env node
// verify-photo-review-items — the real bug this prevents
// ───────────────────────────────────────────────────────────────────────────
// Before v8.15, every row on the AI photo review screen came from the model,
// so confirmPhotoItems() could hardcode `source: 'ai_photo'` and
// `aiEstimated: true` on each saved ingredient. §78 lets you add rows from
// the food library and by hand, and those are NOT model estimates — the
// recipe screen renders an "AI est." badge off `aiEstimated`, and the sync
// layer writes it to the `ai_estimated` column, so leaving it hardcoded
// would silently label your own library picks as guesses.
//
// The flags are now per-item. The easy regression is a later edit putting
// `aiEstimated: true` back, or a library pick losing its real macros on the
// way into the review list — neither shows up on screen until you open the
// saved recipe days later.
//
// Runs the REAL functions, read out of index.html — not copies — against DOM
// and state stubs. Run: node scripts/verify-photo-review-items.mjs

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

// Build a sandbox holding the two real functions plus the globals they touch.
function makeSandbox(items, mealName) {
  const body = `
    let _photoDetectedItems = ${JSON.stringify(items)};
    let _photoContext = { mealName: ${JSON.stringify(mealName)} };
    const state = { recipes: [], foodLibrary: [] };
    const captured = { library: null, entry: null, saved: false, closed: null, renders: 0 };
    function renderPhotoReviewItems() { captured.renders++; }
    function addToFoodLibrary(x) { captured.library = x; }
    function addFoodEntry(x) { captured.entry = x; }
    function save() { captured.saved = true; }
    function closeModal(id) { captured.closed = id; }

    ${fnSource('pushPhotoItemFromLibrary')}
    ${fnSource('confirmPhotoItems')}

    return {
      pushPhotoItemFromLibrary,
      confirmPhotoItems,
      captured,
      state,
      items: () => _photoDetectedItems,
    };
  `;
  return new Function(body)();
}

const AI_ITEM = {
  name: 'Gammon steak', grams: 220, kcal: 420, protein: 48, carbs: 0, fats: 24,
  confidence: 'high', suggestedMatch: null, matchStatus: 'pending',
  source: 'ai_photo', aiEstimated: true,
};

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

check('a library pick lands on the review list with its real macros', () => {
  const s = makeSandbox([], 'Gammon steak dinner');
  s.pushPhotoItemFromLibrary({ name: 'Heinz Baked Beans', grams: 207, kcal: 162, protein: 10.2, carbs: 26.6, fats: 0.6, isRecipe: false });
  const it = s.items()[0];
  return (it.name === 'Heinz Baked Beans' && it.grams === 207 && it.kcal === 162
    && it.protein === 10.2 && it.carbs === 26.6 && it.fats === 0.6) || JSON.stringify(it);
});

check('a library pick is NOT flagged as an AI estimate', () => {
  const s = makeSandbox([], 'Meal');
  s.pushPhotoItemFromLibrary({ name: 'Beans', grams: 100, kcal: 80, protein: 5, carbs: 13, fats: 0.3, isRecipe: false });
  const it = s.items()[0];
  return (it.aiEstimated === false && it.source === 'library') || JSON.stringify(it);
});

check('a recipe pick collapses to grams 1 — "1 serving", not a weight', () => {
  const s = makeSandbox([], 'Meal');
  s.pushPhotoItemFromLibrary({ name: 'My chilli', grams: 450, kcal: 600, protein: 40, carbs: 55, fats: 20, isRecipe: true });
  const it = s.items()[0];
  return (it.grams === 1 && it.source === 'recipe' && it.kcal === 600) || JSON.stringify(it);
});

check('grams can never be 0 — confirmPhotoItems divides by it', () => {
  const s = makeSandbox([], 'Meal');
  s.pushPhotoItemFromLibrary({ name: 'Sauce', grams: 0.2, kcal: 5, protein: 0, carbs: 1, fats: 0, isRecipe: false });
  return s.items()[0].grams >= 1 || `grams was ${s.items()[0].grams}`;
});

check('THE REGRESSION: a library row survives into the saved recipe unbadged', () => {
  const s = makeSandbox([], 'Gammon steak dinner');
  s.pushPhotoItemFromLibrary({ name: 'Heinz Baked Beans', grams: 207, kcal: 162, protein: 10.2, carbs: 26.6, fats: 0.6, isRecipe: false });
  s.items().unshift({ ...AI_ITEM });
  s.confirmPhotoItems();
  const ings = s.state.recipes[0].ingredients;
  const ai = ings.find(i => i.name === 'Gammon steak');
  const lib = ings.find(i => i.name === 'Heinz Baked Beans');
  return (ai.aiEstimated === true && ai.source === 'ai_photo'
    && lib.aiEstimated === false && lib.source === 'library') || JSON.stringify(ings);
});

check('a hand-typed row is not badged either', () => {
  const s = makeSandbox([{
    name: 'Bread roll', grams: 60, kcal: 160, protein: 5, carbs: 30, fats: 2,
    confidence: 'low', suggestedMatch: null, matchStatus: 'dismissed',
    source: 'manual', aiEstimated: false,
  }], 'Meal');
  s.confirmPhotoItems();
  const ing = s.state.recipes[0].ingredients[0];
  return (ing.aiEstimated === false && ing.source === 'manual') || JSON.stringify(ing);
});

check('an all-library meal is not logged as AI-estimated', () => {
  const s = makeSandbox([], 'Meal');
  s.pushPhotoItemFromLibrary({ name: 'Beans', grams: 200, kcal: 160, protein: 10, carbs: 26, fats: 1, isRecipe: false });
  s.confirmPhotoItems();
  return s.captured.entry.aiEstimated === false || `entry.aiEstimated was ${s.captured.entry.aiEstimated}`;
});

check('one AI row is enough to keep the logged meal AI-estimated', () => {
  const s = makeSandbox([{ ...AI_ITEM }], 'Meal');
  s.pushPhotoItemFromLibrary({ name: 'Beans', grams: 200, kcal: 160, protein: 10, carbs: 26, fats: 1, isRecipe: false });
  s.confirmPhotoItems();
  return s.captured.entry.aiEstimated === true || `entry.aiEstimated was ${s.captured.entry.aiEstimated}`;
});

check('an item saved before §78 still reads as an AI estimate', () => {
  // Pre-v8.15 items have no source/aiEstimated fields at all — they must not
  // silently become library rows just because the fields are missing.
  const s = makeSandbox([{
    name: 'Chips', grams: 150, kcal: 460, protein: 6, carbs: 60, fats: 21,
    confidence: 'medium', suggestedMatch: null, matchStatus: 'pending',
  }], 'Meal');
  s.confirmPhotoItems();
  const ing = s.state.recipes[0].ingredients[0];
  return (ing.aiEstimated === true && ing.source === 'ai_photo') || JSON.stringify(ing);
});

check('per-gram rates still derive from the reviewed amount', () => {
  const s = makeSandbox([{ ...AI_ITEM }], 'Meal');
  s.confirmPhotoItems();
  const ing = s.state.recipes[0].ingredients[0];
  return (Math.abs(ing.per1kcal - 420 / 220) < 1e-9) || `per1kcal was ${ing.per1kcal}`;
});

check('totals and the logged entry still match the reviewed rows', () => {
  const s = makeSandbox([{ ...AI_ITEM }], 'Gammon steak dinner');
  s.pushPhotoItemFromLibrary({ name: 'Beans', grams: 200, kcal: 160, protein: 10, carbs: 26, fats: 1, isRecipe: false });
  s.confirmPhotoItems();
  const e = s.captured.entry;
  return (e.kcal === 580 && e.protein === 58 && e.name === 'Gammon steak dinner'
    && s.captured.library.per100kcal === 580 && s.captured.saved === true) || JSON.stringify(e);
});

console.log(failed === 0 ? '\nDONE — all checks passed' : `\nFAIL — ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
