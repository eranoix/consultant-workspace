import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { pool } from '@/lib/server/db';
import { getSettings } from '@/lib/server/settings';
import { listServices } from '@/lib/server/services/bookings';
import { getT } from '@/i18n/server';
import { PublicShell } from '@/components/booking/PublicShell';

export const metadata: Metadata = { title: 'Book a time' };
export const dynamic = 'force-dynamic';

export default async function BookIndex() {
  const { t } = await getT();
  const [settings, services] = await Promise.all([getSettings(), listServices(pool())]);
  return (
    <PublicShell name={settings.profile.name} practice={settings.profile.practice}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('bookings.public.title')}</h1>
      <p className="mt-1 text-ink-600">{t('bookings.public.lead', { tz: settings.profile.timeZone })}</p>
      <ul className="mt-6 space-y-3">
        {services.map((s) => (
          <li key={s.id}>
            <Link href={`/book/${s.slug}`} className="card flex items-center gap-4 p-5 transition hover:border-brand-300 hover:shadow-md" data-testid="service">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-900">{s.name}</p>
                <p className="mt-0.5 text-sm text-ink-600">{s.description}</p>
                <p className="mt-2 flex items-center gap-3 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {s.duration_min} min
                  </span>
                  {s.price_label && <span>{s.price_label}</span>}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-ink-400" />
            </Link>
          </li>
        ))}
      </ul>
    </PublicShell>
  );
}
