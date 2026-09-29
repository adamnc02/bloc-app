// Coach's router: the hash, so GitHub Pages serves one index.html for every
// screen (a path like /bloc-app/coach/clients would 404 there). Sign-in's
// OAuth return uses PKCE's `?code=`, never the hash (lib/supabase.ts).
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'today' } | { name: 'clients' } | { name: 'client'; id: string }
  | { name: 'diary' } | { name: 'library' } | { name: 'settings' };

export const DEFAULT_PATH = '/clients';

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] || DEFAULT_PATH;
  const [, a, b] = path.split('/');
  if (a === 'clients' && b) return { name: 'client', id: decodeURIComponent(b) };
  if (a === 'today' || a === 'clients' || a === 'diary' || a === 'library' || a === 'settings') return { name: a };
  return { name: 'clients' };
}

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
