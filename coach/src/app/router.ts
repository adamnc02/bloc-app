// Coach's router: the hash, so GitHub Pages serves one index.html for every
// screen (a path like /bloc-app/coach/clients would 404 there). Sign-in's
// OAuth return uses PKCE's `?code=`, never the hash (lib/supabase.ts).
//
// A client is `#/clients/{card id}/{tab}`, with `?macro={cycle id}` when the
// view is on a cycle other than the one Review opens on.
import { useEffect, useState } from 'react';

export type ClientTab = 'review' | 'plan' | 'sessions' | 'profile';
export const CLIENT_TABS: ClientTab[] = ['review', 'plan', 'sessions', 'profile'];

export type Route =
  | { name: 'today' } | { name: 'clients' } | { name: 'client'; id: string; tab: ClientTab; macro: string | null }
  | { name: 'diary' } | { name: 'library' } | { name: 'settings' };

export const DEFAULT_PATH = '/clients';

export function parseRoute(hash: string): Route {
  const [pathPart, query = ''] = hash.replace(/^#/, '').split('?');
  const path = pathPart || DEFAULT_PATH;
  const [, a, b, c] = path.split('/');
  if (a === 'clients' && b) {
    const tab = (CLIENT_TABS as string[]).includes(c) ? (c as ClientTab) : 'review';
    return { name: 'client', id: decodeURIComponent(b), tab, macro: new URLSearchParams(query).get('macro') };
  }
  if (a === 'today' || a === 'clients' || a === 'diary' || a === 'library' || a === 'settings') return { name: a };
  return { name: 'clients' };
}

export const clientPath = (id: string, tab: ClientTab = 'review', macro?: string | null) =>
  `/clients/${encodeURIComponent(id)}/${tab}${macro ? `?macro=${encodeURIComponent(macro)}` : ''}`;

export function navigate(path: string) {
  window.location.hash = path;
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
