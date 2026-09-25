import type { Metadata } from 'next';
import { ShortcutsSettings } from '@/components/settings/ShortcutsSettings';

export const metadata: Metadata = { title: 'Shortcuts' };

export default function ShortcutsPage() {
  return <ShortcutsSettings />;
}
