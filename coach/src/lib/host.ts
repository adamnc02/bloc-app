// ═══════════════════════════════════════════════════════════════════════
// BLOC Coach's local-dev bypass (TECHNICAL §82, §119, §139).
//
// The SAME rule as BLOC, on the SAME predicate:
//   · isLocalDevHost() is the engine's (engine/src/host.ts), imported as
//     source. Never Vite's import.meta.env.DEV: a production build previewed on
//     a LAN IP must still bypass, and nothing about a build may make a public
//     host bypass.
//   · `?auth=real` turns the bypass OFF on a local host, never on. It is
//     index.html's isRealAuthRequested()/isDevBypassActive(), copied here
//     because those two live in BLOC's index.html, not the engine, and a
//     Coach PR must leave BLOC's served bytes unchanged. 🚨 The copy cannot
//     drift: scripts/verify-coach-host.mjs runs BLOC's two functions (from
//     index.html) and these two over the same host × query matrix and fails
//     on any difference, and on the two plausible wrong versions.
//
// Bypass on: no Supabase client is created at all, and the Clients list is
// the fixture clients (src/data/fixtures.ts). There is no real account and no
// real data behind it.
// ═══════════════════════════════════════════════════════════════════════
import { isLocalDevHost } from '@engine';

export function isRealAuthRequested(search: string | null | undefined): boolean {
  try { return new URLSearchParams(search || '').get('auth') === 'real'; } catch { return false; }
}

export function isDevBypassActive(hostname: string, search: string | null | undefined): boolean {
  return isLocalDevHost(hostname) && !isRealAuthRequested(search);
}

/** "The bypass is active" on this page, as BLOC's IS_LOCAL_DEV. */
export const IS_LOCAL_DEV = isDevBypassActive(window.location.hostname, window.location.search);
/** A local build signed in to BLOC's LIVE project (the red tag, §119). */
export const IS_LOCAL_REAL_AUTH = isLocalDevHost(window.location.hostname) && !IS_LOCAL_DEV;
