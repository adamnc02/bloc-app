// Coach v0.8 (TECHNICAL §156): the engine's clientOutcome(), which the bloc-push
// Edge Function runs for the daily digest, gives the verdict Coach shows.
// Today's Off track list and the Clients chip read summarise() → Review's model;
// if the two ever disagree, the digest names a client Today doesn't (or misses one).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { shiftDateStr } from '@engine';
import { clientOutcome, localDateIn } from '@engine/review';
import { buildFixtureClients, fixtureNow } from '@/data/fixtures';
import { summarise } from '@/data/summary';

const demo = JSON.parse(readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const built = buildFixtureClients(demo);
// The anchor and a month back from it, a week at a time: the verdicts change across these.
const instants = [0, 7, 14, 21, 28].map((d) => fixtureNow(shiftDateStr(built.anchor, -d)));

describe('clientOutcome() matches Coach’s outcome', () => {
  const rows = instants.flatMap((now) =>
    built.clients.filter((b) => b.snapshot).map((b) => {
      const snap = b.snapshot!;
      return { id: b.card.id, now, coach: summarise(b, now), engine: clientOutcome(snap.state, localDateIn(snap.tz, now)) };
    }),
  );

  it('covers on track and off track (the check is not vacuous)', () => {
    const seen = new Set(rows.map((r) => r.engine.status));
    expect(seen.has('on-track')).toBe(true);
    expect(seen.has('off-track')).toBe(true);
  });

  it('agrees on the status for every client at every instant', () => {
    for (const r of rows) expect(`${r.id}@${r.now}: ${r.engine.status}`).toBe(`${r.id}@${r.now}: ${r.coach.outcome.status}`);
  });

  it('agrees on the reason whenever a cycle is running', () => {
    for (const r of rows.filter((x) => x.engine.macroId)) expect(`${r.id}: ${r.engine.reason}`).toBe(`${r.id}: ${r.coach.outcome.reason}`);
  });

  it('judges at the client’s date, not the instant’s UTC date', () => {
    // 20:10 UTC on the anchor is already the next day in Auckland.
    expect(localDateIn('Pacific/Auckland', fixtureNow(built.anchor))).toBe(shiftDateStr(built.anchor, 1));
    expect(localDateIn('Not/AZone', fixtureNow(built.anchor))).toBe(built.anchor);
  });
});
