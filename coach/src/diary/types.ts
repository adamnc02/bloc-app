// The Diary's data: `0024`'s coach settings, days off, diary series and
// bookings, and session requests, camel-cased. Times are minutes from
// midnight in 15-minute steps; dates are the coach's own calendar dates.
import type { ISODate } from '@/domain/types';

export interface DiarySettings {
  /** Working hours: the grid's first and last hour. A guide, never a block. */
  dayStart: number;
  dayEnd: number;
  /** 0 = Monday … 6 = Sunday. */
  workingDays: number[];
  /** A new session's length. */
  sessionMinutes: number;
}
/** No `coach_settings` row means these (0024's column defaults). */
export const DEFAULT_SETTINGS: DiarySettings = { dayStart: 300, dayEnd: 1320, workingDays: [0, 1, 2, 3, 4, 5], sessionMinutes: 60 };

/** A day off, or a holiday over several days (`coach_days_off`). */
export interface DayOff {
  id: string;
  start: ISODate;
  end: ISODate;
  note: string | null;
  /** The coach's answer to "Let clients know?". Undo tells them only if this is true. */
  notified: boolean;
}

export type SessionKind = 'one_to_one' | 'group';

/**
 * The plan session a coach will take with a client in person (0023 `booking.assigned_session`, 0024
 * `diary_booking_clients.assigned_session`): once the client's phone has it, the session is the coach's and
 * read-only there (BLOC §136). A marker for one session: it never repeats, and it's cleared once logged.
 */
export interface AssignedSession { macroId: string; week: number; dayKey: string }

/** A weekly session (`diary_series`): every `weekday` from `from` to `to` (inclusive). */
export interface Series {
  id: string;
  kind: SessionKind;
  weekday: number;
  start: number;
  duration: number;
  from: ISODate;
  to: ISODate | null;
  /** Weeks cancelled "just this one". */
  cancelled: ISODate[];
  title: string | null;
  location: string | null;
  /** Card ids (`diary_series_clients`). */
  clientIds: string[];
}

/**
 * A one-off (`series` null), or one week of a series changed "just this one"
 * (`series` + `occursOn`, the date it replaces).
 */
export interface Booking {
  id: string;
  seriesId: string | null;
  occursOn: ISODate | null;
  date: ISODate;
  start: number;
  duration: number;
  kind: SessionKind;
  status: 'booked' | 'cancelled';
  title: string | null;
  location: string | null;
  clientIds: string[];
  /**
   * Card id → the session assigned to that attendee (`diary_booking_clients`). A weekly session's week
   * carries one on its identity override: a row identical to that week, so the week stays in its series.
   */
  assigned?: Record<string, AssignedSession>;
}

/** A time a request names: a start, or a window when `end_min` is set (0024 `session_request_slots_ok`). */
export interface Slot { date: ISODate; start_min: number; end_min?: number }

export type RequestStatus = 'pending' | 'proposed' | 'countered' | 'accepted' | 'declined' | 'withdrawn';
export interface SessionRequest {
  id: string;
  /** The client's sign-in id; `cardId` is their card, when the link is known. */
  clientId: string;
  cardId: string | null;
  preferences: Slot[];
  notes: string | null;
  repeatWeekly: boolean;
  status: RequestStatus;
  proposed: Slot | null;
  counter: Slot | null;
  bookingId: string | null;
  createdAt: string;
}

/** The last `booking` publication sent to one card for one booking id. */
export interface SentBooking { id: string; seq: number; cardId: string; payload: Record<string, unknown> }

export interface Diary {
  settings: DiarySettings;
  daysOff: DayOff[];
  series: Series[];
  bookings: Booking[];
  requests: SessionRequest[];
  /** Keyed `${cardId}|${booking_id}`. */
  sent: Record<string, SentBooking>;
}
