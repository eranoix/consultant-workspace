import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { daySummary } from '@/lib/server/services/dashboard';
import { todayRing } from '@/lib/server/services/goals';
import { listEntries } from '@/lib/server/services/timeline';
import { mondayOf } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';

export const GET = withUser(async () => {
  const db = pool();
  const summary = await daySummary(db);
  const [ring, entries] = await Promise.all([todayRing(db, summary.today), listEntries(db, mondayOf(summary.today), summary.timeZone)]);
  return json({ summary, ring, entries });
});
