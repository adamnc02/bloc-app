// Settings → Working hours and days, and Days off and holidays. Working hours
// and days are a guide in the Diary's grid, never a block. A day off cancels its sessions for good when it's
// added; removing it frees the days and brings nothing back (§152).
import { useId, useState } from 'react';
import { Section } from '@/components/ui/layout';
import { Button, Field, IconButton } from '@/components/ui/controls';
import { Icon } from '@/components/ui/Icon';
import { Toast } from '@/components/ui/Sheet';
import { addDays, fmt } from '@/lib/format';
import { cancelledOn } from '@/diary/model';
import { addDayOff, saveSettings, undoDayOff } from '@/diary/actions';
import type { DayOff, Diary, DiarySettings as Settings } from '@/diary/types';
import { DayOffSheet } from './DiarySheets';
import { useDiaryData } from './useDiaryData';

const DAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** "12 Oct" for one day, "12–16 Oct" for several. */
const rangeLabel = (o: Pick<DayOff, 'start' | 'end'>) => (o.start === o.end ? fmt.ddm(o.start) : fmt.range(o.start, o.end));

/** The sessions a day off cancelled: every cancelled session on its days. */
function cancelledIn(d: Pick<Diary, 'series' | 'bookings'>, o: Pick<DayOff, 'start' | 'end'>): number {
  let n = 0;
  for (let x = o.start; x <= o.end; x = addDays(x, 1)) n += cancelledOn(d, x).count;
  return n;
}

/** Seven day toggles, each a real toggle button with its full day name. */
function DayToggles({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div role="group" aria-label="Working days" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
      {DAY_LETTER.map((l, i) => {
        const on = value.includes(i);
        return (
          <button key={i} type="button" className="pick" aria-pressed={on} aria-label={DAY_NAME[i]}
            onClick={() => onChange(on ? value.filter((d) => d !== i) : [...value, i].sort((a, b) => a - b))}
            style={{ minHeight: 52, padding: 0, textAlign: 'center', fontWeight: 700, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 2, ...(on ? { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' } : {}) }}>
            <span aria-hidden="true">{l}</span>
            <span aria-hidden="true" style={{ height: 12, display: 'grid', placeItems: 'center' }}>{on ? <Icon name="check" size={12} /> : <span style={{ fontSize: 11, color: 'var(--text3)' }}>off</span>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Hour options for a native select; a saved time off the hour is kept as an option. */
function TimeSelect({ id, value, from, to, onChange }: { id: string; value: number; from: number; to: number; onChange: (m: number) => void }) {
  const opts: number[] = [];
  for (let m = from; m <= to; m += 60) opts.push(m);
  if (!opts.includes(value)) opts.push(value);
  opts.sort((a, b) => a - b);
  return (
    <select id={id} className="input num" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {opts.map((m) => <option key={m} value={m}>{m === 1440 ? 'Midnight' : fmt.time(m)}</option>)}
    </select>
  );
}

/** Working hours: working days, the day's start and end, and what that comes to. */
function WorkingHoursEditor({ value, onChange }: { value: Settings; onChange: (v: Settings) => void }) {
  const id = useId();
  const hours = (value.dayEnd - value.dayStart) / 60;
  const days = value.workingDays.length;
  return (
    <div>
      <Field label="Working days">
        <DayToggles value={value.workingDays} onChange={(workingDays) => onChange({ ...value, workingDays })} />
      </Field>
      <div className="tiles-2" style={{ marginTop: 16 }}>
        <div><Field label="Day starts" htmlFor={`${id}-s`}>
          <TimeSelect id={`${id}-s`} value={value.dayStart} from={Math.min(4 * 60, value.dayStart)} to={value.dayEnd - 60} onChange={(dayStart) => onChange({ ...value, dayStart })} />
        </Field></div>
        <div><Field label="Day ends" htmlFor={`${id}-e`}>
          <TimeSelect id={`${id}-e`} value={value.dayEnd} from={value.dayStart + 60} to={24 * 60} onChange={(dayEnd) => onChange({ ...value, dayEnd })} />
        </Field></div>
      </div>
      <p className="caption" style={{ marginTop: 10 }} aria-live="polite">
        {Number.isInteger(hours) ? hours : hours.toFixed(2).replace(/0+$/, '')} hours a day · {days} {days === 1 ? 'day' : 'days'} a week. The diary shows these hours.
      </p>
    </div>
  );
}

/**
 * The two sections, in Settings' grid: Working hours and days (the inline editor, Save hours) and Days off and
 * holidays (the list with a trash button each, and ＋ Add a day off). A new session's length keeps its saved
 * value; there's no control for it here.
 */
export function DiarySettingsSections({ i }: { i: number }) {
  const { repo, diary, who, today, run, toast } = useDiaryData();
  const [hours, setHours] = useState<Settings | null>(null);
  const [adding, setAdding] = useState(false);
  if (!diary) return <>
    <Section i={i} title="Working hours and days" sub="Your diary’s hours and the days you work. The default is 5am to 10pm."><div className="card" aria-busy="true" style={{ minHeight: 120 }} /></Section>
    <Section i={i + 1} title="Days off and holidays" sub="A day off cancels that day’s sessions for good, never the series. You can set them from the Diary too."><div className="card" aria-busy="true" style={{ minHeight: 80 }} /></Section>
  </>;
  const value = hours ?? diary.settings;
  const coming = diary.daysOff.filter((o) => o.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <>
      <Section i={i} title="Working hours and days" sub="Your diary’s hours and the days you work. The default is 5am to 10pm.">
        <div className="card">
          <WorkingHoursEditor value={value} onChange={setHours} />
          <Button size="card" style={{ marginTop: 18 }} disabled={!value.workingDays.length || value.dayEnd <= value.dayStart}
            onClick={() => void run((_d) => saveSettings(repo, { ...value, sessionMinutes: diary.settings.sessionMinutes }), 'Working hours saved').then((ok) => ok && setHours(null))}>Save hours</Button>
        </div>
      </Section>

      <Section i={i + 1} title="Days off and holidays" sub="A day off cancels that day’s sessions for good, never the series; removing it later brings none back. You can set them from the Diary too.">
        {coming.length > 0 ? (
          <div className="card list">
            {coming.map((o) => {
              const count = cancelledIn(diary, o);
              const label = o.note || (o.start === o.end ? 'Day off' : 'Holiday');
              return (
                <div key={o.id} className="listrow" style={{ cursor: 'default' }}>
                  <span className="icon-tile"><Icon name={o.start === o.end ? 'calendar' : 'sun'} size={18} /></span>
                  <span className="main">
                    <b>{label}</b>
                    <small className="muted num" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>{rangeLabel(o)}{count ? ` · ${count} ${count === 1 ? 'session' : 'sessions'} cancelled` : ''}</small>
                  </span>
                  <IconButton icon="trash" inCard label={`Remove ${label}, ${rangeLabel(o)}`}
                    onClick={() => void run((_d) => undoDayOff(repo, o.id), `${label} removed · its cancelled sessions stay cancelled`)} />
                </div>
              );
            })}
          </div>
        ) : <div className="card muted">No days off booked.</div>}
        <Button size="card" variant="ghost" icon="plus" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>Add a day off</Button>
      </Section>

      {adding && (
        <DayOffSheet diary={diary} who={who} today={today} date={null} onClose={() => setAdding(false)}
          onConfirm={(a, b, label, notify) => void run((d) => addDayOff(repo, d, a, b, label, notify),
            `${label}: ${a === b ? fmt.long(a) : `${fmt.ddm(a)} – ${fmt.ddm(b)}`} off${notify ? ' · clients notified' : ''}`).then((ok) => ok && setAdding(false))} />
      )}
      <Toast msg={toast.msg} />
    </>
  );
}
