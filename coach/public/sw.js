/*
 * BLOC Coach's service worker — push notifications and nothing else
 * (Coach v0.9, TECHNICAL §158; the same shape as BLOC's sw.js, §111/§157).
 *
 * 🚨 THERE IS NO `fetch` HANDLER, AND THERE MUST NEVER BE ONE WITHOUT A PLAN.
 * A caching worker pins a merge-deployed app to an old build.
 * scripts/verify-coach-push.mjs asserts it.
 *
 * Scope: served at /bloc-app/coach/sw.js and registered with scope './', so it
 * controls /bloc-app/coach/. That is inside BLOC's scope (/bloc-app/), and the
 * more specific scope wins, so Coach's pages are Coach's worker's alone, and
 * a push to a Coach subscription is shown by this worker.
 *
 * 🚨 PINNED: verify-coach-push.mjs fails if this file's SHA-256 changes. On
 * iOS a changed worker can split a phone's push subscription (banners that no
 * tap reaches; MIGRATION-LESSONS §69, TECHNICAL §113). Change it only with a
 * planned re-registration: Settings → Notifications → Turn off, Turn on.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 🚨 iOS requires every push to show a notification; a silent one counts
// against the site. So this always shows something.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'BLOC Coach'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : 'Open BLOC Coach to see what’s new.',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      icon: 'icon-192.png',
      data: { open: openTarget(data.tag) },
    }),
  )
})

// Where a tap goes: the push's tag, passed to the page as it is (TECHNICAL
// §158): 'request:<id>', 'checkin:<id>', 'note:<id>', 'unlinked:<card id>',
// 'digest:<day>', 'coach-test'. The page knows each kind; a new kind needs no
// change here. Anything else opens Today.
// The destination travels three ways, because on an iPhone any single one can
// be lost (§111): the URL (?open=…), a 'coach:open' message to an open window,
// and a note in Cache Storage the page reads AND deletes. The cache name, the
// note's path, the message type and OPEN_TAG are copied in
// src/push/intent.ts; verify-coach-push.mjs proves they agree.
const OPEN_INTENT_CACHE = 'bloc-coach-open-intent'
const OPEN_INTENT_PATH = '__open-intent'
const OPEN_TAG = /^(request|checkin|note|unlinked|digest):[A-Za-z0-9_-]{1,64}$|^coach-test$/

function openTarget(value) {
  return typeof value === 'string' && OPEN_TAG.test(value) ? value : 'today'
}

function openFor(notification) {
  // The tag first: iOS can hand a click an empty notification.data (§112).
  if (OPEN_TAG.test(notification.tag || '')) return notification.tag
  const data = notification.data || null
  return data ? openTarget(data.open) : 'today'
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  const open = openFor(event.notification)
  // Built from the scope, never from the payload: only ever somewhere inside Coach.
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
            w.postMessage({ type: 'coach:open', open })
            return w.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})
