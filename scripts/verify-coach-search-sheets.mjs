#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-search-sheets.mjs — every Coach sheet whose search box
// filters a list is a SearchSheet (Coach v0.4, TECHNICAL §144)
//
// THE BUG IT PREVENTS: a search box over a list inside the ordinary `Sheet`.
// `Sheet` is anchored to the bottom and sized by its content, so each
// keystroke that shortens the list shrinks the sheet and drops its top
// behind the keyboard (BLOC's v8.27 Recipes sheet: 118 → 486 → 563px while
// typing; BLOC TECHNICAL §9 → "Search sheets", §117).
//
// THE RULES:
//   · The one search box in coach/src is SearchSheet's own: no other file
//     renders `type="search"` or a Search… placeholder input, so a filtering
//     list can only be built on SearchSheet.
//   · SearchSheet keeps all four parts: pinned top and frozen height, a list
//     wrap with a SIBLING fade, the fit after the 0.3s slide-in (320ms), the
//     re-fit on every visualViewport resize; pinned below 768px only.
//   · `Sheet` itself renders no search input.
// Control: a component with a search input in a plain Sheet is caught.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(repo, f), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
function files(dir, re) {
  return readdirSync(join(repo, dir)).flatMap(f => {
    const p = `${dir}/${f}`;
    return statSync(join(repo, p)).isDirectory() ? files(p, re) : re.test(f) ? [p] : [];
  });
}
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const HOME = 'coach/src/components/ui/SearchSheet.tsx';

/** A search box: an input typed "search", or one whose placeholder starts "Search". */
function searchBoxes(src) {
  const s = strip(src);
  const hits = [];
  for (const m of s.matchAll(/<input\b[^>]*>/g)) {
    if (/type=["']search["']/.test(m[0]) || /placeholder=["']Search/i.test(m[0])) hits.push(m[0].slice(0, 60));
  }
  return hits;
}

const src = files('coach/src', /\.tsx$/).filter(f => !/\.test\.tsx$/.test(f));
const outside = src.filter(f => f !== HOME).flatMap(f => searchBoxes(read(f)).map(h => `${f}: ${h}`));
check(`no search box outside SearchSheet (${src.length} components)`, outside.length === 0, outside.join('; '));
check('SearchSheet renders the search box', searchBoxes(read(HOME)).length === 1);

const users = src.filter(f => f !== HOME && /<SearchSheet\b/.test(strip(read(f))));
check(`the filtering lists use it: ${users.map(f => f.split('/').pop()).join(', ')}`,
  ['ExerciseSheets.tsx', 'PlanSheets.tsx', 'LibraryScreen.tsx'].every(n => users.some(f => f.endsWith(n))));
const withoutQuery = users.filter(f => [...strip(read(f)).matchAll(/<SearchSheet\b[^>]*>/g)].some(m => !/onQuery=/.test(m[0])));
check('every SearchSheet is given its query and onQuery', withoutQuery.length === 0, withoutQuery.join(', '));

// The four parts.
const ss = strip(read(HOME));
const css = read('coach/src/styles/ui.css');
const fit = strip(read('coach/src/components/ui/searchFit.ts'));
check('1. pinned: fixed, top at the safe area + 30px, height from the frozen app height',
  /\.sheet\.search-sheet\.pinned\s*\{[^}]*position:\s*fixed[^}]*top:\s*calc\(env\(safe-area-inset-top\)\s*\+\s*30px\)/.test(css)
  && /nextAppHeight\(/.test(ss) && /isKeyboardOpen\(/.test(ss) && /keyboardOpen && previous \? previous/.test(fit)
  && /\.ss-fixed\s*\{\s*flex-shrink:\s*0/.test(css));
check('2. only the list resizes: a wrap (flex 1 1 auto, min-height 0) with a SIBLING fade',
  /\.ss-list-wrap\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0/.test(css)
  && /<div ref=\{wrap\} className="ss-list-wrap">\s*<div className="ss-list">\{children\}<\/div>\s*<div className="ss-fade"/.test(ss));
check('3. fitted after the 0.3s slide-in (320ms), cleared first',
  /style\.maxHeight = ''/.test(ss) && /setTimeout\(fit, FIT_AFTER_MS\)/.test(ss) && /FIT_AFTER_MS = 320/.test(fit)
  && /\.sheet\.search-sheet\s*\{[^}]*animation-duration:\s*\.3s/.test(css));
check('4. re-fitted on every visualViewport resize: 28px behind the keyboard, at least 80',
  /vv\.addEventListener\('resize', measure\)/.test(ss) && /LIST_UNDER_KEYBOARD = 28/.test(fit) && /LIST_MIN = 80/.test(fit));
check('pinned below 768px only (a tablet or laptop gets a centred dialog)', /PIN_BELOW_PX = 768/.test(fit) && /min-width: \$\{PIN_BELOW_PX\}px/.test(ss));
check('Sheet renders no search input', searchBoxes(read('coach/src/components/ui/Sheet.tsx')).length === 0);

// Control.
console.log('\n— control: a search box in a plain Sheet, which must be caught —');
const bad = `export function Pick() { return <Sheet open title="Pick" onClose={() => {}}><input type="search" value={q} onChange={() => {}} />{list}</Sheet>; }`;
check('control: caught', searchBoxes(bad).length === 1);

console.log(failures ? `\nFAIL: ${failures} check(s)` : '\nAll checks pass.');
process.exit(failures ? 1 : 0);
