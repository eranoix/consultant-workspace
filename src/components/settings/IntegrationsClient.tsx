'use client';

import useSWR from 'swr';
import { KeyRound, Link2, RefreshCw, Unplug } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, Spinner, useToast } from '../ui';

interface Provider {
  id: string;
  name: string;
  description: string;
  scopes: string[];
  accounts: string[];
}
interface Credential {
  id: string;
  provider: string;
  account_label: string;
  fingerprint: string;
  key_version: number;
  status: string;
  last_refreshed_at: string | null;
  access_expires_at: string | null;
  last_error: string | null;
  needs_rotation: boolean;
}

export function IntegrationsClient() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { data, mutate } = useSWR<{ providers: Provider[]; credentials: Credential[] }>('/api/integrations', fetcher);
  if (!data) return <Spinner />;
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '·');
  return (
    <div className="space-y-4">
      {data.providers.map((p) => (
        <section key={p.id} className="card">
          <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">{p.name}</h2>
              <p className="text-xs text-ink-500">
                {p.description} · <span className="font-mono">{p.scopes.join(' ')}</span>
              </p>
            </div>
          </header>
          <ul className="divide-y divide-ink-100">
            {p.accounts.map((account) => {
              const c = data.credentials.find((x) => x.provider === p.id && x.account_label === account);
              return (
                <li key={account} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="integration-account">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{account}</p>
                    {c ? (
                      <p className="flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
                        <KeyRound className="h-3 w-3" />
                        <span>
                          {t('integrations.fingerprint')} <span className="font-mono">{c.fingerprint}</span>
                        </span>
                        <span>· AES-256-GCM · {t('integrations.keyVersion', { v: c.key_version })}</span>
                        <span>· {t('integrations.refreshed', { when: fmt(c.last_refreshed_at) })}</span>
                        {c.needs_rotation && <Badge tone="amber">{t('integrations.needsRotation')}</Badge>}
                      </p>
                    ) : (
                      <p className="text-[11px] text-ink-400">{t('integrations.notConnected')}</p>
                    )}
                    {c?.last_error && <p className="text-[11px] text-red-600">{c.last_error}</p>}
                  </div>
                  {c ? (
                    <>
                      <Badge tone={c.status === 'connected' ? 'green' : 'red'}>{t(`integrations.status.${c.status}`)}</Badge>
                      <Button
                        size="sm"
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        onClick={async () => {
                          const r = await api<{ ok: boolean; rotated?: boolean; error?: string }>(`/api/integrations/${c.id}`, { method: 'POST' });
                          toast(r.ok ? t(r.rotated ? 'integrations.toast.rotated' : 'integrations.toast.refreshed') : r.error ?? 'Error', { tone: r.ok ? 'ok' : 'error' });
                          void mutate();
                        }}
                      >
                        {t('integrations.refresh')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Unplug className="h-3.5 w-3.5" />}
                        onClick={async () => {
                          await api(`/api/integrations/${c.id}`, { method: 'DELETE' });
                          void mutate();
                        }}
                      >
                        {t('integrations.disconnect')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Link2 className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        await api('/api/integrations', { method: 'POST', body: { provider: p.id, account } });
                        toast(t('integrations.toast.connected'));
                        void mutate();
                      }}
                    >
                      {t('integrations.connect')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
