import { pool, tx } from '@/lib/server/db';
import { errorResponse, json } from '@/lib/server/http';
import { bookingByToken, cancelBooking } from '@/lib/server/services/bookings';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    return json(await bookingByToken(pool(), (await ctx.params).token));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const token = (await ctx.params).token;
    await tx((db) => cancelBooking(db, { token }));
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
