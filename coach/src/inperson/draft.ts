// An in-person session being logged on this device: which session, the sets and the ratings, kept in
// localStorage (`blocCoach_inPerson`) until Finish, so a reload or a locked phone loses nothing. One entry per
// diary week and client. This device only: another device starts again from the targets.
import { KEYS } from '@/lib/storage';
import type { Ratings, SetEntry } from './model';

export interface InPersonDraft {
  sessionId: string;
  macroId: string;
  week: number;
  dayKey: string;
  sets: Record<string, SetEntry[]>;
  rpe: Ratings;
}

const keyOf = (occKey: string, cardId: string) => `${occKey}|${cardId}`;
function all(): Record<string, InPersonDraft> {
  try { return JSON.parse(localStorage.getItem(KEYS.inPerson) || '{}') as Record<string, InPersonDraft>; } catch { return {}; }
}
function write(x: Record<string, InPersonDraft>) {
  try { if (Object.keys(x).length) localStorage.setItem(KEYS.inPerson, JSON.stringify(x)); else localStorage.removeItem(KEYS.inPerson); } catch { /* private mode: this page only */ }
}
export const loadDraft = (occKey: string, cardId: string): InPersonDraft | null => all()[keyOf(occKey, cardId)] ?? null;
export function saveDraft(occKey: string, cardId: string, d: InPersonDraft) { write({ ...all(), [keyOf(occKey, cardId)]: d }); }
export function dropDraft(occKey: string, cardId: string) { const x = all(); delete x[keyOf(occKey, cardId)]; write(x); }
