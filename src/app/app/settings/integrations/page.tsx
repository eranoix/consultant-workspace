import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Activity } from 'lucide-react';
import { getT } from '@/i18n/server';
import { PROVIDERS, probe } from '@/lib/server/services/integrations';
import { IntegrationsClient } from '@/components/settings/IntegrationsClient';

export const metadata: Metadata = { title: 'Integrations' };
export const dynamic = 'force-dynamic';

async function Probe({ id, name }: { id: string; name: string }) {
  const { t } = await getT();
  const r = await probe(id);
  return (
    <div className="card p-4" data-testid="probe">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className={`h-2 w-2 rounded-full ${r.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
        {name}
      </p>
      <p className="mt-1 text-xs text-ink-500">{r.detail}</p>
      <p className="mt-1 text-[11px] text-ink-400">{t('integrations.probe.latency', { ms: r.latencyMs })}</p>
    </div>
  );
}

function ProbeSkeleton({ name }: { name: string }) {
  return (
    <div className="card animate-pulse p-4">
      <p className="text-sm font-medium text-ink-400">{name}</p>
      <div className="mt-2 h-3 w-2/3 rounded bg-ink-100" />
      <div className="mt-2 h-2 w-1/3 rounded bg-ink-100" />
    </div>
  );
}

export default async function IntegrationsPage() {
  const { t } = await getT();
  return (
    <div className="max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">{t('integrations.title')}</h1>
        <p className="mt-0.5 text-sm text-ink-500">{t('integrations.subtitle')}</p>
      </div>
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
        <Activity className="h-3.5 w-3.5" />
        {t('integrations.probe.title')}
      </h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {PROVIDERS.map((p) => (
          <Suspense key={p.id} fallback={<ProbeSkeleton name={p.name} />}>
            <Probe id={p.id} name={p.name} />
          </Suspense>
        ))}
      </div>
      <IntegrationsClient />
      <p className="mt-4 text-xs text-ink-500">{t('integrations.footnote')}</p>
    </div>
  );
}
