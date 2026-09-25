import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ApprovalsView } from '@/components/approvals/ApprovalsView';

export const metadata: Metadata = { title: 'Approvals' };

export default function ApprovalsPage() {
  return (
    <Suspense>
      <ApprovalsView />
    </Suspense>
  );
}
