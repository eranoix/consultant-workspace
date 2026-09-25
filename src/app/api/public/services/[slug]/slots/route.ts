import { pool } from '@/lib/server/db';
import { errorResponse, HttpError, json } from '@/lib/server/http';
import { serviceBySlug, slotsForDay } from '@/lib/server/services/bookings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const date = new URL(req.url).searchParams.get('date') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
    const db = pool();
    const service = await serviceBySlug(db, (await ctx.params).slug);
    const { timeZone, slots } = await slotsForDay(db, service, date);
    return json({ timeZone, slots: slots.map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })) });
  } catch (err) {
    return errorResponse(err);
  }
}
