// The coach's own exercise library (`coach_exercises`, 0035, §165): loaded once per screen, and `remember` adds an
// exercise the coach has just added by name, so every Coach picker lists it from then on.
import { useCallback, useEffect, useState } from 'react';
import { useCoach } from '@/app/App';
import type { LibraryEntry } from './library';

export function useCoachExercises() {
  const { repo } = useCoach();
  const [mine, setMine] = useState<LibraryEntry[]>([]);
  useEffect(() => { repo.loadExercises().then(setMine).catch(() => setMine([])); }, [repo]);
  const remember = useCallback((e: LibraryEntry) => {
    const key = e.name.trim().toLowerCase();
    setMine((cur) => (cur.some((x) => x.name.trim().toLowerCase() === key) ? cur : [...cur, { ...e, name: e.name.trim(), source: 'mine' }]));
    repo.saveExercise(e).catch(() => {});
  }, [repo]);
  return { mine, remember };
}
