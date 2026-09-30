#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// verify-demo-clients.mjs — the demo clients are the same story every week
//
// THE BUG THIS PREVENTS: a BLOC Coach demo client whose story drifts with
// the calendar. engine/src/demo builds each demo client's BLOC state by
// simulating their story up to "today", placed relative to the Monday of
// today's week, so a coach sees Maya in week 5 of her cut whenever the demo
// is rebuilt. That only holds if nothing in the build reads the calendar
// date (a random seed, a month length) and every cycle lands on a Monday.
// A Tuesday cycle start makes BLOC's week boundaries disagree with Coach's;
// a log dated after today shows a session nobody has done yet.
//
// THE RULES (for every persona, built on a Monday, a Wednesday and a Sunday):
//   · The same weekday N weeks later (N = 1, 5, 30) builds the same state,
//     every date moved by exactly N weeks and nothing else changed.
//   · Every cycle starts on a Monday; every goal phase starts on a Monday
//     and ends on a Sunday.
//   · Nothing is logged after today; today holds a weigh-in only (no food,
//     no steps, no session: the day has just started).
//   · Coach's judgement (clientOutcome) reads each client as the story
//     intends, on every day of the week: Maya on track, Tom off track,
//     Grace no outcome yet (week 1), Priya on track through recomposition,
//     Casey off track with calories leading.
// CONTROLS: a story seeded by a different persona key differs (the
// comparison can fail), and a cycle half a week off a Monday is caught.
// ═══════════════════════════════════════════════════════════════════════

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => pathToFileURL(join(repo, 'engine', 'src', p)).href;
const { buildDemoState, DEMO_PERSONAS } = await import(src('demo/index.ts'));
const { clientOutcome, judgeOutcome, computeTraining, computeNutrition } = await import(src('review/index.ts'));
const { shiftDateStr, dayDiff, getHomeWeekStart } = await import(src('dates.ts'));

let failures = 0;
function check(label, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok && detail) console.log(`    ${detail}`);
}

const isMonday = (d) => dayDiff(getHomeWeekStart(d), d) === 0;
const COACH = 'demo-coach';
// A state with every date moved back `days`, for comparing one week with another. The birthday stays put.
function movedBack(s, days) {
  const back = (d) => shiftDateStr(d, -days);
  const j = JSON.stringify({ ...s, profile: { ...s.profile, birthday: '' } })
    .replace(/\d{4}-\d{2}-\d{2}/g, back)
    .replace(/_g(\d{4})(\d{2})(\d{2})/g, (_, y, m, d) => '_g' + back(`${y}-${m}-${d}`).replace(/-/g, ''));
  return j;
}
const plain = (s) => JSON.stringify({ ...s, profile: { ...s.profile, birthday: '' } });

const BASES = { Monday: '2026-10-05', Wednesday: '2026-10-07', Sunday: '2026-10-11' };
const EXPECT = {
  maya: { status: 'on-track' },
  tom: { status: 'off-track' },
  grace: { status: 'no-data' },
  priya: { status: 'on-track', recomposition: true },
  casey: { status: 'off-track', lead: 'calories' },
};

for (const p of DEMO_PERSONAS) {
  for (const [dayName, base] of Object.entries(BASES)) {
    const a = buildDemoState(p, base, { coachId: COACH });
    const drift = [1, 5, 30].filter((n) => movedBack(buildDemoState(p, shiftDateStr(base, n * 7), { coachId: COACH }), n * 7) !== plain(a));
    check(`${p.key}, ${dayName}: the same story 1, 5 and 30 weeks later`, !drift.length, `differs at +${drift.join(', +')} weeks`);

    const offMonday = [
      ...a.macrocycles.filter((m) => !isMonday(m.start)).map((m) => `cycle ${m.name} starts ${m.start}`),
      ...a.goals.filter((g) => !isMonday(g.startDate) || !isMonday(shiftDateStr(g.endDate, 1))).map((g) => `goal ${g.startDate}–${g.endDate}`),
    ];
    check(`${p.key}, ${dayName}: every cycle and goal phase on Monday–Sunday weeks`, !offMonday.length, offMonday.join('; '));

    const late = [
      ...a.bodyLogs.filter((l) => l.date > base || (l.date === base && (l.steps !== undefined))).map((l) => `body ${l.date}`),
      ...a.nutritionLogs.filter((l) => l.date >= base).map((l) => `food ${l.date}`),
    ];
    check(`${p.key}, ${dayName}: nothing logged after this morning`, !late.length, late.slice(0, 5).join(', '));

    const o = clientOutcome(a, base);
    const want = EXPECT[p.key];
    let ok = o.status === want.status, detail = `${o.status}: ${o.reason}`;
    if (ok && (want.lead || want.recomposition)) {
      const m = a.macrocycles.find((x) => x.id === o.macroId);
      const full = judgeOutcome(a, m, base, { training: computeTraining(a, m, base), nutrition: computeNutrition(a, m, base) });
      if (want.lead) { ok = full.lead?.key === want.lead; detail += ` · lead ${full.lead?.key}`; }
      if (want.recomposition) { ok = ok && full.recomposition === true; detail += ` · recomposition ${full.recomposition}`; }
    }
    check(`${p.key}, ${dayName}: Coach reads ${want.status}${want.lead ? ` (${want.lead})` : ''}${want.recomposition ? ' (recomposition)' : ''}`, ok, detail);
  }
}

// Controls: the checks above can fail.
{
  const [p] = DEMO_PERSONAS;
  const a = buildDemoState(p, BASES.Monday, { coachId: COACH });
  const b = buildDemoState({ ...p, key: p.key + '-other' }, shiftDateStr(BASES.Monday, 7), { coachId: COACH });
  check('control: a differently seeded story is caught as different', movedBack(b, 7) !== plain(a));
  const off = { ...p, cycles: p.cycles.map((c, i) => (i === 0 ? { ...c, startOffsetWeeks: c.startOffsetWeeks + 0.5 } : c)) };
  const s = buildDemoState(off, BASES.Monday, { coachId: COACH });
  check('control: a cycle half a week off Monday is caught', s.macrocycles.some((m) => !isMonday(m.start)));
}

if (failures) { console.log(`\n✗ ${failures} failed`); process.exit(1); }
console.log('\n✓ demo clients: same story every week, Monday-aligned, read by Coach as intended');
