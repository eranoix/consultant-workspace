'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useState, type ReactNode } from 'react';
import { Languages, LogOut } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useLocale, useT } from '@/i18n/client';
import { cx, ToastProvider } from '../ui';
import { Sidebar } from './Sidebar';
import { ShortcutHandler } from './Shortcuts';
import { hubFor, isActive } from './nav';
import { WorkspaceProvider, type WorkspaceInfo } from './workspace';
import { TaskDrawerHost } from '../board/TaskDrawer';

function HubTabs() {
  const pathname = usePathname();
  const t = useT();
  const hub = hubFor(pathname);
  return (
    <div className="flex min-w-0 items-center gap-4">
      <span className="hidden shrink-0 text-sm font-semibold text-ink-900 sm:block">{t(hub.labelKey)}</span>
      <nav className="-mb-px flex min-w-0 gap-1 overflow-x-auto" aria-label={t(hub.labelKey)}>
        {hub.items.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                'whitespace-nowrap border-b-2 px-2.5 py-4 text-sm transition-colors',
                active ? 'border-brand-600 font-medium text-brand-800' : 'border-transparent text-ink-500 hover:text-ink-800',
              )}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function UserMenu({ name }: { name: string }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink-600 hover:bg-ink-100"
        disabled={busy}
        title={t('shell.language')}
        onClick={async () => {
          setBusy(true);
          await api('/api/me/locale', { method: 'PUT', body: { locale: locale === 'en' ? 'pt' : 'en' } });
          router.refresh();
          setBusy(false);
        }}
      >
        <Languages className="h-4 w-4" />
        {locale === 'en' ? 'EN' : 'PT'}
      </button>
      <button type="button" className="kbd h-6 hidden sm:inline-flex" title={t('shell.shortcuts.title')} onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))}>
        ?
      </button>
      <span className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800" title={name}>
        {initials}
      </span>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
        title={t('shell.signOut')}
        aria-label={t('shell.signOut')}
        onClick={async () => {
          await api('/api/auth/logout', { method: 'POST' });
          router.push('/login');
        }}
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AppShell({ info, children }: { info: WorkspaceInfo; children: ReactNode }) {
  return (
    <WorkspaceProvider value={info}>
      <ToastProvider>
        <Sidebar />
        <div className="min-h-screen pl-16">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
            <HubTabs />
            <UserMenu name={info.user.name} />
          </header>
          <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">{children}</main>
        </div>
        <ShortcutHandler />
        <Suspense>
          <TaskDrawerHost />
        </Suspense>
      </ToastProvider>
    </WorkspaceProvider>
  );
}
