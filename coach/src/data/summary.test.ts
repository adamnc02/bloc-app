// Coach v0.1 (TECHNICAL §139): the Clients list's rows, at the CLIENT's local
// today, over the fixture clients built from the tracked demo dataset.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { buildFixtureClients, DEMO_ANCHOR } from './fixtures';
import { cycleAt, linkStatusOf, displayName, summarise } from './summary';
import { decodeClientState, localDateIn } from '@/lib/clientState';
import type { ClientBundle } from './types';

const demo = JSON.parse(readFileSync(new URL('../../../bloc-demo-data.json', import.meta.url), 'utf8'));
const { anchor, now, clients } = buildFixtureClients(demo);
const row = (id: string) => summarise(clients.find((c) => c.card.id === id)!, now);

describe('the client’s local today', () => {
  it('is the tracked demo’s anchor, 2 Aug 2026', () => expect(anchor).toBe(DEMO_ANCHOR));
  it('differs by zone at the same instant', () => {
    expect(localDateIn('Europe/London', now)).toBe('2026-08-02');
    expect(localDateIn('Pacific/Auckland', now)).toBe('2026-08-03');
  });
  it('falls back to UTC for an unknown zone', () => expect(localDateIn('Not/AZone', now)).toBe('2026-08-02'));
});

describe('rows at the anchor', () => {
  it('Maya: the coach’s cycle, week 8 of 14, weigh-ins for the sparkline', () => {
    const r = row('maya');
    expect(r.cycleText).toBe('Weight Loss 2026 · week 8 of 14');
    expect(r.weights.length).toBeGreaterThan(1);
    expect(r.weights.every((w) => w.date <= '2026-08-02')).toBe(true);
    expect(r.staleSync).toBe(false);
  });
  it('Tom: his own cycle, two weeks behind, and stale at 60h', () => {
    const r = row('tom');
    expect(r.cycleText).toBe('Own cycle · week 6 of 14');
    expect(r.staleSync).toBe(true);
  });
  it('Grace (Auckland): week 1, because it is already 3 Aug for her', () => {
    const r = row('grace');
    expect(r.clientToday).toBe('2026-08-03');
    expect(r.cycleText).toBe('Own cycle · week 1 of 14');
  });
  it('CONTROL: judged at the coach’s London date, Grace has not started', () => {
    const g = clients.find((c) => c.card.id === 'grace')!;
    expect(cycleAt(g.snapshot!.state, '2026-08-02')).toBeNull();
  });
  it('the rest: waiting, invited, unlinked, in person', () => {
    expect(row('ben').cycleText).toBe('Linked · waiting for their first sync');
    expect(row('sam').status).toBe('invited');
    expect(row('leah').status).toBe('unlinked');
    expect(row('eileen').status).toBe('not-on-app');
  });
});

describe('link status and name', () => {
  const base: ClientBundle = { card: { id: 'x', firstName: 'Card', surname: 'Name', email: null, phone: null, notes: null, createdAt: '' }, link: null, invite: null, profileName: null, snapshot: null, snapshotError: null };
  const active = { clientId: 'u', status: 'active' as const, photoConsent: false, linkedAt: null, endedAt: null };
  const invite = { expiresAt: '2026-08-09T00:00:00Z', createdAt: '2026-08-02T00:00:00Z' };
  it('active beats a live invite; an invite beats an ended link', () => {
    expect(linkStatusOf({ ...base, link: active, invite })).toBe('linked');
    expect(linkStatusOf({ ...base, link: { ...active, status: 'ended' }, invite })).toBe('invited');
    expect(linkStatusOf({ ...base, link: { ...active, status: 'ended' } })).toBe('unlinked');
  });
  it('once linked, the client’s own BLOC name wins', () => {
    const p = { first: 'Own', surname: 'Name', preferred: null };
    expect(displayName({ ...base, link: active, profileName: p })).toBe('Own Name');
    expect(displayName({ ...base, profileName: p })).toBe('Card Name');
  });
});

describe('decoding an upload', () => {
  const json = JSON.stringify({ macrocycles: [], bodyLogs: [{ date: '2026-08-01', weight: 180 }] });
  const hex = '\\x' + gzipSync(json).toString('hex');
  const hash = createHash('sha256').update(json).digest('hex');
  it('inflates, checks the hash and normalises', async () => {
    const s = await decodeClientState(hex, hash);
    expect(s.bodyLogs?.[0].weight).toBe(180);
  });
  it('CONTROL: refuses an upload that doesn’t match its hash', async () => {
    await expect(decodeClientState(hex, '0'.repeat(64))).rejects.toThrow(/hash/);
  });
});

describe('initials', async () => {
  const { initials } = await import('@/lib/format');
  it('take the first letter of each word, skipping punctuation', () => {
    expect(initials('Work (test client)')).toBe('WT');
    expect(initials('Maya Okafor')).toBe('MO');
    expect(initials('  ')).toBe('');
  });
});

describe('SHA-256 without crypto.subtle (a LAN-IP dev build is not a secure origin)', async () => {
  const { sha256HexSync } = await import('@/lib/sha256');
  const node = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
  it('equals Node’s for empty, one-block, multi-block and non-ASCII input', () => {
    for (const t of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(1000), 'Weight Loss 2026 · week 8 — ¼″ 🏋️', '{"bodyLogs":[{"weight":180}]}']) {
      expect(sha256HexSync(t)).toBe(node(t));
    }
  });
  it('a whole demo state hashes the same', () => {
    const big = JSON.stringify(demo);
    expect(sha256HexSync(big)).toBe(node(big));
  });
});

describe('decoding on a page with no crypto.subtle (a phone on http://<LAN-IP>)', () => {
  it('still inflates, checks the hash and refuses a bad one', async () => {
    const { vi } = await import('vitest');
    const json = JSON.stringify({ bodyLogs: [{ date: '2026-08-01', weight: 181 }] });
    const hex = '\\x' + gzipSync(json).toString('hex');
    const hash = createHash('sha256').update(json).digest('hex');
    vi.stubGlobal('crypto', {});
    try {
      expect((await decodeClientState(hex, hash)).bodyLogs?.[0].weight).toBe(181);
      await expect(decodeClientState(hex, '0'.repeat(64))).rejects.toThrow(/hash/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
