import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { availabilityRules, listBookings, listCalendars, listServices } from '@/lib/server/services/bookings';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req) => {
  const db = pool();
  const scope = new URL(req.url).searchParams.get('scope') === 'past' ? 'past' : 'upcoming';
  const [bookings, services, calendars, rules] = await Promise.all([listBookings(db, scope), listServices(db, false), listCalendars(db), availabilityRules(db)]);
  return json({ bookings, services, calendars, rules });
});
