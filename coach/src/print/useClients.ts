// The coach's clients, loaded once (the print page has no shell to hold them).
import { useEffect, useState } from 'react';
import { useCoach } from '@/app/App';
import type { ClientBundle } from '@/data/types';

export function useClients() {
  const { repo } = useCoach();
  const [bundles, setBundles] = useState<ClientBundle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { repo.loadClients().then(setBundles).catch((e) => setError(e instanceof Error ? e.message : String(e))); }, [repo]);
  return { bundles, error };
}
