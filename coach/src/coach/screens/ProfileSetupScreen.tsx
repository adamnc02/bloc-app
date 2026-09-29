import { useId, useState, type ReactNode } from 'react';
import { Button, Chip, Field, Hero, Icon, Notice, Page, PageHeader, Section, useEntering, type IconName } from '@/components/ui';
import { getSupabase } from '@/lib/supabase';
import { createMyProfile } from '@/data/live';
import type { CoachProfile } from '@/data/types';
import { initials } from '@/lib/format';

/**
 * The coach profile (wireframe OnboardingScreen, step "profile"). Saving it
 * calls `create_coach_profile()` (0022): signing up in Coach is what makes
 * someone a coach, and nothing in BLOC can. The wireframes' later steps
 * (working hours, the AI key) come with the Diary and AI sub-phases; both
 * have defaults, so nothing is lost by skipping them now.
 */
export function ProfileSetupScreen({ email, onDone }: { email: string; onDone: (p: CoachProfile) => void }) {
  const ref = useEntering<HTMLDivElement>('profile-setup');
  const id = useId();
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      onDone(await createMyProfile(getSupabase()!, name.trim(), business.trim() || null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Page innerRef={ref}>
        <PageHeader eyebrow="Set up BLOC Coach" title="Your coach profile" />
        <Hero style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent)', color: 'var(--on-accent)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, flexShrink: 0 }}>{initials(name || '?')}</div>
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontSize: 20 }}>{name || 'Your name'}</div>
            <div className="muted" style={{ marginTop: 2 }}>{business || 'Coach'}</div>
          </div>
        </Hero>
        <Section i={2} title="Coach profile" sub="How clients see you when they link.">
          <form className="card" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save(); }}>
            <Field label="Your name" htmlFor={`${id}-n`}>
              <input id={`${id}-n`} className="input" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Business name" htmlFor={`${id}-b`} hint="Optional.">
              <input id={`${id}-b`} className="input" autoComplete="organization" maxLength={120} value={business} onChange={(e) => setBusiness(e.target.value)} />
            </Field>
            <div className="caption" style={{ marginTop: 14 }}>Signed in as {email}</div>
            {error && <Notice icon="warning" tone="bad" title="Couldn’t save your profile" style={{ marginTop: 16 }}>{error}</Notice>}
            <Button type="submit" size="card" style={{ marginTop: 18 }} disabled={!name.trim() || busy}>Continue</Button>
          </form>
        </Section>
      </Page>
    </div>
  );
}

/**
 * A coach profile that isn't active (wireframe OnboardingScreen, step
 * "pending"; proposal §11 Q18, "Status screen only"). v1 creates every coach
 * active, so this only holds the shape for the later approval step.
 */
export function StatusScreen({ profile, email, onSignOut }: { profile: CoachProfile; email: string; onSignOut: () => void }) {
  const ref = useEntering<HTMLDivElement>('status');
  const pending = profile.status === 'pending_approval';
  const row = (icon: IconName, title: string, sub: string, chip: ReactNode) => (
    <div className="listrow" style={{ cursor: 'default' }}>
      <span className="icon-tile"><Icon name={icon} size={18} /></span>
      <span className="main"><b>{title}</b><small className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 3 }}>{sub}</small></span>
      {chip}
    </div>
  );
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Page innerRef={ref}>
        <PageHeader eyebrow="BLOC Coach" title={pending ? 'Waiting for approval' : 'Account paused'} />
        <Hero>
          <Chip tone="amber" icon="clock">{pending ? 'Pending approval' : 'Suspended'}</Chip>
          <div className="display" style={{ fontSize: 20, marginTop: 12 }}>{pending ? 'We’re checking your qualifications' : 'Your coach account is paused'}</div>
          <p className="body-copy" style={{ marginTop: 6 }}>
            {pending ? 'Coach accounts are approved by hand. Clients can link to you once your account is approved.' : 'Your clients can’t be reached from here while it’s paused. Your own BLOC training is unaffected.'}
          </p>
        </Hero>
        <Section i={2} title="Your account" sub="What’s set up, and what’s still being checked.">
          <div className="card list">
            {row('account', 'Account and profile', `${profile.displayName} · ${email}`, <Chip tone="good" icon="check">Done</Chip>)}
            {row('shield', 'Qualifications', pending ? 'Being checked' : 'Paused', <Chip tone="amber" icon="clock">{pending ? 'Checking' : 'Paused'}</Chip>)}
          </div>
          <Button variant="danger" size="card" icon="logout" style={{ marginTop: 16 }} onClick={onSignOut}>Sign out</Button>
        </Section>
      </Page>
    </div>
  );
}
