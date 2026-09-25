import { pool } from '@/lib/server/db';
import { errorResponse, json } from '@/lib/server/http';
import { openDays, serviceBySlug } from '@/lib/server/services/bookings';
import { getSettings } from '@/lib/server/settings';
import { dateInZone } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const db = pool();
    const service = await serviceBySlug(db, (await ctx.params).slug);
    const tz = (await getSettings(db)).profile.timeZone;
    return json({ timeZone: tz, days: await openDays(db, service, dateInZone(Date.now(), tz), Math.min(service.max_advance_days + 1, 31)) });
  } catch (err) {
    return errorResponse(err);
  }
}
