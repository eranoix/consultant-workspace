import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { currentUser } from '@/lib/server/auth';
import { getT } from '@/i18n/server';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await currentUser().catch(() => null)) redirect('/app');
  const { t } = await getT();
  const demo = (process.env.DEMO_PASSWORD ?? 'workspace-demo') === 'workspace-demo' ? 'workspace-demo' : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-ink-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="h-11 w-11" />
          <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
          <p className="text-sm text-ink-500">{t('auth.subtitle')}</p>
        </div>
        <div className="card p-6">
          <Suspense>
            <LoginForm demoEmail="maya@lumen.example.com" demoPassword={demo} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
