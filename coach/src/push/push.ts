// ═══════════════════════════════════════════════════════════════════════
// BLOC Coach's push notifications, the browser half (TECHNICAL §158). BLOC's
// (index.html, §111–§113) ported for `app: 'coach'`:
//   · push_subscriptions rows with app 'coach', id 'ps_' + the FULL SHA-256
//     of the endpoint (0019's CHECK), the device's IANA zone (the digest's
//     07:00 is the coach's);
//   · BLOC's VAPID public key: one pair per project (MIGRATION-LESSONS §61),
//     and bloc-push signs with it; verify-coach-push.mjs proves they agree;
//   · six honest states; 'on' needs the SERVER's row;
//   · the permission prompt only from a tap (turnOn); the silent re-register
//     after iOS drops a subscription (checkPushHealth, §113);
//   · sign-out unregisters this device first, while the session passes RLS.
// The five switches are coach_notification_prefs (0031): no row = all on.
//
// 🚨 Permission is per ORIGIN (MIGRATION-LESSONS §55): Coach shares
//    adamnc02.github.io with BLOC and Listly, so a phone that allowed either
//    shows no prompt here. That's correct.
// ═══════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import { KEYS } from '@/lib/storage';

export const COACH_VAPID_PUBLIC_KEY = 'BNEl1hpY_ki-wZusqT2dH3RYQbQRQNulTtA6u342THI9ouH9C4oxAj_NprdRnGu3MfN_eUivnocXMzdXXe1_zMI';
export const COACH_SW_URL = 'sw.js';
export const COACH_SW_SCOPE = './';

export type PushState = 'needs-install' | 'unsupported' | 'denied' | 'ask' | 'off' | 'on';

/** Pure: which state this device is in. 'needs-install' before 'unsupported' (an iPhone Safari tab has no PushManager). */
export function decidePushState(f: { ios: boolean; standalone: boolean; supported: boolean; permission: NotificationPermission; hereId: string | null; registeredIds: string[] }): PushState {
  if (f.ios && !f.standalone) return 'needs-install';
  if (!f.supported) return 'unsupported';
  if (f.permission === 'denied') return 'denied';
  if (f.permission === 'default') return 'ask';
  return f.hereId !== null && f.registeredIds.includes(f.hereId) ? 'on' : 'off';
}

export type PushHealth = 'none' | 'adopt' | 'ok' | 'resubscribe' | 'ask';
/** Pure (BLOC's §113): a registration iOS dropped is re-made quietly while permission holds, or asked for once. */
export function decidePushHealth(f: { supported: boolean; localId: string | null; hereId: string | null; hereOnServer: boolean; permission: NotificationPermission }): PushHealth {
  if (!f.supported) return 'none';
  if (!f.localId) return f.hereId && f.hereOnServer && f.permission === 'granted' ? 'adopt' : 'none';
  if (f.hereId === f.localId) return 'ok';
  return f.permission === 'granted' ? 'resubscribe' : 'ask';
}

export async function pushIdFor(endpoint: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return 'ps_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const localGet = (): { id: string } | null => { try { return JSON.parse(localStorage.getItem(KEYS.pushDevice) || 'null'); } catch { return null; } };
const localSet = (id: string) => { try { localStorage.setItem(KEYS.pushDevice, JSON.stringify({ id, at: Date.now() })); } catch { /* private mode */ } };
const localClear = () => { try { localStorage.removeItem(KEYS.pushDevice); } catch { /* private mode */ } };

export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}
export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
    || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}
export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** On every start, so a changed sw.js reaches every device. Never throws. */
export function registerCoachServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(COACH_SW_URL, { scope: COACH_SW_SCOPE })
    .catch((e) => console.warn('[push] service worker registration failed:', e && e.message));
}
async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration(COACH_SW_SCOPE)) || navigator.serviceWorker.register(COACH_SW_URL, { scope: COACH_SW_SCOPE });
}
async function localSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(COACH_SW_SCOPE);
  return (reg && await reg.pushManager.getSubscription()) || null;
}
async function thisDeviceId(): Promise<string | null> {
  const sub = await localSubscription();
  return sub ? pushIdFor(sub.endpoint) : null;
}
function b64ToBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Macintosh/.test(ua)) return 'Mac';
  return 'This browser';
}
function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London'; } catch { return 'Europe/London'; }
}

export async function currentPushState(sb: SupabaseClient): Promise<PushState> {
  const ok = pushSupported();
  let registeredIds: string[] = [];
  if (ok) {
    const { data, error } = await sb.from('push_subscriptions').select('id').eq('app', 'coach');
    if (error) throw new Error('Couldn’t check this device with the server: ' + error.message);
    registeredIds = (data || []).map((r: { id: string }) => r.id);
  }
  return decidePushState({
    ios: isIos(), standalone: isStandalone(), supported: ok,
    permission: ok ? Notification.permission : 'default',
    hereId: ok ? await thisDeviceId() : null, registeredIds,
  });
}

/**
 * 🚨 `ask` true MUST come from a tap (iOS shows no prompt otherwise); false is
 * the silent re-register, which never prompts. Throws a sentence a person can act on.
 */
export async function registerPushHere(sb: SupabaseClient, userId: string, ask: boolean): Promise<void> {
  if (!pushSupported()) throw new Error('This browser can’t show notifications.');
  const permission = ask ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications were turned off. Coach can’t ask again: turn them on in iPhone Settings → Notifications → BLOC Coach.'
      : 'No answer was given, so nothing was turned on. Tap again when you’re ready.');
  }
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(COACH_VAPID_PUBLIC_KEY) as BufferSource }));
  const newId = await pushIdFor(sub.endpoint);
  const { error } = await sb.from('push_subscriptions').upsert({
    id: newId, user_id: userId, app: 'coach', endpoint: sub.endpoint,
    p256dh: bytesToB64(sub.getKey('p256dh')), auth_key: bytesToB64(sub.getKey('auth')),
    tz: deviceTimeZone(), device_label: deviceLabel(), failed_count: 0,
  }, { onConflict: 'id' });
  if (error) throw new Error('Couldn’t register this device: ' + error.message);
  // A registration iOS replaced is a dead end on the server: remove it.
  const prev = localGet();
  if (prev && prev.id && prev.id !== newId) await sb.from('push_subscriptions').delete().eq('id', prev.id).then(() => {}, () => {});
  localSet(newId);
}

export async function turnOffPushHere(sb: SupabaseClient): Promise<void> {
  const sub = await localSubscription();
  if (!sub) return;
  const { error } = await sb.from('push_subscriptions').delete().eq('id', await pushIdFor(sub.endpoint));
  if (error) throw new Error('Couldn’t turn notifications off: ' + error.message);
  await sub.unsubscribe();
  localClear();
}

/** Before sign-out, so the next person to sign in here isn't sent this coach's pushes. Never blocks sign-out. */
export async function forgetThisPushDevice(sb: SupabaseClient): Promise<void> {
  try { await turnOffPushHere(sb); } catch (e) { console.warn('[push] could not unregister this device on sign-out:', e instanceof Error ? e.message : e); }
}

export async function sendTestPush(sb: SupabaseClient): Promise<{ devices?: number; sent?: number; gone?: number }> {
  const { data, error } = await sb.functions.invoke('bloc-push', { body: { mode: 'test' } });
  if (error) throw new Error('The test couldn’t be sent: ' + error.message);
  return (data || {}) as { devices?: number; sent?: number; gone?: number };
}

/**
 * On every signed-in start. Returns 'ask' when the registration was dropped
 * and iOS wants to ask again: the caller offers one tap to turn back on.
 */
export async function checkPushHealth(sb: SupabaseClient, userId: string): Promise<'ask' | null> {
  try {
    if (!pushSupported()) return null;
    const local = localGet();
    const hereId = await thisDeviceId();
    let hereOnServer = false;
    if (hereId && !local) {
      const { data } = await sb.from('push_subscriptions').select('id').eq('id', hereId);
      hereOnServer = !!(data && data.length);
    }
    const verdict = decidePushHealth({ supported: true, localId: local?.id ?? null, hereId, hereOnServer, permission: Notification.permission });
    if (verdict === 'adopt' && hereId) { localSet(hereId); return null; }
    if (verdict === 'none' || verdict === 'ok') return null;
    await sb.from('push_subscriptions').delete().eq('id', local!.id).then(() => {}, () => {});
    if (verdict === 'resubscribe') {
      try { await registerPushHere(sb, userId, false); return null; } catch { /* ask instead */ }
    }
    localClear(); // asked once; declining doesn't nag every start
    return 'ask';
  } catch (e) {
    console.warn('[push] health check failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ── The five switches (coach_notification_prefs, 0031) ──────────────────
export type PrefKey = 'session_requests' | 'check_ins' | 'notes_back' | 'client_unlinked' | 'daily_digest';
export type Prefs = Record<PrefKey, boolean>;
export const PREF_KEYS: PrefKey[] = ['session_requests', 'check_ins', 'notes_back', 'client_unlinked', 'daily_digest'];
/** No row is every switch on (0031's push_coach_wants). */
export const DEFAULT_PREFS: Prefs = { session_requests: true, check_ins: true, notes_back: true, client_unlinked: true, daily_digest: true };

export async function loadPrefs(sb: SupabaseClient, coachId: string): Promise<Prefs> {
  const { data, error } = await sb.from('coach_notification_prefs').select(PREF_KEYS.join(', ')).eq('coach_id', coachId).maybeSingle();
  if (error) throw new Error('Couldn’t load your notification settings: ' + error.message);
  return { ...DEFAULT_PREFS, ...((data as Partial<Prefs> | null) ?? {}) };
}

/**
 * 🚨 Update, then insert when there was no row: never `.upsert()`. 0031 grants
 * UPDATE on the switch columns only, never coach_id, and supabase-js's upsert
 * asks for UPDATE on every column it sends (MIGRATION-LESSONS §72).
 */
export async function savePref(sb: SupabaseClient, coachId: string, key: PrefKey, value: boolean): Promise<void> {
  const at = new Date().toISOString();
  const { data, error } = await sb.from('coach_notification_prefs').update({ [key]: value, updated_at: at }).eq('coach_id', coachId).select('coach_id');
  if (error) throw new Error('Couldn’t save that: ' + error.message);
  if (data && data.length) return;
  const { error: insErr } = await sb.from('coach_notification_prefs').insert({ coach_id: coachId, [key]: value, updated_at: at });
  if (insErr) throw new Error('Couldn’t save that: ' + insErr.message);
}
