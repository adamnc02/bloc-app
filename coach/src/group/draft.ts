// A group session being logged on this device: every attendee's sets and whether it replaces their planned session,
// kept in localStorage (`blocCoach_groupSession`) until Finish, so a reload or a locked phone loses nothing. One
// entry per diary week. This device only.
import { KEYS } from '@/lib/storage';
import type { AssignedSession, PlannedWorkout } from '@/diary/types';
import type { GroupSet } from './model';

export interface GroupDraft {
  sessionId: string;
  /** The workout being run: the planned one when Start was pressed, fixed from then on. */
  workout: PlannedWorkout;
  /** Card id → exercise key → sets. */
  sets: Record<string, Record<string, GroupSet[]>>;
  /** Card id → the planned session this replaces for them, when switched on. */
  replaces: Record<string, AssignedSession | null>;
}

function all(): Record<string, GroupDraft> {
  try { return JSON.parse(localStorage.getItem(KEYS.groupSession) || '{}') as Record<string, GroupDraft>; } catch { return {}; }
}
function write(x: Record<string, GroupDraft>) {
  try { if (Object.keys(x).length) localStorage.setItem(KEYS.groupSession, JSON.stringify(x)); else localStorage.removeItem(KEYS.groupSession); } catch { /* private mode: this page only */ }
}
export const loadGroupDraft = (occKey: string): GroupDraft | null => all()[occKey] ?? null;
export function saveGroupDraft(occKey: string, d: GroupDraft) { write({ ...all(), [occKey]: d }); }
export function dropGroupDraft(occKey: string) { const x = all(); delete x[occKey]; write(x); }
