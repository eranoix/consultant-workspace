import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pool } from '@/lib/server/db';
import { getSettings } from '@/lib/server/settings';
import { serviceBySlug } from '@/lib/server/services/bookings';
import { PublicShell } from '@/components/booking/PublicShell';
import { BookingFlow } from '@/components/booking/BookingFlow';

export const metadata: Metadata = { title: 'Book a time' };
export const dynamic = 'force-dynamic';

export default async function BookService({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const settings = await getSettings();
  const service = await serviceBySlug(pool(), slug).catch(() => null);
  if (!service) notFound();
  return (
    <PublicShell name={settings.profile.name} practice={settings.profile.practice}>
      <h1 className="text-2xl font-semibold tracking-tight">{service.name}</h1>
      <p className="mb-6 mt-1 text-ink-600">
        {service.description} · {service.duration_min} min
      </p>
      <BookingFlow slug={service.slug} serviceName={service.name} duration={service.duration_min} />
    </PublicShell>
  );
}
