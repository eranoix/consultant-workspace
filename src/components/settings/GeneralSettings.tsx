'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { api, fetcher } from '@/lib/client/api';
import { useLocale, useT } from '@/i18n/client';
import { Button, Card, Field, PageHeader, Spinner, useToast } from '../ui';

interface Settings {
  profile: { name: string; practice: string; email: string; timeZone: string };
  partner: { name: string; shortName: string; domains: string[] };
}

export function GeneralSettings() {
  const t = useT();
  const toast = useToast();
  const locale = useLocale();
  const router = useRouter();
  const { data, mutate } = useSWR<Settings>('/api/settings', fetcher);
  const { data: cals, mutate: mutateCals } = useSWR<{ calendars: { id: string; label: string; is_timeline_target: boolean }[] }>('/api/calendars', fetcher);
  const [form, setForm] = useState<Settings | null>(null);
  const [domains, setDomains] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setForm(data);
      setDomains(data.partner.domains.join(', '));
    }
  }, [data]);

  if (!form || !cals) return <Spinner />;
  return (
    <div className="max-w-3xl">
      <PageHeader title={t('settings.general.title')} subtitle={t('settings.general.subtitle')} />
      <div className="space-y-4">
        <Card title={t('settings.general.profile')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('settings.general.name')}>
              <input className="input" value={form.profile.name} onChange={(e) => setForm({ ...form, profile: { ...form.profile, name: e.target.value } })} />
            </Field>
            <Field label={t('settings.general.practice')}>
              <input className="input" value={form.profile.practice} onChange={(e) => setForm({ ...form, profile: { ...form.profile, practice: e.target.value } })} />
            </Field>
            <Field label={t('settings.general.timeZone')}>
              <input className="input" value={form.profile.timeZone} onChange={(e) => setForm({ ...form, profile: { ...form.profile, timeZone: e.target.value } })} />
            </Field>
          </div>
        </Card>
        <Card title={t('settings.general.partner')}>
          <p className="mb-3 text-xs text-ink-500">{t('settings.general.partnerHint')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('settings.general.partnerName')}>
              <input className="input" value={form.partner.name} onChange={(e) => setForm({ ...form, partner: { ...form.partner, name: e.target.value } })} />
            </Field>
            <Field label={t('settings.general.shortName')}>
              <input className="input" value={form.partner.shortName} onChange={(e) => setForm({ ...form, partner: { ...form.partner, shortName: e.target.value } })} />
            </Field>
            <Field label={t('settings.general.domains')}>
              <input className="input" value={domains} onChange={(e) => setDomains(e.target.value)} />
            </Field>
          </div>
        </Card>
        <div className="flex justify-end">
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/api/settings', {
                  method: 'PUT',
                  body: { profile: { name: form.profile.name, practice: form.profile.practice, timeZone: form.profile.timeZone }, partner: { ...form.partner, domains: domains.split(',').map((d) => d.trim()).filter(Boolean) } },
                });
                toast(t('settings.saved'));
                void mutate();
                router.refresh();
              } catch (e) {
                toast((e as Error).message, { tone: 'error' });
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('common.save')}
          </Button>
        </div>
        <Card title={t('settings.general.timelineCalendar')}>
          <p className="mb-3 text-xs text-ink-500">{t('settings.general.timelineCalendarHint')}</p>
          <div className="space-y-2">
            {cals.calendars.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="target"
                  checked={c.is_timeline_target}
                  onChange={async () => {
                    await api('/api/calendars', { method: 'PUT', body: { timelineTarget: c.id } });
                    void mutateCals();
                    toast(t('settings.saved'));
                  }}
                />
                {c.label}
              </label>
            ))}
          </div>
        </Card>
        <Card title={t('settings.general.language')}>
          <div className="flex gap-2">
            {(['en', 'pt'] as const).map((l) => (
              <Button
                key={l}
                variant={locale === l ? 'primary' : 'secondary'}
                onClick={async () => {
                  await api('/api/me/locale', { method: 'PUT', body: { locale: l } });
                  router.refresh();
                }}
              >
                {l === 'en' ? 'English' : 'Português'}
              </Button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
