/*
 * BLOC's service worker — push notifications and nothing else.
 * (v8.22, TECHNICAL §111; modelled on Listly's public/sw.js. Coach pushes
 * and their routes: v8.49, §157.)
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
 *
 * 🚨 PINNED: scripts/verify-push.mjs fails if this file's SHA-256 changes. On
 * iOS a changed worker can split a phone's push subscription (banners that
 * no tap reaches; MIGRATION-LESSONS §69, TECHNICAL §113). Change it only with
 * a planned re-registration: Settings → Notifications → Turn off, Turn on.
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
  const title = typeof data.title === 'string' && data.title ? data.title : 'BLOC'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : 'Open BLOC to see what’s new.',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: 'icon-192.png',
      data: { open: openTarget(data.open) },
    }),
  )
})

// Tapping opens BLOC where the notification points. 🚨 THE DESTINATION
// TRAVELS THREE WAYS, because on an iPhone any single one can be lost
// (TECHNICAL §111):
//   1. the URL (?open=…) — lost when iOS cold-starts the app at its
//      start_url instead of the URL openWindow() asked for;
//   2. a 'bloc:open' message to an open window — missed by a suspended page;
//   3. a note in Cache Storage that the page reads AND DELETES on start and
//      whenever it comes to the front. A notepad, not a page cache: still no
//      fetch handler.
// The cache name, the note's path, the message type and COACH_OPEN are
// copied in index.html (BLOC_OPEN_INTENT_*, BLOC_COACH_OPEN);
// scripts/verify-push.mjs proves they agree.
const OPEN_INTENT_CACHE = 'bloc-open-intent'
const OPEN_INTENT_PATH = '__open-intent'

// Where a tap goes (TECHNICAL §157):
//   'measurements'       the 07:00 reminder and the test notification
//   'coach:<kind>:<id>'  a push about the coach (BLOC Coach): passed to the
//                        page as it is, which knows each kind; a new kind
//                        needs no change here
//   'home'               anything else
// 🚨 The TAG decides first (§112): iOS can hand a click an empty
// notification.data, and every push BLOC sends is tagged
// ('measurements:<device>:<day>', 'bloc-test', 'coach:<kind>:<id>').
const COACH_OPEN = /^coach:[a-z_]{1,24}:[A-Za-z0-9_-]{1,64}$/

function openTarget(value) {
  if (value === 'measurements' || value === 'home') return value
  return typeof value === 'string' && COACH_OPEN.test(value) ? value : null
}

function openFor(notification) {
  const tag = notification.tag || ''
  if (COACH_OPEN.test(tag)) return tag
  if (/^measurements:/.test(tag) || tag === 'bloc-test') return 'measurements'
  const data = notification.data || null
  return (data && openTarget(data.open)) || 'home'
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  const open = openFor(event.notification)
  // Built from the scope, never from the payload: only ever somewhere inside BLOC.
  const inside = new URL(scope)
  inside.searchParams.set('open', open)
  const url = inside.href

  const note = caches
    .open(OPEN_INTENT_CACHE)
    .then((c) =>
      c.put(
        new URL(OPEN_INTENT_PATH, scope).href,
        new Response(JSON.stringify({ open, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    .catch(() => {})

  event.waitUntil(
    note
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((windows) => {
        for (const w of windows) {
          if (w.url.startsWith(scope)) {
            w.postMessage({ type: 'bloc:open', open })
            return w.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})
