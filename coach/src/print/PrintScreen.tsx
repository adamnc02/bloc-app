// Print or share a client's plan (§162): one mesocycle of their coach's cycle, for a client not on the app who
// trains on their own between sessions. `#/print/{card id}`. On screen: a preview and Print; printed: the sheet
// alone (styles/print.css). On an iPhone, Print's preview shares to Mail or Files as a PDF: that is how it's emailed.
import { useMemo } from 'react';
import type { Loose } from '@engine';
import { useCoach } from '@/app/App';
import { clientPath, navigate } from '@/app/router';
import { Button, EmptyState, Icon } from '@/components/ui';
import { displayName } from '@/data/summary';
import { fmt } from '@/lib/format';
import { useRecord } from '@/inperson/useRecord';
import { useClients } from './useClients';
import { printPlan, targetText } from './model';
import '@/styles/print.css';

const RPE = Array.from({ length: 10 }, (_, i) => i + 1);

export function PrintScreen({ cardId }: { cardId: string }) {
  const { profile } = useCoach();
  const { bundles, error } = useClients();
  const bundle = bundles?.find((b) => b.card.id === cardId) ?? null;
  const rec = useRecord(bundle);
  const plan = useMemo(() => (rec.state ? printPlan(rec.state, rec.today) : null), [rec.state, rec.today]);
  const name = bundle ? displayName(bundle) : 'Client';
  const first = name.split(' ')[0] || name;
  const back = () => navigate(clientPath(cardId, 'sessions'));

  const toolbar = (
    <div className="pp-toolbar">
      <button type="button" className="eyebrow eyebrow-link" onClick={back}><Icon name="chevL" size={14} /> {first}’s sessions</button>
      {plan && <Button size="card" icon="send" onClick={() => window.print()}>Print or share</Button>}
      {plan && <p className="caption">On an iPhone, Print opens a preview: share it to Mail or Files as a PDF.</p>}
    </div>
  );
  if (error || rec.error) return <div className="pp-screen">{toolbar}<EmptyState>Couldn’t load the plan: {error ?? rec.error}</EmptyState></div>;
  if (!bundles || !rec.state) return <div className="pp-screen" aria-busy="true" />;
  if (!plan) return <div className="pp-screen">{toolbar}<EmptyState>{first} has no cycle of yours running to print.</EmptyState></div>;

  const maxSets = Math.max(1, ...plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => e.sets))));
  const dates = (w: { start: string | null; end: string | null }) => (w.start && w.end ? `${fmt.ddm(w.start)} – ${fmt.ddm(w.end)}` : '');
  return (
    <div className="pp-screen">
      {toolbar}
      <article className="pp-sheet">
        <header className="pp-head">
          <div>
            <h1>{name}</h1>
            <p>{String(plan.macro.name)} · mesocycle {plan.mesocycle} of {plan.mesocycles}{plan.weeks[0] ? ` · ${dates({ start: plan.weeks[0].start, end: plan.weeks[plan.weeks.length - 1].end })}` : ''}</p>
          </div>
          <p className="pp-coach">From {profile.displayName}{profile.businessName ? `, ${profile.businessName}` : ''}</p>
        </header>
        <p className="pp-how">For each set, write the weight and reps you did and tick it. Circle how hard each exercise felt: 1 is very easy, 10 is as hard as you could go. Bring this sheet to your next session.</p>
        {plan.weeks.map((w, wi) => (
          <section key={wi} className="pp-week">
            {plan.weeks.length > 1 && <h2>Week {wi + 1}{dates(w) ? ` · ${dates(w)}` : ''}{w.deload ? ' · deload' : ''}</h2>}
            {plan.weeks.length === 1 && w.deload && <h2>Deload week</h2>}
            {w.sessions.map((s) => (
              <div key={s.dayKey} className="pp-session">
                <h3><span className="pp-box" aria-hidden="true" /> {s.label}<span className="pp-date">Date: ____________</span></h3>
                <table>
                  <thead>
                    <tr><th className="pp-ex">Exercise</th>{Array.from({ length: maxSets }, (_, k) => <th key={k}>Set {k + 1}</th>)}</tr>
                  </thead>
                  <tbody>
                    {s.exercises.map((t) => {
                      const ex = t.ex as Loose;
                      const cardio = ex.category === 'cardio';
                      return (
                        <tr key={String(ex.id)}>
                          <td className="pp-ex">
                            <b>{String(ex.name)}</b>
                            <span>{t.sets} {t.sets === 1 ? 'set' : 'sets'}{ex.type && ex.type !== 'standard' ? ` · ${ex.type === 'dropset' ? 'drop set' : ex.type === 'giant' ? 'giant set' : 'pause set'}` : ''}</span>
                            {!cardio && <span className="pp-rpe">How hard? {RPE.map((n) => <i key={n}>{n}</i>)}</span>}
                          </td>
                          {Array.from({ length: maxSets }, (_, k) => (
                            <td key={k} className={k < t.sets ? 'pp-set' : 'pp-none'}>
                              {k < t.sets && <>
                                <span className="pp-target">{targetText(t, k)}</span>
                                <span className="pp-write">{cardio ? '____ min' : '____ kg × ____'}</span>
                                <span className="pp-tick"><span className="pp-box" aria-hidden="true" /> done</span>
                              </>}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        ))}
        <footer className="pp-foot">Targets for mesocycle {plan.mesocycle}. Your next sheet follows from what you do on this one.</footer>
      </article>
    </div>
  );
}
