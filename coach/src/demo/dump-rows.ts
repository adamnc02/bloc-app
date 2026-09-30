// Writes a demo Rebuild's rows as JSON, for super-duper-octo-barnacle's
// tools/schema-test/behaviour-bloc-demo.mjs, which writes them into the real
// schema (PGlite) exactly as the bloc-demo Edge Function does. Fictional data.
//
//   cd coach && npx tsx --tsconfig tsconfig.json src/demo/dump-rows.ts \
//     ../../super-duper-octo-barnacle/tools/schema-test/fixtures/bloc-demo-rows.json
import { writeFileSync } from 'node:fs';
import { buildDemoRows, demoId, type DemoIds } from './build';
import { DEMO_CARDS, type DemoCardKey } from './cards';

const [out, at] = process.argv.slice(2);
if (!out) throw new Error('usage: dump-rows.ts <out.json> [ISO instant]');
const ids: DemoIds = {
  coachId: demoId('fixture-coach'),
  cards: Object.fromEntries(DEMO_CARDS.map((c) => [c.key, demoId(`fixture-card:${c.key}`)])) as Record<DemoCardKey, string>,
  users: Object.fromEntries(DEMO_CARDS.filter((c) => c.account).map((c) => [c.key, demoId(`fixture-user:${c.key}`)])),
};
const now = Date.parse(at || '2026-10-07T09:00:00Z');
// The states themselves stay out (~100 KB each): the behaviour test writes its own small one.
const { states, ...rows } = buildDemoRows(ids, now);
const fixture = { now, ids, rows: { ...rows, states: states.map((s) => ({ client: s.client, tz: s.tz, uploadedAt: s.uploadedAt })) } };
writeFileSync(out, JSON.stringify(fixture, null, 1));
console.log(`wrote ${out}`);
