// BLOC Coach's Supabase client: BLOC's own project, Coach's own session
// (TECHNICAL §139). The URL and publishable key are BLOC's (index.html), which
// are public by design; RLS is the security boundary.
//
// 🚨 Never created under the local-dev bypass (host.ts): `getSupabase()`
//    returns null there, exactly as BLOC leaves `supabase` null (§82).
// 🚨 `storageKey` is Coach's own (storage.ts). Without it supabase-js uses
//    `sb-<ref>-auth-token`, which is BLOC's key on the same origin: signing
//    in or out of Coach would sign BLOC in or out too.
// PKCE, so the OAuth return is `?code=…` and never lands in the hash, which
// the router owns.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IS_LOCAL_DEV } from './host';
import { KEYS } from './storage';

export const SUPABASE_URL = 'https://pinfjcxwwbbbwfqppqsj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vC0Yhw8pgtkohqUI5tMVeQ_rnNhJ9vm';

/** Where a client redeems an invite: the LIVE BLOC app (BLOC v8.37, TECHNICAL §129). */
export const BLOC_INVITE_BASE = 'https://adamnc02.github.io/bloc-app/';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (IS_LOCAL_DEV) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storageKey: KEYS.auth, flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
