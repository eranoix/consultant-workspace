import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TimelineView } from '@/components/timeline/TimelineView';

export const metadata: Metadata = { title: 'Timeline' };

export default function TimelinePage() {
  return (
    <Suspense>
      <TimelineView />
    </Suspense>
  );
}
