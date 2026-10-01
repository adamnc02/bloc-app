// Renders a session's sheet only once its attendees' records have loaded (§165). The sheet's actions (Start session,
// Logged, Tag a session, the workout) depend on what's logged; drawn before the records arrived, a logged session
// flashed Start session and the rows that came later pushed the rising sheet half way up the screen.
import { useMemo, type ReactNode } from 'react';
import type { ClientBundle } from '@/data/types';
import type { Occurrence } from '@/diary/model';
import { useRecords, type AttendeeRecord } from './useRecords';

export function ActionsGate({ occ, bundles, children }: { occ: Occurrence; bundles: ClientBundle[]; children: (records: Record<string, AttendeeRecord>) => ReactNode }) {
  const ids = occ.clientIds.join('|');
  const people = useMemo(() => (ids ? ids.split('|').map((c) => bundles.find((b) => b.card.id === c)).filter((b): b is ClientBundle => !!b) : []), [bundles, ids]);
  const { records } = useRecords(people);
  return records ? <>{children(records)}</> : null;
}
