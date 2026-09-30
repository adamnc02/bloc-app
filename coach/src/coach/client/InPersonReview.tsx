// Review for a client not on the app (TECHNICAL §155). Their record is what the coach has published and taken in
// person (inperson/model.ts recordState: the plan, the measurements, the sessions logged), so Review's own model
// runs on it: the story chart without calories (none are logged), and Strength from the sessions logged. Judged at
// the coach's date, the only one a client with no app has.
import { useMemo, useState } from 'react';
import { Button, Card, Hero, Seg, Section, StatTile } from '@/components/ui';
import { StoryChart } from '@/components/charts/StoryChart';
import { navigate, clientPath } from '@/app/router';
import { fmt } from '@/lib/format';
import { computeReview, cycleOptions, defaultCycleId } from '@/review/model';
import type { ClientView } from '@/coach/screens/ClientScreen';
import { useRecord } from '@/inperson/useRecord';
import { latestBody } from '@/inperson/Measurements';
import { StrengthSection } from './StrengthSection';

export function InPersonReview({ v }: { v: ClientView }) {
  const { bundle, first } = v;
  const rec = useRecord(bundle);
  const [pick, setPick] = useState<string | null>(null);
  const cycles = useMemo(() => (rec.state ? cycleOptions(rec.state, rec.today) : []), [rec.state, rec.today]);
  const macroId = pick ?? (rec.state ? defaultCycleId(rec.state, rec.today) : null);
  const m = useMemo(() => (rec.state && macroId ? computeReview(rec.state, macroId, rec.today, first) : null), [rec.state, macroId, rec.today, first]);

  if (rec.error) return <Hero><p className="display" style={{ fontSize: 20 }}>Couldn’t load {first}’s record: {rec.error}</p></Hero>;
  if (!rec.state) return <div aria-busy="true" style={{ minHeight: 200 }} />;
  if (!m) {
    return (
      <Hero>
        <div className="eyebrow">In person</div>
        <p className="display" style={{ fontSize: 20, marginTop: 6 }}>{first} has no cycle yet.</p>
        <p className="muted" style={{ marginTop: 6 }}>Build or apply one in Plan. Weigh-ins, measurements and sessions you log in person then show here.</p>
        <Button size="card" style={{ marginTop: 16 }} icon="plan" onClick={() => navigate(clientPath(bundle.card.id, 'plan'))}>Open {first}’s plan</Button>
      </Hero>
    );
  }

  const body = latestBody(rec.state);
  const inCycle = (d: string) => d >= m.cycle.start && d <= m.cycle.end;
  const weighIns = m.story.weighIns;
  const firstW = weighIns[0], lastW = weighIns[weighIns.length - 1];
  const tape = m.story.measurements;
  const firstWaist = tape.find((x) => x.waist != null), lastWaist = [...tape].reverse().find((x) => x.waist != null);
  const firstHip = tape.find((x) => x.hip != null), lastHip = [...tape].reverse().find((x) => x.hip != null);
  const delta = (a: number | null | undefined, b: number | null | undefined, unit: 'lbs' | 'in') =>
    a == null || b == null || a === b ? undefined : unit === 'lbs' ? `${fmt.signed(b - a, 1)} lbs` : `${fmt.signed(b - a, 2)}″`;
  const hasBody = weighIns.length > 0 || tape.length > 0;

  return (
    <>
      <Hero>
        <div className="eyebrow acc">In person · judged at your date</div>
        <p className="display" style={{ fontSize: 22, marginTop: 6 }}>{m.cycle.name}</p>
        <p className="muted" style={{ marginTop: 4 }}>
          {m.weekNow ? `Week ${m.weekNow} of ${m.cycle.weeks}` : m.cycle.status === 'upcoming' ? `Starts ${fmt.ddm(m.cycle.start)}` : `Ended ${fmt.ddm(m.cycle.end)}`} · {fmt.range(m.cycle.start, m.cycle.end)}
        </p>
        {cycles.length > 1 && (
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <Seg accent className="auto" label="Cycle" value={m.cycle.id} onChange={setPick} options={cycles.map((c) => ({ value: c.id, label: c.name }))} />
          </div>
        )}
        <div className="tiles-3 no-stack" style={{ marginTop: 16 }}>
          <StatTile label="Weight · lbs" value={lastW ? fmt.one(lastW.lbs) : body.weight ? fmt.one(body.weight.lbs) : '—'} sub={delta(firstW?.lbs, lastW?.lbs, 'lbs') ?? (lastW ? fmt.dm(lastW.date) : undefined)} />
          <StatTile label="Waist" value={lastWaist?.waist != null ? fmt.inches(lastWaist.waist) : '—'} sub={delta(firstWaist?.waist, lastWaist?.waist, 'in') ?? (lastWaist ? fmt.dm(lastWaist.date) : undefined)} />
          <StatTile label="Hip" value={lastHip?.hip != null ? fmt.inches(lastHip.hip) : '—'} sub={delta(firstHip?.hip, lastHip?.hip, 'in') ?? (lastHip ? fmt.dm(lastHip.date) : undefined)} />
        </div>
        <p className="caption" style={{ marginTop: 10 }}>
          {body.weight && !inCycle(body.weight.date) && !lastW ? `Last weighed ${fmt.ddm(body.weight.date)}, outside this cycle.` : 'The latest, and the change since the cycle’s first.'}
        </p>
      </Hero>

      <Section i={2} title="Weight and measurements" sub={`The measurements you take with ${first}: weight with its weekly average against the goal, waist and hip, and the goal phases. Hold and drag to read a day.`}>
        {hasBody
          ? <Card><StoryChart d={m.story} name={first} noKcal /></Card>
          : <div className="card muted">No measurements in this cycle yet. Take them in {first}’s Profile or in an in-person session.</div>}
      </Section>

      <StrengthSection t={m.training} i={3} first={first} />
    </>
  );
}
