import { useEffect, useId, useMemo, useState } from 'react';
import { CoachShell } from '@/coach/CoachShell';
import { Button, Chip, Field, Hero, Icon, Notice, Page, PageHeader, RowButton, Section, Sheet, SwitchRow, Toast, useEntering, useToast } from '@/components/ui';
import { useCoach } from '@/app/App';
import { settingsBack } from '@/app/router';
import { displayName } from '@/data/summary';
import { initials } from '@/lib/format';
import { getAiKey, setAiKey } from '@/ai/transport';
import { DiarySettingsSections } from '@/coach/diary/DiarySettings';

declare const __COACH_VERSION__: string;
/** Coach's version: coach/package.json, the one place a release bumps it (TECHNICAL §139). */
export const COACH_VERSION = __COACH_VERSION__;

/** The wireframe's five notifications. They're switched on in the release that sends pushes; until then they show off. */
const NOTIFICATIONS: { key: string; title: string; sub: string }[] = [
  { key: 'request', title: 'Session requests', sub: 'As soon as a client asks for a session.' },
  { key: 'check-in', title: 'Check-ins submitted', sub: 'When a client sends a check-in for you to run.' },
  { key: 'note-back', title: 'Notes back', sub: 'When a client replies to advice you published.' },
  { key: 'unlinked', title: 'Client unlinked', sub: 'When a client leaves coaching.' },
  { key: 'digest', title: 'Daily digest', sub: 'Clients newly off track, once a day.' },
];

type SheetKey = 'profile' | 'password' | 'ai' | 'signout' | null;

/**
 * Settings (the wireframe's SettingsScreen, without section badges): the account (sign-in, password, sign out),
 * the coach profile, working hours and days, days off and holidays, linked services (the AI key) and
 * notifications.
 *
 * The AI key stays on this device (ai/transport.ts) and signing out keeps it.
 *
 * 🚨 Sign out is Coach's only: `scope: 'local'` ends THIS device's Coach session and nothing else. The
 *    default, 'global', would revoke every session of the account, BLOC's on every phone included.
 * The password is the account's, shared with BLOC: changing it here changes it there. A Google sign-in has
 * none, so the row isn't shown.
 */
export function SettingsScreen() {
  const { profile, email, provider, repo, signOut, changePassword } = useCoach();
  const ref = useEntering<HTMLDivElement>('settings');
  const toast = useToast();
  const id = useId();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [aiKey, setKey] = useState<string | null>(getAiKey());
  const [keyInput, setKeyInput] = useState('');
  const [name, setName] = useState(profile.displayName);
  const [business, setBusiness] = useState(profile.businessName ?? '');
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fixture = repo.kind === 'fixture';
  const hasPassword = !fixture && provider !== 'google';
  const close = () => { setSheet(null); setError(null); };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const saveProfile = () => act(async () => { await repo.updateProfile(name.trim(), business.trim() || null); close(); toast.show('Profile saved'); });
  const pwBad = pw.next && pw.confirm && pw.next !== pw.confirm ? 'The two passwords don’t match' : pw.next && pw.next.length < 6 ? 'At least 6 characters' : null;
  const savePassword = () => act(async () => { await changePassword(pw.next); setPw({ next: '', confirm: '' }); close(); toast.show('Password changed for BLOC and BLOC Coach'); });

  // Back to the page Settings was opened from, named (a client page: the client's name).
  const back = useMemo(() => settingsBack(), []);
  const [clientName, setClientName] = useState<string | null>(null);
  useEffect(() => {
    if (back.route.name !== 'client') return;
    const cid = back.route.id;
    repo.loadClients().then((bs) => { const b = bs.find((x) => x.card.id === cid); if (b) setClientName(displayName(b)); }).catch(() => {});
  }, [back, repo]);
  const backLabel = back.route.name === 'client' ? clientName ?? 'Client'
    : back.route.name === 'today' ? 'Today' : back.route.name === 'diary' ? 'Diary' : back.route.name === 'library' ? 'Library' : back.route.name === 'session' ? 'In person' : 'Clients';

  const keyHint = aiKey ? aiKey.slice(-4) : null;

  return (
    <CoachShell tab="settings">
      <Page innerRef={ref}>
        <PageHeader
          eyebrow={<>
            <a href={back.href} className="eyebrow eyebrow-link phone-only"><Icon name="chevL" size={14} /> {backLabel}</a>
            <span className="wide-only">Account</span>
          </>}
          title="Settings"
        />
        <Hero style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>{initials(profile.displayName)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="display" style={{ fontSize: 20 }}>{profile.displayName}</div>
            <div className="muted" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{[profile.businessName, email].filter(Boolean).join(' · ') || 'Fixture coach'}</div>
          </div>
          <Chip tone="acc">{COACH_VERSION}</Chip>
        </Hero>

        <div className="grid-2">
          <Section i={2} title="Account" sub="One sign-in for BLOC and BLOC Coach.">
            <div className="card list">
              <RowButton lead="account" title="Sign-in" sub={fixture ? 'Local build · fixture clients, no account' : `${email} · also your BLOC account`} trailing="check" />
              {hasPassword && <RowButton lead="lock" title="Password" sub="The same password in both apps" onClick={() => { setPw({ next: '', confirm: '' }); setError(null); setSheet('password'); }} />}
              {!fixture && (
                <button type="button" className="rowbtn is-danger" onClick={() => setSheet('signout')}>
                  <span className="icon-tile"><Icon name="logout" size={18} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}><b>Sign out</b><small>Of BLOC Coach, on this device</small></span>
                  <span className="chev"><Icon name="chevR" size={22} /></span>
                </button>
              )}
            </div>
            <p className="caption" style={{ marginTop: 10 }}>Clients, diary and templates are kept under your coach ID, separate from your own training in BLOC.</p>
          </Section>

          <Section i={3} title="Coach profile" sub="How clients see you when they link.">
            <div className="card list">
              <RowButton lead="edit" title={profile.displayName} sub={profile.businessName || 'No business name'} onClick={() => { setError(null); setSheet('profile'); }} />
            </div>
          </Section>

          <DiarySettingsSections i={4} />

          <Section i={6} title="Linked services" sub="Runs check-ins, cycle reviews and next cycles. In this version it stays on this device." slot={keyHint ? <Chip tone="good" icon="check">Saved</Chip> : <Chip tone="neutral">Not set</Chip>}>
            <div className="card list">
              <RowButton lead="key" title="Anthropic API key" sub={keyHint ? `Ends ${keyHint} · on this device` : 'Not added. AI tools are off.'} onClick={() => { setKeyInput(''); setSheet('ai'); }} />
            </div>
          </Section>

          <Section i={7} title="Notifications" sub="Push and in-app alerts about your clients. They arrive in the next update, so they’re off for now.">
            <div className="card list">
              {NOTIFICATIONS.map((x, k) => (
                <div key={x.key} style={k ? { borderTop: '1px solid var(--divider)' } : undefined}>
                  <SwitchRow title={x.title} sub={x.sub} checked={false} label={x.title} disabled />
                </div>
              ))}
            </div>
          </Section>
        </div>
      </Page>

      <Sheet open={sheet === 'profile'} onClose={close} title="Coach profile">
        <Field label="Your name" htmlFor={`${id}-n`}><input id={`${id}-n`} className="input" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Business name" htmlFor={`${id}-b`} hint="Optional."><input id={`${id}-b`} className="input" autoComplete="organization" maxLength={120} value={business} onChange={(e) => setBusiness(e.target.value)} /></Field>
        <p className="body-copy" style={{ marginTop: 14 }}>Linked clients see your name in BLOC, under Settings → Coaching.</p>
        {error && <Notice icon="warning" tone="bad" title="Couldn’t save" style={{ marginTop: 14 }}>{error}</Notice>}
        <Button style={{ marginTop: 20 }} disabled={!name.trim() || busy} onClick={saveProfile}>Save profile</Button>
      </Sheet>

      <Sheet open={sheet === 'password'} onClose={close} title="Change password">
        <p className="body-copy">One password for BLOC and BLOC Coach: this changes it in both.</p>
        <div style={{ marginTop: 16 }}>
          <Field label="New password" htmlFor={`${id}-p1`}><input id={`${id}-p1`} className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Confirm new password" htmlFor={`${id}-p2`}><input id={`${id}-p2`} className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        {pwBad && <p className="dy-refusal" role="alert"><Icon name="warning" size={16} /> {pwBad}.</p>}
        {error && <Notice icon="warning" tone="bad" title="Couldn’t change it" style={{ marginTop: 14 }}>{error}</Notice>}
        <Button style={{ marginTop: 20 }} icon="lock" disabled={!pw.next || !pw.confirm || !!pwBad || busy} onClick={savePassword}>Change password</Button>
      </Sheet>

      <Sheet open={sheet === 'ai'} onClose={close} title="Anthropic API key">
        {keyHint && (
          <div className="tile row" style={{ padding: 14 }}>
            <span><span className="caption" style={{ display: 'block' }}>Current key</span><b className="num">sk-ant-…{keyHint}</b></span>
            <Chip tone="good" icon="check">Saved</Chip>
          </div>
        )}
        <div style={{ marginTop: keyHint ? 16 : 0 }}>
          <Field label={keyHint ? 'Replace with a new key' : 'Anthropic API key'} htmlFor={`${id}-k`}>
            <input id={`${id}-k`} className="input num" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
          </Field>
        </div>
        <Notice icon="lock" title="Kept on this device" style={{ marginTop: 16 }}>
          In this version your key stays on this device and isn’t stored on BLOC’s servers. Add it on each device you run AI tools from.
        </Notice>
        {keyHint && <Button variant="danger" size="card" icon="trash" style={{ marginTop: 16 }} onClick={() => { setAiKey(null); setKey(null); close(); toast.show('Key removed from this device'); }}>Remove key</Button>}
        <Button style={{ marginTop: 12 }} disabled={!keyInput.trim()} onClick={() => { setAiKey(keyInput.trim()); setKey(keyInput.trim()); setKeyInput(''); close(); toast.show('Key saved on this device'); }}>Save key</Button>
      </Sheet>

      <Sheet open={sheet === 'signout'} onClose={close} title="Sign out?">
        <p className="body-copy">You’ll be signed out of BLOC Coach on this device. BLOC stays signed in, your clients, diary and templates stay in your account, and your AI key stays on this device.</p>
        <div className="tile row" style={{ marginTop: 16, padding: 14 }}>
          <span className="muted">Signed in as</span><b>{email}</b>
        </div>
        <Button variant="danger" icon="logout" style={{ marginTop: 20 }} onClick={() => { setSheet(null); signOut(); }}>Sign out</Button>
      </Sheet>
      <Toast msg={toast.msg} />
    </CoachShell>
  );
}
