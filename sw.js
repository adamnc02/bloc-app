/*
 * BLOC's service worker — push notifications and nothing else.
 * (v8.22, TECHNICAL §111; modelled on Listly's public/sw.js.)
 *
 * 🚨 THERE IS NO `fetch` HANDLER, AND THERE MUST NEVER BE ONE WITHOUT A PLAN.
 * A caching service worker is how a single-file app deployed by merge gets
 * permanently stuck on an old build: a cached index.html keeps loading, and no
 * deploy reaches the phone. With no fetch handler this worker never sees a
 * request, so every load goes to the network exactly as before it existed.
 * scripts/verify-manifest.mjs and verify-push.mjs assert it.
 *
 * Scope: served at /bloc-app/sw.js and registered with scope './', so it
 * controls /bloc-app/ — which will include /bloc-app/coach/ when BLOC Coach
 * exists. Harmless with no fetch handler; Coach registers its OWN worker at
 * /bloc-app/coach/, and the more specific scope wins (TECHNICAL §108/§111).
 *
 * `skipWaiting` + `clients.claim` so a changed sw.js takes over at once rather
 * than waiting for every BLOC window to close, which on an installed iPhone
 * app can be days.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 🚨 iOS requires every push to show a notification. A silent push counts
// against the site, and repeated ones get its permission revoked — so this
// always shows something, even for a payload it cannot read.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Measurements due'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : 'Log your waist and hip today.',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: 'icon-192.png',
      data: {
        url: typeof data.url === 'string' ? data.url : self.registration.scope,
        open: data.open === 'measurements' ? 'measurements' : null,
      },
    }),
  )
})

// Tapping opens BLOC on the Measurements sheet. 🚨 THE DESTINATION TRAVELS
// THREE WAYS, because on an iPhone any single one can be lost (Listly, UAT
// 2026-09-25):
//   1. the URL (?open=measurements) — lost when iOS cold-starts the app at
//      its start_url instead of the URL openWindow() asked for;
//   2. a 'bloc:open' message to an open window — missed by a suspended page;
//   3. a note in Cache Storage that the page reads AND DELETES on start and
//      whenever it comes to the front. A notepad, not a page cache: still no
//      fetch handler.
// The cache name, the note's path and the message type are copied in
// index.html (BLOC_OPEN_INTENT_*); scripts/verify-push.mjs proves they agree.
const OPEN_INTENT_CACHE = 'bloc-open-intent'
const OPEN_INTENT_PATH = '__open-intent'

// 🚨 v8.23 (§112): the destination must NOT depend on notification.data. In
// v8.22 it did, and on Adam's iPhone a tap — from the banner with BLOC open,
// and from Notification Centre — opened BLOC on Home with no sheet: every
// route came out empty, consistent with iOS handing the click an empty
// `data`. So: `data.open` if it is there, else the TAG (every BLOC push is
// tagged 'measurements:<device>:<day>' or 'bloc-test' — Listly also routes on
// its tag), else Measurements anyway, because until BLOC sends a second kind
// of notification (BLOC Coach, PROMPT-03) every one of them is a measurements
// reminder. `via` records which it was, for the Settings → About readout.
function openFor(notification) {
  const data = notification.data || null
  if (data && data.open === 'measurements') return { open: 'measurements', via: 'data' }
  const tag = notification.tag || ''
  if (/^measurements:/.test(tag) || tag === 'bloc-test') return { open: 'measurements', via: 'tag' }
  return { open: 'measurements', via: 'default' }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  const { open, via } = openFor(event.notification)
  // Built from the scope, never from data.url: only ever somewhere inside BLOC.
  const inside = new URL(scope)
  inside.searchParams.set('open', open)
  const url = inside.href

  const note = open
    ? caches
        .open(OPEN_INTENT_CACHE)
        .then((c) =>
          c.put(
            new URL(OPEN_INTENT_PATH, scope).href,
            new Response(JSON.stringify({ open, via, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }),
          ),
        )
        .catch(() => {})
    : Promise.resolve()

  event.waitUntil(
    note
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((windows) => {
        for (const w of windows) {
          if (w.url.startsWith(scope)) {
            if (open) w.postMessage({ type: 'bloc:open', open, via })
            return w.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})
