// Settings → Demo data, loaded only for the demo coach (PROMPT-04). The section
// carries the engine's client simulator; every other coach would download it
// for nothing, so it is its own chunk, fetched once this sign-in's
// app_metadata.demo_admin is seen. (bloc-demo checks the flag again itself.)
import { lazy, Suspense, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientBundle } from '@/data/types';

const DemoSection = lazy(() => import('./DemoSection').then((m) => ({ default: m.DemoSection })));

export function DemoGate(props: { sb: SupabaseClient; i: number; loadClients: () => Promise<ClientBundle[]> }) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    props.sb.auth.getUser().then(({ data }) => setAdmin(data.user?.app_metadata?.demo_admin === true)).catch(() => setAdmin(false));
  }, [props.sb]);
  return admin ? <Suspense fallback={null}><DemoSection {...props} /></Suspense> : null;
}
