'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { useT } from '@/i18n/client';
import { cx } from '../ui';
import { HUBS, isActive } from './nav';

export function Sidebar() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nav = useRef<HTMLElement>(null);
  const { data: counts, mutate } = useSWR<{ meetings: number; emails: number }>('/api/approvals/counts', fetcher);
  const { data: alerts, mutate: mutateAlerts } = useSWR<{ alerts: { severity: string }[] }>('/api/alerts', fetcher);
  useLive(['sources', 'candidate_tasks'], () => void mutate());
  useLive(['alerts'], () => void mutateAlerts());
  const pending = (counts?.meetings ?? 0) + (counts?.emails ?? 0);
  const liveAlerts = alerts?.alerts.length ?? 0;

  useEffect(() => setOpen(false), [pathname]);

  const enter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(true), 120);
  };
  const leave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setOpen(false);
  };

  return (
    <nav
      ref={nav}
      aria-label={t('shell.navLabel')}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={(e) => {
        if ((e.target as HTMLElement).matches(':focus-visible')) setOpen(true);
      }}
      onBlur={(e) => {
        if (!nav.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      className={cx(
        'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-ink-200 bg-white transition-[width,box-shadow] duration-150',
        open ? 'w-60 shadow-pop' : 'w-16',
      )}
    >
      <Link href="/app" className="flex h-14 shrink-0 items-center gap-2.5 px-4" onClick={() => setOpen(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0" />
        <span className={cx('truncate text-sm font-semibold text-ink-900 transition-opacity', open ? 'opacity-100' : 'opacity-0')}>
          {t('shell.product')}
        </span>
      </Link>
      <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4">
        {HUBS.map((hub) => (
          <div key={hub.id} className="mt-3">
            <div className={cx('h-5 px-5 text-[10px] font-semibold uppercase tracking-wider text-ink-400 transition-opacity', open ? 'opacity-100' : 'opacity-0')}>
              {t(hub.labelKey)}
            </div>
            {!open && <div className="mx-4 -mt-2.5 mb-1 border-t border-ink-100" />}
            <ul className="mt-1 space-y-0.5 px-2">
              {hub.items.map((item) => {
                const active = isActive(item, pathname);
                const badge = item.href === '/app/approvals' ? pending : item.href === '/app/alerts' ? liveAlerts : 0;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={open ? undefined : t(item.labelKey)}
                      aria-current={active ? 'page' : undefined}
                      onClick={(e) => {
                        setOpen(false);
                        (e.currentTarget as HTMLElement).blur();
                      }}
                      className={cx(
                        'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                        active ? 'bg-brand-50 font-medium text-brand-800' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className={cx('truncate transition-opacity', open ? 'opacity-100' : 'opacity-0')}>{t(item.labelKey)}</span>
                      {badge > 0 && (
                        <span
                          className={cx(
                            'absolute flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white',
                            item.href === '/app/alerts' ? 'bg-red-600' : 'bg-brand-600',
                            open ? 'right-2' : 'right-1 top-1',
                          )}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
