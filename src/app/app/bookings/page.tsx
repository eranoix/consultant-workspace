import type { Metadata } from 'next';
import { BookingsAdmin } from '@/components/booking/BookingsAdmin';

export const metadata: Metadata = { title: 'Bookings' };

export default function BookingsPage() {
  return <BookingsAdmin />;
}
