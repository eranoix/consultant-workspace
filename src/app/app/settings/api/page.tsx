import type { Metadata } from 'next';
import { TokensSettings } from '@/components/settings/TokensSettings';

export const metadata: Metadata = { title: 'API tokens' };

export default function ApiTokensPage() {
  return <TokensSettings />;
}
