// ═══════════════════════════════════════════════════════════════════════
// The dev bypass's clients (TECHNICAL §139).
//
// Under the local-dev bypass (lib/host.ts) Coach has no Supabase client and
// no account. Its clients are built here from BLOC's own demo dataset,
// bloc-demo-data.dev.json when the developer has one (it may carry
// `_devAnchorDate`), else the tracked bloc-demo-data.json, and every one is
// evaluated at the dataset's anchor date, never the machine's clock: the
// demo's figures were engineered against that date (BLOC TECHNICAL §35).
//
// All names are fictional. Nothing here is ever
// sent anywhere: add, invite and profile edits change this page's memory only.
// ═══════════════════════════════════════════════════════════════════════
import { normaliseState, shiftDateStr, type BlocState } from '@engine';
import { formatInviteCode, splitName } from './live';
import type { AiDraft, CoachPublication, Submission } from '@/ai/types';
import type { ClientBundle, ClientCard, CoachProfile, CoachRepo, NewInvite, PlanDraft } from './types';
import { foldPlan } from '@/plan/fold';
import { dayKeys } from '@/plan/doc';
import { macroTemplateOf, workoutTemplateOf, type Template } from '@/plan/templates';

/** bloc-demo-data.json's own "today" (BLOC TECHNICAL §35: Sunday 2 Aug 2026). */
export const DEMO_ANCHOR = '2026-08-02';
/** The fixtures' "now": the anchor at 20:10 UTC (21:10 in London), so a client in Auckland is already on the next day. */
export const fixtureNow = (anchor: string) => Date.parse(`${anchor}T20:10:00Z`);

export const FIXTURE_COACH: CoachProfile = {
  coachId: 'dev-local-coach', displayName: 'Rowan Price', businessName: 'Price Strength Studio', status: 'active',
};

/** Fetches the demo dataset the same way BLOC's bypass does: the .dev copy first, then the tracked one. */
export async function loadDemoData(): Promise<Record<string, unknown>> {
  const get = async (file: string) => {
    const res = await fetch(new URL(`../${file}`, window.location.href.split('#')[0]));
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  };
  try { return await get('bloc-demo-data.dev.json'); } catch { return await get('bloc-demo-data.json'); }
}

const hoursBefore = (now: number, h: number) => new Date(now - h * 3600000).toISOString();

function withCycle(demo: Record<string, unknown>, patch: (s: BlocState) => void): BlocState {
  const s = normaliseState(structuredClone(demo)) as BlocState;
  patch(s);
  return s;
}

/** The fixture clients, built from the demo state at its anchor. Pure given the dataset. */
export function buildFixtureClients(demo: Record<string, unknown>): { anchor: string; now: number; clients: ClientBundle[] } {
  const anchor = typeof demo._devAnchorDate === 'string' ? demo._devAnchorDate : DEMO_ANCHOR;
  const now = fixtureNow(anchor);
  const card = (id: string, name: string, extra: Partial<ClientCard> = {}): ClientCard => {
    const { first, surname } = splitName(name);
    return { id, firstName: first, surname, email: `${id}@example.com`, phone: null, notes: null, createdAt: '2026-06-01T09:00:00Z', ...extra };
  };
  const linked = (id: string, since = '2026-06-01T09:00:00Z') => ({ clientId: `user-${id}`, status: 'active' as const, photoConsent: id === 'maya', linkedAt: since, endedAt: null });
  const snap = (state: BlocState, tz: string, hoursAgo: number, rev = 12) => ({
    rev, hash: `fixture-${rev}`, tz, uploadedAt: hoursBefore(now, hoursAgo), appVersion: 'v8.43', state,
  });
  const base = { invite: null, profileName: null, snapshotError: null, lastEndedAt: null };

  // Maya: the demo client as is, on a cycle her coach published, synced 2h ago.
  const maya = withCycle(demo, (s) => { for (const m of s.macrocycles || []) m.publishedBy = FIXTURE_COACH.coachId; });
  // Tom: his own cycle, started two weeks after Maya's (so two weeks behind her
  // at any anchor, including a .dev file's final-week one); last synced 60h ago (stale).
  const tom = withCycle(demo, (s) => { for (const m of s.macrocycles || []) if (m.start) m.start = shiftDateStr(m.start, 14); });
  // Grace: in Auckland. Her cycle starts on the day after the anchor, which is
  // already HER today at the fixtures' now, so she's in week 1, not "next cycle".
  const grace = withCycle(demo, (s) => { for (const m of s.macrocycles || []) m.start = shiftDateStr(anchor, 1); });

  // Priya: microcycles on with one-week mesocycles, so each session's A and B
  // both fall in the same week (the grid's A/B rows, every week filled).
  const priya = withCycle(demo, (s) => { for (const m of s.macrocycles || []) { m.weeksPerMeso = 1; m.useMicrocycles = true; m.publishedBy = FIXTURE_COACH.coachId; } });

  const clients: ClientBundle[] = [
    { ...base, card: card('maya', 'Maya Okafor', { phone: '07700 900111', notes: 'Shift work: trains early on weekdays.' }), link: linked('maya'), snapshot: snap(maya, 'Europe/London', 2) },
    { ...base, card: card('tom', 'Tom Hartley'), link: linked('tom'), snapshot: snap(tom, 'Europe/London', 60) },
    { ...base, card: card('grace', 'Grace Lin'), link: linked('grace'), snapshot: snap(grace, 'Pacific/Auckland', 5) },
    { ...base, card: card('priya', 'Priya Shah'), link: linked('priya'), snapshot: snap(priya, 'Europe/London', 6) },
    { ...base, card: card('ben', 'Ben Carter'), link: linked('ben', hoursBefore(now, 3)), snapshot: null },
    { ...base, card: card('sam', 'Sam Whitfield'), link: null, snapshot: null,
      invite: { expiresAt: hoursBefore(now, -5 * 24), createdAt: hoursBefore(now, 2 * 24) } },
    { ...base, card: card('leah', 'Leah Brooks'), snapshot: null, lastEndedAt: hoursBefore(now, 72),
      link: { clientId: 'user-leah', status: 'ended', photoConsent: false, linkedAt: '2026-06-01T09:00:00Z', endedAt: hoursBefore(now, 72) } },
    { ...base, card: card('eileen', 'Eileen Moss', { email: null, phone: '01632 960 555' }), link: null, snapshot: null },
  ];
  return { anchor, now, clients };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function fakeCode(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => ALPHABET[x % 32]).join('');
}

export function createFixtureRepo(demo: Record<string, unknown>, onProfile: (p: CoachProfile) => void): CoachRepo & { anchor: string } {
  const built = buildFixtureClients(demo);
  const clients = built.clients;
  let n = 0, tick = 0, seq = 0;
  const ai = {
    drafts: [] as AiDraft[],
    pubs: [] as (CoachPublication & { cardId: string })[],
    subs: fixtureSubmissions(built.anchor, built.now),
  };
  const plan = { drafts: [] as PlanDraft[], templates: fixtureTemplates(clients.find((c) => c.card.id === 'maya'), built.now) };
  return {
    kind: 'fixture',
    anchor: built.anchor,
    now: () => built.now,
    async loadClients() { return clients.map((c) => ({ ...c })); },
    async addClient(input) {
      const { first, surname } = splitName(input.name);
      const contact = input.contact.trim();
      const c: ClientCard = {
        id: `new-${++n}`, firstName: first, surname,
        email: contact.includes('@') ? contact : null, phone: contact.includes('@') ? null : contact, notes: null,
        createdAt: new Date(built.now).toISOString(),
      };
      clients.push({ card: c, link: null, invite: null, profileName: null, snapshot: null, snapshotError: null, lastEndedAt: null });
      return c;
    },
    async createInvite(cardId): Promise<NewInvite> {
      const expiresAt = new Date(built.now + 7 * 86400000).toISOString();
      const c = clients.find((x) => x.card.id === cardId);
      if (c) c.invite = { expiresAt, createdAt: new Date(built.now).toISOString() };
      return { code: formatInviteCode(fakeCode()), expiresAt };
    },
    async updateCard(cardId, patch) {
      const c = clients.find((x) => x.card.id === cardId);
      if (!c) throw new Error('No such client');
      if (c.link?.status === 'active' && (patch.firstName !== undefined || patch.surname !== undefined || patch.email !== undefined || patch.phone !== undefined)) {
        throw new Error('A linked client’s name and contact are theirs to change');
      }
      c.card = { ...c.card, ...patch };
      return c.card;
    },
    async endLink(cardId) {
      const c = clients.find((x) => x.card.id === cardId);
      if (c?.link) c.link = { ...c.link, status: 'ended', photoConsent: false, endedAt: new Date(built.now).toISOString() };
      if (c) c.snapshot = null;
    },
    async updateProfile(displayName, businessName) {
      const p = { ...FIXTURE_COACH, displayName, businessName };
      onProfile(p);
      return p;
    },

    // AI tools: this page's memory only; nothing is sent anywhere but the model.
    async loadAi(cardId, clientId) {
      return {
        drafts: ai.drafts.filter((d) => d.cardId === cardId).map((d) => ({ ...d })),
        publications: ai.pubs.filter((p) => p.cardId === cardId).map(({ cardId: _c, ...p }) => { void _c; return { ...p }; }),
        submissions: clientId ? ai.subs.filter((x) => x.clientId === clientId).map(({ clientId: _c, ...x }) => { void _c; return { ...x }; }) : [],
      };
    },
    async saveAiDraft(cardId, tool, macroId, original) {
      const d: AiDraft = { id: fakeId(), cardId, tool, macroId, original, edited: null, editedAt: null, publicationId: null, createdAt: new Date(built.now + ++tick * 1000).toISOString() };
      ai.drafts.push(d);
      return { ...d };
    },
    async saveAiEdit(draftId, edited, publicationId) {
      const d = ai.drafts.find((x) => x.id === draftId);
      if (!d) throw new Error('No such draft');
      d.edited = edited;
      d.editedAt = new Date(built.now + ++tick * 1000).toISOString();
      if (publicationId) d.publicationId = publicationId;
      return { ...d };
    },
    async publish(cardId, type, payload, supersedes) {
      const p = { cardId, id: fakeId(), seq: ++seq, type, payload, supersedes, createdAt: new Date(built.now + ++tick * 1000).toISOString(), ack: null };
      ai.pubs.push(p);
      return { ...p };
    },
    async loadPhotos() { return []; },

    // Plan and Library: this page's memory only.
    async loadPlan(cardId) {
      return {
        publications: ai.pubs.filter((p) => p.cardId === cardId && ['plan', 'goal_phases', 'ai_response'].includes(p.type)).map(({ cardId: _c, ...p }) => { void _c; return { ...p }; }),
        drafts: plan.drafts.filter((d) => d.cardId === cardId).map((d) => structuredClone(d)),
      };
    },
    async savePlanDraft(cardId, macroId, body) {
      const at = new Date(built.now + ++tick * 1000).toISOString();
      const d = plan.drafts.find((x) => x.cardId === cardId && x.macroId === macroId);
      if (d) { d.body = structuredClone(body); d.updatedAt = at; return structuredClone(d); }
      const nd: PlanDraft = { id: fakeId(), cardId, macroId, body: structuredClone(body), updatedAt: at };
      plan.drafts.push(nd);
      return structuredClone(nd);
    },
    async deletePlanDraft(id) { plan.drafts = plan.drafts.filter((d) => d.id !== id); },
    async loadTemplates() { return plan.templates.map((t) => structuredClone(t)); },
    async saveTemplate(t) {
      const nt: Template = { ...structuredClone(t), id: fakeId(), starred: false, createdAt: new Date(built.now + ++tick * 1000).toISOString(), appliedCount: 0, appliedLast90: 0 };
      plan.templates.push(nt);
      return structuredClone(nt);
    },
    async starTemplate(id, starred) { const t = plan.templates.find((x) => x.id === id); if (t) t.starred = starred; },
    async deleteTemplate(id) { plan.templates = plan.templates.filter((t) => t.id !== id); },
    async recordApplication(templateId) {
      const t = plan.templates.find((x) => x.id === templateId);
      if (t) { t.appliedCount++; t.appliedLast90++; }
    },
  };
}

/** Two templates to start from under the bypass: Maya's cycle, and its first session. */
function fixtureTemplates(maya: ClientBundle | undefined, now: number): Template[] {
  const st = maya?.snapshot?.state;
  const c = st ? foldPlan({ state: st, publications: [], coachId: FIXTURE_COACH.coachId, since: null })[0] : null;
  if (!c) return [];
  const at = new Date(now - 30 * 86400000).toISOString();
  const m = macroTemplateOf(c.doc);
  const dk = dayKeys(c.doc.macro)[0];
  const w = workoutTemplateOf(c.doc, dk, c.doc.macro.dayLabels[dk.replace(/m[12]$/, '')] || 'Session');
  return [
    { id: 'tpl-cycle', kind: 'macrocycle', name: 'Steady cut, 14 weeks', summary: m.summary, body: m.body, starred: true, createdAt: at, appliedCount: 3, appliedLast90: 2 },
    { id: 'tpl-workout', kind: 'workout', name: `${w.body.label} session`, summary: w.summary, body: w.body, starred: false, createdAt: at, appliedCount: 1, appliedLast90: 1 },
  ];
}

/** Maya asked for a check-in the day before the anchor (a `check_in` row, `body.purpose 'check_in'`, BLOC v8.41). */
function fixtureSubmissions(anchor: string, now: number): (Submission & { clientId: string })[] {
  return [{
    clientId: 'user-maya', id: 'sub-maya-checkin', kind: 'check_in', publicationId: null, createdAt: new Date(now - 26 * 3600000).toISOString(),
    body: { v: 1, purpose: 'check_in', feel: 'Okay', note: 'Hungry in the evenings since the cut dropped. Sleep’s been poor this week.', macro_id: null, sent_on: shiftDateStr(anchor, -1) },
  }];
}

function fakeId(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
