// ═══════════════════════════════════════════════════════════════════════
// Coach's data, from BLOC's live Supabase project (TECHNICAL §139).
//
// Reads are all RLS-scoped to the signed-in coach (0022 `my_coach_id()`, 0023
// `is_active_coach_of()`), so nothing here filters by coach for security; the
// `coach_id` filters only stop a coach who is ALSO someone's client from
// seeing their own link as if it were a client's.
//
// 🚨 A client's name and contact belong to the client once linked (a 0022
//    trigger refuses the coach's change). Coach shows their
//    BLOC profile's name then, and never writes the card's name fields for a
//    linked client.
// ═══════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeClientState } from '@/lib/clientState';
import type { ClientBundle, ClientCard, ClientSnapshot, CoachProfile, CoachRepo, NewClient, NewInvite } from './types';

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function toProfile(r: Row): CoachProfile {
  return {
    coachId: String(r.coach_id),
    displayName: String(r.display_name ?? ''),
    businessName: str(r.business_name),
    status: (r.status as CoachProfile['status']) ?? 'active',
  };
}

/** The signed-in user's coach profile, or null if they haven't made one. */
export async function loadMyProfile(sb: SupabaseClient, userId: string): Promise<CoachProfile | null> {
  const { data, error } = await sb.from('coach_profiles').select('coach_id, display_name, business_name, status').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

/** Signing up in Coach is what makes someone a coach (0022 `create_coach_profile`, idempotent). */
export async function createMyProfile(sb: SupabaseClient, displayName: string, businessName: string | null): Promise<CoachProfile> {
  const { data, error } = await sb.rpc('create_coach_profile', { p_display_name: displayName, p_business_name: businessName });
  if (error) throw error;
  return toProfile(data as Row);
}

function toCard(r: Row): ClientCard {
  return {
    id: String(r.id), firstName: String(r.first_name ?? ''), surname: str(r.surname),
    email: str(r.email), phone: str(r.phone), createdAt: String(r.created_at ?? ''),
  };
}

/** Splits "First Last" for the card; everything after the first word is the surname. */
export function splitName(name: string): { first: string; surname: string | null } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? '', surname: parts.slice(1).join(' ') || null };
}

/** An invite code as the client types it: `XXXX-XXXX` (0022's 8 characters). */
export const formatInviteCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

// A decoded upload, kept per (user, hash): the list reloads often and a
// year of state is ~100 KB of gzip to inflate and hash each time.
const decoded = new Map<string, ClientSnapshot['state']>();

export function createLiveRepo(sb: SupabaseClient, profile: CoachProfile, onProfile: (p: CoachProfile) => void): CoachRepo {
  let current = profile;
  return {
    kind: 'live',
    now: () => Date.now(),

    async loadClients() {
      const [cards, links, invites] = await Promise.all([
        sb.from('client_records').select('id, first_name, surname, email, phone, created_at').is('archived_at', null).order('created_at'),
        sb.from('coach_clients').select('client_id, client_record_id, status, photo_consent, linked_at, ended_at').eq('coach_id', current.coachId),
        sb.from('invite_codes').select('client_record_id, expires_at, created_at').eq('coach_id', current.coachId).is('used_at', null),
      ]);
      for (const r of [cards, links, invites]) if (r.error) throw r.error;

      const linkByCard = new Map<string, Row>();
      for (const l of (links.data ?? []) as Row[]) {
        // A card can have an ended link and, after a re-invite, an active one: the active wins.
        const prev = linkByCard.get(String(l.client_record_id));
        if (!prev || l.status === 'active') linkByCard.set(String(l.client_record_id), l);
      }
      const inviteByCard = new Map<string, Row>();
      for (const i of (invites.data ?? []) as Row[]) inviteByCard.set(String(i.client_record_id), i);

      const active = [...linkByCard.values()].filter((l) => l.status === 'active').map((l) => String(l.client_id));
      const profiles = new Map<string, Row>();
      const snaps = new Map<string, ClientSnapshot | string>();
      if (active.length) {
        const [pr, st] = await Promise.all([
          sb.from('profiles').select('user_id, first_name, surname, preferred_name').in('user_id', active),
          sb.from('client_state').select('user_id, state_rev, state_hash, tz, uploaded_at, app_version').in('user_id', active).order('state_rev', { ascending: false }),
        ]);
        if (pr.error) throw pr.error;
        if (st.error) throw st.error;
        for (const p of (pr.data ?? []) as Row[]) profiles.set(String(p.user_id), p);
        const newest = new Map<string, Row>();
        for (const s of (st.data ?? []) as Row[]) if (!newest.has(String(s.user_id))) newest.set(String(s.user_id), s);
        await Promise.all([...newest.entries()].map(async ([uid, s]) => {
          const hash = String(s.state_hash);
          try {
            let state = decoded.get(`${uid}:${hash}`);
            if (!state) {
              const { data, error } = await sb.from('client_state').select('state_gz').eq('user_id', uid).eq('state_rev', s.state_rev as number).single();
              if (error) throw error;
              state = await decodeClientState(String((data as Row).state_gz), hash);
              decoded.set(`${uid}:${hash}`, state);
            }
            snaps.set(uid, {
              rev: Number(s.state_rev), hash, tz: String(s.tz ?? 'UTC'), uploadedAt: String(s.uploaded_at),
              appVersion: str(s.app_version), state,
            });
          } catch (e) {
            snaps.set(uid, e instanceof Error ? e.message : String(e));
          }
        }));
      }

      return ((cards.data ?? []) as Row[]).map((r): ClientBundle => {
        const card = toCard(r);
        const l = linkByCard.get(card.id);
        const i = inviteByCard.get(card.id);
        const uid = l ? String(l.client_id) : null;
        const p = uid ? profiles.get(uid) : undefined;
        const snap = uid ? snaps.get(uid) : undefined;
        return {
          card,
          link: l ? {
            clientId: String(l.client_id), status: l.status as 'pending' | 'active' | 'ended', photoConsent: !!l.photo_consent,
            linkedAt: str(l.linked_at), endedAt: str(l.ended_at),
          } : null,
          invite: i ? { expiresAt: String(i.expires_at), createdAt: String(i.created_at) } : null,
          profileName: p ? { first: str(p.first_name), surname: str(p.surname), preferred: str(p.preferred_name) } : null,
          snapshot: snap && typeof snap !== 'string' ? snap : null,
          snapshotError: typeof snap === 'string' ? snap : null,
        };
      });
    },

    async addClient(input: NewClient) {
      const { first, surname } = splitName(input.name);
      const contact = input.contact.trim();
      const isEmail = contact.includes('@');
      const { data, error } = await sb.from('client_records')
        .insert({ coach_id: current.coachId, first_name: first, surname, email: isEmail ? contact : null, phone: isEmail ? null : contact || null })
        .select('id, first_name, surname, email, phone, created_at').single();
      if (error) throw error;
      return toCard(data as Row);
    },

    async createInvite(cardId: string): Promise<NewInvite> {
      const { data, error } = await sb.rpc('create_invite', { p_client_record_id: cardId });
      if (error) throw error;
      const r = data as Row;
      return { code: formatInviteCode(String(r.code)), expiresAt: String(r.expires_at) };
    },

    async updateProfile(displayName: string, businessName: string | null) {
      const { data, error } = await sb.from('coach_profiles')
        .update({ display_name: displayName, business_name: businessName })
        .eq('coach_id', current.coachId).select('coach_id, display_name, business_name, status').single();
      if (error) throw error;
      current = toProfile(data as Row);
      onProfile(current);
      return current;
    },
  };
}
