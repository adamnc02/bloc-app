// Coach v0.9 (TECHNICAL §158): the pure parts of Coach's push, as BLOC's verify-push.mjs holds BLOC's.
import { describe, expect, it } from 'vitest';
import { decidePushHealth, decidePushState, pushIdFor } from './push';
import { openTarget, pushRoute } from './intent';

describe('decidePushState: six honest states', () => {
  const base = { ios: true, standalone: true, supported: true, permission: 'granted' as NotificationPermission, hereId: 'ps_x', registeredIds: ['ps_x'] };
  it('on needs the SERVER\'s row, not just the browser\'s subscription', () => {
    expect(decidePushState(base)).toBe('on');
    expect(decidePushState({ ...base, registeredIds: [] })).toBe('off');
    expect(decidePushState({ ...base, hereId: null })).toBe('off');
  });
  it('an iPhone Safari tab is needs-install, before unsupported (PushManager is absent there)', () => {
    expect(decidePushState({ ...base, standalone: false, supported: false })).toBe('needs-install');
    expect(decidePushState({ ...base, ios: false, supported: false })).toBe('unsupported');
  });
  it('denied and ask', () => {
    expect(decidePushState({ ...base, permission: 'denied' })).toBe('denied');
    expect(decidePushState({ ...base, permission: 'default' })).toBe('ask');
  });
});

describe('decidePushHealth (BLOC §113)', () => {
  const h = (o: Partial<Parameters<typeof decidePushHealth>[0]>) => decidePushHealth({ supported: true, localId: null, hereId: null, hereOnServer: false, permission: 'granted', ...o });
  it('every verdict', () => {
    expect(h({})).toBe('none');
    expect(h({ hereId: 'ps_a', hereOnServer: true })).toBe('adopt');
    expect(h({ localId: 'ps_a', hereId: 'ps_a' })).toBe('ok');
    expect(h({ localId: 'ps_a', hereId: 'ps_b' })).toBe('resubscribe');
    expect(h({ localId: 'ps_a', hereId: null, permission: 'default' })).toBe('ask');
    expect(h({ supported: false, localId: 'ps_a' })).toBe('none');
  });
});

describe('the row id', () => {
  it('is ps_ + the FULL sha-256 of the endpoint (0019\'s CHECK)', async () => {
    const id = await pushIdFor('https://push.example/abc');
    expect(id).toMatch(/^ps_[0-9a-f]{64}$/);
    expect(await pushIdFor('https://push.example/abc')).toBe(id);
  });
});

describe('where a tap goes', () => {
  it('requests, check-ins and notes back: Today, which does the item\'s button', () => {
    expect(pushRoute('request:3f2a')).toBe('/today?push=request%3A3f2a');
    expect(pushRoute('checkin:s1')).toBe('/today?push=checkin%3As1');
    expect(pushRoute('note:s2')).toBe('/today?push=note%3As2');
  });
  it('an unlink: that client\'s Profile; the digest: Today; the test: stays', () => {
    expect(pushRoute('unlinked:card-1')).toBe('/clients/card-1/profile');
    expect(pushRoute('digest:2026-10-01')).toBe('/today');
    expect(pushRoute('coach-test')).toBeNull();
    expect(pushRoute('today')).toBe('/today');
  });
  it('only known shapes are destinations', () => {
    expect(openTarget('request:abc')).toBe('request:abc');
    expect(openTarget('today')).toBe('today');
    expect(openTarget('coach:pub:abc')).toBeNull();   // BLOC's, never Coach's
    expect(openTarget('request:../../x')).toBeNull();
    expect(openTarget(42)).toBeNull();
  });
});
