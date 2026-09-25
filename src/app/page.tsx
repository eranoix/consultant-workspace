import Link from 'next/link';
import { ArrowRight, CalendarCheck, CalendarClock, Inbox, KanbanSquare, ShieldCheck } from 'lucide-react';
import { getT } from '@/i18n/server';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { t } = await getT();
  const s = await getSettings().catch(() => null);
  const features = [
    { icon: Inbox, key: 'approvals' },
    { icon: KanbanSquare, key: 'board' },
    { icon: CalendarClock, key: 'timeline' },
    { icon: ShieldCheck, key: 'alerts' },
  ];
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 via-ink-50 to-ink-50">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <header className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="font-semibold">{t('shell.product')}</span>
        </header>
        <h1 className="mt-14 max-w-3xl text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">{t('auth.landing.headline')}</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-600">{t('auth.landing.lead')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-800">
            {t('auth.landing.signIn')}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/book" className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-800 hover:bg-ink-50">
            <CalendarCheck className="h-4 w-4" />
            {t('auth.landing.book', { name: s?.profile.name ?? '' })}
          </Link>
        </div>
        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, key }) => (
            <div key={key} className="card p-5">
              <Icon className="h-5 w-5 text-brand-700" />
              <h2 className="mt-3 font-semibold">{t(`auth.landing.features.${key}.title`)}</h2>
              <p className="mt-1 text-sm text-ink-600">{t(`auth.landing.features.${key}.text`)}</p>
            </div>
          ))}
        </div>
        <p className="mt-12 text-xs text-ink-500">{t('auth.landing.demo')}</p>
      </div>
    </main>
  );
}
