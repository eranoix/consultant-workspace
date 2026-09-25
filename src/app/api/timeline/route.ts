import { pool } from '@/lib/server/db';
import { HttpError, json, withUser } from '@/lib/server/http';
import { getWeekState, listEntries, timeZoneOf } from '@/lib/server/services/timeline';
import { dateInZone, mondayOf } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req) => {
  const db = pool();
  const tz = await timeZoneOf(db);
  const raw = new URL(req.url).searchParams.get('week');
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new HttpError(400, 'week must be YYYY-MM-DD');
  const today = dateInZone(Date.now(), tz);
  const week = mondayOf(raw ?? today);
  const [entries, state] = await Promise.all([listEntries(db, week, tz), getWeekState(db, week)]);
  return json({ week, today, timeZone: tz, entries, state });
});
