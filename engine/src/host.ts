// ═══════════════════════════════════════════════════════════════════════
// Which hosts get the local-dev auth bypass (deep dive §8; TECHNICAL §82,
// §91, §119, §124). Moved from index.html in v8.34 behind a same-named shim,
// so BLOC and BLOC Coach share ONE predicate: Coach keys its own bypass on
// this, never on import.meta.env.DEV (a Vite build previewed on a LAN IP
// must still bypass; a dev build on a public host must never).
//
// scripts/verify-local-dev-hosts.mjs tests THIS function, in the build.
// ═══════════════════════════════════════════════════════════════════════

// ── LOCAL DEV BYPASS: which hosts qualify ─────────────────────────────
// 🚨 THIS FUNCTION DECIDES WHETHER AUTHENTICATION IS SKIPPED. Read the rules
// before touching it.
//
// It was `['localhost','127.0.0.1'].includes(h)` until v8.16. That could only
// ever be reached by the laptop serving the app talking to itself, which meant
// the app could not be opened on a phone for design review — a phone on the
// same Wi-Fi reaches the laptop by its LAN address, never by `localhost`.
// It now also accepts PRIVATE-NETWORK hosts, so `http://192.168.0.42:8777`
// gets the same bypass and the same seeded demo data.
//
// Why this stays safe on the deployed site:
//
//   • It matches a bare IPv4 LITERAL in an RFC1918 / link-local range, or a
//     `.local` mDNS name, or exact `localhost`/loopback. Nothing else.
//   • The deploy target is `adamnc02.github.io` — a public DNS name, not an
//     IP literal and not `.local`, so it cannot match by construction. There
//     is no configuration, build flag or env var that could make it match;
//     the only input is the hostname the browser is already on.
//   • Matching is EXACT or anchored. `localhost.evil.com` and
//     `192.168.0.42.evil.com` are ordinary public hostnames and must not
//     match — which is why `localhost` is compared with `===` and the IPv4
//     test is anchored at both ends rather than searched for.
//
// What it does NOT protect against, stated plainly: while the dev server is
// running, anyone else on the same Wi-Fi who knows the address gets the app
// with the bypass active. (`?auth=real` can only turn it OFF — see isDevBypassActive() in
// index.html.) That is acceptable because the bypass leaves
// `supabase` null and seeds the DEMO dataset — there is no real account and
// no real data behind it — and the server only runs during a working session.
//
// 🚨 Never widen this to a hostname that public DNS can resolve. If a future
// change needs that, it needs a different mechanism, not another branch here.
// `scripts/verify-local-dev-hosts.mjs` asserts every rule above against the
// real shipped source and will fail loudly if this drifts.
export function isLocalDevHost(hostname: unknown): boolean {
  const h = String(hostname || '').toLowerCase();

  // Loopback, by exact match only.
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;

  // mDNS names (e.g. adams-macbook.local). Reserved for link-local use, so
  // public DNS can never serve one.
  if (/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*\.local$/.test(h)) return true;

  // A bare IPv4 literal, anchored — no prefix, no suffix, no trailing labels.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some(n => n > 255)) return false;
  const [a, b] = parts;
  if (a === 127) return true;                    // loopback range
  if (a === 10) return true;                     // 10.0.0.0/8
  if (a === 192 && b === 168) return true;       // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 169 && b === 254) return true;       // 169.254.0.0/16 link-local
  return false;                                   // every public address
}
