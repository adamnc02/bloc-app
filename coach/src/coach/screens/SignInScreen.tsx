import { useState } from 'react';
import { CoachLogo } from '@/components/brand/Brand';
import { getSupabase, BLOC_INVITE_BASE } from '@/lib/supabase';

/** Where Google and the confirmation email come back to: this page, without the hash. */
const returnUrl = () => window.location.href.split('#')[0];

// BLOC's Google mark, exactly as index.html's AUTH_PROVIDERS has it.
const GOOGLE = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="#4285F4" d="M23.52 12.27c0-.82-.07-1.6-.2-2.36H12v4.47h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.73z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.1C3.24 21.3 7.28 24 12 24z" />
    <path fill="#FBBC05" d="M5.27 14.29c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29v-3.1H1.26A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.26 5.39l4.01-3.1z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.26 6.61l4.01 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
  </svg>
);

/**
 * Sign in: BLOC's sign-in screen (index.html #auth-gate), the same in every
 * part except the logo (Adam, 2026-09-29: "The login page should be the same
 * on both screens, except for the BLOC coach logo"). Same order: Continue
 * with Google, "or", Sign In / Sign Up tabs, email, password, "Sign In →",
 * Forgot password?. Styles: styles/auth.css, copied from BLOC's rules.
 *
 * Coach keeps its OWN session on the device (lib/storage.ts), so signing in
 * here doesn't sign BLOC in, and signing out doesn't sign it out.
 *
 * 🚨 Google comes back here only if this URL is on the Supabase project's
 *    Redirect URLs list (Auth → URL Configuration); otherwise it lands on the
 *    Site URL, which is BLOC (§119). On a local build, sign in by email.
 * Forgot password? sends the reset link to BLOC: it's the same account, the
 *    link signs you in there, and BLOC's Settings is where a password changes
 *    (Coach has no password screen).
 */
export function SignInScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const switchMode = (m: 'signin' | 'signup') => { setMode(m); setError(null); };

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
    if (e) setError(e.message || 'Sign-in failed. Please try again.');
  };

  const forgot = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setStatus(null);
    if (!email.trim()) { setError('Enter your email above first.'); return; }
    const { error: e } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: BLOC_INVITE_BASE });
    if (e) { setError(e.message || 'Could not send reset email.'); return; }
    setError(null);
    setStatus('Password reset email sent.');
  };

  return (
    <div className="auth-gate">
      <div className="auth-gate-inner">
        <div className="auth-gate-logo"><CoachLogo height={44} /></div>
        <div className="auth-gate-tagline">Sign in to continue</div>

        <button type="button" className="auth-provider-btn" onClick={google}>{GOOGLE}<span>Continue with Google</span></button>

        <div className="auth-divider"><span>or</span></div>

        <div className="auth-tabs">
          <button type="button" className={`auth-tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => switchMode('signin')}>Sign In</button>
          <button type="button" className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => switchMode('signup')}>Sign Up</button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="form-group">
            <input type="email" placeholder="Email" autoComplete="email" inputMode="email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <input type="password" placeholder="Password" aria-label="Password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="auth-submit" disabled={busy}>{mode === 'signin' ? 'Sign In →' : 'Sign Up →'}</button>
          {mode === 'signin' && <div className="auth-forgot-row"><button type="button" onClick={forgot}>Forgot password?</button></div>}
        </form>

        {error && <div className="auth-error" role="alert">{error}</div>}
        {status && <div className="auth-status" role="status">{status}</div>}
      </div>
    </div>
  );
}
