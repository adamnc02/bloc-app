// Settings → Diary: working hours and days (a guide in the grid, never a
// block), a new session's length, and the days off and holidays still to
// come, each with Undo.
import { useId, useState } from 'react';
import { Section } from '@/components/ui/layout';
import { Button, Checkbox, Field, RowButton, Stepper } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/Sheet';
import { Toast } from '@/components/ui/Sheet';
import { fmt } from '@/lib/format';
import { lengthLabel } from '@/diary/slots';
import { addDayOff, saveSettings, undoDayOff } from '@/diary/actions';
import type { DiarySettings as Settings } from '@/diary/types';
import { DayOffSheet, UndoDayOffSheet } from './DiarySheets';
import { workingDaysLabel } from './DiaryScreen';
import { useDiaryData } from './useDiaryData';

const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const QUARTERS = Array.from({ length: 97 }, (_, i) => i * 15);

export function DiarySettingsSection({ i }: { i: number }) {
  const { repo, diary, who, today, run, toast } = useDiaryData();
  const [sheet, setSheet] = useState<'hours' | 'off' | { undo: string } | null>(null);
  if (!diary) return null;
  const s = diary.settings;
  const coming = diary.daysOff.filter((o) => o.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const undo = sheet && typeof sheet === 'object' ? diary.daysOff.find((o) => o.id === sheet.undo) : undefined;
  return (
    <Section i={i} title="Diary" sub="Your working week, a session’s standard length, and days off.">
      <div className="card list">
        <RowButton lead="clock" title={`${workingDaysLabel(s.workingDays)} · ${fmt.hour(s.dayStart)}–${fmt.hour(s.dayEnd)}`} sub={`Sessions ${lengthLabel(s.sessionMinutes)} · a guide, never a block`} onClick={() => setSheet('hours')} />
        {coming.map((o) => (
          <RowButton key={o.id} lead="moon" title={o.start === o.end ? fmt.long(o.start) : `${fmt.ddm(o.start)} – ${fmt.ddm(o.end)}`}
            sub={[o.note, o.notified ? 'Clients told' : 'Clients not told'].filter(Boolean).join(' · ')} onClick={() => setSheet({ undo: o.id })} />
        ))}
        <RowButton lead="plus" title="Mark a day off or a holiday" onClick={() => setSheet('off')} />
      </div>
      {sheet === 'hours' && <HoursSheet s={s} onClose={() => setSheet(null)} onSave={(x) => void run((_d) => saveSettings(repo, x), 'Diary settings saved').then((ok) => ok && setSheet(null))} />}
      {sheet === 'off' && (
        <DayOffSheet diary={diary} who={who} today={today} date={null} onClose={() => setSheet(null)}
          onConfirm={(a, b, note, notify) => void run((_d) => addDayOff(repo, a, b, note, notify), `${a === b ? fmt.long(a) : `${fmt.ddm(a)} – ${fmt.ddm(b)}`} off · ${notify ? 'clients told' : 'no one told'}`).then((ok) => ok && setSheet(null))} />
      )}
      {undo && (
        <UndoDayOffSheet off={undo} diary={diary} onClose={() => setSheet(null)}
          onUndo={() => void run((d) => undoDayOff(repo, d, undo.id), `Back on${undo.notified ? ' · clients told' : ''}`).then((ok) => ok && setSheet(null))} />
      )}
      <Toast msg={toast.msg} />
    </Section>
  );
}

function HoursSheet({ s, onSave, onClose }: { s: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const id = useId();
  const [x, setX] = useState<Settings>(s);
  const bad = x.dayEnd <= x.dayStart ? 'The day has to end after it starts' : null;
  return (
    <Sheet open title="Working week" onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>The Diary shows these hours and marks other days “Not working”. You can still book outside them.</p>
      <div className="tiles-2">
        <Field label="Day starts" htmlFor={`${id}-s`}>
          <select id={`${id}-s`} className="input" value={x.dayStart} onChange={(e) => setX({ ...x, dayStart: Number(e.target.value) })}>
            {QUARTERS.filter((q) => q < 1440).map((q) => <option key={q} value={q}>{fmt.time(q)}</option>)}
          </select>
        </Field>
        <Field label="Day ends" htmlFor={`${id}-e`}>
          <select id={`${id}-e`} className="input" value={x.dayEnd} onChange={(e) => setX({ ...x, dayEnd: Number(e.target.value) })}>
            {QUARTERS.filter((q) => q > 0).map((q) => <option key={q} value={q}>{q === 1440 ? 'Midnight' : fmt.time(q)}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Working days">
        <div className="card list">
          {DAY_LONG.map((d, i) => (
            <label key={d} className="listrow" style={{ cursor: 'pointer' }}>
              <span className="main"><b>{d}</b></span>
              <Checkbox label={`Working on ${d}`} checked={x.workingDays.includes(i)}
                onChange={(on) => setX({ ...x, workingDays: on ? [...x.workingDays, i].sort((a, b) => a - b) : x.workingDays.filter((w) => w !== i) })} />
            </label>
          ))}
        </div>
      </Field>
      <Field label="A new session’s length">
        <Stepper label="length" value={x.sessionMinutes} min={15} max={480} step={15} format={lengthLabel} onChange={(v) => setX({ ...x, sessionMinutes: v })} />
      </Field>
      {bad && <p className="dy-refusal" role="alert">{bad}.</p>}
      <div style={{ marginTop: 20 }}><Button disabled={!!bad} onClick={() => onSave(x)}>Save</Button></div>
    </Sheet>
  );
}
