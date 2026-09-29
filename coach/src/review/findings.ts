// ═══════════════════════════════════════════════════════════════════════
// Review's findings: what stands out, each with the action that deals with it
// (TECHNICAL §140). The outcome leads: an off-track verdict's explaining
// input comes first; on track, a drifting input is context with no action.
//
// `action` names what the coach would do. A card shows a button only for an
// action Coach has built (AVAILABLE_ACTIONS); the rest arrive with their
// screens (Run check-in with the AI tools, Adjust goals and Swap exercise
// with Plan) on the same cards.
// ═══════════════════════════════════════════════════════════════════════
import type { Outcome } from './outcome';
import type { GridRow, RpePoint } from './training';

export type FindingAction = 'adjust' | 'swap' | 'progress' | 'checkin' | 'message';
export const AVAILABLE_ACTIONS: ReadonlySet<FindingAction> = new Set(['message']);

export interface Finding {
  id: string;
  tone: 'bad' | 'amber' | 'neutral';
  icon: 'fuel' | 'progress' | 'train' | 'scale' | 'message' | 'check' | 'flag';
  title: string;
  body: string;
  action: FindingAction | null;
}

const ICON = { calories: 'fuel', steps: 'progress', training: 'train', 'weigh-ins': 'scale' } as const;
/** An exercise done but short of its target in this many finished weeks is a finding of its own. */
export const NAGGING_FAILS = 2;

export function buildFindings(first: string, o: Outcome, rows: GridRow[], rpe: RpePoint[], missedSessions: number): Finding[] {
  const out: Finding[] = [];
  if (o.status === 'off-track') {
    if (o.lead) {
      out.push({
        id: 'lead', tone: 'bad', icon: ICON[o.lead.key], title: `${o.lead.label} explains it`, body: `${o.lead.fact}.`,
        action: o.lead.key === 'calories' || o.lead.key === 'steps' ? 'adjust' : 'message',
      });
    } else {
      out.push({ id: 'lead', tone: 'bad', icon: 'flag', title: 'Nothing in the logs explains it', body: o.unexplained ?? '', action: 'checkin' });
    }
  }
  for (const r of rows.filter((x) => x.fails >= NAGGING_FAILS)) {
    const p = rpe.find((x) => x.key === r.key);
    out.push({
      id: `ex-${r.key}`, tone: 'bad', icon: 'train',
      title: `${r.name} keeps missing`,
      body: `${r.sessionLabel}: done but short of its target in ${r.fails} of ${r.passes + r.fails + r.missed} counted weeks${p ? `, rated RPE ${p.rpe.toFixed(1)}` : ''}. One exercise may need changing, not the plan.`,
      action: 'swap',
    });
  }
  if (missedSessions > 0) {
    out.push({
      id: 'missed', tone: missedSessions >= NAGGING_FAILS ? 'bad' : 'amber', icon: 'train',
      title: `${missedSessions} planned session${missedSessions === 1 ? '' : 's'} not done`,
      body: 'In the finished weeks of this cycle.',
      action: 'message',
    });
  }
  for (const p of rpe.filter((x) => x.zone === 'too-hard')) {
    if (out.some((f) => f.id === `ex-${p.key}`)) continue;
    out.push({ id: `hard-${p.key}`, tone: 'bad', icon: 'train', title: `${p.name} is too hard`, body: `Missing its target at RPE ${p.rpe.toFixed(1)}. Change it within days, not weeks.`, action: 'swap' });
  }
  for (const p of rpe.filter((x) => x.zone === 'too-easy')) {
    out.push({ id: `easy-${p.key}`, tone: 'amber', icon: 'train', title: `${p.name} looks too easy`, body: `On target at RPE ${p.rpe.toFixed(1)}. It can progress faster.`, action: 'progress' });
  }
  const skipped = rpe.filter((p) => p.skipped > 0);
  if (skipped.length) {
    out.push({
      id: 'rpe-skip', tone: 'amber', icon: 'message', title: 'Effort ratings skipped',
      body: `${first} skipped the RPE rating on ${skipped.map((p) => `${p.name}${p.skipped > 1 ? ` (${p.skipped}×)` : ''}`).join(', ')} recently. Skips count as 5.5, the middle of the scale.`,
      action: 'message',
    });
  }
  const wi = o.context.find((d) => d.key === 'weigh-ins' && d.bad);
  if (wi && o.status === 'off-track') out.push({ id: 'wi', tone: 'amber', icon: 'scale', title: 'Weigh-ins are patchy', body: `${wi.fact}. A steadier trend makes the next check-in more reliable.`, action: 'message' });
  if (o.status === 'on-track') {
    for (const d of o.context.filter((x) => x.bad)) out.push({ id: `ctx-${d.key}`, tone: 'neutral', icon: 'check', title: `${d.label} drifting, goal on track`, body: d.fact, action: null });
  }
  if (!out.length) out.push({ id: 'none', tone: 'neutral', icon: 'check', title: 'Nothing needs you', body: o.status === 'no-data' ? 'There isn’t enough logged yet to judge this cycle.' : 'The outcome and the inputs behind it are on plan.', action: null });
  return out;
}
