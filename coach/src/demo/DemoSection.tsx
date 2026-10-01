// ═══════════════════════════════════════════════════════════════════════
// Settings → Demo data (TECHNICAL §164): the demo clients on this coach, set up,
// rebuilt to this week, or removed. Shown ONLY when this coach's sign-in has
// app_metadata.demo_admin, which only the service role can set (DemoGate
// checks, then loads this chunk); the bloc-demo Edge Function checks it again
// itself, so hiding the section isn't the lock.
//
// A Rebuild is two calls: the coach's side first (its publications come back
// with their `seq`s), then each client's state with those plans stamped as
// applied (stampLedger), one client a call.
// ═══════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stampLedger } from '@engine/demo';
import { Button, Chip, Notice, RowButton, Section, Sheet } from '@/components/ui';
import type { ClientBundle } from '@/data/types';
import { displayName } from '@/data/summary';
import { buildDemoRows } from './build';
import { DEMO_CARDS, type DemoCardKey } from './cards';

interface Registry { cards: Partial<Record<DemoCardKey, string>>; users: Partial<Record<DemoCardKey, string>> }
interface Status { registry: Registry; coachId: string; passwordSet: boolean }

async function call<T>(sb: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.functions.invoke('bloc-demo', { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* keep the generic one */ }
    throw new Error(msg);
  }
  return data as T;
}

/** The Rebuild: the coach's side, then each client's state. Returns what to say. */
export async function rebuildDemo(sb: SupabaseClient, st: Status, now = Date.now()): Promise<string> {
  const rows = buildDemoRows({ coachId: st.coachId, cards: st.registry.cards as Record<DemoCardKey, string>, users: st.registry.users }, now);
  const { states, ...coachSide } = rows;
  const res = await call<{ publications: { id: string; seq: number; type: string; card: DemoCardKey; created_at: string }[] }>(sb, { action: 'rebuild', rows: coachSide });
  const payloadOf = new Map(rows.publications.map((p) => [p.id, p.payload]));
  for (const s of states) {
    const mine = res.publications.filter((p) => p.card === s.client)
      .map((p) => ({ id: p.id, seq: p.seq, type: p.type, coachId: st.coachId, createdAt: p.created_at, payload: payloadOf.get(p.id) }));
    await call(sb, { action: 'states', states: [{ client: s.client, tz: s.tz, uploadedAt: s.uploadedAt, state: stampLedger(s.state, mine) }] });
  }
  return `Rebuilt ${DEMO_CARDS.length} clients to this week. In BLOC as Casey: Settings → My data → Restore → today.`;
}

/** Rendered by DemoGate once the demo_admin flag is seen. */
export function DemoSection({ sb, i, loadClients }: { sb: SupabaseClient; i: number; loadClients: () => Promise<ClientBundle[]> }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [sheet, setSheet] = useState<'casey' | 'remove' | null>(null);
  const [linked, setLinked] = useState<ClientBundle[]>([]);

  const refresh = useCallback(async () => { setStatus(await call<Status>(sb, { action: 'status' })); }, [sb]);
  useEffect(() => { refresh().catch((e) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true })); }, [refresh]);

  const setUp = Object.keys(status?.registry.cards ?? {}).length > 0;
  const act = async (label: string, fn: () => Promise<string>) => {
    setBusy(label); setMsg(null);
    try { setMsg({ text: await fn(), bad: false }); await refresh(); }
    catch (e) { setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }); }
    finally { setBusy(null); }
  };
  const pickCasey = async () => {
    const all = await loadClients();
    const demo = new Set(Object.values(status?.registry.cards ?? {}));
    setLinked(all.filter((b) => b.link?.status === 'active' && !demo.has(b.card.id)));
    setSheet('casey');
  };
  const runSetup = (caseyCardId: string) => { setSheet(null); void act('setup', async () => {
    await call(sb, { action: 'setup', cards: DEMO_CARDS, casey_card_id: caseyCardId });
    const st = await call<Status>(sb, { action: 'status' });
    return rebuildDemo(sb, st);
  }); };

  return (
    <Section i={i} title="Demo data" sub="Fictional clients on this coach, for showing BLOC Coach. Only this account sees this."
      slot={setUp ? <Chip tone="good" icon="check">Set up</Chip> : <Chip tone="neutral">Not set up</Chip>}>
      <div className="card list">
        {!setUp && <RowButton lead="userPlus" title="Set up" sub={status?.passwordSet === false ? 'Add the DEMO_PASSWORD function secret first' : 'Adds the demo clients and links Casey'} disabled={!!busy || status?.passwordSet === false} onClick={() => void pickCasey()} />}
        {setUp && <RowButton lead="sync" title={busy === 'rebuild' ? 'Rebuilding…' : 'Rebuild'} sub="Every demo client back to their story, dated this week" disabled={!!busy} onClick={() => void act('rebuild', async () => rebuildDemo(sb, (await call<Status>(sb, { action: 'status' }))))} />}
        {setUp && <RowButton lead="trash" title="Remove" sub="Deletes the demo clients. Casey’s account stays" disabled={!!busy} onClick={() => setSheet('remove')} />}
      </div>
      {busy === 'setup' && <p className="muted" role="status" style={{ marginTop: 10 }}>Setting up: this takes a minute.</p>}
      {msg && <p className={msg.bad ? 't-bad' : 'muted'} role="status" style={{ marginTop: 10 }}>{msg.text}</p>}

      <Sheet open={sheet === 'casey'} onClose={() => setSheet(null)} title="Which client is Casey?">
        <p className="body-copy">Casey is the test client you sign in to BLOC as. Their data is replaced by the demo’s on every Rebuild.</p>
        <div className="card list" style={{ marginTop: 12 }}>
          {linked.map((b) => <RowButton key={b.card.id} lead="account" title={displayName(b)} onClick={() => runSetup(b.card.id)} />)}
          {!linked.length && <p className="muted" style={{ padding: 16 }}>No linked clients. Link the test client first.</p>}
        </div>
      </Sheet>
      <Sheet open={sheet === 'remove'} onClose={() => setSheet(null)} title="Remove the demo?">
        <Notice icon="warning" tone="bad" title="This deletes the demo clients">
          The six demo sign-ins, their cards and everything the demo wrote. Casey’s account and card stay. Set up brings it all back.
        </Notice>
        <div className="btnrow" style={{ marginTop: 16 }}>
          <Button variant="ghost" size="card" onClick={() => setSheet(null)}>Cancel</Button>
          <Button size="card" icon="trash" onClick={() => { setSheet(null); void act('remove', async () => {
            const r = await call<{ removed: { signIns: number; cards: number } }>(sb, { action: 'remove' });
            return `Removed ${r.removed.signIns} sign-ins and ${r.removed.cards} cards.`;
          }); }}>Remove</Button>
        </div>
      </Sheet>
    </Section>
  );
}
