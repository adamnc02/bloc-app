#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-household-recipes.mjs
//
// THE BUGS THIS PREVENTS (§176). Household recipes are read from Pinch, a
// different Supabase project, and each of these would leak them or break
// BLOC's own sign-in without any error:
//   · kept in `state` → in every daily snapshot, in client_state for a
//     coach, and in exports
//   · logged through confirmServing's addToFoodLibrary → a personal food,
//     mirrored to BLOC's own `foods` table
//   · a session key matching /^sb-.*-auth-token$/ → the pre-paint check
//     reads it as "signed in to BLOC"
//   · an implicit-flow household client, or one that detects sessions in the
//     URL, could take BLOC's own #access_token return
//   · missing from ACCOUNT_LOCAL_KEYS → the next account on the phone sees
//     the last one's household
//
// Static checks against index.html, plus the pure helper recipeLogRows run
// in a sandbox. A control runs the same checks on the v8.60 index.html
// (before household recipes existed), which must fail.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(repo, 'index.html'), 'utf8');

function run(src, label, quiet = false) {
  let failures = 0;
  const check = (name, ok) => { if (!ok) failures++; if (!quiet) console.log(`${ok ? '✓' : '✗'} ${name}`); };
  const fn = (name) => {
    const at = src.indexOf(`function ${name}(`);
    if (at < 0) return '';
    let depth = 0, i = src.indexOf('{', at);
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
    }
    return '';
  };
  const constant = (name) => (src.match(new RegExp(`const ${name} = '([^']+)'`)) || [])[1];

  const authKey = constant('HOUSEHOLD_AUTH_KEY');
  const cacheKey = constant('HOUSEHOLD_CACHE_KEY');
  check(`${label}: the household session key exists and never matches /^sb-.*-auth-token$/`, !!authKey && !/^sb-.*-auth-token$/.test(authKey));
  check(`${label}: the cache lives in localStorage['${cacheKey}'], never in state`,
    !!cacheKey && fn('householdCache').includes('localStorage.getItem(HOUSEHOLD_CACHE_KEY)')
    && !/state\.household/i.test(src));
  const init = fn('initHousehold');
  check(`${label}: the household client is PKCE, with its own storageKey, and never detects a session in the URL`,
    /flowType:\s*'pkce'/.test(init) && /storageKey:\s*HOUSEHOLD_AUTH_KEY/.test(init) && /detectSessionInUrl:\s*\(\)\s*=>\s*false/.test(init));
  check(`${label}: the household client reads only the published v1 views`,
    /from\('bloc_recipes_v1'\)/.test(fn('refreshHousehold')) && /from\('bloc_recipe_ingredients_v1'\)/.test(fn('refreshHousehold'))
    && !/householdClient\.from\('(recipes|ingredients|products|steps)'\)/.test(src)
    && !/householdClient[\s\S]{0,80}\.(insert|update|upsert|delete)\(/.test(src));
  const confirm = fn('confirmServing');
  check(`${label}: confirmServing never adds a household recipe to the food library`,
    /nutrPendingProduct\.source !== 'household-recipe'/.test(confirm) && /householdRecipeId = nutrPendingProduct\.householdRecipeId/.test(confirm));
  const keys = (src.match(/const ACCOUNT_LOCAL_KEYS = \[([\s\S]*?)\];/) || [])[1] || '';
  check(`${label}: an account switch wipes the household cache and session`,
    keys.includes(`'${cacheKey}'`) && keys.includes(`'${authKey}'`));
  check(`${label}: the edit sheet never matches a household entry to the library by name`,
    /\(isManual \|\| isHousehold\) \? null/.test(fn('openEditFoodEntry')));
  check(`${label}: the builder, delete and food-library editor refuse a recipe now in Pinch`,
    ['openRecipeBuilder', 'deleteRecipe', 'openFoodLibEntry', 'deleteFoodLibEntry'].every((n) => fn(n).includes('isPersonalRecipeLocked(')));

  // recipeLogRows: an imported recipe appears once.
  const helpers = ['householdCache', 'householdRecipes', 'householdRecipeForPersonal', 'recipeLogRows'].map(fn).join('\n');
  if (helpers.includes('function recipeLogRows')) {
    const store = {};
    const ctx = vm.createContext({
      HOUSEHOLD_CACHE_KEY: cacheKey,
      localStorage: { getItem: (k) => store[k] ?? null },
      state: {
        recipes: [{ id: 'recipe_1', name: 'Lasagne' }, { id: 'recipe_2', name: 'Soup' }],
        foodLibrary: [{ id: 'lib_9', name: 'Lasagne', source: 'recipe' }, { id: 'lib_8', name: 'Soup', source: 'recipe' }, { id: 'f', name: 'Oats', source: 'library' }],
      },
    });
    vm.runInContext(helpers, ctx);
    const rowsWith = (recipes) => {
      store[cacheKey] = JSON.stringify({ recipes });
      return vm.runInContext("recipeLogRows('').map(r => r.kind + ':' + r.name).join(',')", ctx);
    };
    check(`${label}: no household cache → personal recipes only, as before`, rowsWith([]) === 'personal:Lasagne,personal:Soup');
    check(`${label}: an imported recipe with Pinch nutrition complete appears once, as household (matched through its library twin's recipe id)`,
      rowsWith([{ id: 'h1', name: 'Lasagne', complete: true, blocRecipeId: 'recipe_1' }]) === 'household:Lasagne,personal:Soup');
    check(`${label}: Pinch incomplete → the BLOC copy is the one row`,
      rowsWith([{ id: 'h1', name: 'Lasagne', complete: false, blocRecipeId: 'recipe_1' }]) === 'personal:Lasagne,personal:Soup');
    check(`${label}: a household recipe with no BLOC original is listed beside the personal ones`,
      rowsWith([{ id: 'h2', name: 'Dal', complete: false, blocRecipeId: null }]) === 'household:Dal,personal:Lasagne,personal:Soup');
  } else {
    check(`${label}: recipeLogRows exists`, false);
  }
  return failures;
}

const failures = run(html, 'v8.61+');

// Control: the v8.60 file has no household recipes and must fail.
let control = '';
try { control = execFileSync('git', ['show', '2e50a98:index.html'], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { /* shallow clone */ }
if (control) {
  const controlFailures = run(control, 'control v8.60', true);
  console.log(`${controlFailures > 0 ? '✓' : '✗'} control: the v8.60 index.html fails ${controlFailures} of these checks (must be > 0)`);
  if (controlFailures === 0) process.exitCode = 1;
}
if (failures) { console.log(`FAIL ${failures} check(s)`); process.exitCode = 1; }
