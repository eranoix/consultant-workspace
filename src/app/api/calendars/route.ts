import { z } from 'zod';
import { tx, pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { listCalendars } from '@/lib/server/services/bookings';

export const dynamic = 'force-dynamic';

export const GET = withUser(async () => json({ calendars: await listCalendars(pool()) }));

/** Choose the calendar the weekly timeline syncs to. */
export const PUT = withUser(async (req) => {
  const { timelineTarget } = await parseBody(req, z.object({ timelineTarget: z.string().uuid() }));
  await tx(async (db) => {
    await db.query('UPDATE calendar_accounts SET is_timeline_target = false WHERE is_timeline_target');
    await db.query('UPDATE calendar_accounts SET is_timeline_target = true WHERE id = $1', [timelineTarget]);
  });
  return json({ ok: true });
});
