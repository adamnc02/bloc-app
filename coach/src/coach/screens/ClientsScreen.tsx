import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Avatar, Button, Chip, EmptyState, Hero, Icon, IconButton, Notice, Page, PageHeader, Section, Seg, Toast, useEntering, useIsWide, useOnResume, useToast,
} from '@/components/ui';
import { WeightSparkline } from '@/components/charts/Sparkline';
import { CoachShell, AccountButton } from '@/coach/CoachShell';
import { AddClientSheet, InviteSheet, InviteStatusSheet } from '@/coach/components/ClientSheets';
import { navigate } from '@/app/router';
import { useCoach } from '@/app/App';
import { BLOC_INVITE_BASE } from '@/lib/supabase';
import { fmt } from '@/lib/format';
import { summarise, type ClientSummary } from '@/data/summary';
import type { ClientBundle, NewClient, NewInvite } from '@/data/types';
import type { LinkStatus } from '@/domain/types';

// 🔜 "Off track" joins the filters once Review's outcome model exists.
export type ClientFilter = 'all' | 'invited' | 'not-on-app';
const FILTERS: { value: ClientFilter; label: string; test: (c: ClientSummary) => boolean }[] = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'invited', label: 'Invited', test: (c) => c.status === 'invited' },
  // Unlinked clients count as not on the app, as the hero does: the coach can't see their data either way.
  { value: 'not-on-app', label: 'Not on the app', test: (c) => c.status === 'not-on-app' || c.status === 'unlinked' },
];

const STATUS: Record<LinkStatus, { label: string; tone: 'good' | 'acc' | 'neutral' | 'amber' }> = {
  linked: { label: 'Linked', tone: 'good' },
  invited: { label: 'Invited', tone: 'acc' },
  'not-on-app': { label: 'In person', tone: 'neutral' },
  unlinked: { label: 'Unlinked', tone: 'amber' },
};

export const inviteLink = (code: string) => `${BLOC_INVITE_BASE}?invite=${encodeURIComponent(code)}`;

function syncText(c: ClientSummary): string {
  if (c.status !== 'linked') return c.status === 'invited' ? 'Not linked yet' : c.status === 'unlinked' ? 'No longer shared' : 'Not on BLOC';
  if (c.problem) return 'Sync unreadable';
  if (c.syncedHoursAgo == null) return 'Never synced';
  if (c.staleSync) return `Not synced for ${Math.round(c.syncedHoursAgo)}h`;
  return fmt.ago(c.syncedHoursAgo);
}

/**
 * Clients. Each row: the client's
 * name and link status, their cycle and week at THEIR local today, a 5-week
 * weight sparkline, and when they last synced. Table-like on a laptop,
 * stacked on a phone.
 *
 * 🔜 The link status stands where the outcome chip will go, and "last
 *    synced" where the next session will: the outcome comes with Review, the
 *    next session with the Diary.
 */
export function ClientsScreen() {
  const { repo } = useCoach();
  const ref = useEntering<HTMLDivElement>('clients');
  const wide = useIsWide();
  const toast = useToast();
  const [bundles, setBundles] = useState<ClientBundle[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ name: string; inv: NewInvite } | null>(null);
  const [statusFor, setStatusFor] = useState<ClientSummary | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    repo.loadClients().then(setBundles).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [repo]);
  useEffect(load, [load]);
  useOnResume(load); // back to the app: reload, so a change made elsewhere shows here

  const now = repo.now();
  const rows = useMemo(() => (bundles ?? []).map((b) => summarise(b, now)), [bundles, now]);
  const shown = rows.filter((r) => FILTERS.find((f) => f.value === filter)!.test(r));
  const count = (f: ClientFilter) => rows.filter(FILTERS.find((x) => x.value === f)!.test).length;
  const by = (s: LinkStatus) => rows.filter((r) => r.status === s).length;

  const open = (c: ClientSummary) => {
    if (c.status === 'invited') { setSheetError(null); setStatusFor(c); }
    else navigate(`/clients/${encodeURIComponent(c.id)}`);
  };

  const add = async (nc: NewClient) => {
    setBusy(true); setSheetError(null);
    try {
      const card = await repo.addClient(nc);
      setAdding(false);
      if (nc.onApp) {
        try { setInvite({ name: nc.name, inv: await repo.createInvite(card.id) }); }
        catch (e) { toast.show(`${nc.name} added. Couldn’t make the invite: ${e instanceof Error ? e.message : e}`); }
      } else {
        toast.show(`${nc.name} added · in person only`);
      }
      load();
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const newCode = async (c: ClientSummary) => {
    setBusy(true); setSheetError(null);
    try {
      const inv = await repo.createInvite(c.id);
      setStatusFor(null);
      setInvite({ name: c.name, inv });
      load();
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const linked = by('linked'), invited = by('invited'), inPerson = by('not-on-app') + by('unlinked');
  const statusBundle = statusFor && bundles?.find((b) => b.card.id === statusFor.id);

  return (
    <CoachShell tab="clients">
      <Page innerRef={ref}>
        <PageHeader
          title="Clients"
          actions={<><IconButton icon="userPlus" label="Add client" onClick={() => { setSheetError(null); setAdding(true); }} /><AccountButton /></>}
        />

        <Hero>
          <div className="row top-align">
            <div>
              <div className="eyebrow acc">On BLOC</div>
              <div className="big digits" style={{ marginTop: 8 }}>{linked}<small>of {rows.length} linked</small></div>
            </div>
            <span className="caption" style={{ textAlign: 'right' }}>{rows.length} {rows.length === 1 ? 'client' : 'clients'}</span>
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 18, height: 10 }} role="img" aria-label={`${linked} linked, ${invited} invited, ${inPerson} not on the app`}>
            <Seg_ grow={linked} bg="var(--green)" i={0} />
            <Seg_ grow={invited} bg="var(--accent)" i={1} />
            <Seg_ grow={inPerson} bg="var(--surface3)" i={2} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 12, fontSize: 12.5 }} className="muted">
            <span><Icon name="check" size={13} /> <b className="t-good">{linked}</b> linked</span>
            <span><Icon name="link" size={13} /> <b style={{ color: 'var(--accent2)' }}>{invited}</b> invited</span>
            <span><Icon name="account" size={13} /> <b style={{ color: 'var(--text)' }}>{inPerson}</b> not on the app</span>
          </div>
        </Hero>

        <Section i={2} title="Your clients" sub="Each client at their own local date. Tap a client to open them.">
          <div style={{ overflowX: 'auto', margin: '0 calc(-1 * var(--gutter))', padding: '0 var(--gutter) 4px', scrollbarWidth: 'none' }}>
            <Seg
              className="auto" label="Filter clients" value={filter} onChange={setFilter}
              options={FILTERS.map((f) => ({ value: f.value, label: <>{f.label} <span className="num" style={{ opacity: 0.7, marginLeft: 4 }}>{count(f.value)}</span></> }))}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            {loadError ? (
              <Notice icon="warning" tone="bad" title="Couldn’t load your clients" trailing={<Button size="compact" variant="ghost" onClick={load}>Retry</Button>}>{loadError}</Notice>
            ) : !bundles ? (
              <div className="card muted" aria-busy="true">Loading your clients…</div>
            ) : rows.length === 0 ? (
              <EmptyState action={<Button size="card" icon="userPlus" onClick={() => setAdding(true)}>Add your first client</Button>}>No clients yet. Add one, then invite them to link from BLOC.</EmptyState>
            ) : shown.length === 0 ? (
              <EmptyState>No clients match this filter.</EmptyState>
            ) : wide ? (
              <ClientTable rows={shown} onOpen={open} />
            ) : (
              <div className="card list">{shown.map((r) => <ClientRowStacked key={r.id} r={r} onOpen={open} />)}</div>
            )}
          </div>
        </Section>
      </Page>

      {adding && <AddClientSheet open onClose={() => setAdding(false)} onAdd={add} busy={busy} error={sheetError} />}
      {invite && (
        <InviteSheet
          open name={invite.name} code={invite.inv.code} link={inviteLink(invite.inv.code)} expiresAt={invite.inv.expiresAt}
          onClose={() => setInvite(null)} onToast={toast.show}
        />
      )}
      {statusFor && statusBundle?.invite && (
        <InviteStatusSheet
          open name={statusFor.name} expiresAt={statusBundle.invite.expiresAt} now={now}
          onClose={() => setStatusFor(null)} onNewCode={() => newCode(statusFor)} busy={busy} error={sheetError}
        />
      )}
      <Toast msg={toast.msg} />
    </CoachShell>
  );
}

/** One segment of the hero's bar; grows from the left like a Bar. */
function Seg_({ grow, bg, i }: { grow: number; bg: string; i: number }) {
  if (!grow) return null;
  return <div className="bar" style={{ flex: grow, height: 10, margin: 0, borderRadius: 5, background: 'transparent' }}><i style={{ background: bg, ['--i' as string]: i } as CSSProperties} /></div>;
}

const statusChip = (c: ClientSummary) => <Chip tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Chip>;
const clip: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// 375pt (BLOC TECHNICAL §116): the cycle line gets the row's full width (at
// 375pt "Weight Loss 2026 · week 8 of 14" lost its week beside an 84px
// sparkline), so the sparkline sits on the shorter "last synced" line instead.
function ClientRowStacked({ r, onOpen }: { r: ClientSummary; onOpen: (c: ClientSummary) => void }) {
  return (
    <button type="button" className="listrow" onClick={() => onOpen(r)} style={{ alignItems: 'flex-start' }} aria-label={`${r.name}, ${STATUS[r.status].label}, ${r.cycleText}, ${syncText(r)}`}>
      <Avatar initials={r.initials} />
      <span className="main" style={{ minWidth: 0 }}>
        <span className="row" style={{ alignItems: 'center', gap: 8 }}>
          <b style={clip}>{r.name}</b>
          {statusChip(r)}
        </span>
        <span className="muted" style={{ display: 'block', marginTop: 5, fontSize: 12.5, ...clip }}>{r.cycleText}</span>
        <span className="row" style={{ marginTop: 3, alignItems: 'center', gap: 10 }}>
          <span className={r.staleSync || r.problem ? 't-bad' : 'caption'} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12, minWidth: 0, ...clip }}>
            <Icon name={r.staleSync || r.problem ? 'warning' : 'sync'} size={13} />{syncText(r)}
          </span>
          {r.weights.length > 1 && <span style={{ flexShrink: 0 }}><WeightSparkline points={r.weights} target={r.targetLbs} width={84} height={24} /></span>}
        </span>
      </span>
    </button>
  );
}

const COLS = 'minmax(0, 2.1fr) minmax(0, 1fr) 112px minmax(0, 1.8fr) minmax(0, 1.3fr) 20px';

function ClientTable({ rows, onOpen }: { rows: ClientSummary[]; onOpen: (c: ClientSummary) => void }) {
  return (
    <div className="card" style={{ padding: '4px 18px' }}>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, padding: '12px 0', borderBottom: '1px solid var(--divider)' }} className="caption">
        {['Client', 'Status', 'Weight trend', 'Cycle', 'Synced', ''].map((h, k) => <span key={k} style={{ fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', fontSize: 11 }}>{h}</span>)}
      </div>
      {rows.map((r) => (
        <button
          key={r.id} type="button" aria-label={`${r.name}, ${STATUS[r.status].label}, ${r.cycleText}, ${syncText(r)}`} onClick={() => onOpen(r)} className="listrow"
          style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '12px 0' }}
        >
          <span style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
            <Avatar initials={r.initials} size={36} />
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', ...clip }}>{r.name}</b>
              <span className="caption" style={{ display: 'block', ...clip }}>{r.tz && r.clientToday ? `${fmt.ddm(r.clientToday)} for them` : r.status === 'not-on-app' ? 'In person' : ' '}</span>
            </span>
          </span>
          <span>{statusChip(r)}</span>
          <span>{r.weights.length > 1 ? <WeightSparkline points={r.weights} target={r.targetLbs} width={104} height={30} /> : <span className="caption">No weigh-ins</span>}</span>
          <span className="muted" style={{ fontSize: 13, ...clip }} title={r.cycleText}>{r.cycleText}</span>
          <span className={r.staleSync || r.problem ? 't-bad' : 'muted'} style={{ fontSize: 13, ...clip }}>{syncText(r)}</span>
          <span style={{ color: 'var(--text3)' }}><Icon name="chevR" size={18} /></span>
        </button>
      ))}
    </div>
  );
}
