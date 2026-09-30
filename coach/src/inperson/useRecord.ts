// A client's record for In person: their card's publications folded over their upload (model.ts
// recordState), the client's today, and the in-person sessions logged. Loaded when opened and again on return
// to the app.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCoach } from '@/app/App';
import { useOnResume } from '@/components/ui/hooks';
import type { CoachPublication } from '@/ai/types';
import type { ClientBundle } from '@/data/types';
import { linkStatusOf } from '@/data/summary';
import { localDateIn } from '@/lib/clientState';
import { loggedSessions, recordState } from './model';

/**
 * 🚨 The client's today is their own (their upload's zone), as for every engine call about a client (§139). A
 * client with no upload (not on the app, or not synced yet) has no zone, so the coach's is the only one there is.
 */
export function clientTodayOf(bundle: ClientBundle | null | undefined, nowMs: number): string {
  const snap = bundle && linkStatusOf(bundle) === 'linked' ? bundle.snapshot : null;
  return localDateIn(snap?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone, nowMs);
}

export function useRecord(bundle: ClientBundle | null | undefined) {
  const { repo, profile } = useCoach();
  const cardId = bundle?.card.id ?? null;
  const [pubs, setPubs] = useState<CoachPublication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!cardId) return;
    repo.loadCardPublications(cardId).then((p) => { setPubs(p); setError(null); }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo, cardId]);
  useEffect(load, [load]);
  useOnResume(load);
  const snap = bundle && linkStatusOf(bundle) === 'linked' ? bundle.snapshot : null;
  const today = clientTodayOf(bundle, repo.now());
  const state = useMemo(() => (bundle && pubs
    ? recordState({ state: snap?.state ?? null, publications: pubs, coachId: profile.coachId, since: bundle.lastEndedAt })
    : null), [bundle, pubs, snap, profile.coachId]);
  const logged = useMemo(() => (pubs ? loggedSessions(pubs) : []), [pubs]);
  return { pubs, state, today, logged, error, reload: load };
}
