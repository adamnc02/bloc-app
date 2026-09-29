// ═══════════════════════════════════════════════════════════════════════
// Reading a client's upload, `client_state` (BLOC v8.38, TECHNICAL §130;
// super-duper-octo-barnacle docs/SUPABASE.md → "how the two apps talk").
//
// BLOC uploads its whole `state` as compact JSON, gzipped, with the sha-256
// hex of the UNCOMPRESSED JSON and the device's IANA zone. PostgREST returns
// the bytea as its hex text form, `\x1f8b…`.
//
// 🚨 The coach evaluates a client at THE CLIENT'S local "today" (their `tz`),
//    never the coach's own date A coach
//    in London at 08:00 on Monday is looking at a client in Auckland whose
//    Monday is already over. Every engine call gets `{ today: clientToday }`.
// ═══════════════════════════════════════════════════════════════════════
import { normaliseState, type BlocState } from '@engine';
import { sha256HexSync } from './sha256';

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('\\x') ? hex.slice(2) : hex;
  if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('not a hex bytea');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export async function gunzipText(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** SHA-256 hex. `crypto.subtle` only exists on a secure origin; a LAN-IP dev build uses the plain-JS version (sha256.ts). */
export async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return sha256HexSync(text);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * The upload's state, normalised exactly as BLOC's load() does. Refuses an
 * upload whose content doesn't match its own `state_hash`: a truncated or
 * mis-encoded row must never reach the engine as if it were the client.
 */
export async function decodeClientState(stateGzHex: string, stateHash: string): Promise<BlocState> {
  const json = await gunzipText(hexToBytes(stateGzHex));
  const hash = await sha256Hex(json);
  if (hash !== stateHash) throw new Error('the upload does not match its hash');
  return normaliseState(JSON.parse(json));
}

/** A zone's calendar date at an instant, 'YYYY-MM-DD'. An unknown zone falls back to UTC. */
export function localDateIn(tz: string | null | undefined, atMs: number): string {
  const fmt = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(atMs));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  try { return fmt(tz || 'UTC'); } catch { return fmt('UTC'); }
}
