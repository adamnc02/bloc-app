// ═══════════════════════════════════════════════════════════════════════
// Plan's state (TECHNICAL §144): the client's cycles as published (the
// fold), the coach's drafts, the one cycle on screen, and publishing it.
//
// Every edit is a draft (`coach_plan_drafts`, one row per card and cycle),
// saved a moment after the coach stops, so it survives a reload or another
// device; an edit that brings the cycle back to what's published removes
// the draft. Nothing reaches the client until Publish (proposal §6.2).
//
// 🚨 The client's today (their `tz`) decides which cycle is running and
//    whether a replace can be offered; the coach's own date never does.
// ═══════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planReplaceOffer, type Macrocycle, type ReplaceOffer, type ReplaceRefusal } from '@engine';
import { useCoach } from '@/app/App';
import { useOnResume } from '@/components/ui';
import { localDateIn } from '@/lib/clientState';
import { foldPlan, type CycleEntry } from '@/plan/fold';
import { diffPlan, payloadsOf, type PlanDiff } from '@/plan/diff';
import { endOf, makeIds, type IdGen, type PlanDoc } from '@/plan/doc';
import { buildLibrary, type LibraryEntry } from '@/plan/library';
import type { PlanData, PlanDraft } from '@/data/types';
import type { ClientView } from '@/coach/screens/ClientScreen';

export interface PlanCycle {
  id: string;
  name: string;
  start: string;
  end: string;
  coachOwned: boolean;
  /** Only in a draft: not published yet. */
  isNew: boolean;
  status: 'past' | 'active' | 'upcoming';
  entry: CycleEntry | null;
  draft: PlanDraft | null;
}

const SAVE_AFTER_MS = 700;

export function usePlan(v: ClientView, wanted: string | null) {
  const { repo, profile } = useCoach();
  const [data, setData] = useState<PlanData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardId = v.bundle.card.id;
  const load = useCallback(() => {
    repo.loadPlan(cardId).then((d) => { setData(d); setError(null); }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo, cardId]);
  useEffect(load, [load]);
  useOnResume(load);

  const snap = v.summary.status === 'linked' ? v.bundle.snapshot : null;
  const today = v.summary.clientToday ?? localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone, repo.now());
  const ids = useMemo<IdGen>(() => makeIds(() => Date.now()), []);

  const entries = useMemo(() => (data
    ? foldPlan({ state: snap?.state ?? null, publications: data.publications, coachId: profile.coachId, since: v.bundle.lastEndedAt })
    : []), [data, snap, profile.coachId, v.bundle.lastEndedAt]);

  const cycles = useMemo<PlanCycle[]>(() => {
    if (!data) return [];
    const byMacro = new Map(data.drafts.map((d) => [d.macroId, d]));
    const out: PlanCycle[] = entries.map((e) => mk(e.doc, e.coachOwned, false, e, byMacro.get(e.id) ?? null, today));
    for (const d of data.drafts) if (!entries.some((e) => e.id === d.macroId) && d.body?.doc) out.push(mk(d.body.doc, true, true, null, d, today));
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }, [data, entries, today]);

  const [pick, setPick] = useState<string | null>(wanted);
  useEffect(() => { if (wanted) setPick(wanted); }, [wanted]);
  const selected = cycles.find((c) => c.id === pick) ?? defaultCycle(cycles);

  // The working copy: the draft if there is one, else the published cycle.
  // It reloads when the chosen cycle changes, or after publish, discard or a
  // new cycle (`reset`), never after its own background save.
  const [doc, setDoc] = useState<PlanDoc | null>(null);
  const [reset, setReset] = useState(0);
  const selId = selected?.id ?? null;
  const selRef = useRef(selected);
  selRef.current = selected;
  useEffect(() => {
    const s = selRef.current;
    setDoc(s ? structuredClone(s.draft?.body.doc ?? s.entry!.doc) : null);
  }, [selId, reset]);

  const base = selected?.entry?.doc ?? null;
  const diff = useMemo<PlanDiff | null>(() => (doc && selected?.coachOwned ? diffPlan(base, doc) : null), [doc, base, selected]);

  // Save the draft a moment after the last edit; an edit back to what's published removes it.
  const pending = useRef<number | undefined>();
  const draftId = useRef<string | null>(null);
  useEffect(() => { draftId.current = selected?.draft?.id ?? null; }, [selId]); // eslint-disable-line react-hooks/exhaustive-deps
  const persist = useCallback((next: PlanDoc) => {
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(async () => {
      pending.current = undefined;
      try {
        const d = diffPlan(base, next);
        if (d.count === 0 && base) {
          if (draftId.current) { await repo.deletePlanDraft(draftId.current); draftId.current = null; }
        } else {
          const saved = await repo.savePlanDraft(cardId, next.macro.id, { v: 1, doc: next, base: base ? JSON.stringify(base) : null });
          draftId.current = saved.id;
        }
        const fresh = await repo.loadPlan(cardId);
        setData(fresh);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, SAVE_AFTER_MS);
  }, [base, repo, cardId]);

  const edit = useCallback((fn: (d: PlanDoc) => PlanDoc) => {
    setDoc((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      if (next !== cur) persist(next);
      return next;
    });
  }, [persist]);

  /** A whole new cycle (New cycle, a template): saved as a draft at once, and shown. */
  const startNew = useCallback(async (d: PlanDoc) => {
    await repo.savePlanDraft(cardId, d.macro.id, { v: 1, doc: d, base: null });
    setData(await repo.loadPlan(cardId));
    setPick(d.macro.id);
    setReset((n) => n + 1);
  }, [repo, cardId]);

  const discard = useCallback(async () => {
    window.clearTimeout(pending.current);
    pending.current = undefined;
    const id = selected?.draft?.id ?? draftId.current;
    if (id) await repo.deletePlanDraft(id);
    draftId.current = null;
    if (selected?.isNew) setPick(null);
    setData(await repo.loadPlan(cardId));
    setReset((n) => n + 1);
  }, [repo, cardId, selected]);

  const publish = useCallback(async () => {
    if (!doc || !diff) return;
    window.clearTimeout(pending.current);
    pending.current = undefined;
    for (const p of payloadsOf(diff)) await repo.publish(cardId, p.type, p.payload, null);
    const id = selected?.draft?.id ?? draftId.current;
    if (id) await repo.deletePlanDraft(id);
    draftId.current = null;
    setData(await repo.loadPlan(cardId));
    setReset((n) => n + 1);
  }, [doc, diff, repo, cardId, selected]);

  /** Every other cycle the client has (theirs and the coach's), for the overlap rule. */
  const others = useMemo(() => cycles.filter((c) => c.id !== selected?.id && !c.isNew)
    .map((c) => ({ ...(c.entry!.doc.macro as unknown as Macrocycle), publishedBy: c.coachOwned ? profile.coachId : undefined })), [cycles, selected, profile.coachId]);
  const otherGoals = useMemo(() => cycles.filter((c) => c.id !== selected?.id && c.entry).flatMap((c) => c.entry!.doc.goals), [cycles, selected]);

  /** Whether the draft's dates overlap another cycle, and if so whether it can be offered as a replace (BLOC v8.45, §143). */
  const overlap = useMemo<ReplaceOffer | ReplaceRefusal | null>(() => (doc
    ? planReplaceOffer(doc.macro as unknown as Macrocycle, others, otherGoals, { today }) : null), [doc, others, otherGoals, today]);

  const library = useMemo<LibraryEntry[]>(() => buildLibrary((snap?.state as { customLibrary?: unknown } | undefined)?.customLibrary,
    doc ? Object.values(doc.exercises).flat().filter((e) => e.bodyPart).map((e) => ({ name: e.name, bodyPart: e.bodyPart!, category: e.category })) : []), [snap, doc]);

  return {
    loading: !data && !error, error, reload: load, today, cycles, selected, doc, base, diff, overlap, library, ids,
    trainLogs: (snap?.state as { trainLogs?: Record<string, { done?: unknown }> } | undefined)?.trainLogs ?? null,
    pick: setPick, edit, startNew, discard, publish, history: (snap?.state as { exerciseHistory?: Record<string, Record<string, { weight?: unknown }>> } | undefined)?.exerciseHistory ?? {},
  };
}
export type PlanState = ReturnType<typeof usePlan>;

function mk(d: PlanDoc, coachOwned: boolean, isNew: boolean, entry: CycleEntry | null, draft: PlanDraft | null, today: string): PlanCycle {
  const end = endOf(d.macro);
  return {
    id: d.macro.id, name: (draft?.body.doc ?? d).macro.name, start: d.macro.start, end, coachOwned, isNew, entry, draft,
    status: end < today ? 'past' : d.macro.start > today ? 'upcoming' : 'active',
  };
}

/** The cycle Plan opens on: the running one, else the next, else the latest. */
function defaultCycle(cycles: PlanCycle[]): PlanCycle | null {
  return cycles.find((c) => c.status === 'active' && c.coachOwned)
    ?? cycles.find((c) => c.status === 'upcoming' && c.coachOwned)
    ?? cycles.find((c) => c.status === 'active')
    ?? cycles.find((c) => c.status === 'upcoming')
    ?? cycles[cycles.length - 1] ?? null;
}
