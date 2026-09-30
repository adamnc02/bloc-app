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

// ── Wiring ───────────────────────────────────────────────────────────────
// 🚨 A tap on a CLOSED app (swiped away, phone locked) is a cold start: iOS
//    opens Coach at its start or on the last page it remembers, so route 1 can
//    be lost, and the message and the note can arrive while Coach is still
//    signing in. v0.9 attached the listener once Coach was ready and read the
//    note once; v0.9.1 listened from page load but read the note only after
//    sign-in. Now, as Listly's App does on its first render, all three routes
//    are read from page load (listenForOpenMessages, main.tsx), the note in a
//    burst that repeats whenever Coach comes to the front, and the destination
//    is held until Coach is ready (watchOpenIntents).
export type OpenVia = 'url' | 'message' | 'note';

// ── Temporary (v0.9.2): what the page saw of a notification tap ──────────
// A phone has no console. Settings → Notifications lists these, so a tap on a
// closed Coach shows whether iOS ran the worker's click handler at all (a note
// or a message arrives) or launched Coach without it. Removed before Phase 6
// closes, with the v0.9.1 readout.
const LOG_MAX = 16;
export function pushLog(ev: string): void {
  try {
    const now = new Date();
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const list = JSON.parse(localStorage.getItem(KEYS.pushLog) || '[]') as string[];
    list.push(`${t} ${ev}`);
    localStorage.setItem(KEYS.pushLog, JSON.stringify(list.slice(-LOG_MAX)));
  } catch { /* private mode */ }
}
export function readPushLog(): string[] {
  try { return JSON.parse(localStorage.getItem(KEYS.pushLog) || '[]') as string[]; } catch { return []; }
}
/** When to re-read the note after page load, ready, or a return to the front, ms. */
export const RECHECK_MS = [0, 500, 1500, 3000, 6000, 10000];

let pending: { target: string; via: OpenVia } | null = null;
let deliver: ((target: string, via: OpenVia) => void) | null = null;
function hand(target: string | null, via: OpenVia) {
  if (!target) return;
  if (deliver) deliver(target, via);
  else pending = { target, via };
}

let timers: ReturnType<typeof setTimeout>[] = [];
let busy = false;
/** Routes 1 and 3: the URL (stripped once read) and the note (deleted once read). */
async function check(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const fromUrl = parseOpenParam(window.location.href);
    if (fromUrl) {
      const u = new URL(window.location.href);
      u.searchParams.delete('open');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
      pushLog(`url ${fromUrl.slice(0, 24)}`);
      hand(fromUrl, 'url');
      await takeOpenNote(); // the same tap: consume its note too
      return;
    }
    const note = await takeOpenNote();
    if (note) pushLog(`note ${note.slice(0, 24)}`);
    hand(note, 'note');
  } finally { busy = false; }
}
function burst(why: string) {
  pushLog(`checks (${why})`);
  for (const t of timers) clearTimeout(t);
  timers = RECHECK_MS.map((ms) => setTimeout(() => void check(), ms));
}

/**
 * At page load, before React and before sign-in, as Listly's App does on its
 * first render: all three routes are read from the first moment, and the
 * destination is HELD until Coach is ready (watchOpenIntents). v0.9.1 started
 * reading only once sign-in had finished.
 */
export function listenForOpenMessages(): void {
  if (typeof window === 'undefined') return;
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  pushLog(`boot ${location.pathname}${location.search}${location.hash} · worker ${sw?.controller ? 'yes' : 'no'} · ${document.visibilityState}`);
  sw?.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: unknown; open?: unknown } | null;
    pushLog(`message ${d && typeof d.type === 'string' ? d.type : '?'} ${d && typeof d.open === 'string' ? d.open.slice(0, 24) : ''}`);
    if (d && d.type === OPEN_MESSAGE) void takeOpenNote().finally(() => hand(openTarget(d.open), 'message'));
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') burst('visible'); });
  window.addEventListener('focus', () => burst('focus'));
  window.addEventListener('pageshow', () => burst('pageshow'));
  burst('load');
}

/** Temporary readout (Settings → Notifications): which route last opened Coach from a notification. */
export interface LastOpen { at: number; via: OpenVia; target: string; path: string | null }
export function lastOpen(): LastOpen | null {
  try { return JSON.parse(localStorage.getItem(KEYS.lastOpen) || 'null'); } catch { return null; }
}

/**
 * Once Coach is ready: `go` gets a hash path. Delivers anything held since
 * page load, and re-reads the note once more (a tap during a slow sign-in).
 * Returns the unsubscribe.
 */
export function watchOpenIntents(go: (path: string) => void): () => void {
  deliver = (target, via) => {
    const path = pushRoute(target);
    pushLog(`open via ${via} → ${path ?? 'stay'}`);
    try { localStorage.setItem(KEYS.lastOpen, JSON.stringify({ at: Date.now(), via, target, path } satisfies LastOpen)); } catch { /* private mode */ }
    if (path) go(path);
  };
  if (pending) { const p = pending; pending = null; deliver(p.target, p.via); }
  burst('ready');
  return () => { deliver = null; };
}
