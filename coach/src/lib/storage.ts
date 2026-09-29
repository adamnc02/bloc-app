// ═══════════════════════════════════════════════════════════════════════
// Every key BLOC Coach keeps in localStorage (TECHNICAL §139).
//
// 🚨 BLOC and BLOC Coach share ONE origin (adamnc02.github.io), so they share
//    localStorage. Three rules, and scripts/verify-coach-storage.mjs checks
//    each against Coach's source:
//    · Every Coach key starts `blocCoach_`, and every localStorage call in
//      Coach names a key from this file, never a literal.
//    · Coach never reads or writes BLOC's keys (`bloc_state`, `bloc_api_key`,
//      `bloc_*`, and BLOC's Supabase session `sb-<ref>-auth-token`).
//    · Coach's Supabase session key must NOT look like `sb-*-auth-token`:
//      BLOC's pre-paint check (index.html, §60) treats any such key as "signed
//      in to BLOC" and would skip painting its sign-in gate.
//    Signing out of Coach clears only Coach's session; BLOC on the same device
//    stays signed in, and the coach's AI key stays for next time.
// ═══════════════════════════════════════════════════════════════════════

export const KEYS = {
  /** supabase-js session storage for Coach (its `storageKey`, src/lib/supabase.ts). */
  auth: 'blocCoach_auth',
  /** The coach's own Anthropic key for the AI tools (ai/transport.ts). Kept on sign-out. */
  aiKey: 'blocCoach_aiKey',
} as const;
