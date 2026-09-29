import { useId, useState, type CSSProperties } from 'react';
import { CoachShell } from '@/coach/CoachShell';
import { Button, Chip, Field, Hero, Icon, Notice, Page, PageHeader, RowButton, Section, Sheet, Toast, useEntering, useToast } from '@/components/ui';
import { useCoach } from '@/app/App';
import { initials } from '@/lib/format';

declare const __COACH_VERSION__: string;
/** Coach's version: coach/package.json, the one place a release bumps it (TECHNICAL §139). */
export const COACH_VERSION = __COACH_VERSION__;

/**
 * Settings (proposal §5.8; wireframe SettingsScreen), as far as Coach v0.1
 * goes: the account, the coach profile, the version and Sign out. Working
 * hours and days off come with the Diary, the AI key with the AI tools, and
 * notifications with Phase 6.
 *
 * Sign out is Coach's only (proposal §11 Q15): `scope: 'local'` ends THIS
 * device's Coach session and nothing else. The default, 'global', would
 * revoke every session of the account, BLOC's on every phone included.
 */
export function SettingsScreen() {
  const { profile, email, repo, signOut } = useCoach();
  const ref = useEntering<HTMLDivElement>('settings');
  const toast = useToast();
  const id = useId();
  const [sheet, setSheet] = useState<'profile' | 'signout' | null>(null);
  const [name, setName] = useState(profile.displayName);
  const [business, setBusiness] = useState(profile.businessName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fixture = repo.kind === 'fixture';

  const saveProfile = async () => {
    setBusy(true); setError(null);
    try {
      await repo.updateProfile(name.trim(), business.trim() || null);
      setSheet(null);
      toast.show('Profile saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CoachShell tab="settings">
      <Page innerRef={ref}>
        <PageHeader
          eyebrow={<>
            <a href="#/clients" className="eyebrow eyebrow-link phone-only"><Icon name="chevL" size={14} /> Clients</a>
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
              <RowButton lead="account" title="Sign-in" sub={fixture ? 'Local build · fixture clients, no account' : `${email} · the same account as BLOC`} trailing="check" />
            </div>
            <p className="caption" style={{ marginTop: 10 }}>Clients, diary and templates are kept under your coach ID, separate from your own training in BLOC.</p>
          </Section>

          <Section i={3} title="Coach profile" sub="How clients see you when they link.">
            <div className="card list">
              <RowButton lead="edit" title={profile.displayName} sub={profile.businessName || 'No business name'} onClick={() => { setError(null); setSheet('profile'); }} />
            </div>
          </Section>

          <Section i={4} title="About" sub="Which version of BLOC Coach this is.">
            <div className="card">
              <div className="ex"><span>Version</span><span className="num">{COACH_VERSION}</span></div>
              <div className="ex"><span>Coming next</span><span>Review, then AI tools, Plan, Diary and In person</span></div>
            </div>
          </Section>
        </div>

        {!fixture && (
          <section className="sec rise" style={{ ['--i' as string]: 5 } as CSSProperties} aria-label="Sign out">
            <Button style={{ maxWidth: 420 }} variant="danger" icon="logout" onClick={() => setSheet('signout')}>Sign out</Button>
          </section>
        )}
      </Page>

      <Sheet open={sheet === 'profile'} onClose={() => setSheet(null)} title="Coach profile">
        <Field label="Your name" htmlFor={`${id}-n`}><input id={`${id}-n`} className="input" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Business name" htmlFor={`${id}-b`} hint="Optional."><input id={`${id}-b`} className="input" autoComplete="organization" maxLength={120} value={business} onChange={(e) => setBusiness(e.target.value)} /></Field>
        <p className="body-copy" style={{ marginTop: 14 }}>Linked clients see your name in BLOC, under Settings → Coaching.</p>
        {error && <Notice icon="warning" tone="bad" title="Couldn’t save" style={{ marginTop: 14 }}>{error}</Notice>}
        <Button style={{ marginTop: 20 }} disabled={!name.trim() || busy} onClick={saveProfile}>Save profile</Button>
      </Sheet>

      <Sheet open={sheet === 'signout'} onClose={() => setSheet(null)} title="Sign out?">
        <p className="body-copy">You’ll be signed out of BLOC Coach on this device. BLOC stays signed in, and your clients stay in your account.</p>
        <div className="tile row" style={{ marginTop: 16, padding: 14 }}>
          <span className="muted">Signed in as</span><b>{email}</b>
        </div>
        <Button variant="danger" icon="logout" style={{ marginTop: 20 }} onClick={() => { setSheet(null); signOut(); }}>Sign out</Button>
      </Sheet>
      <Toast msg={toast.msg} />
    </CoachShell>
  );
}
