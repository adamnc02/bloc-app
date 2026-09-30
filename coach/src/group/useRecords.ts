// Every attendee's record for a group session: each card's publications folded over their upload (In person's
// recordState), their today, and their group sessions logged. Loaded when opened and again on return to the app.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BlocState } from '@engine';
import { useCoach } from '@/app/App';
import { useOnResume } from '@/components/ui/hooks';
import type { CoachPublication } from '@/ai/types';
import type { ClientBundle } from '@/data/types';
import { linkStatusOf } from '@/data/summary';
import { recordState } from '@/inperson/model';
import { clientTodayOf } from '@/inperson/useRecord';
import { loggedGroups, type LoggedGroup } from './model';

export interface AttendeeRecord { pubs: CoachPublication[]; state: BlocState; today: string; groups: LoggedGroup[] }

export function useRecords(bundles: ClientBundle[]) {
  const { repo, profile } = useCoach();
  const ids = bundles.map((b) => b.card.id).join('|');
  const [pubs, setPubs] = useState<Record<string, CoachPublication[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    const cards = ids ? ids.split('|') : [];
    Promise.all(cards.map((c) => repo.loadCardPublications(c).then((p) => [c, p] as const)))
      .then((xs) => { setPubs(Object.fromEntries(xs)); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo, ids]);
  useEffect(load, [load]);
  useOnResume(load);
  const records = useMemo(() => {
    if (!pubs) return null;
    const out: Record<string, AttendeeRecord> = {};
    for (const b of bundles) {
      const p = pubs[b.card.id] ?? [];
      const snap = linkStatusOf(b) === 'linked' ? b.snapshot : null;
      out[b.card.id] = {
        pubs: p, state: recordState({ state: snap?.state ?? null, publications: p, coachId: profile.coachId, since: b.lastEndedAt }),
        today: clientTodayOf(b, repo.now()), groups: loggedGroups(p),
      };
    }
    return out;
  }, [pubs, bundles, profile.coachId, repo]);
  return { records, error, reload: load };
}
