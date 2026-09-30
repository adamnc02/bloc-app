// Coach's router: the hash, so GitHub Pages serves one index.html for every
// screen (a path like /bloc-app/coach/clients would 404 there). Sign-in's
// OAuth return uses PKCE's `?code=`, never the hash (lib/supabase.ts).
//
// A client is `#/clients/{card id}/{tab}`, with `?macro={cycle id}` when the
// view is on a cycle other than the one Review opens on, and `?act=swap&ex=`
// or `?act=goal` when a Review finding opens Plan on its job.
//
// An in-person session is `#/session/{occurrence key}?card={card id}`: the
// diary occurrence (`s:{series}@{week}` or `b:{booking}`) and the client. A group
// session is `#/session/{occurrence key}` with no card (everyone booked). A session a
// client not on the app did on their own is `#/session/own:{date}?card={card id}`.
import { useEffect, useState } from 'react';

/** Where Review opens scrolled to, from Today's Needs you: the AI tools on a tool, or one note back (`?at=ai|note`). */
export interface ReviewFocus { at: 'ai' | 'note'; note: string | null; tool: string | null }

export type ClientTab = 'review' | 'plan' | 'sessions' | 'profile';
export const CLIENT_TABS: ClientTab[] = ['review', 'plan', 'sessions', 'profile'];

export type Route =
  | { name: 'today'; push: string | null } | { name: 'clients' } | { name: 'client'; id: string; tab: ClientTab; macro: string | null; intent: { act: 'swap' | 'goal'; ex: string | null } | null; focus: ReviewFocus | null }
  | { name: 'diary' } | { name: 'library' } | { name: 'settings' }
  | { name: 'session'; occKey: string; cardId: string }
  | { name: 'print'; cardId: string };

/** Today is the hub: where the app opens. */
export const DEFAULT_PATH = '/today';

export function parseRoute(hash: string): Route {
  const [pathPart, query = ''] = hash.replace(/^#/, '').split('?');
  const path = pathPart || DEFAULT_PATH;
  const [, a, b, c] = path.split('/');
  if (a === 'clients' && b) {
    const tab = (CLIENT_TABS as string[]).includes(c) ? (c as ClientTab) : 'review';
    const q = new URLSearchParams(query);
    const act = q.get('act');
    // A Review finding's action opens Plan on its job (TECHNICAL §144).
    const intent = act === 'swap' || act === 'goal' ? { act, ex: q.get('ex') } as const : null;
    const at = q.get('at');
    const focus = at === 'ai' || at === 'note' ? { at, note: q.get('note'), tool: q.get('tool') } as const : null;
    return { name: 'client', id: decodeURIComponent(b), tab, macro: q.get('macro'), intent, focus };
  }
  if (a === 'print' && b) return { name: 'print', cardId: decodeURIComponent(b) };
  if (a === 'session' && b) return { name: 'session', occKey: decodeURIComponent(b), cardId: new URLSearchParams(query).get('card') ?? '' };
  // Today can carry a tapped push's tag (`?push=`, TECHNICAL §158).
  if (a === 'today' || !a) return { name: 'today', push: new URLSearchParams(query).get('push') };
  if (a === 'clients' || a === 'diary' || a === 'library' || a === 'settings') return { name: a };
  return { name: 'today', push: null };
}

export const sessionPath = (occKey: string, cardId: string) => `/session/${encodeURIComponent(occKey)}?card=${encodeURIComponent(cardId)}`;
/** A client's plan, printed (§162). */
export const printPath = (cardId: string) => `/print/${encodeURIComponent(cardId)}`;
/** A group session: everyone booked on that diary week (§162). */
export const groupSessionPath = (occKey: string) => `/session/${encodeURIComponent(occKey)}`;

export function clientPath(id: string, tab: ClientTab = 'review', macro?: string | null, intent?: { act: 'swap' | 'goal'; ex?: string | null } | null, focus?: Partial<ReviewFocus> & { at: ReviewFocus['at'] }) {
  const q = new URLSearchParams();
  if (macro) q.set('macro', macro);
  if (intent) { q.set('act', intent.act); if (intent.ex) q.set('ex', intent.ex); }
  if (focus) { q.set('at', focus.at); if (focus.note) q.set('note', focus.note); if (focus.tool) q.set('tool', focus.tool); }
  const qs = q.toString();
  return `/clients/${encodeURIComponent(id)}/${tab}${qs ? `?${qs}` : ''}`;
}

export function navigate(path: string) {
  window.location.hash = path;
}

/**
 * The page Settings was opened from, so its back link returns there and names it. In memory: Settings
 * opened by a reload (or a typed address) goes back to Clients.
 */
let beforeSettings: string | null = null;
/** The page an in-person session was started from (Today, the Diary, a client's Sessions); Today after a reload. */
let beforeSession: string | null = null;
let lastHash = typeof window !== 'undefined' ? window.location.hash : '';
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const next = window.location.hash;
    if (parseRoute(next).name === 'settings' && parseRoute(lastHash).name !== 'settings') beforeSettings = lastHash || `#${DEFAULT_PATH}`;
    if (parseRoute(next).name === 'session' && parseRoute(lastHash).name !== 'session' && parseRoute(lastHash).name !== 'settings') beforeSession = lastHash || `#${DEFAULT_PATH}`;
    lastHash = next;
  });
}
export function sessionBack(): { href: string; route: Route } {
  const href = beforeSession ?? `#${DEFAULT_PATH}`;
  return { href, route: parseRoute(href) };
}
export function settingsBack(): { href: string; route: Route } {
  const href = beforeSettings ?? `#${DEFAULT_PATH}`;
  return { href, route: parseRoute(href) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => { setRoute(parseRoute(window.location.hash)); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
