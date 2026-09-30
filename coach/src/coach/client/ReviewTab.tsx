import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AIBadge, Button, Card, Chip, Hero, Icon, Notice, OutcomeChip, Score, Section, Sheet, Tag, useIsTablet, useIsWide, type IconName } from '@/components/ui';
import { ComplianceGrid, SessionsStrip } from '@/components/charts/ComplianceGrid';
import { NutritionChart } from '@/components/charts/NutritionChart';
import { RpeQuadrant } from '@/components/charts/RpeQuadrant';
import { StoryChart } from '@/components/charts/StoryChart';
import { fmt } from '@/lib/format';
import { reviewFor, type ReviewModel } from '@/review/model';
import { AVAILABLE_ACTIONS, requestFinding, type Finding } from '@/review/findings';
import { mealsOn } from '@/review/nutrition';
import { outOf10 } from '@/review/training';
import type { DriverKey } from '@/review/outcome';
import { goalLabel, type ClientView } from '@/coach/screens/ClientScreen';
import { clientPath } from '@/app/router';
import { AiPanel, useAiData } from '@/coach/client/AiPanel';
import { InPersonReview } from '@/coach/client/InPersonReview';
import { StrengthSection } from '@/coach/client/StrengthSection';
import { openRequest } from '@/ai/tools';
import type { AiTool } from '@/ai/types';

/** A verdict rests on weigh-ins: say so when the latest is older than this. */
const STALE_WEIGH_IN_DAYS = 7;
const DRIVER_ICON: Record<DriverKey, IconName> = { calories: 'fuel', steps: 'progress', training: 'train', 'weigh-ins': 'scale' };

/**
 * Client → Review. Reads top to bottom as a story: the verdict, the evidence
 * on one time axis, compliance from the cycle down to the set, nutrition,
 * effort, and the findings with their actions. Everything is the engine's,
 * on the client's uploaded state, at THEIR local today (review/model.ts).
 */
export function ReviewTab({ v }: { v: ClientView }) {
  const { summary: c, bundle, cycle, first } = v;
  const snap = c.status === 'linked' ? bundle.snapshot : null;
  const model = useMemo(
    () => (snap && cycle && c.clientToday ? reviewFor(bundle.card.id, snap.hash, snap.state, cycle.id, c.clientToday, first) : null),
    [snap, cycle, c.clientToday, bundle.card.id, first],
  );

  // A client not on the app: their record is what you publish and take in person (TECHNICAL §155).
  if (c.status === 'not-on-app') return <InPersonReview v={v} />;
  if (c.status !== 'linked' || !snap || !c.clientToday || !cycle || !model) {
    let text: ReactNode;
    if (c.status === 'invited') text = `Invite sent. ${first}’s review starts once they link and their BLOC syncs.`;
    else if (c.status === 'unlinked') text = `${first} is no longer linked, so their data isn’t shared with you.`;
    else if (c.problem) text = 'Their latest sync couldn’t be read.';
    else if (!snap) text = `Linked. Waiting for ${first}’s first sync: their BLOC uploads whenever it’s opened.`;
    else text = `${first} has no cycle yet.`;
    return (
      <>
        <Hero><OutcomeChip status="no-data" /><p className="display" style={{ fontSize: 20, marginTop: 12 }}>{text}</p></Hero>
        {c.problem && <Notice icon="warning" tone="bad" title="Their latest sync couldn’t be read" style={{ marginTop: 12 }}>{c.problem}</Notice>}
      </>
    );
  }
  return <Review v={v} m={model} tz={snap.tz} />;
}

function Review({ v, m, tz }: { v: ClientView; m: ReviewModel; tz: string }) {
  const { bundle } = v;
  const [day, setDay] = useState<string | null>(null);
  const ai = useAiData(v);
  const [aiTool, setAiTool] = useState<AiTool>(() => (['check_in', 'cycle_review', 'next_cycle'].includes(v.focus?.tool ?? '') ? v.focus!.tool as AiTool : 'check_in'));
  // From Today's Needs you: once the AI tools have loaded, scroll to the note back (else the AI tools), once.
  const focused = useRef(false);
  // 🚨 Marked done only when the scroll happens: a second load of the AI data (or React's development double-run)
  //    cancels a pending timer, and a flag set up front stopped the retry, so Review stayed at the top.
  useEffect(() => {
    if (!v.focus || focused.current || !ai.data) return;
    const t = setTimeout(() => {
      if (focused.current) return;
      const note = v.focus!.note ? document.querySelector<HTMLElement>(`[data-note="${CSS.escape(v.focus!.note)}"]`) : null;
      const el = (note && note.offsetParent ? note : null) ?? document.getElementById('review-ai');
      if (!el) return;
      focused.current = true;
      el.scrollIntoView({ block: note && note.offsetParent ? 'center' : 'start', behavior: 'smooth' });
    }, 300);
    return () => clearTimeout(t);
  });
  const aiRef = useRef<HTMLDivElement>(null);
  const openAi = (tool: AiTool) => { setAiTool(tool); aiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const request = ai.data ? openRequest(ai.data.submissions, ai.data.drafts, m.cycle.id) : null;
  const findings = request ? [requestFinding(v.first, request.body?.feel, request.body?.note, fmt.dm(String(request.body?.sent_on || request.createdAt.slice(0, 10)))), ...m.findings.filter((f) => f.id !== 'none')] : m.findings;
  const t = m.training;
  const lastScored = [...t.cols].reverse().find((col) => col.closed && (t.scored ? col.score != null : col.attendance != null));
  return (
    <>
      <VerdictHero m={m} tz={tz} />

      <Section i={2} title="The evidence" sub="Weight, measurements and food on one time axis. Hold and drag to read any day.">
        <Card><StoryChart d={m.story} name={m.cycle.name} /></Card>
        <EvidenceTiles m={m} />
      </Section>

      <Section i={3} title="Compliance" sub={t.scored ? 'From the whole cycle down to a single set. Tap a cell to see its sets.' : 'Maintenance cycles are scored on attendance. The grid still shows what was logged.'}>
        <div className="tiles-3">
          <ScoreTile scope="Cycle" label={t.scored ? 'Training' : 'Attendance'} value={outOf10(t.scored ? t.cycleScore : t.cycleAttendance)} />
          <ScoreTile scope="Cycle" label="Nutrition" value={outOf10(m.nutrition.cycleScore)} />
          <ScoreTile scope={lastScored ? lastScored.label : 'Last week'} label={t.scored ? 'Training' : 'Attendance'} value={outOf10(lastScored ? (t.scored ? lastScored.score : lastScored.attendance) : null)} />
        </div>
        <Card style={{ marginTop: 12 }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="label" style={{ margin: 0 }}>Sessions · planned against done</span>
            <span className="caption" style={{ whiteSpace: 'nowrap' }}>{t.cols.filter((c) => !c.future).reduce((a, c) => a + c.done, 0)} of {t.cols.filter((c) => !c.future).reduce((a, c) => a + c.planned, 0)} so far</span>
          </div>
          <SessionsStrip t={t} />
        </Card>
        <Card style={{ marginTop: 12 }}><ComplianceGrid t={t} /></Card>
      </Section>

      <div className="grid-2">
        {m.hasNutrition && (
          <Section i={4} title="Nutrition" sub="Intake against target, with its protein share, logged TDEE and BMR. In the day view, tap a day to see its meals.">
            <Card><NutritionChart days={m.days} weeks={m.nutrition.weeks} bmr={m.bmr} tdee={m.tdee} goalType={m.cycle.goalType} onDay={setDay} /></Card>
            <NutritionWeeks m={m} />
          </Section>
        )}
        {m.rpe.length > 0 && (
          <Section i={5} title="Effort" sub="How hard each exercise felt against whether it hit target. Too hard is flagged early.">
            <Card><RpeQuadrant points={m.rpe} /></Card>
          </Section>
        )}
      </div>

      <StrengthSection t={m.training} i={5} first={v.first} />

      {/* Laptop: Findings and AI tools side by side, each in its own column (.grid-2, 1024px and wider). */}
      <div className="grid-2">
        <Section i={6} title="Findings" sub="What stands out, each with the action that deals with it.">
          <div className="stack">
            {findings.map((f, k) => <FindingCard key={f.id} f={f} v={v} i={7 + k} onCheckin={() => openAi('check_in')} />)}
          </div>
        </Section>

        <div ref={aiRef} style={{ scrollMarginTop: 20, minWidth: 0 }}>
          <Section id="review-ai" i={7 + findings.length} title="AI tools" sub={`Runs on this device with your key, on ${v.first}’s data at their date. Nothing reaches ${v.first} until you publish.`} slot={<AIBadge />}>
            <AiPanel v={v} m={m} state={bundle.snapshot!.state} tool={aiTool} onTool={setAiTool} ai={ai} />
          </Section>
        </div>
      </div>

      <MealsSheet v={v} m={m} date={day} onClose={() => setDay(null)} state={bundle.snapshot!.state} />
    </>
  );
}

// ---------------------------------------------------------------- verdict

function VerdictHero({ m, tz }: { m: ReviewModel; tz: string }) {
  const o = m.outcome;
  const withW = o.weeks.filter((w) => w.avg != null);
  const lastAvg = withW[withW.length - 1]?.avg ?? null;
  const recent = withW.slice(-3);
  const change = recent.length > 1 ? (recent[recent.length - 1].avg as number) - (recent[0].avg as number) : null;
  const gt = m.cycle.goalType;
  const good = change == null ? null : gt === 'gain' ? change > 0 : gt === 'maintenance' ? Math.abs(change) <= 1 : change < 0;
  const drifting = o.status === 'on-track' ? o.context.find((d) => d.bad) : undefined;
  const lastWeighIn = m.story.weighIns[m.story.weighIns.length - 1]?.date ?? null;
  const staleDays = lastWeighIn ? Math.round((Date.parse(`${m.story.last}T00:00:00Z`) - Date.parse(`${lastWeighIn}T00:00:00Z`)) / 86400000) : null;
  return (
    <Hero>
      <div className="row">
        <OutcomeChip status={o.status} />
        <span className="caption" style={{ textAlign: 'right' }}>{m.cycle.status === 'past' ? `Ended ${fmt.dm(m.cycle.end)}` : m.weekNow ? `Week ${m.weekNow} of ${m.cycle.weeks}` : `Starts ${fmt.dm(m.cycle.start)}`} · {goalLabel(gt)}</span>
      </div>
      <p className="display" style={{ fontSize: 22, lineHeight: 1.3, marginTop: 14, maxWidth: 760 }}>{o.verdict}</p>
      {o.lead && (
        <div className="tile" style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'color-mix(in srgb, var(--red) 10%, transparent)' }}>
          <span className="t-bad" style={{ marginTop: 1 }}><Icon name={DRIVER_ICON[o.lead.key]} size={20} /></span>
          <div><div className="eyebrow red">What explains it</div><div style={{ fontWeight: 700, marginTop: 4 }}>{o.lead.fact}.</div></div>
        </div>
      )}
      {o.status === 'off-track' && !o.lead && (
        <div className="tile" style={{ marginTop: 16 }}>
          <div className="eyebrow">Nothing in the logs explains it</div>
          {o.unexplained && o.unexplained !== 'Nothing in the logs explains it.' && <div className="muted" style={{ marginTop: 4, color: 'var(--text)' }}>{o.unexplained}</div>}
        </div>
      )}
      {drifting && (
        <div className="tile" style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="t-acc" style={{ marginTop: 1 }}><Icon name="check" size={20} /></span>
          <div className="muted" style={{ color: 'var(--text)' }}>{drifting.fact}</div>
        </div>
      )}
      <div className="tiles-3" style={{ marginTop: 16 }}>
        <div><div className="stat">{lastAvg != null ? fmt.one(lastAvg) : '—'}</div><div className="caption">lbs, latest week</div></div>
        <div><div className={`stat ${good == null ? '' : good ? 't-good' : 't-bad'}`}>{change != null ? fmt.signed(change, 1) : '—'}</div><div className="caption">lbs over {recent.length} wks</div></div>
        <div><div className="stat">{m.story.targetLbs != null ? fmt.one(m.story.targetLbs) : '—'}</div><div className="caption">goal lbs</div></div>
      </div>
      <WeeksNarrative m={m} />
      {staleDays != null && staleDays > STALE_WEIGH_IN_DAYS && (
        <p className="t-amber" style={{ marginTop: 14, fontSize: 13, fontWeight: 700 }}><Icon name="scale" size={14} /> Last weigh-in {fmt.ddm(lastWeighIn!)}, {staleDays} days ago</p>
      )}
      <p className="caption" style={{ marginTop: 14 }}><Icon name="clock" size={13} /> Judged at {fmt.ddm(m.today)}, their date ({tz})</p>
    </Hero>
  );
}

// ---------------------------------------------------------------- how the weeks went

/**
 * The cycle as the engine groups it, one line per stretch: the first weeks,
 * then each flat or moving period with its weights and calories. It's the
 * weekly figures behind the verdict, told rather than tabled.
 */
function WeeksNarrative({ m }: { m: ReviewModel }) {
  const ps = m.outcome.periods;
  if (ps.length < 2) return null;
  const gt = m.cycle.goalType;
  const word = (p: (typeof ps)[number]) => {
    if (p.kind === 'start') return 'start';
    if (p.kind === 'flat') return 'flat';
    const up = (p.toLbs ?? 0) > (p.fromLbs ?? 0);
    return up ? 'gaining' : 'losing';
  };
  const bad = (p: (typeof ps)[number]) => p.kind === 'flat' ? gt !== 'maintenance' : p.kind === 'moving' && gt !== 'maintenance' && ((gt === 'gain') !== ((p.toLbs ?? 0) > (p.fromLbs ?? 0)));
  return (
    <div style={{ marginTop: 16 }}>
      <div className="eyebrow">How the weeks went</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
        {ps.map((p) => {
          const range = p.from === p.to ? p.from : `${p.from}–${p.to}`;
          const lbs = p.kind === 'start'
            ? (p.fromLbs != null && p.from !== p.to ? `${fmt.one(p.fromLbs)} → ${fmt.one(p.toLbs as number)} lbs` : p.toLbs != null ? `${fmt.one(p.toLbs)} lbs` : '')
            : p.fromLbs != null && p.toLbs != null ? `${fmt.one(p.fromLbs)} → ${fmt.one(p.toLbs)} lbs (${fmt.signed(p.toLbs - p.fromLbs, 1)})` : '';
          return (
            <li key={p.from + p.kind} style={{
              display: 'flex', gap: 10, padding: '6px 8px', margin: '0 -8px', borderTop: '1px solid var(--divider)', fontSize: 13.5, alignItems: 'baseline',
              ...(p.flagged && p.kind === 'flat' ? { background: 'color-mix(in srgb, var(--text) 7%, transparent)', borderRadius: 8 } : {}),
            }}>
              <b className="num" style={{ minWidth: 58, whiteSpace: 'nowrap' }}>{range}</b>
              <span style={{ minWidth: 0 }}>
                <span className={bad(p) ? 't-bad' : p.kind === 'moving' ? 't-good' : ''} style={{ fontWeight: 700 }}>{word(p)}</span>
                {lbs && <> · {lbs}</>}
                {p.avgKcal != null && <span className="muted"> · {fmt.int(p.avgKcal)} kcal a day</span>}
                {p.flagged && p.kind === 'flat' && <span className="caption"> · the stall behind the verdict</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- evidence tiles

/** Six tiles: 6 across on a laptop, 3 by 2 on a tablet, 2 by 3 on a phone. */
function EvidenceTiles({ m }: { m: ReviewModel }) {
  const wide = useIsWide(), tablet = useIsTablet();
  const o = m.outcome;
  const lead = o.lead?.key;
  const flag = (k: DriverKey) => (o.status === 'off-track' ? o.lead?.key === k : false);
  const drift = (k: DriverKey) => o.status === 'on-track' && o.context.some((d) => d.key === k && d.bad);

  const last3 = m.story.kcalWeeks.filter((w) => w.avgKcal != null && w.targetKcal != null).slice(-3);
  const kcalDiff = last3.length ? last3.reduce((a, w) => a + ((w.avgKcal as number) - (w.targetKcal as number)), 0) / last3.length : null;
  const steps3 = o.weeks.filter((w) => w.avgSteps != null).slice(-3);
  const steps = steps3.length ? steps3.reduce((a, w) => a + (w.avgSteps as number), 0) / steps3.length : null;
  const closed = m.training.cols.filter((c) => c.closed && (m.training.scored ? c.score != null : c.attendance != null)).slice(-3);
  const train = closed.length ? closed.reduce((a, c) => a + ((m.training.scored ? c.score : c.attendance) as number), 0) / closed.length : null;
  const from21 = [m.story.start, shiftBack(m.story.last, 20)].sort()[1];
  const span21 = Math.round((Date.parse(`${m.story.last}T00:00:00Z`) - Date.parse(`${from21}T00:00:00Z`)) / 86400000) + 1;
  const weighIns = m.story.weighIns.filter((w) => w.date >= from21).length;
  const meas = m.story.measurements.filter((x) => x.waist != null);
  const lastM = meas[meas.length - 1];

  const intake3 = m.story.kcalWeeks.filter((w) => w.avgKcal != null).slice(-3);
  const intake = intake3.length ? intake3.reduce((a, w) => a + (w.avgKcal as number), 0) / intake3.length : null;
  const vsTdee = intake != null && m.tdee != null ? intake - m.tdee : null;
  const tiles: { key: DriverKey | 'waist' | 'tdee'; label: string; value: string; sub: string }[] = [
    { key: 'waist', label: 'Waist', value: lastM?.waist != null ? fmt.inches(lastM.waist) : '—', sub: !lastM ? 'Not measured' : o.waist ? `${fmt.signed(o.waist.to - o.waist.from, 2)}″ since ${fmt.dm(o.waist.fromDate)}` : `Measured ${fmt.dm(lastM.date)}` },
    { key: 'calories', label: 'Calories', value: kcalDiff != null ? fmt.signedInt(kcalDiff) : '—', sub: `a day vs target, ${last3.length || 3} wks` },
    { key: 'steps', label: 'Steps', value: steps != null ? fmt.int(steps) : '—', sub: `a day, ${steps3.length || 3} wks` },
    { key: 'training', label: m.training.scored ? 'Training' : 'Attendance', value: outOf10(train), sub: `out of 10, ${closed.length || 3} wks` },
    { key: 'weigh-ins', label: 'Weigh-ins', value: String(weighIns), sub: `of the last ${span21} days` },
    { key: 'tdee', label: vsTdee != null && vsTdee > 0 ? 'Surplus' : 'Deficit', value: vsTdee != null ? fmt.signedInt(vsTdee) : '—', sub: m.tdee != null ? `a day vs TDEE ${fmt.int(m.tdee)}, ${intake3.length || 3} wks` : 'No logged TDEE yet' },
  ];
  tiles.sort((a, b) => (a.key === lead ? -1 : b.key === lead ? 1 : 0));
  // The deficit reads with calories: keep it right after them.
  const di = tiles.findIndex((x) => x.key === 'tdee');
  const [deficit] = tiles.splice(di, 1);
  tiles.splice(tiles.findIndex((x) => x.key === 'calories') + 1, 0, deficit);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${wide ? 6 : tablet ? 3 : 2}, minmax(0, 1fr))`, gap: 10, marginTop: 12 }}>
      {tiles.map((x) => {
        const isLead = x.key !== 'waist' && x.key !== 'tdee' && flag(x.key);
        const drifting = x.key !== 'waist' && x.key !== 'tdee' && drift(x.key);
        return (
          <div key={x.key} className="card" style={{ ...TILE, borderColor: isLead ? 'color-mix(in srgb, var(--red) 60%, transparent)' : undefined }}>
            <div className="row" style={{ minHeight: 22 }}><span className="muted" style={{ fontSize: 12 }}>{x.label}</span>{isLead && <Tag>Explains it</Tag>}</div>
            <div className={`stat ${isLead ? 't-bad' : ''}`} style={{ marginTop: 6, whiteSpace: 'nowrap' }}>{x.value}</div>
            <div className="caption" style={{ marginTop: 4 }}>{drifting ? 'Drifting · goal on track' : x.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

const shiftBack = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/**
 * A tile in a grid of tiles. 🚨 `marginTop: 0`: ui.css spaces stacked cards
 * with `.card + .card { margin-top }`, which in a grid pushes every tile after
 * the first down, so the first reads as taller.
 */
const TILE = { padding: 14, marginTop: 0 } as const;

function ScoreTile({ scope, label, value }: { scope: string; label: string; value: string }) {
  return (
    <div className="card" style={TILE}>
      <div className="caption" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{scope}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ marginTop: 6 }}><Score value={value} size={24} /></div>
    </div>
  );
}

// ---------------------------------------------------------------- nutrition weeks

const FIELD_LABEL = { kcal: 'Kcal', protein: 'Protein', carbs: 'Carbs', steps: 'Steps' } as const;

/** The finished weeks' verdicts, the ones BLOC's Home showed the client, newest first. */
function NutritionWeeks({ m }: { m: ReviewModel }) {
  const weeks = [...m.nutrition.weeks].reverse().slice(0, 4);
  return (
    <div className="card list" style={{ marginTop: 12 }}>
      {weeks.map((w) => (
        <div key={w.start} className="ex" style={{ alignItems: 'flex-start' }}>
          <span>
            <b>{fmt.range(w.start, w.end)}</b>
            <span className="caption" style={{ display: 'block', marginTop: 2 }}>{w.reason ?? `${w.countedDays} days counted`}</span>
          </span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', whiteSpace: 'normal', maxWidth: '62%' }}>
            {w.metrics.filter((x) => x.good != null).map((x) => <Tag key={x.field} tone={x.good ? 'good' : ''}>{FIELD_LABEL[x.field]} {x.good ? '✓' : '×'}</Tag>)}
            {w.score != null && <Tag tone="acc">{outOf10(w.score)}/10</Tag>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- findings

function FindingCard({ f, v, i, onCheckin }: { f: Finding; v: ClientView; i: number; onCheckin: () => void }) {
  const tone = f.tone === 'bad' ? 'var(--red)' : f.tone === 'amber' ? 'var(--amber)' : 'var(--text3)';
  const card = v.bundle.card;
  const href = card.phone ? `sms:${card.phone.replace(/\s/g, '')}` : card.email ? `mailto:${card.email}` : null;
  const available = f.action && AVAILABLE_ACTIONS.has(f.action);
  return (
    <Card i={i}>
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ color: tone, marginTop: 2 }}><Icon name={f.icon} size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{f.title}</div>
          {f.body && <p className="muted" style={{ marginTop: 4, lineHeight: 1.45 }}>{f.body}</p>}
          {f.action === 'message' && available && (href
            ? <a className="btn-sm" style={{ marginTop: 12 }} href={href}><Icon name="message" size={16} /> Message {v.first}</a>
            : <p className="caption" style={{ marginTop: 10 }}>Add {v.first}’s phone or email in Profile to message them from here.</p>)}
          {f.action === 'checkin' && available && <Button variant="ghost" size="sm" icon="sparkle" style={{ marginTop: 12 }} onClick={onCheckin}>Run check-in</Button>}
          {f.action === 'adjust' && available && v.cycle?.coachOwned && <a className="btn-sm" style={{ marginTop: 12 }} href={`#${clientPath(card.id, 'plan', v.cycle.id, { act: 'goal' })}`}><Icon name="target" size={16} /> Adjust goals</a>}
          {f.action === 'swap' && available && v.cycle?.coachOwned && f.exercise && <a className="btn-sm" style={{ marginTop: 12 }} href={`#${clientPath(card.id, 'plan', v.cycle.id, { act: 'swap', ex: f.exercise })}`}><Icon name="swap" size={16} /> Swap exercise</a>}
          {(f.action === 'adjust' || f.action === 'swap') && available && !v.cycle?.coachOwned && <p className="caption" style={{ marginTop: 10 }}>{v.first}’s own cycle: start one of yours in Plan to change it.</p>}
          {!f.action && <Chip tone="neutral" style={{ marginTop: 10 }}>No action needed</Chip>}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- meals

function MealsSheet({ v, m, date, onClose, state }: { v: ClientView; m: ReviewModel; date: string | null; onClose: () => void; state: Parameters<typeof mealsOn>[0] }) {
  const d = m.days.find((x) => x.date === date);
  const lines = date ? mealsOn(state, date) : [];
  const meals = [...new Set(lines.map((l) => l.meal))];
  return (
    <Sheet open={!!d} onClose={onClose} title={d ? fmt.long(d.date) : ''}>
      {d && (
        <>
          <div className="tiles-3">
            <div className="tile"><div className="caption">Kcal</div><div className="stat">{d.kcal != null ? fmt.int(d.kcal) : '—'}</div><div className="caption">of {d.target.kcal != null ? fmt.int(d.target.kcal) : '—'}</div></div>
            <div className="tile"><div className="caption">TDEE now</div><div className="stat">{m.tdee != null ? fmt.int(m.tdee) : '—'}</div><div className="caption">BMR {m.bmr != null ? fmt.int(m.bmr) : '—'}</div></div>
            <div className="tile"><div className="caption">Steps</div><div className="stat">{d.steps != null ? fmt.int(d.steps) : '—'}</div><div className="caption">of {d.target.steps != null ? fmt.int(d.target.steps) : '—'}</div></div>
          </div>
          <p className="num caption" style={{ marginTop: 10 }}>
            <span style={{ color: 'var(--protein)', fontWeight: 700 }}>P {d.protein != null ? Math.round(d.protein) : '—'}g</span> · <span style={{ color: 'var(--carbs)', fontWeight: 700 }}>C {d.carbs != null ? Math.round(d.carbs) : '—'}g</span> · <span style={{ color: 'var(--fats)', fontWeight: 700 }}>F {d.fats != null ? Math.round(d.fats) : '—'}g</span>
          </p>
          {meals.length ? (
            <div className="card list" style={{ marginTop: 14 }}>
              {meals.map((meal) => {
                const items = lines.filter((l) => l.meal === meal);
                return (
                  <div key={meal} className="ex">
                    <span style={{ minWidth: 0 }}><b>{meal}</b><br /><span className="caption">{items.map((x) => x.name).join(', ')}</span></span>
                    <span>{fmt.int(items.reduce((a, x) => a + x.kcal, 0))} kcal</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="caption" style={{ marginTop: 14 }}>{v.first} logged this day as daily totals, without meals.</p>
          )}
        </>
      )}
    </Sheet>
  );
}
