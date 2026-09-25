'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { useLocale, useT } from '@/i18n/client';
import { Badge, Button } from '@/components/ui';

export function ManageBooking({ token, booking, timeZone }: { token: string; booking: { starts_at: string; service_name: string; customer_name: string; status: string }; timeZone: string }) {
  const t = useT();
  const locale = useLocale();
  const [status, setStatus] = useState(booking.status);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{booking.service_name}</h1>
        <Badge tone={status === 'confirmed' ? 'green' : 'neutral'}>{t(`bookings.public.status.${status}`)}</Badge>
      </div>
      <p className="mt-1 text-ink-600">
        {new Date(booking.starts_at).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone })}
      </p>
      <p className="text-sm text-ink-500">{booking.customer_name}</p>
      {status === 'confirmed' && (
        <Button
          variant="danger"
          className="mt-5"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            await api(`/api/public/bookings/${token}`, { method: 'DELETE' });
            setStatus('cancelled');
            setBusy(false);
          }}
        >
          {t('bookings.public.cancel')}
        </Button>
      )}
    </div>
  );
}
