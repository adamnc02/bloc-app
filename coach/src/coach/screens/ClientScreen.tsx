import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Avatar, Chip, EmptyState, IconButton, OutcomeChip, Page, PageHeader, Sheet, Icon, useEntering, useOnResume } from '@/components/ui';
import { CoachShell } from '@/coach/CoachShell';
import { useCoach } from '@/app/App';
import { clientPath, navigate, type ClientTab } from '@/app/router';
import { fmt } from '@/lib/format';
import { summarise, type ClientSummary } from '@/data/summary';
import { cycleOptions, defaultCycleId, type CycleOption } from '@/review/model';
import type { ClientBundle } from '@/data/types';
import { ReviewTab } from '@/coach/client/ReviewTab';
import { ProfileTab } from '@/coach/client/ProfileTab';
import { PlanTab, type PlanIntent } from '@/coach/client/plan/PlanTab';

const TABS: { key: ClientTab; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'plan', label: 'Plan' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'profile', label: 'Profile' },
];

export interface ClientView {
  bundle: ClientBundle;
  summary: ClientSummary;
  /** The client's cycles at their today (linked with an upload), oldest first. */
  cycles: CycleOption[];
  /** The cycle the view is on: `?macro=` or the one Review opens on. */
  cycle: CycleOption | null;
  first: string;
  reload: () => void;
}

/**
 * A client, in four tabs: Review, Plan, Sessions, Profile. The header's
 * switch button changes the client or the cycle for the whole view; it
 * defaults to the cycle that's running at the client's today.
 */
export function ClientScreen({ id, tab, macro, intent }: { id: string; tab: ClientTab; macro: string | null; intent?: PlanIntent | null }) {
  const { repo } = useCoach();
  const ref = useEntering<HTMLDivElement>(`client-${id}-${tab}`);
  const [bundles, setBundles] = useState<ClientBundle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  const load = useCallback(() => {
    repo.loadClients().then(setBundles).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo]);
  useEffect(load, [load]);
  useOnResume(load); // back to the app: reload

  const now = repo.now();
  const summaries = useMemo(() => (bundles ?? []).map((b) => summarise(b, now)), [bundles, now]);
  const bundle = bundles?.find((b) => b.card.id === id) ?? (bundles ? null : undefined);

  const back = <a href="#/clients" className="eyebrow eyebrow-link"><Icon name="chevL" size={14} /> Clients</a>;
  if (error || bundle === null) {
    return (
      <CoachShell tab="clients"><Page innerRef={ref}>
        <PageHeader eyebrow={back} title="Client" />
        <EmptyState>{error ? `Couldn’t load this client: ${error}` : 'This client isn’t on your list.'}</EmptyState>
      </Page></CoachShell>
    );
  }
  if (!bundle) return <CoachShell tab="clients"><div className="page" aria-busy="true" /></CoachShell>;

  const summary = summaries.find((s) => s.id === id)!;
  const snap = summary.status === 'linked' ? bundle.snapshot : null;
  const cycles = snap && summary.clientToday ? cycleOptions(snap.state, summary.clientToday) : [];
  const defId = snap && summary.clientToday ? defaultCycleId(snap.state, summary.clientToday) : null;
  const cycle = cycles.find((c) => c.id === macro) ?? cycles.find((c) => c.id === defId) ?? null;
  const first = summary.name.split(' ')[0] || summary.name;
  const view: ClientView = { bundle, summary, cycles, cycle, first, reload: load };
  const macroParam = cycle && cycle.id !== defId ? cycle.id : null;

  const sub: ReactNode = cycle
    ? <>{cycle.name}{cycle.coachOwned ? '' : ' (their own)'} · {cycle.status === 'past' ? `ended ${fmt.dm(cycle.end)}` : cycle.status === 'upcoming' ? `starts ${fmt.dm(cycle.start)}` : summary.cycle ? `week ${summary.cycle.week} of ${summary.cycle.weeks}` : `${fmt.dm(cycle.start)} – ${fmt.dm(cycle.end)}`}</>
    : summary.cycleText;

  let body: ReactNode;
  if (tab === 'review') body = <ReviewTab v={view} />;
  else if (tab === 'profile') body = <ProfileTab v={view} />;
  else if (tab === 'plan') body = <PlanTab key={id} v={view} macro={macro} intent={intent ?? null} />;
  else body = <EmptyState>{first}’s bookings, recurring and one-off, and their session requests. Sessions arrives with the Diary.</EmptyState>;

  return (
    <CoachShell tab="clients">
      <Page innerRef={ref}>
        <PageHeader
          eyebrow={back}
          title={summary.name}
          sub={<>{sub}{summary.status === 'linked' && <span className="caption"> · {fmt.ago(summary.syncedHoursAgo)}</span>}</>}
          actions={<IconButton icon="swap" label="Switch client or cycle" onClick={() => setPick(true)} />}
        />
        <div className="tabs rise" style={{ ['--i' as string]: 0 }} role="tablist" aria-label="Client views">
          {TABS.map((t) => (
            <a key={t.key} role="tab" aria-selected={t.key === tab} href={`#${clientPath(id, t.key, macroParam)}`}>{t.label}</a>
          ))}
        </div>
        {body}
      </Page>

      <Sheet open={pick} onClose={() => setPick(false)} title="Switch view">
        {cycles.length > 0 && <>
          <span className="label">{first}’s cycles</span>
          {[...cycles].reverse().map((c) => {
            const on = c.id === cycle?.id;
            return (
              <button key={c.id} type="button" className="card" onClick={() => { setPick(false); navigate(clientPath(id, tab, c.id === defId ? null : c.id)); }}
                style={{ width: '100%', textAlign: 'left', marginBottom: 10, cursor: 'pointer', borderColor: on ? 'var(--accent)' : undefined }} aria-pressed={on}>
                <div className="row">
                  <div style={{ minWidth: 0 }}>
                    <div className="display" style={{ fontSize: 17 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{fmt.range(c.start, c.end)} · {goalLabel(c.goalType)}{c.coachOwned ? '' : ' · their own'}</div>
                  </div>
                  <Chip tone={c.status === 'past' ? 'neutral' : c.status === 'upcoming' ? 'acc' : 'good'}>{c.status === 'past' ? 'Past' : c.status === 'upcoming' ? 'Upcoming' : 'Active'}</Chip>
                </div>
              </button>
            );
          })}
        </>}
        {summaries.length > 1 && <>
          <span className="label" style={{ marginTop: 18 }}>Other clients</span>
          <div className="card list">
            {summaries.filter((c) => c.id !== id).map((c) => (
              <button key={c.id} type="button" className="listrow" onClick={() => { setPick(false); navigate(clientPath(c.id, tab)); }}>
                <Avatar initials={c.initials} size={34} />
                <span className="main"><b>{c.name}</b></span>
                {c.status === 'linked' ? <OutcomeChip status={c.outcome.status} /> : <Chip tone="neutral">{LINK_LABEL[c.status]}</Chip>}
              </button>
            ))}
          </div>
        </>}
      </Sheet>
    </CoachShell>
  );
}

export const LINK_LABEL = { linked: 'Linked', invited: 'Invited', unlinked: 'Unlinked', 'not-on-app': 'In person' } as const;

export const goalLabel = (g: string) => (g === 'gain' ? 'Gain weight' : g === 'maintenance' ? 'Maintain weight' : 'Lose weight');
