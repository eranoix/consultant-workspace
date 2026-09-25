import type { Metadata } from 'next';
import { ClientsSettings } from '@/components/settings/ClientsSettings';

export const metadata: Metadata = { title: 'Clients' };

export default function ClientsPage() {
  return <ClientsSettings />;
}
