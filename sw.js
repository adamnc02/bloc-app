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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  let target
  try {
    target = new URL(event.notification.data?.url || scope, scope)
  } catch {
    target = new URL(scope)
  }
  // Only ever somewhere inside BLOC.
  const inside = target.href.startsWith(scope) ? target : new URL(scope)
  const open = event.notification.data?.open === 'measurements' ? 'measurements' : null
  if (open && !inside.searchParams.has('open')) inside.searchParams.set('open', open)
  const url = inside.href

  const note = open
    ? caches
        .open(OPEN_INTENT_CACHE)
        .then((c) =>
          c.put(
            new URL(OPEN_INTENT_PATH, scope).href,
            new Response(JSON.stringify({ open, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }),
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
            if (open) w.postMessage({ type: 'bloc:open', open })
            return w.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})
