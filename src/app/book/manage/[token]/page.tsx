import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pool } from '@/lib/server/db';
import { getSettings } from '@/lib/server/settings';
import { bookingByToken } from '@/lib/server/services/bookings';
import { PublicShell } from '@/components/booking/PublicShell';
import { ManageBooking } from './ManageBooking';

export const metadata: Metadata = { title: 'Your booking', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const settings = await getSettings();
  const booking = await bookingByToken(pool(), token).catch(() => null);
  if (!booking) notFound();
  return (
    <PublicShell name={settings.profile.name} practice={settings.profile.practice}>
      <ManageBooking token={token} booking={{ starts_at: new Date(booking.starts_at).toISOString(), service_name: booking.service_name, customer_name: booking.customer_name, status: booking.status }} timeZone={settings.profile.timeZone} />
    </PublicShell>
  );
}
