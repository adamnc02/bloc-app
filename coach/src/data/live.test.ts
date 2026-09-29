// Coach v0.5 (TECHNICAL §152): every live repo call throws a readable Error,
// and a request refused for an expired token refreshes and retries once.
import { describe, expect, it, vi } from 'vitest';
import type { CoachRepo } from './types';
import { hardened, toError } from './live';

const pgErr = (code: string, message: string) => ({ code, message, details: null, hint: null });

describe('the live repo', () => {
  it('a Supabase error object becomes an Error with its message (control: String() gives [object Object])', () => {
    const raw = pgErr('42501', 'permission denied for table diary_series');
    expect(String(raw)).toBe('[object Object]');
    expect(toError(raw).message).toBe('permission denied for table diary_series');
  });
  it('an expired token: refresh, then the call is retried once', async () => {
    const auth = { getSession: vi.fn(async () => ({})), refreshSession: vi.fn(async () => ({})) };
    let n = 0;
    const repo = { kind: 'live', now: () => 0, loadDiary: async () => { if (n++ === 0) throw pgErr('PGRST301', 'JWT expired'); return 'ok'; } } as unknown as CoachRepo;
    await expect(hardened({ auth } as never, repo).loadDiary()).resolves.toBe('ok');
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });
  it('any other error is not retried, and is readable', async () => {
    const auth = { getSession: vi.fn(async () => ({})), refreshSession: vi.fn(async () => ({})) };
    const repo = { kind: 'live', now: () => 0, loadDiary: async () => { throw pgErr('23505', 'duplicate key'); } } as unknown as CoachRepo;
    await expect(hardened({ auth } as never, repo).loadDiary()).rejects.toThrow('duplicate key');
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });
});
