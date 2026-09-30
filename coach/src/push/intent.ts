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
import { KEYS } from '@/lib/storage';

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

// ── Wiring (v0.9.1) ──────────────────────────────────────────────────────
// 🚨 A tap on a CLOSED app (swiped away, phone locked) is a cold start: iOS
//    opens Coach on the last page it remembers, so route 1 is lost, and the
//    worker's message can arrive before sign-in has finished. In v0.9 the
//    listener was attached only once Coach was ready, and the note was read
//    once, so both could be missed and Coach stayed on the page it opened on.
//    Now the message listener is attached at page load (listenForOpenMessages,
//    main.tsx) and holds the destination until Coach is ready, and the note is
//    re-read in a short burst after ready and after every return to the front.
export type OpenVia = 'url' | 'message' | 'note';
/** When to re-read the note after Coach is ready or comes to the front, ms. */
export const RECHECK_MS = [0, 500, 1500, 3000, 6000, 10000];

let pending: { target: string; via: OpenVia } | null = null;
let deliver: ((target: string, via: OpenVia) => void) | null = null;
function hand(target: string | null, via: OpenVia) {
  if (!target) return;
  if (deliver) deliver(target, via);
  else pending = { target, via };
}

/** At page load, before React: route 2 is never missed while Coach is still signing in. */
export function listenForOpenMessages(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: unknown; open?: unknown } | null;
    if (d && d.type === OPEN_MESSAGE) void takeOpenNote().finally(() => hand(openTarget(d.open), 'message'));
  });
}

/** Temporary readout (Settings → Notifications): which route last opened Coach from a notification. */
export interface LastOpen { at: number; via: OpenVia; target: string; path: string | null }
export function lastOpen(): LastOpen | null {
  try { return JSON.parse(localStorage.getItem(KEYS.lastOpen) || 'null'); } catch { return null; }
}

/**
 * Once Coach is ready: `go` gets a hash path. Takes anything held since page
 * load, reads route 1, and re-reads the note (RECHECK_MS) now and whenever
 * Coach comes to the front. Returns the unsubscribe.
 */
export function watchOpenIntents(go: (path: string) => void): () => void {
  deliver = (target, via) => {
    const path = pushRoute(target);
    try { localStorage.setItem(KEYS.lastOpen, JSON.stringify({ at: Date.now(), via, target, path } satisfies LastOpen)); } catch { /* private mode */ }
    if (path) go(path);
  };
  if (pending) { const p = pending; pending = null; deliver(p.target, p.via); }
  let timers: ReturnType<typeof setTimeout>[] = [];
  let busy = false;
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
        hand(fromUrl, 'url');
        await takeOpenNote(); // the same tap: consume its note too
        return;
      }
      hand(await takeOpenNote(), 'note');
    } finally { busy = false; }
  };
  const burst = () => { for (const t of timers) clearTimeout(t); timers = RECHECK_MS.map((ms) => setTimeout(() => void check(), ms)); };
  const onVisible = () => { if (document.visibilityState === 'visible') burst(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', burst);
  window.addEventListener('pageshow', burst);
  burst();
  return () => {
    deliver = null;
    for (const t of timers) clearTimeout(t);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', burst);
    window.removeEventListener('pageshow', burst);
  };
}
