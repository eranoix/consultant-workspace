'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlarmClock, BellOff, Check, CheckCheck, CircleAlert, ExternalLink, Info, TriangleAlert } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { useLocale, useT } from '@/i18n/client';
import { Badge, cx, Empty, Spinner, useToast } from '../ui';

export interface AlertRow {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  rule_name: string | null;
  event: string | null;
}

export function severityIcon(s: string) {
  if (s === 'critical') return <CircleAlert className="h-4 w-4 text-red-600" />;
  if (s === 'warning') return <TriangleAlert className="h-4 w-4 text-amber-600" />;
  return <Info className="h-4 w-4 text-sky-600" />;
}

export function relatedHref(a: AlertRow): string | null {
  if (a.entity_type === 'task') return `/app/board?task=${a.entity_id}`;
  if (a.entity_type === 'source') return `/app/approvals?source=${a.entity_id}`;
  if (a.entity_type === 'thread') return '/app/approvals?tab=emails';
  if (a.entity_type === 'job' || a.entity_type === 'intake') return '/app/alerts?tab=jobs';
  if (a.entity_type === 'booking') return '/app/bookings';
  return null;
}

export function timeAgo(iso: string, locale: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale === 'pt' ? 'pt-BR' : 'en', { numeric: 'auto' });
  if (diff < 3600) return rtf.format(-Math.max(1, Math.round(diff / 60)), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

export function AlertList({ status = 'live', compact, limit }: { status?: 'live' | 'resolved'; compact?: boolean; limit?: number }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { data, mutate } = useSWR<{ alerts: AlertRow[] }>(`/api/alerts${status === 'resolved' ? '?status=resolved' : ''}`, fetcher);
  useLive(['alerts'], () => void mutate());

  const act = async (a: AlertRow, action: 'acknowledge' | 'snooze' | 'resolve' | 'reopen') => {
    await mutate(
      data && { alerts: action === 'acknowledge' ? data.alerts.map((x) => (x.id === a.id ? { ...x, status: 'acknowledged' } : x)) : data.alerts.filter((x) => x.id !== a.id) },
      { revalidate: false },
    );
    await api(`/api/alerts/${a.id}`, { method: 'POST', body: { action, minutes: 60 } });
    if (action === 'resolve') toast(t('alerts.toast.resolved'), { action: { label: t('approvals.undo'), run: () => void api(`/api/alerts/${a.id}`, { method: 'POST', body: { action: 'reopen' } }).then(() => mutate()) } });
    void mutate();
  };

  if (!data)
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  const list = limit ? data.alerts.slice(0, limit) : data.alerts;
  if (list.length === 0) return <Empty icon={<BellOff className="h-8 w-8" />} title={t(status === 'resolved' ? 'alerts.emptyResolved' : 'alerts.empty')} />;
  return (
    <ul className="divide-y divide-ink-100">
      {list.map((a) => {
        const href = relatedHref(a);
        return (
          <li key={a.id} className={cx('flex items-start gap-3', compact ? 'py-2.5' : 'px-4 py-3')} data-testid="alert">
            <span className="mt-0.5">{severityIcon(a.severity)}</span>
            <div className="min-w-0 flex-1">
              <p className={cx('text-sm font-medium text-ink-900', compact && 'truncate')}>{a.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
                <span>{timeAgo(a.created_at, locale)}</span>
                {a.status === 'acknowledged' && <Badge tone="neutral">{t('alerts.status.acknowledged')}</Badge>}
                {!compact && a.rule_name && <span className="truncate">· {a.event}</span>}
                {href && (
                  <Link href={href} className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    {t('alerts.open')}
                  </Link>
                )}
              </p>
            </div>
            {status === 'live' ? (
              <div className="flex shrink-0 gap-0.5">
                {a.status !== 'acknowledged' && (
                  <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-800" title={t('alerts.actions.acknowledge')} aria-label={t('alerts.actions.acknowledge')} onClick={() => act(a, 'acknowledge')}>
                    <Check className="h-4 w-4" />
                  </button>
                )}
                <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-100 hover:text-ink-800" title={t('alerts.actions.snooze')} aria-label={t('alerts.actions.snooze')} onClick={() => act(a, 'snooze')}>
                  <AlarmClock className="h-4 w-4" />
                </button>
                <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-emerald-50 hover:text-emerald-700" title={t('alerts.actions.resolve')} aria-label={t('alerts.actions.resolve')} onClick={() => act(a, 'resolve')}>
                  <CheckCheck className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <span className="shrink-0 text-[11px] text-ink-400">{a.resolved_at && timeAgo(a.resolved_at, locale)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
