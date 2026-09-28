import { useId, useState, type CSSProperties } from 'react';
import { CoachLogo } from '@/components/brand/Brand';
import { Button, Field, Hero, Notice, Page, PageHeader, Section, numberSections, useEntering } from '@/components/ui';
import { getSupabase } from '@/lib/supabase';

/** Where Google and the confirmation email come back to: this page, without the hash. */
const returnUrl = () => window.location.href.split('#')[0];

/**
 * Sign in (wireframe OnboardingScreen, step "account"; proposal §3). One
 * sign-in for both apps: a coach uses the account they already have in BLOC,
 * or creates one here. Coach keeps its OWN session on the device (lib/storage.ts),
 * so signing in here doesn't sign BLOC in, and signing out doesn't sign it out.
 *
 * 🚨 Google comes back to this URL only if it is on the Supabase project's
 *    Redirect URLs list (Auth → URL Configuration); otherwise it lands on the
 *    Site URL, which is BLOC (§119). On a local build, sign in by email.
 */
export function SignInScreen() {
  const ref = useEntering<HTMLDivElement>('signin');
  const id = useId();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const n = numberSections(['email', 'google']);

  const submit = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setError(null); setStatus(null);
    if (!email.trim() || !password) { setError('Enter both an email and a password.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error: e } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: returnUrl() } });
        if (e) throw e;
        if (!data.session) { setStatus('Check your email to confirm your account, then sign in.'); setMode('signin'); }
      } else {
        const { error: e } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (e) throw e;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setError(null);
    const { error: e } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl() } });
    if (e) setError(e.message);
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <Page innerRef={ref}>
        <PageHeader eyebrow="BLOC Coach" title={mode === 'signin' ? 'Sign in' : 'Create your coach account'} />
        <Hero>
          <CoachLogo height={60} />
          <div className="display" style={{ fontSize: 20, marginTop: 14 }}>One sign-in, two sides.</div>
          <p className="body-copy" style={{ marginTop: 6 }}>
            Use the account you already have in BLOC, or create one. Your clients, diary and templates are kept under their own coach ID, apart from your own training.
          </p>
        </Hero>

        <Section n={n.email} i={2} title={mode === 'signin' ? 'Your account' : 'New account'} sub={mode === 'signin' ? 'The same email and password as BLOC.' : 'Create one with your email. It works in BLOC too.'}>
          <form className="card" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Field label="Email" htmlFor={`${id}-e`}>
              <input id={`${id}-e`} className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor={`${id}-p`}>
              <input id={`${id}-p`} className="input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <Notice icon="warning" tone="bad" title="That didn’t work" style={{ marginTop: 16 }}>{error}</Notice>}
            {status && <Notice icon="check" title={status} style={{ marginTop: 16 }} />}
            <Button type="submit" size="card" style={{ marginTop: 18 }} disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Button>
            <Button type="button" size="card" variant="ghost" style={{ marginTop: 10 }} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}>
              {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </Button>
          </form>
        </Section>

        <Section n={n.google} i={3} title="Or with Google" sub="If you sign in to BLOC with Google, use the same here.">
          <Button variant="ghost" onClick={google}>Continue with Google</Button>
        </Section>

        <p className="caption rise" style={{ ['--i' as string]: 4, marginTop: 24 } as CSSProperties}>
          Signing up here is what makes you a coach. Nothing in BLOC can. Forgot your password? Reset it from BLOC’s sign-in screen: it’s the same account.
        </p>
      </Page>
    </div>
  );
}
