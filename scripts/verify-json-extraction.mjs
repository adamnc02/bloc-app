#!/usr/bin/env node
// verify-json-extraction — the real bug this prevents
// ───────────────────────────────────────────────────────────────────────────
// v8.12 and earlier parsed every AI response by joining all `text` blocks and
// calling JSON.parse on the result, having only stripped a markdown fence from
// the very start and end of the string. That holds for a plain single-turn
// call, where the model returns one text block containing only JSON.
//
// It does NOT hold for analyseMealPhoto() with a restaurant named, because
// that request carries the web_search tool. A search turn interleaves the
// model's own narration as additional text blocks — "No published nutrition
// data for…", "Let me search…" — and the join glued that prose onto the JSON.
// On iOS (JavaScriptCore) the result was this error, seen on 2026-09-21:
//
//     JSON Parse error: Unexpected identifier "No"
//
// extractJsonObject() replaces that: it strips fences anywhere, then walks the
// first balanced {…} object, string- and escape-aware so a brace inside a food
// name cannot end the object early.
//
// This script runs the REAL function, not a copy, so it cannot drift from
// what ships. v8.34 (TECHNICAL §124): extractJsonObject moved to the shared
// engine, so it runs from the COMMITTED build (engine/dist/bloc-engine.js),
// and checks index.html's extractJsonObject is only a shim handing the text
// to it. Run: node scripts/verify-json-extraction.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const dist = readFileSync(join(root, 'engine', 'dist', 'bloc-engine.js'), 'utf8');

const engine = vm.runInNewContext(`${dist}\n;BlocEngine`, {});
if (typeof engine.extractJsonObject !== 'function') {
  console.error('✗ extractJsonObject() is not exported by the engine build');
  process.exit(1);
}
const extractJsonObject = engine.extractJsonObject;

// BLOC must call the engine's, not keep a copy of its own.
const SHIM = /function extractJsonObject\(rawText\) \{\n  return BlocEngine\.extractJsonObject\(rawText\);[^\n]*\n\}/;
const shimOk = (html.match(/function extractJsonObject\(/g) || []).length === 1 && SHIM.test(html);
console.log(`${shimOk ? '✓' : '✗'} index.html's extractJsonObject() hands the text to the engine's`);
const shimFailed = shimOk ? 0 : 1;

const JSON_BODY = '{"items":[{"item":"Gammon steak","estimated_grams":220,"calories":420,"protein":48,"carbs":0,"fat":24,"confidence":"high"}]}';

const cases = [
  ['plain JSON, no tools (the v8.12 happy path)',
    JSON_BODY, o => o.items.length === 1],

  ['fenced JSON (the case v8.12 did handle)',
    '```json\n' + JSON_BODY + '\n```', o => o.items[0].calories === 420],

  ['THE BUG: web-search narration before the JSON',
    'No published nutrition data for Doubletree hotel - elstree chaplins was found, so I have estimated from the photo.\n\n' + JSON_BODY,
    o => o.items[0].item === 'Gammon steak'],

  ['narration after the JSON',
    JSON_BODY + '\n\nNote: the halloumi fries are a rough estimate.',
    o => o.items.length === 1],

  ['narration both sides, fenced',
    'Let me search for that menu.\n```json\n' + JSON_BODY + '\n```\nHope that helps.',
    o => o.items[0].protein === 48],

  ['a brace inside a food name does not truncate the object',
    '{"items":[{"item":"Chips {large}","estimated_grams":150,"calories":460,"protein":6,"carbs":60,"fat":21,"confidence":"medium"}]}',
    o => o.items[0].item === 'Chips {large}' && o.items[0].calories === 460],

  ['an escaped quote inside a food name survives',
    '{"items":[{"item":"Pineapple \\"ring\\"","estimated_grams":80,"calories":55,"protein":0,"carbs":14,"fat":0,"confidence":"low"}]}',
    o => o.items[0].item === 'Pineapple "ring"'],

  ['nested objects close at the right brace',
    '{"items":[{"item":"Peas","estimated_grams":90,"calories":70,"protein":5,"carbs":11,"fat":0.5,"confidence":"high"}],"meta":{"source":{"kind":"photo"}}}',
    o => o.meta.source.kind === 'photo' && o.items.length === 1],
];

const nullCases = [
  ['prose with no JSON at all returns null, not a thrown parse error',
    "I'm sorry, I can't identify the food in that photo."],
  ['truncated JSON (max_tokens) returns null', '{"items":[{"item":"Gammon st'],
  ['empty string returns null', ''],
  ['null input returns null', null],
];

let failed = 0;

for (const [name, input, assert] of cases) {
  let ok = false, detail = '';
  try {
    const out = extractJsonObject(input);
    ok = out !== null && assert(out);
    if (!ok) detail = ` (got ${JSON.stringify(out)})`;
  } catch (e) {
    detail = ` (threw ${e.message})`;
  }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail}`);
  if (!ok) failed++;
}

for (const [name, input] of nullCases) {
  let ok = false, detail = '';
  try {
    const out = extractJsonObject(input);
    ok = out === null;
    if (!ok) detail = ` (got ${JSON.stringify(out)})`;
  } catch (e) {
    detail = ` (threw ${e.message} — it must return null, never throw)`;
  }
  console.log(`${ok ? '✓' : '✗'} ${name}${detail}`);
  if (!ok) failed++;
}

// Control: the v8.12 implementation, to prove these cases really were broken
// before and that this script would have caught the bug.
const old = (raw) => JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());
let oldBroke = false;
try { old('No published nutrition data was found.\n\n' + JSON_BODY); } catch { oldBroke = true; }
console.log(`${oldBroke ? '✓' : '✗'} control: the v8.12 parser does fail on the narration case`);
if (!oldBroke) failed++;

failed += shimFailed;
console.log(failed === 0 ? '\nDONE — all checks passed' : `\nFAIL — ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
