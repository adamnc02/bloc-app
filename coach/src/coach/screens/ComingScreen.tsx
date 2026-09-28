import type { CSSProperties } from 'react';
import { EmptyState, Page, PageHeader, useEntering } from '@/components/ui';
import { CoachShell, AccountButton, type CoachTab } from '@/coach/CoachShell';

/** A tab that later sub-phases of PROMPT-03 Phase 5 build. Says so rather than pretending. */
export function ComingScreen({ tab, title, sub }: { tab: CoachTab; title: string; sub: string }) {
  const ref = useEntering<HTMLDivElement>(`coming-${title}`);
  return (
    <CoachShell tab={tab}>
      <Page innerRef={ref}>
        <PageHeader eyebrow="BLOC Coach" title={title} actions={<AccountButton />} />
        <div className="rise" style={{ ['--i' as string]: 1 } as CSSProperties}>
          <EmptyState>{sub}</EmptyState>
        </div>
      </Page>
    </CoachShell>
  );
}
