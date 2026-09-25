import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AlertsView } from '@/components/alerts/AlertsView';

export const metadata: Metadata = { title: 'Alerts' };

export default function AlertsPage() {
  return (
    <Suspense>
      <AlertsView />
    </Suspense>
  );
}
