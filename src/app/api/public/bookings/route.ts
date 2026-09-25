import { z } from 'zod';
import { tx } from '@/lib/server/db';
import { errorResponse, json, parseBody } from '@/lib/server/http';
import { createBooking } from '@/lib/server/services/bookings';

const Body = z.object({
  slug: z.string().min(1).max(80),
  startsAt: z.string().datetime(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const b = await parseBody(req, Body);
    return json(await tx((db) => createBooking(db, b)), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
