// A one-to-one booking's in-person actions, in its sheet (the Diary's and a client's Sessions tab):
//   · Start session, from 15 minutes before it starts until the end of that day; Log it, for one from the last
//     14 days that wasn't logged; or, once logged, the session as sent.
//   · Tag a session: the plan session this booking is for, when it isn't the client's next one (they may ask to
//     do a different session). Tagging makes it the coach's and read-only on their phone at once, quietly;
//     Start session then opens on it. A session the client has started can't be tagged.
// A group booking has its own (group/GroupActions.tsx, §162).
import { useState } from 'react';
import { useCoach } from '@/app/App';
import { navigate, sessionPath } from '@/app/router';
import { Button, RowButton } from '@/components/ui/controls';
import { fmt } from '@/lib/format';
import type { ClientBundle } from '@/data/types';
import { displayName } from '@/data/summary';
import type { Occurrence } from '@/diary/model';
import { assignSession, publishedIdOf } from '@/diary/actions';
import type { AssignedSession, Diary } from '@/diary/types';
import { agendaOf, canStart, cycleForSession, loggedFor, loggedSessions, missedFrom } from './model';
import type { AttendeeRecord } from '@/group/useRecords';
import { useRecord } from './useRecord';
import { SessionPicker } from './SessionPicker';
import { assignedFor } from './InPersonScreen';

export function InPersonActions({ occ, cardId, diary, bundles, today, nowMin, run, record }: {
  occ: Occurrence; cardId: string; diary: Diary; bundles: ClientBundle[]; today: string; nowMin: number;
  run: (fn: (d: Diary) => Promise<Diary>, ok: string | null) => Promise<boolean>;
  /** The client's record, loaded before the sheet opened (ActionsGate, §165); else it's loaded here. */
  record?: AttendeeRecord;
}) {
  const { repo } = useCoach();
  const bundle = bundles.find((b) => b.card.id === cardId) ?? null;
  const own = useRecord(record ? null : bundle);
  const rec = record ? { state: record.state, today: record.today, logged: loggedSessions(record.pubs) } : own;
  const [picking, setPicking] = useState(false);
  if (occ.kind !== 'one_to_one' || !bundle) return null;
  const first = displayName(bundle).split(' ')[0];
  const logged = loggedFor(rec.logged, publishedIdOf(occ), occ.date);
  const tagged = assignedFor(diary, occ, cardId);
  const macro = rec.state ? cycleForSession(rec.state, rec.today, occ.date) : null;
  const units = rec.state && macro ? agendaOf(rec.state, macro, rec.today) : [];
  const label = (s: AssignedSession) => units.flatMap((u) => u.sessions).find((x) => x.week === s.week && x.dayKey === s.dayKey)?.label ?? s.dayKey;
  const startable = !logged && canStart(occ.date, occ.start, today, nowMin);
  const missed = !logged && occ.date < today && occ.date >= missedFrom(today);
  const upcoming = !logged && occ.date >= today;
  const go = () => navigate(sessionPath(occ.key, cardId));
  return (
    <div style={{ marginTop: 16 }}>
      {logged && <RowButton lead="check" title="Logged in person" sub={`${logged.setsDone} of ${logged.sets} sets · sent to ${first}`} onClick={go} />}
      {startable && <Button icon="play" onClick={go}>Start session</Button>}
      {missed && <Button icon="edit" onClick={go}>Log it</Button>}
      {upcoming && macro && (
        <div className="card list" style={{ marginTop: startable ? 12 : 0, padding: '0 16px' }}>
          <RowButton lead="target" title={tagged ? `Tagged: ${label(tagged)}` : 'Tag a session'}
            sub={tagged ? `${first} sees it read-only, “with your coach”. Start session opens on it.` : `Otherwise Start session opens on ${first}’s next unfinished session.`}
            onClick={() => setPicking(true)} />
        </div>
      )}
      {picking && macro && (
        <SessionPicker title="Tag a session" macro={macro} units={units} first={first} current={tagged} tagged={tagged}
          onPick={(s) => void run((d) => assignSession(repo, d, occ, cardId, s), `${label(s)} tagged for ${fmt.ddm(occ.date)}: read-only on ${first}’s phone`).then((ok) => ok && setPicking(false))}
          onClear={() => void run((d) => assignSession(repo, d, occ, cardId, null), `Untagged: ${first} has it back`).then((ok) => ok && setPicking(false))}
          clearLabel="Untag it" onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
