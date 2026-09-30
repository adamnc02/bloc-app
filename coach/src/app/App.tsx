// ═══════════════════════════════════════════════════════════════════════
// BLOC Coach: who is signed in, and which data source the screens use
// (TECHNICAL §139).
//
//   bypass (a local host, no `?auth=real`) → no Supabase at all; the fixture
//     coach `dev-local-coach` and the fixture clients (data/fixtures.ts).
//   otherwise → BLOC's live project, Coach's own session:
//     signed out            → SignInScreen
//     signed in, no profile → ProfileSetupScreen (create_coach_profile: this
//                             is what makes someone a coach, never BLOC)
//     profile not active    → StatusScreen (v1 creates every coach active)
//     active                → the app
// ═══════════════════════════════════════════════════════════════════════
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { IS_LOCAL_DEV, IS_LOCAL_REAL_AUTH } from '@/lib/host';
import { getSupabase } from '@/lib/supabase';
import { createFixtureRepo, FIXTURE_COACH, loadDemoData } from '@/data/fixtures';
import { createLiveRepo, loadMyProfile } from '@/data/live';
import type { CoachProfile, CoachRepo } from '@/data/types';
import { EmptyState, Button, Sheet } from '@/components/ui';
import { navigate, useRoute } from './router';
import { checkPushHealth, forgetThisPushDevice, registerCoachServiceWorker, registerPushHere } from '@/push/push';
import { RECENT_MS, watchOpenIntents } from '@/push/intent';
import { SignInScreen } from '@/coach/screens/SignInScreen';
import { ProfileSetupScreen, StatusScreen } from '@/coach/screens/ProfileSetupScreen';
import { ClientsScreen } from '@/coach/screens/ClientsScreen';
import { ClientScreen } from '@/coach/screens/ClientScreen';
import { SettingsScreen } from '@/coach/screens/SettingsScreen';
import { TodayScreen } from '@/coach/screens/TodayScreen';
import { InPersonScreen } from '@/inperson/InPersonScreen';
import { LibraryScreen } from '@/coach/screens/LibraryScreen';
import { DiaryScreen } from '@/coach/diary/DiaryScreen';

export interface CoachSession {
  repo: CoachRepo;
  profile: CoachProfile;
  /** The sign-in's email; null under the bypass. */
  email: string | null;
  /** How the account signs in ('email', 'google'); null under the bypass. A Google sign-in has no password. */
  provider: string | null;
  /** Sets the account's password (the same account as BLOC, so BLOC's password changes too). */
  changePassword: (password: string) => Promise<void>;
  /** Under the bypass: the demo dataset's anchor date, the fixtures' "today". */
  fixtureAnchor: string | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<CoachSession | null>(null);
export function useCoach(): CoachSession {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCoach outside the signed-in app');
  return c;
}

type Gate =
  | { k: 'loading' }
  | { k: 'error'; msg: string }
  | { k: 'signed-out' }
  | { k: 'no-profile'; session: Session }
  | { k: 'not-active'; session: Session; profile: CoachProfile }
  | { k: 'ready'; session: CoachSession };

export function App() {
  const [gate, setGate] = useState<Gate>({ k: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const userRef = useRef<string | null>(null);

  const enterLive = useCallback(async (session: Session | null) => {
    const sb = getSupabase()!;
    if (!session) { setGate({ k: 'signed-out' }); return; }
    try {
      const profile = await loadMyProfile(sb, session.user.id);
      if (!profile) { setGate({ k: 'no-profile', session }); return; }
      if (profile.status !== 'active') { setGate({ k: 'not-active', session, profile }); return; }
      setGate(readyLive(session, profile));
    } catch (e) {
      setGate({ k: 'error', msg: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  function readyLive(session: Session, profile: CoachProfile): Gate {
    const sb = getSupabase()!;
    const s: CoachSession = {
      profile, email: session.user.email ?? null, fixtureAnchor: null,
      provider: (session.user.app_metadata?.provider as string | undefined) ?? null,
      changePassword: async (password) => { const { error } = await sb.auth.updateUser({ password }); if (error) throw new Error(error.message); },
      repo: createLiveRepo(sb, profile, (p) => setGate((g) => (g.k === 'ready' ? { k: 'ready', session: { ...g.session, profile: p } } : g))),
      // §158: this device stops getting this coach's pushes first, while the session still passes RLS.
      signOut: async () => { await forgetThisPushDevice(sb); await sb.auth.signOut({ scope: 'local' }); userRef.current = null; setGate({ k: 'signed-out' }); },
    };
    return { k: 'ready', session: s };
  }

  // §158: the push worker registers on every start (so a changed sw.js reaches every device), and a tapped
  // notification opens where it points, once the app is showing.
  useEffect(() => { registerCoachServiceWorker(); }, []);
  const ready = gate.k === 'ready';
  // Route 4 (§158): the newest coach push from the server, for when iOS doesn't pass the tap on.
  const live = ready && gate.k === 'ready' && gate.session.repo.kind === 'live';
  useEffect(() => {
    if (!ready) return undefined;
    const sb = live ? getSupabase() : null;
    return watchOpenIntents(navigate, sb ? async () => {
      const { data, error } = await sb.from('push_outbox').select('id, tag, created_at').eq('app', 'coach')
        .gte('created_at', new Date(Date.now() - RECENT_MS).toISOString()).order('id', { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      const r = (data ?? [])[0] as { id: number; tag: string; created_at: string } | undefined;
      return r ? { id: Number(r.id), tag: r.tag, createdAt: r.created_at } : null;
    } : undefined);
  }, [ready, live]);

  useEffect(() => {
    let cancelled = false;
    if (IS_LOCAL_DEV) {
      loadDemoData().then((demo) => {
        if (cancelled) return;
        const repo = createFixtureRepo(demo, (p) => setGate((g) => (g.k === 'ready' ? { k: 'ready', session: { ...g.session, profile: p } } : g)));
        setGate({ k: 'ready', session: { repo, profile: FIXTURE_COACH, email: null, provider: null, fixtureAnchor: repo.anchor, signOut: async () => {}, changePassword: async () => {} } });
      }).catch((e) => { if (!cancelled) setGate({ k: 'error', msg: `Couldn’t load the demo dataset for the fixture clients: ${e.message}` }); });
      return () => { cancelled = true; };
    }
    const sb = getSupabase()!;
    const enter = (session: Session | null) => { userRef.current = session?.user.id ?? null; enterLive(session); };
    sb.auth.getSession().then(({ data }) => { if (!cancelled) enter(data.session); });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      // Only a change of user re-gates (a token refresh fires too). Deferred:
      // supabase-js must not be awaited inside its own callback.
      if (event === 'SIGNED_OUT') { userRef.current = null; setGate({ k: 'signed-out' }); }
      else if (session && session.user.id !== userRef.current) setTimeout(() => { if (!cancelled) enter(session); }, 0);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [enterLive, attempt]);

  let body: ReactNode;
  if (gate.k === 'loading') body = <div className="page" aria-busy="true" />;
  else if (gate.k === 'error') body = (
    <div className="page" style={{ maxWidth: 560, paddingTop: 80 }}>
      <EmptyState action={<Button size="card" onClick={() => { setGate({ k: 'loading' }); setAttempt((a) => a + 1); }}>Try again</Button>}>
        BLOC Coach couldn’t start. {gate.msg}
      </EmptyState>
    </div>
  );
  else if (gate.k === 'signed-out') body = <SignInScreen />;
  else if (gate.k === 'no-profile') body = <ProfileSetupScreen email={gate.session.user.email ?? ''} onDone={(p) => setGate(p.status === 'active' ? readyLive(gate.session, p) : { k: 'not-active', session: gate.session, profile: p })} />;
  else if (gate.k === 'not-active') body = <StatusScreen profile={gate.profile} email={gate.session.user.email ?? ''} onSignOut={async () => { await getSupabase()!.auth.signOut({ scope: 'local' }); userRef.current = null; setGate({ k: 'signed-out' }); }} />;
  else body = <Ctx.Provider value={gate.session}><Screens /><PushHealth /></Ctx.Provider>;

  return <>{body}<LocalBuildTag /></>;
}

function Screens() {
  const route = useRoute();
  const key = useMemo(() => JSON.stringify(route), [route]);
  switch (route.name) {
    case 'clients': return <ClientsScreen key={key} />;
    case 'client': return <ClientScreen key={`client-${route.id}`} id={route.id} tab={route.tab} macro={route.macro} intent={route.intent} focus={route.focus} />;
    case 'settings': return <SettingsScreen key={key} />;
    case 'today': return <TodayScreen key={key} />;
    case 'session': return <InPersonScreen key={key} occKey={route.occKey} cardId={route.cardId} />;
    case 'diary': return <DiaryScreen key={key} />;
    case 'library': return <LibraryScreen key={key} />;
  }
}

/**
 * §158 (BLOC's §113): on each signed-in start, a registration iOS dropped is re-made quietly while permission
 * holds. When iOS wants to ask again, Coach offers one tap, once; declining doesn't ask on every start.
 */
function PushHealth() {
  const { repo } = useCoach();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const sb = repo.kind === 'live' ? getSupabase() : null;
    if (!sb) return;
    let cancelled = false;
    sb.auth.getUser().then(({ data }) => (data.user ? checkPushHealth(sb, data.user.id) : null)).then((v) => { if (!cancelled && v === 'ask') setAsk(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [repo]);
  const turnOn = async () => {
    const sb = getSupabase();
    const { data } = sb ? await sb.auth.getUser() : { data: { user: null } };
    if (!sb || !data.user) return;
    try { await registerPushHere(sb, data.user.id, true); setAsk(false); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <Sheet open={ask} onClose={() => setAsk(false)} title="Notifications were switched off"
      footer={<div className="btnrow"><Button variant="ghost" size="card" onClick={() => setAsk(false)}>Not now</Button><Button size="card" icon="bell" onClick={() => void turnOn()}>Turn on</Button></div>}>
      <p className="body-copy">An update switched off BLOC Coach’s notifications on this device. Turn them back on?</p>
      {error && <p className="t-bad" style={{ marginTop: 10 }}>{error}</p>}
    </Sheet>
  );
}

/**
 * Which data a local build is on, at the top of the screen. BLOC shows the
 * red LIVE DATA tag with `?auth=real` (§119); Coach does the same, and also
 * says when it's on the fixture clients, so a screenshot can't be mistaken.
 */
function LocalBuildTag() {
  if (!IS_LOCAL_DEV && !IS_LOCAL_REAL_AUTH) return null;
  const live = IS_LOCAL_REAL_AUTH;
  return (
    <div role="status" style={{
      position: 'fixed', top: 'calc(6px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', zIndex: 200, pointerEvents: 'none',
      padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em',
      background: live ? 'var(--red)' : 'color-mix(in srgb, var(--amber) 85%, transparent)', color: live ? '#fff' : 'var(--on-accent)',
    }}>
      {live ? 'LIVE DATA · LOCAL BUILD' : 'FIXTURE CLIENTS · LOCAL BUILD'}
    </div>
  );
}
