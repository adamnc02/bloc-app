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
import type { Loose } from '@engine';
import type { AiData, AiDraft, AiEdit, AiOriginal, AiTool, CoachPublication, Submission } from '@/ai/types';
import type { CardPatch, ClientBundle, ClientCard, ClientSnapshot, CoachProfile, CoachRepo, NewClient, NewInvite, PlanDraft, PlanDraftBody } from './types';
import type { Template, TemplateBody } from '@/plan/templates';
import { liveDiary } from './liveDiary';

const CARD_COLS = 'id, first_name, surname, email, phone, notes, created_at';

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
    email: str(r.email), phone: str(r.phone), notes: str(r.notes), createdAt: String(r.created_at ?? ''),
  };
}

/** Splits "First Last" for the card; everything after the first word is the surname. */
export function splitName(name: string): { first: string; surname: string | null } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? '', surname: parts.slice(1).join(' ') || null };
}

/** An invite code as the client types it: `XXXX-XXXX` (0022's 8 characters). */
export const formatInviteCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

const DRAFT_COLS = 'id, client_record_id, tool, macro_id, original, edited, edited_at, publication_id, created_at';

export function toDraft(r: Row): AiDraft {
  return {
    id: String(r.id), cardId: String(r.client_record_id), tool: r.tool as AiTool, macroId: str(r.macro_id),
    original: r.original as AiOriginal, edited: (r.edited ?? null) as AiEdit | null, editedAt: str(r.edited_at),
    publicationId: str(r.publication_id), createdAt: String(r.created_at),
  };
}
function toPublication(r: Row, ack: Row | undefined): CoachPublication {
  return {
    id: String(r.id), seq: Number(r.seq), type: String(r.type), payload: (r.payload ?? {}) as Loose, supersedes: str(r.supersedes),
    createdAt: String(r.created_at),
    ack: ack ? { status: ack.status as NonNullable<CoachPublication['ack']>['status'], note: str(ack.note) } : null,
  };
}
function toPlanDraft(r: Row): PlanDraft {
  return { id: String(r.id), cardId: String(r.client_record_id), macroId: String(r.macro_id ?? ''), body: r.body as PlanDraftBody, updatedAt: String(r.updated_at) };
}
function toTemplate(r: Row, appliedCount: number, appliedLast90: number): Template {
  return {
    id: String(r.id), kind: r.kind as Template['kind'], name: String(r.name), summary: str(r.summary), body: r.body as TemplateBody,
    starred: !!r.starred, createdAt: String(r.created_at), appliedCount, appliedLast90,
  };
}
async function blobToBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// A decoded upload, kept per (user, hash): the list reloads often and a
// year of state is ~100 KB of gzip to inflate and hash each time.
const decoded = new Map<string, ClientSnapshot['state']>();

/**
 * Supabase's errors are plain objects (`{code, message, details, hint}`), so a
 * screen's `e instanceof Error ? e.message : String(e)` showed "[object Object]".
 * Every repo call throws a real Error with the server's message.
 */
export function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; code?: unknown; details?: unknown };
    const msg = [o.message, o.details].filter((x) => typeof x === 'string' && x).join(': ');
    const err = new Error(msg || JSON.stringify(e));
    (err as Error & { code?: unknown }).code = o.code;
    return err;
  }
  return new Error(String(e));
}
/** PostgREST's "JWT expired" / "invalid JWT" (PGRST301 / PGRST303), or any 401. */
const isAuthError = (e: unknown) => {
  const o = (e ?? {}) as { code?: unknown; status?: unknown; message?: unknown };
  return o.code === 'PGRST301' || o.code === 'PGRST303' || o.status === 401 || (typeof o.message === 'string' && /JWT|401/i.test(o.message));
};

/**
 * 🚨 A tab left in the background past the access token's hour came back with
 * every request refused (401): the reload on return ran before supabase-js
 * refreshed the token. Every call first asks for the session (getSession
 * refreshes an expired token), and an auth error refreshes and retries once.
 */
export function hardened(sb: Pick<SupabaseClient, "auth">, repo: CoachRepo): CoachRepo {
  const out: Record<string, unknown> = { ...repo };
  for (const [k, v] of Object.entries(repo)) {
    if (typeof v !== 'function' || k === 'now' || k === 'watchRequests') continue;
    out[k] = async (...args: unknown[]) => {
      await sb.auth.getSession();
      try {
        return await (v as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (e) {
        if (!isAuthError(e)) throw toError(e);
        await sb.auth.refreshSession();
        try { return await (v as (...a: unknown[]) => Promise<unknown>)(...args); } catch (e2) { throw toError(e2); }
      }
    };
  }
  return out as unknown as CoachRepo;
}

export function createLiveRepo(sb: SupabaseClient, profile: CoachProfile, onProfile: (p: CoachProfile) => void): CoachRepo {
  return hardened(sb, createLiveRepoInner(sb, profile, onProfile));
}

function createLiveRepoInner(sb: SupabaseClient, profile: CoachProfile, onProfile: (p: CoachProfile) => void): CoachRepo {
  let current = profile;
  return {
    ...liveDiary(sb, () => current.coachId),
    kind: 'live',
    now: () => Date.now(),

    async loadClients() {
      const [cards, links, invites] = await Promise.all([
        sb.from('client_records').select(CARD_COLS).is('archived_at', null).order('created_at'),
        sb.from('coach_clients').select('client_id, client_record_id, status, photo_consent, linked_at, ended_at').eq('coach_id', current.coachId),
        sb.from('invite_codes').select('client_record_id, expires_at, created_at').eq('coach_id', current.coachId).is('used_at', null),
      ]);
      for (const r of [cards, links, invites]) if (r.error) throw r.error;

      const linkByCard = new Map<string, Row>();
      const endedByCard = new Map<string, string>();
      for (const l of (links.data ?? []) as Row[]) {
        const e = str(l.ended_at);
        const k = String(l.client_record_id);
        if (e && (!endedByCard.has(k) || e > endedByCard.get(k)!)) endedByCard.set(k, e);
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
          lastEndedAt: endedByCard.get(card.id) ?? null,
        };
      });
    },

    async addClient(input: NewClient) {
      const { first, surname } = splitName(input.name);
      const contact = input.contact.trim();
      const isEmail = contact.includes('@');
      const { data, error } = await sb.from('client_records')
        .insert({ coach_id: current.coachId, first_name: first, surname, email: isEmail ? contact : null, phone: isEmail ? null : contact || null })
        .select(CARD_COLS).single();
      if (error) throw error;
      return toCard(data as Row);
    },

    async createInvite(cardId: string): Promise<NewInvite> {
      const { data, error } = await sb.rpc('create_invite', { p_client_record_id: cardId });
      if (error) throw error;
      const r = data as Row;
      return { code: formatInviteCode(String(r.code)), expiresAt: String(r.expires_at) };
    },

    async updateCard(cardId: string, patch: CardPatch) {
      const row: Row = {};
      if (patch.firstName !== undefined) row.first_name = patch.firstName;
      if (patch.surname !== undefined) row.surname = patch.surname;
      if (patch.email !== undefined) row.email = patch.email;
      if (patch.phone !== undefined) row.phone = patch.phone;
      if (patch.notes !== undefined) row.notes = patch.notes;
      const { data, error } = await sb.from('client_records').update(row).eq('id', cardId).select(CARD_COLS).single();
      if (error) throw error;
      return toCard(data as Row);
    },

    async endLink(cardId: string) {
      const { error } = await sb.rpc('end_link', { p_client_record_id: cardId });
      if (error) throw error;
    },

    async loadAi(cardId: string, clientId: string | null): Promise<AiData> {
      const [drafts, pubs, subs] = await Promise.all([
        sb.from('coach_ai_drafts').select(DRAFT_COLS).eq('client_record_id', cardId).order('created_at'),
        sb.from('publications').select('id, seq, type, payload, supersedes, created_at').eq('client_record_id', cardId).in('type', ['ai_response', 'note_reply', 'photo_request']).order('seq'),
        // A coach who is also someone's client sees their own submissions too: filter to this coach.
        clientId
          ? sb.from('client_submissions').select('id, kind, publication_id, body, created_at').eq('coach_id', current.coachId).eq('client_id', clientId).order('created_at')
          : Promise.resolve({ data: [] as Row[], error: null }),
      ]);
      for (const r of [drafts, pubs, subs]) if (r.error) throw r.error;
      const pubRows = (pubs.data ?? []) as Row[];
      const acks = new Map<string, Row>();
      if (pubRows.length) {
        const a = await sb.from('publication_acks').select('publication_id, status, note').in('publication_id', pubRows.map((p) => String(p.id)));
        if (a.error) throw a.error;
        for (const r of (a.data ?? []) as Row[]) acks.set(String(r.publication_id), r);
      }
      return {
        drafts: ((drafts.data ?? []) as Row[]).map(toDraft),
        publications: pubRows.map((p) => toPublication(p, acks.get(String(p.id)))),
        submissions: ((subs.data ?? []) as Row[]).map((r) => ({
          id: String(r.id), kind: r.kind as Submission['kind'], publicationId: str(r.publication_id), body: (r.body ?? {}) as Loose, createdAt: String(r.created_at),
        })),
      };
    },

    async saveAiDraft(cardId, tool, macroId, original) {
      const { data, error } = await sb.from('coach_ai_drafts')
        .insert({ coach_id: current.coachId, client_record_id: cardId, tool, macro_id: macroId, original })
        .select(DRAFT_COLS).single();
      if (error) throw error;
      return toDraft(data as Row);
    },

    async saveAiEdit(draftId, edited, publicationId) {
      const row: Row = { edited, edited_at: new Date().toISOString() };
      if (publicationId) row.publication_id = publicationId;
      const { data, error } = await sb.from('coach_ai_drafts').update(row).eq('id', draftId).select(DRAFT_COLS).single();
      if (error) throw error;
      return toDraft(data as Row);
    },

    async publish(cardId, type, payload, supersedes) {
      const { data, error } = await sb.from('publications')
        .insert({ coach_id: current.coachId, client_record_id: cardId, type, payload, supersedes })
        .select('id, seq, type, payload, supersedes, created_at').single();
      if (error) throw error;
      return toPublication(data as Row, undefined);
    },

    async loadCardPublications(cardId) {
      const pubs = await sb.from('publications').select('id, seq, type, payload, supersedes, created_at').eq('client_record_id', cardId).order('seq');
      if (pubs.error) throw pubs.error;
      const rows = (pubs.data ?? []) as Row[];
      const acks = new Map<string, Row>();
      if (rows.length) {
        const a = await sb.from('publication_acks').select('publication_id, status, note').in('publication_id', rows.map((p) => String(p.id)));
        if (a.error) throw a.error;
        for (const r of (a.data ?? []) as Row[]) acks.set(String(r.publication_id), r);
      }
      return rows.map((p) => toPublication(p, acks.get(String(p.id))));
    },

    async loadInbox() {
      const [subs, drafts, pubs, leaves] = await Promise.all([
        sb.from('client_submissions').select('id, client_id, kind, publication_id, body, created_at').eq('coach_id', current.coachId).order('created_at'),
        sb.from('coach_ai_drafts').select(DRAFT_COLS).eq('coach_id', current.coachId).order('created_at'),
        sb.from('publications').select('id, seq, client_record_id, type, payload, supersedes, created_at').eq('coach_id', current.coachId)
          .in('type', ['plan', 'ai_response', 'note_reply', 'photo_request', 'session_log']).order('seq'),
        sb.from('coach_flag_dismissals').select('client_record_id, macro_id, day_key, ex_id, kind, through_week').eq('coach_id', current.coachId),
      ]);
      for (const r of [subs, drafts, pubs, leaves]) if (r.error) throw r.error;
      return {
        submissions: ((subs.data ?? []) as Row[]).map((r) => ({
          id: String(r.id), clientId: String(r.client_id), kind: r.kind as Submission['kind'], publicationId: str(r.publication_id), body: (r.body ?? {}) as Loose, createdAt: String(r.created_at),
        })),
        drafts: ((drafts.data ?? []) as Row[]).map(toDraft),
        publications: ((pubs.data ?? []) as Row[]).map((p) => ({ ...toPublication(p, undefined), cardId: String(p.client_record_id) })),
        leaves: ((leaves.data ?? []) as Row[]).map((r) => ({
          cardId: String(r.client_record_id), macroId: String(r.macro_id), dayKey: String(r.day_key), exId: String(r.ex_id),
          kind: r.kind === 'missed' ? 'missed' : 'too_hard', throughWeek: Number(r.through_week),
        })),
      };
    },

    async leaveFlag(l) {
      const { error } = await sb.from('coach_flag_dismissals').insert({
        coach_id: current.coachId, client_record_id: l.cardId, macro_id: l.macroId, day_key: l.dayKey, ex_id: l.exId, kind: l.kind, through_week: l.throughWeek,
      });
      // Left already (the unique run): nothing to do.
      if (error && error.code !== '23505') throw error;
    },

    async loadPhotos(paths) {
      // 0024 coach_may_view_media(): readable only while the link is active and consent is on.
      return Promise.all(paths.map(async (path) => {
        const { data, error } = await sb.storage.from('client-media').download(path);
        if (error || !data) throw new Error(`Couldn’t read a photo (${error?.message ?? 'no data'})`);
        return { mediaType: data.type || 'image/jpeg', base64: await blobToBase64(data) };
      }));
    },

    async loadPlan(cardId) {
      const [pubs, drafts] = await Promise.all([
        sb.from('publications').select('id, seq, type, payload, supersedes, created_at').eq('client_record_id', cardId).in('type', ['plan', 'goal_phases', 'ai_response']).order('seq'),
        sb.from('coach_plan_drafts').select('id, client_record_id, macro_id, body, updated_at').eq('client_record_id', cardId),
      ]);
      for (const r of [pubs, drafts]) if (r.error) throw r.error;
      const pubRows = (pubs.data ?? []) as Row[];
      const acks = new Map<string, Row>();
      if (pubRows.length) {
        const a = await sb.from('publication_acks').select('publication_id, status, note').in('publication_id', pubRows.map((p) => String(p.id)));
        if (a.error) throw a.error;
        for (const r of (a.data ?? []) as Row[]) acks.set(String(r.publication_id), r);
      }
      return {
        publications: pubRows.map((p) => toPublication(p, acks.get(String(p.id)))),
        drafts: ((drafts.data ?? []) as Row[]).map(toPlanDraft),
      };
    },

    async savePlanDraft(cardId, macroId, body) {
      const at = new Date().toISOString();
      const upd = await sb.from('coach_plan_drafts').update({ body, updated_at: at })
        .eq('client_record_id', cardId).eq('macro_id', macroId).select('id, client_record_id, macro_id, body, updated_at');
      if (upd.error) throw upd.error;
      if (upd.data && upd.data.length) return toPlanDraft(upd.data[0] as Row);
      const { data, error } = await sb.from('coach_plan_drafts')
        .insert({ coach_id: current.coachId, client_record_id: cardId, macro_id: macroId, body, updated_at: at })
        .select('id, client_record_id, macro_id, body, updated_at').single();
      if (error) throw error;
      return toPlanDraft(data as Row);
    },

    async deletePlanDraft(draftId) {
      const { error } = await sb.from('coach_plan_drafts').delete().eq('id', draftId);
      if (error) throw error;
    },

    async loadTemplates() {
      const since = new Date(Date.now() - 90 * 86400000).toISOString();
      const [t, a] = await Promise.all([
        sb.from('coach_templates').select('id, kind, name, summary, body, starred, created_at').eq('coach_id', current.coachId).order('created_at'),
        sb.from('template_applications').select('template_id, applied_at'),
      ]);
      for (const r of [t, a]) if (r.error) throw r.error;
      const all = new Map<string, number>(), recent = new Map<string, number>();
      for (const r of (a.data ?? []) as Row[]) {
        const id = String(r.template_id);
        all.set(id, (all.get(id) ?? 0) + 1);
        if (String(r.applied_at) >= since) recent.set(id, (recent.get(id) ?? 0) + 1);
      }
      return ((t.data ?? []) as Row[]).map((r) => toTemplate(r, all.get(String(r.id)) ?? 0, recent.get(String(r.id)) ?? 0));
    },

    async saveTemplate(tpl) {
      const { data, error } = await sb.from('coach_templates')
        .insert({ coach_id: current.coachId, kind: tpl.kind, name: tpl.name, summary: tpl.summary, body: tpl.body })
        .select('id, kind, name, summary, body, starred, created_at').single();
      if (error) throw error;
      return toTemplate(data as Row, 0, 0);
    },

    async starTemplate(id, starred) {
      const { error } = await sb.from('coach_templates').update({ starred, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },

    async deleteTemplate(id) {
      const { error } = await sb.from('coach_templates').delete().eq('id', id);
      if (error) throw error;
    },

    async recordApplication(templateId, cardId) {
      const { error } = await sb.from('template_applications').insert({ template_id: templateId, client_record_id: cardId });
      if (error) throw error;
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
