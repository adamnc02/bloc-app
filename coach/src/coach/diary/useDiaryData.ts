// The Diary's data for a screen: the diary and the clients, loaded together;
// a client's confirmation of the coach's time booked as soon as it's seen
// (autoBook); reloaded when a request changes (Realtime) and when the app
// comes back to the front. The Diary and a client's Sessions tab both use it.
//
// The Diary is the coach's own, so its "today" is the coach's date (the
// clients' dates matter only where the engine judges a client).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCoach } from '@/app/App';
import { useOnResume, useToast } from '@/components/ui/hooks';
import { displayName } from '@/data/summary';
import type { ClientBundle } from '@/data/types';
import { autoBook } from '@/diary/actions';
import type { Diary } from '@/diary/types';
import { initials } from '@/lib/format';
import type { Who } from './BookingBlock';

export function makeWho(bundles: ClientBundle[]): Who {
  const byId = new Map(bundles.map((b) => [b.card.id, displayName(b)]));
  const full = (id: string) => byId.get(id) ?? 'Client';
  const first = (id: string) => full(id).split(' ')[0] || full(id);
  return {
    name: (o, isFull) => {
      if (o.kind === 'group') return o.title || 'Group session';
      const id = o.clientIds[0];
      if (!id) return 'Client';
      const n = isFull ? full(id) : first(id);
      return o.clientIds.length > 1 ? `${n} +${o.clientIds.length - 1}` : n;
    },
    initials: (id) => initials(full(id)),
  };
}

/** The coach's own calendar date and minute of the day, from the repo's "now" (fixtures pin it). */
export function coachClock(nowMs: number): { today: string; nowMin: number } {
  const d = new Date(nowMs);
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { today, nowMin: d.getHours() * 60 + d.getMinutes() };
}

export function useDiaryData() {
  const { repo } = useCoach();
  const [diary, setDiary] = useState<Diary | null>(null);
  const [bundles, setBundles] = useState<ClientBundle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast(3200);
  const show = toast.show;
  const booking = useRef(false);

  const load = useCallback(async () => {
    try {
      const [d, b] = await Promise.all([repo.loadDiary(), repo.loadClients()]);
      setBundles(b);
      setDiary(d);
      if (booking.current) return;
      booking.current = true;
      try {
        const w = makeWho(b);
        const { diary: after, booked } = await autoBook(repo, d, (o) => w.name(o));
        if (booked.length) {
          setDiary(after);
          show(booked.length === 1 ? `${w.name({ kind: 'one_to_one', title: null, clientIds: [booked[0].cardId!] })} confirmed your time: booked` : `${booked.length} confirmed times booked`);
        }
      } finally { booking.current = false; }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repo, show]);

  useEffect(() => { void load(); }, [load]);
  useOnResume(() => { void load(); });
  useEffect(() => repo.watchRequests(() => { void load(); }), [repo, load]);

  const who = useMemo(() => makeWho(bundles ?? []), [bundles]);
  const clock = coachClock(repo.now());

  /** Runs one change; on success shows `ok`, on failure the error, and keeps the diary it returned. */
  const run = useCallback(async (fn: (d: Diary) => Promise<Diary>, ok: string | null) => {
    if (!diary) return false;
    setBusy(true);
    try {
      setDiary(await fn(diary));
      if (ok) show(ok);
      return true;
    } catch (e) {
      show(`Couldn’t save: ${e instanceof Error ? e.message : String(e)}`);
      void load();
      return false;
    } finally {
      setBusy(false);
    }
  }, [diary, show, load]);

  return { repo, diary, bundles, error, busy, who, today: clock.today, nowMin: clock.nowMin, run, toast, reload: load };
}
