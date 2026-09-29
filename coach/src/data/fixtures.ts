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
import type { ClientBundle, ClientCard, CoachProfile, CoachRepo, NewInvite } from './types';

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
    return { id, firstName: first, surname, email: `${id}@example.com`, phone: null, createdAt: '2026-06-01T09:00:00Z', ...extra };
  };
  const linked = (id: string, since = '2026-06-01T09:00:00Z') => ({ clientId: `user-${id}`, status: 'active' as const, photoConsent: id === 'maya', linkedAt: since, endedAt: null });
  const snap = (state: BlocState, tz: string, hoursAgo: number, rev = 12) => ({
    rev, hash: `fixture-${rev}`, tz, uploadedAt: hoursBefore(now, hoursAgo), appVersion: 'v8.43', state,
  });
  const base = { invite: null, profileName: null, snapshotError: null };

  // Maya: the demo client as is, on a cycle her coach published, synced 2h ago.
  const maya = withCycle(demo, (s) => { for (const m of s.macrocycles || []) m.publishedBy = FIXTURE_COACH.coachId; });
  // Tom: his own cycle, started two weeks after Maya's (so two weeks behind her
  // at any anchor, including a .dev file's final-week one); last synced 60h ago (stale).
  const tom = withCycle(demo, (s) => { for (const m of s.macrocycles || []) if (m.start) m.start = shiftDateStr(m.start, 14); });
  // Grace: in Auckland. Her cycle starts on the day after the anchor, which is
  // already HER today at the fixtures' now, so she's in week 1, not "next cycle".
  const grace = withCycle(demo, (s) => { for (const m of s.macrocycles || []) m.start = shiftDateStr(anchor, 1); });

  const clients: ClientBundle[] = [
    { ...base, card: card('maya', 'Maya Okafor', { phone: '07700 900111' }), link: linked('maya'), snapshot: snap(maya, 'Europe/London', 2) },
    { ...base, card: card('tom', 'Tom Hartley'), link: linked('tom'), snapshot: snap(tom, 'Europe/London', 60) },
    { ...base, card: card('grace', 'Grace Lin'), link: linked('grace'), snapshot: snap(grace, 'Pacific/Auckland', 5) },
    { ...base, card: card('ben', 'Ben Carter'), link: linked('ben', hoursBefore(now, 3)), snapshot: null },
    { ...base, card: card('sam', 'Sam Whitfield'), link: null, snapshot: null,
      invite: { expiresAt: hoursBefore(now, -5 * 24), createdAt: hoursBefore(now, 2 * 24) } },
    { ...base, card: card('leah', 'Leah Brooks'), snapshot: null,
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
  let n = 0;
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
        email: contact.includes('@') ? contact : null, phone: contact.includes('@') ? null : contact,
        createdAt: new Date(built.now).toISOString(),
      };
      clients.push({ card: c, link: null, invite: null, profileName: null, snapshot: null, snapshotError: null });
      return c;
    },
    async createInvite(cardId): Promise<NewInvite> {
      const expiresAt = new Date(built.now + 7 * 86400000).toISOString();
      const c = clients.find((x) => x.card.id === cardId);
      if (c) c.invite = { expiresAt, createdAt: new Date(built.now).toISOString() };
      return { code: formatInviteCode(fakeCode()), expiresAt };
    },
    async updateProfile(displayName, businessName) {
      const p = { ...FIXTURE_COACH, displayName, businessName };
      onProfile(p);
      return p;
    },
  };
}
