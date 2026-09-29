import type { CSSProperties, HTMLAttributes } from 'react';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/format';
import type { Occurrence } from '@/diary/model';

/** Names and initials for the Diary: the client's own name once linked (the Clients list's). */
export interface Who {
  /** "Maya", a group's title, or the full name with `full`. */
  name: (o: Pick<Occurrence, 'kind' | 'title' | 'clientIds'>, full?: boolean) => string;
  initials: (cardId: string) => string;
}

/** "Thu 18:00" for a request preference. */
export const prefLabel = (p: { date: string; start_min: number; end_min?: number }) =>
  `${fmt.dayShort(p.date)} ${p.end_min != null ? `${fmt.time(p.start_min)}–${fmt.time(p.end_min)}` : fmt.time(p.start_min)}`;

/** Screen-reader label: who, when, and what kind of item it is. */
export function sessionAria(o: Occurrence, w: Who, clashNames: string[] = []): string {
  const who = o.kind === 'group' ? `${w.name(o)}, group of ${o.clientIds.length}` : w.name(o, true);
  const when = `${fmt.long(o.date)}, ${fmt.time(o.start)} to ${fmt.time(o.start + o.duration)}`;
  if (o.kind === 'request') {
    const st = o.request?.status === 'proposed' ? 'you proposed this time, waiting for the client'
      : o.request?.status === 'accepted' ? 'confirmed by the client, not booked yet' : 'session request';
    const clash = clashNames.length ? `, clashes with ${clashNames.join(' and ')}` : '';
    return `${who}, ${st}, ${when}${o.request?.repeatWeekly ? ', repeats weekly' : ''}${clash}. Open to respond.`;
  }
  return `${who}, ${when}${o.recurring ? ', weekly' : ', one-off'}. Open to edit.`;
}

interface Props extends Omit<HTMLAttributes<HTMLElement>, 'style'> {
  occ: Occurrence;
  style?: CSSProperties;
  /** Narrow lane (overlap) or phone column: drop the secondary lines. */
  compact?: boolean;
  /** Names of bookings a request placeholder overlaps. */
  clashNames?: string[];
  /** Picked up and being dragged: the original stays behind, faded. */
  lifted?: boolean;
  /** Floating copy under the finger / pointer: not interactive. */
  floating?: boolean;
  who: Who;
}

/** A session in the diary grid: a real button (Enter opens edit), draggable. */
export function BookingBlock({ occ, style, compact, clashNames = [], lifted, floating, who, ...rest }: Props) {
  const req = occ.kind === 'request' ? occ.request : undefined;
  const proposed = req?.status === 'proposed';
  const confirmed = req?.status === 'accepted';
  const countered = req?.status === 'countered';
  const others = req && req.status === 'pending' ? req.preferences.filter((p) => !(p.date === occ.date && p.start_min === occ.start)) : [];
  const cls = [
    'bk', `bk-${occ.kind}`, proposed ? 'is-proposed' : '', lifted ? 'is-lifted' : '', floating ? 'is-floating' : '',
    compact ? 'is-compact' : '', occ.duration < 45 ? 'is-short' : '',
  ].join(' ');

  const clash = clashNames.length > 0 && !proposed;
  const reqTag = req && <span className="tag acc">{proposed ? 'Proposed' : confirmed ? 'Confirmed' : countered ? 'New time' : 'Request'}</span>;
  const body = (
    <>
      {/* Compact (a phone column, a shared lane): no tag, which can't fit at 375pt; the dashed outline marks a request. */}
      <span className="bk-name">
        {occ.kind === 'group' && <Icon name="group" size={13} />}
        {clash && <Icon name="warning" size={12} className="t-bad" title={`Clashes with ${clashNames.join(' and ')}`} />}
        <b>{who.name(occ)}</b>
        {occ.recurring && occ.kind !== 'request' && <Icon name="sync" size={11} className="bk-rec" title="Weekly" />}
        {req && !compact && reqTag}
      </span>
      <span className="bk-time num">
        {fmt.time(occ.start)}{compact ? '' : `–${fmt.time(occ.start + occ.duration)}`}
        {req?.repeatWeekly && !compact && ' · Weekly'}
      </span>
      {occ.kind === 'group' && (
        <span className="bk-people" aria-hidden="true">
          {occ.clientIds.slice(0, 3).map((id) => <i key={id}>{who.initials(id)}</i>)}
          <small>{occ.clientIds.length}</small>
        </span>
      )}
      {req && !compact && (
        proposed
          ? <span className="bk-sub">Waiting for {who.name(occ)}</span>
          : confirmed ? <span className="bk-sub">{clash ? 'Clashes: move it to book' : 'Booking…'}</span>
          : countered ? <span className="bk-sub">{who.name(occ)} suggested this</span>
          : others.length > 0 && <span className="bk-sub">Also {others.map(prefLabel).join(' · ')}</span>
      )}
    </>
  );

  if (floating) return <div className={cls} style={style} aria-hidden="true">{body}</div>;
  return (
    <button type="button" className={cls} style={style} aria-label={sessionAria(occ, who, clashNames)} {...rest}>
      {body}
    </button>
  );
}
