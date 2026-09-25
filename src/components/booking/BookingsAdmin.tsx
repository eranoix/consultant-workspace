'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ExternalLink, XCircle } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLive } from '@/lib/client/live';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button, Card, Empty, PageHeader, Segmented, Spinner, useToast } from '../ui';
import { useWorkspace } from '../shell/workspace';

interface Data {
  bookings: { id: string; starts_at: string; ends_at: string; customer_name: string; customer_email: string; company: string | null; notes: string | null; status: string; service_name: string; calendar_label: string | null }[];
  services: { id: string; slug: string; name: string; duration_min: number; calendar_account_id: string | null; active: boolean; price_label: string | null }[];
  calendars: { id: string; label: string; side: string | null; is_timeline_target: boolean }[];
  rules: { weekday: number; start_time: string; end_time: string }[];
}

export function BookingsAdmin() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { timeZone } = useWorkspace();
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const { data, mutate } = useSWR<Data>(`/api/bookings?scope=${scope}`, fetcher);
  useLive(['bookings'], () => void mutate());
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone });
  const days = [1, 2, 3, 4, 5, 6, 0];
  const dayName = (d: number) => new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + d)));

  return (
    <div>
      <PageHeader
        title={t('bookings.title')}
        subtitle={t('bookings.subtitle', { tz: timeZone })}
        actions={
          <a href="/book" target="_blank" rel="noreferrer">
            <Button icon={<ExternalLink className="h-4 w-4" />}>{t('bookings.publicPage')}</Button>
          </a>
        }
      />
      {!data ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card
            className="xl:col-span-2"
            bodyClassName="p-0"
            title={t('bookings.list')}
            action={
              <Segmented
                size="sm"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'upcoming', label: t('bookings.upcoming') },
                  { value: 'past', label: t('bookings.past') },
                ]}
              />
            }
          >
            {data.bookings.length === 0 ? (
              <Empty title={t('bookings.empty')} />
            ) : (
              <ul className="divide-y divide-ink-100">
                {data.bookings.map((b) => (
                  <li key={b.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-40 shrink-0 text-sm font-medium">{fmt(b.starts_at)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {b.customer_name}
                        {b.company && <span className="font-normal text-ink-500"> · {b.company}</span>}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {b.service_name} · {b.customer_email}
                        {b.calendar_label && ` · ${b.calendar_label}`}
                      </p>
                    </div>
                    {b.status === 'cancelled' ? (
                      <Badge tone="neutral">{t('bookings.cancelled')}</Badge>
                    ) : (
                      scope === 'upcoming' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<XCircle className="h-3.5 w-3.5" />}
                          onClick={async () => {
                            if (!window.confirm(t('bookings.confirmCancel'))) return;
                            await api(`/api/bookings/${b.id}`, { method: 'DELETE' });
                            toast(t('bookings.toast.cancelled'));
                            void mutate();
                          }}
                        >
                          {t('common.cancel')}
                        </Button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <div className="space-y-4">
            <Card title={t('bookings.services')}>
              <p className="mb-3 text-xs text-ink-500">{t('bookings.servicesHint')}</p>
              <ul className="space-y-3">
                {data.services.map((s) => (
                  <li key={s.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{s.name}</p>
                      <span className="text-xs text-ink-500">
                        {s.duration_min} min{s.price_label ? ` · ${s.price_label}` : ''}
                      </span>
                    </div>
                    <select
                      className="input mt-1 h-8 py-1 text-xs"
                      aria-label={t('bookings.calendarFor', { service: s.name })}
                      value={s.calendar_account_id ?? ''}
                      onChange={async (e) => {
                        await api(`/api/services/${s.id}`, { method: 'PATCH', body: { calendarAccountId: e.target.value || null } });
                        toast(t('bookings.toast.calendar'));
                        void mutate();
                      }}
                    >
                      <option value="">{t('bookings.noCalendar')}</option>
                      {data.calendars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={t('bookings.hours')}>
              <ul className="space-y-1 text-sm">
                {days.map((d) => {
                  const w = data.rules.filter((r) => r.weekday === d);
                  return (
                    <li key={d} className="flex justify-between">
                      <span className="text-ink-600">{dayName(d)}</span>
                      <span className={w.length ? 'text-ink-900' : 'text-ink-400'}>{w.length ? w.map((r) => `${r.start_time} to ${r.end_time}`).join(', ') : t('bookings.closed')}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
