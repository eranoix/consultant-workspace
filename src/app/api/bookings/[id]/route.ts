import { tx } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { cancelBooking } from '@/lib/server/services/bookings';

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await tx((db) => cancelBooking(db, { id: params.id }));
  return json({ ok: true });
});
