// ═══════════════════════════════════════════════════════════════════════
// Opening Coach from a tapped notification (TECHNICAL §158).
//
// The worker (public/sw.js) passes the push's tag as the destination, three
// ways, because on an iPhone any single one can be lost (BLOC's §111):
//   1. the URL, `?open=<tag>` (lost when iOS cold-starts at start_url);
//   2. a 'coach:open' message to an open window (missed by a suspended page);
//   3. a note in Cache Storage, read AND deleted here, ignored after 5 min.
// The names and the pattern are copied from sw.js; verify-coach-push.mjs
// proves they agree.
//
// Where each goes (pushRoute): Today with `?push=<tag>` for a request, a
// check-in or a note back (Today does what that Needs you item's button does,
// once its data has loaded, today/model.ts pushAction); the digest to Today;
// an unlink to that client's Profile; the test notification nowhere.
// ═══════════════════════════════════════════════════════════════════════
import { clientPath } from '@/app/router';

export const OPEN_INTENT_CACHE = 'bloc-coach-open-intent';
export const OPEN_INTENT_PATH = '__open-intent';
export const OPEN_MESSAGE = 'coach:open';
export const OPEN_TAG = /^(request|checkin|note|unlinked|digest):[A-Za-z0-9_-]{1,64}$|^coach-test$/;
export const OPEN_MAX_AGE_MS = 5 * 60 * 1000;

/** A tag the page acts on, or 'today', or null (not a destination at all). */
export function openTarget(v: unknown): string | null {
  if (v === 'today') return 'today';
  return typeof v === 'string' && OPEN_TAG.test(v) ? v : null;
}

/** The hash path a destination opens, or null to stay where Coach is. */
export function pushRoute(target: string): string | null {
  if (target === 'coach-test') return null;
  const [kind, id] = target.split(':');
  if (kind === 'request' || kind === 'checkin' || kind === 'note') return `/today?push=${encodeURIComponent(target)}`;
  if (kind === 'unlinked' && id) return clientPath(id, 'profile');
  return '/today';
}

export function parseOpenParam(url: string): string | null {
  try { return openTarget(new URL(url).searchParams.get('open')); } catch { return null; }
}

/** Route 3: the note, read and deleted (always, so it never opens twice). */
export async function takeOpenNote(now = Date.now()): Promise<string | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(OPEN_INTENT_CACHE);
    const key = new URL(OPEN_INTENT_PATH, window.location.href.split('#')[0]).href;
    const hit = await cache.match(key);
    if (!hit) return null;
    await cache.delete(key);
    const body = await hit.json() as { open?: unknown; at?: unknown };
    const open = openTarget(body.open);
    if (!open || typeof body.at !== 'number') return null;
    return now - body.at <= OPEN_MAX_AGE_MS ? open : null;
  } catch { return null; }
}

/**
 * Wires the three routes. `go` gets a hash path. Runs on start, when Coach
 * comes to the front, and on the worker's message. Returns the unsubscribe.
 */
export function watchOpenIntents(go: (path: string) => void): () => void {
  let busy = false;
  const apply = (target: string | null) => { const path = target ? pushRoute(target) : null; if (path) go(path); };
  const check = async () => {
    if (busy) return;
    busy = true;
    try {
      // Route 1, stripped so a reload doesn't open it again.
      const fromUrl = parseOpenParam(window.location.href);
      if (fromUrl) {
        const u = new URL(window.location.href);
        u.searchParams.delete('open');
        history.replaceState(null, '', u.pathname + u.search + u.hash);
      }
      const fromNote = await takeOpenNote();
      apply(fromUrl || fromNote);
    } finally { busy = false; }
  };
  const onMessage = (e: MessageEvent) => {
    const d = e.data as { type?: unknown; open?: unknown } | null;
    if (d && d.type === OPEN_MESSAGE) void takeOpenNote().finally(() => apply(openTarget(d.open)));
  };
  const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onMessage);
  document.addEventListener('visibilitychange', onVisible);
  void check();
  return () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
