'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowLeft, CalendarCheck, Loader2 } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLocale, useT } from '@/i18n/client';
import { Button, cx, Field } from '../ui';

interface Slot {
  start: string;
  end: string;
}

export function BookingFlow({ slug, serviceName, duration }: { slug: string; serviceName: string; duration: number }) {
  const t = useT();
  const locale = useLocale();
  const loc = locale === 'pt' ? 'pt-BR' : 'en-US';
  const { data: days } = useSWR<{ timeZone: string; days: { date: string; count: number }[] }>(`/api/public/services/${slug}/days`, fetcher);
  const [date, setDate] = useState<string | null>(null);
  const firstOpen = days?.days.find((d) => d.count > 0)?.date ?? null;
  const selected = date ?? firstOpen;
  const { data: slots, isLoading } = useSWR<{ timeZone: string; slots: Slot[] }>(selected ? `/api/public/services/${slug}/slots?date=${selected}` : null, fetcher);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [form, setForm] = useState({ name: '', email: '', company: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: string; startsAt: string } | null>(null);
  const tz = days?.timeZone ?? 'UTC';
  const time = (iso: string) => new Date(iso).toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const dayText = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(loc, { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));

  if (done)
    return (
      <div className="card p-6 text-center" data-testid="booking-confirmed">
        <CalendarCheck className="mx-auto h-10 w-10 text-brand-600" />
        <h2 className="mt-3 text-lg font-semibold">{t('bookings.public.confirmed')}</h2>
        <p className="mt-1 text-ink-600">
          {serviceName} · {new Date(done.startsAt).toLocaleString(loc, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz })}
        </p>
        <p className="mt-4 text-sm text-ink-500">{t('bookings.public.manageHint')}</p>
        <Link href={`/book/manage/${done.token}`} className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline">
          {t('bookings.public.manage')}
        </Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">{t('bookings.public.pickDay')}</h2>
        {!days ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {days.days.map((d) => (
              <button
                key={d.date}
                type="button"
                disabled={d.count === 0}
                onClick={() => {
                  setDate(d.date);
                  setSlot(null);
                }}
                data-testid="day"
                className={cx(
                  'rounded-lg border px-2 py-2 text-center text-xs transition',
                  selected === d.date ? 'border-brand-600 bg-brand-700 text-white' : d.count ? 'border-ink-200 bg-white hover:border-brand-400' : 'cursor-not-allowed border-ink-100 bg-ink-50 text-ink-300',
                )}
              >
                <span className="block font-medium">{dayText(d.date, { weekday: 'short' })}</span>
                <span className="block text-base font-semibold">{dayText(d.date, { day: 'numeric' })}</span>
                <span className="block text-[10px] opacity-80">{dayText(d.date, { month: 'short' })}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">{t('bookings.public.pickTime', { day: dayText(selected, { weekday: 'long', month: 'long', day: 'numeric' }) })}</h2>
          {isLoading || !slots ? (
            <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
          ) : slots.slots.length === 0 ? (
            <p className="text-sm text-ink-500">{t('bookings.public.noSlots')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {slots.slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  data-testid="slot"
                  onClick={() => setSlot(s)}
                  className={cx('rounded-lg border px-2 py-2 text-sm font-medium transition', slot?.start === s.start ? 'border-brand-600 bg-brand-700 text-white' : 'border-ink-200 bg-white hover:border-brand-400')}
                >
                  {time(s.start)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {slot && (
        <form
          className="card space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const res = await api<{ token: string; startsAt: string }>('/api/public/bookings', { method: 'POST', body: { slug, startsAt: slot.start, ...form } });
              setDone(res);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 className="text-sm font-semibold">
            {t('bookings.public.details', { time: time(slot.start), duration })}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('bookings.public.name')}>
              <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('bookings.public.email')}>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <Field label={t('bookings.public.company')}>
            <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </Field>
          <Field label={t('bookings.public.notes')}>
            <textarea className="input min-h-[80px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="primary" loading={busy} className="w-full">
            {t('bookings.public.confirm')}
          </Button>
        </form>
      )}
      <Link href="/book" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" />
        {t('bookings.public.back')}
      </Link>
    </div>
  );
}
