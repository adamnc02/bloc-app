// A group booking's actions, in its sheet (the Diary's and a client's Sessions tab; §162):
//   · Start session, from 15 minutes before it starts until the end of that day; Log it, for one from the last
//     14 days that wasn't logged; or, once logged, the session as sent.
//   · The workout: the one planned for it (0033), and Plan a workout / Change workout from the Library. On a weekly
//     group it's asked "Just this one" (that week) or "All future" (the series; a week with its own keeps it).
import { useEffect, useMemo, useState } from 'react';
import { useCoach } from '@/app/App';
import { groupSessionPath, navigate } from '@/app/router';
import { Button, RowButton } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/Sheet';
import type { ClientBundle } from '@/data/types';
import type { Occurrence } from '@/diary/model';
import { planWorkout, publishedIdOf, type Scope } from '@/diary/actions';
import type { Diary, PlannedWorkout } from '@/diary/types';
import { canStart, missedFrom } from '@/inperson/model';
import { TemplatePicker } from '@/coach/client/plan/PlanSheets';
import type { Template } from '@/plan/templates';
import { fmt } from '@/lib/format';
import { plannedFromTemplate, workoutExercises } from './model';
import { useRecords } from './useRecords';

export function GroupActions({ occ, bundles, today, nowMin, run }: {
  occ: Occurrence; diary: Diary; bundles: ClientBundle[]; today: string; nowMin: number;
  run: (fn: (d: Diary) => Promise<Diary>, ok: string | null) => Promise<boolean>;
}) {
  const { repo } = useCoach();
  const ids = occ.clientIds.join('|');
  const people = useMemo(() => (ids ? ids.split('|').map((c) => bundles.find((b) => b.card.id === c)).filter((b): b is ClientBundle => !!b) : []), [bundles, ids]);
  const { records } = useRecords(people);
  const [picking, setPicking] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [scopeFor, setScopeFor] = useState<PlannedWorkout | null>(null);
  useEffect(() => { if (picking && !templates) repo.loadTemplates().then(setTemplates).catch(() => setTemplates([])); }, [picking, templates, repo]);
  if (occ.kind !== 'group') return null;

  const bookingId = publishedIdOf(occ);
  const sentTo = records ? people.filter((b) => records[b.card.id]?.groups.some((g) => g.bookingId === bookingId && g.date === occ.date)).length : 0;
  const logged = sentTo > 0;
  const startable = !logged && people.length > 0 && canStart(occ.date, occ.start, today, nowMin);
  const missed = !logged && occ.date < today && occ.date >= missedFrom(today);
  const upcoming = !logged && occ.date >= today;
  const go = () => navigate(groupSessionPath(occ.key));
  const save = (w: PlannedWorkout, scope: Scope) => void run((d) => planWorkout(repo, d, occ, w, scope),
    `${w.name} planned ${scope === 'all' ? `every ${fmt.dayLong(occ.date)}` : `for ${fmt.ddm(occ.date)}`}`).then((ok) => ok && setScopeFor(null));
  const pick = (t: Template) => {
    setPicking(false);
    const w = plannedFromTemplate(t);
    if (occ.recurring) setScopeFor(w); else save(w, 'one');
  };
  const w = occ.workout;
  return (
    <div style={{ marginTop: 16 }}>
      {logged && <RowButton lead="check" title="Logged as a group session" sub={`Sent to ${sentTo} ${sentTo === 1 ? 'person' : 'people'}`} onClick={go} />}
      {startable && <Button icon="play" onClick={go}>Start session</Button>}
      {missed && <Button icon="edit" onClick={go}>Log it</Button>}
      {(upcoming || startable) && (
        <div className="card list" style={{ marginTop: startable ? 12 : 0, padding: '0 16px' }}>
          <RowButton lead="library" title={w ? `Workout: ${w.name}` : 'Plan a workout'}
            sub={w ? `${workoutExercises(w).length} exercises · ${workoutExercises(w).map((e) => e.name).slice(0, 3).join(', ')}` : 'Choose one from your Library. Start session runs it.'}
            onClick={() => setPicking(true)} />
        </div>
      )}
      {picking && <TemplatePicker open kind="workout" title={w ? 'Change workout' : 'Plan a workout'} templates={templates ?? []} onClose={() => setPicking(false)} onPick={pick} />}
      {scopeFor && (
        <Sheet open title={`Plan ${scopeFor.name}`} onClose={() => setScopeFor(null)}>
          <p className="muted">{occ.title ?? 'This group'} is weekly. Plan it for this week, or for every week from now on? A week with its own workout keeps it.</p>
          <div className="stack" style={{ marginTop: 18 }}>
            <Button onClick={() => save(scopeFor, 'one')}>Just {fmt.ddm(occ.date)}</Button>
            <Button variant="ghost" onClick={() => save(scopeFor, 'all')}>Every {fmt.dayLong(occ.date)}</Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
