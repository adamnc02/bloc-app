import { useEffect, useState, type ReactNode } from 'react';
import { Avatar, Chip, EmptyState, Hero, Icon, Notice, Page, PageHeader, Section, numberSections, useEntering } from '@/components/ui';
import { WeightSparkline } from '@/components/charts/Sparkline';
import { CoachShell } from '@/coach/CoachShell';
import { useCoach } from '@/app/App';
import { fmt } from '@/lib/format';
import { summarise, type ClientSummary } from '@/data/summary';
import type { ClientBundle } from '@/data/types';

/**
 * One client, as far as Coach v0.1 goes: who they are, their link, and the
 * cycle and week the engine finds at THEIR local today. Review, Plan,
 * Sessions and Profile (proposal §5.3) replace this page from 5b.
 */
export function ClientScreen({ id }: { id: string }) {
  const { repo } = useCoach();
  const ref = useEntering<HTMLDivElement>(`client-${id}`);
  const [bundle, setBundle] = useState<ClientBundle | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    repo.loadClients().then((all) => setBundle(all.find((b) => b.card.id === id) ?? null)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo, id]);

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

  const c: ClientSummary = summarise(bundle, repo.now());
  const n = numberSections(['link', c.status === 'linked' && 'training']);
  const fact = (label: string, value: ReactNode) => (
    <div className="ex"><span>{label}</span><span style={{ textAlign: 'right' }}>{value}</span></div>
  );
  return (
    <CoachShell tab="clients">
      <Page innerRef={ref}>
        <PageHeader eyebrow={back} title={c.name} />
        <Hero style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Avatar initials={c.initials} size={56} solid />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="display" style={{ fontSize: 18 }}>{c.cycleText}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              {c.clientToday ? `It’s ${fmt.ddm(c.clientToday)} for them (${c.tz})` : bundle.card.email || bundle.card.phone || ' '}
            </div>
          </div>
          {c.weights.length > 1 && <WeightSparkline points={c.weights} target={c.targetLbs} width={104} height={34} />}
        </Hero>

        <Section n={n.link} i={2} title="Link" sub="What they share with you, and how recently.">
          <div className="card">
            {fact('Status', <Chip tone={c.status === 'linked' ? 'good' : c.status === 'invited' ? 'acc' : 'neutral'}>{{ linked: 'Linked', invited: 'Invited', unlinked: 'Unlinked', 'not-on-app': 'Not on the app' }[c.status]}</Chip>)}
            {bundle.link?.linkedAt && fact('Linked since', fmt.ddm(bundle.link.linkedAt.slice(0, 10)))}
            {c.status === 'linked' && fact('Progress photos', c.photoConsent ? 'Shared with you' : 'Not shared')}
            {c.status === 'linked' && fact('Last synced', c.syncedHoursAgo == null ? 'Never' : fmt.ago(c.syncedHoursAgo).replace('Last synced ', ''))}
            {bundle.snapshot && fact('Their BLOC', `${bundle.snapshot.appVersion ?? 'unknown'} · upload ${bundle.snapshot.rev}`)}
          </div>
          {c.problem && <Notice icon="warning" tone="bad" title="Their latest sync couldn’t be read" style={{ marginTop: 12 }}>{c.problem}</Notice>}
          {c.staleSync && <Notice icon="warning" tone="amber" title={`Not synced for ${Math.round(c.syncedHoursAgo!)}h`} style={{ marginTop: 12 }}>Often the first sign of drop-off. Their BLOC uploads whenever it’s opened.</Notice>}
        </Section>

        {c.status === 'linked' && (
          <Section n={n.training} i={3} title="Their cycle" sub="Worked out by BLOC’s own engine, at their local date.">
            {c.cycle ? (
              <div className="card">
                {fact('Cycle', c.cycle.coachOwned ? c.cycle.name : `${c.cycle.name} (their own)`)}
                {fact('Week', `${c.cycle.week} of ${c.cycle.weeks}`)}
                {fact('Weigh-ins, last 5 weeks', String(c.weights.length))}
              </div>
            ) : <EmptyState>{c.cycleText}.</EmptyState>}
            <p className="caption" style={{ marginTop: 12 }}>Review, Plan, Sessions and Profile arrive in the next versions of Coach.</p>
          </Section>
        )}
      </Page>
    </CoachShell>
  );
}
