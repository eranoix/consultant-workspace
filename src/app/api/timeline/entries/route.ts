import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { createEntry } from '@/lib/server/services/timeline';

const Body = z.object({
  taskId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(300).optional(),
  startsAt: z.string().datetime(),
  durationMin: z.number().int().min(5).max(720),
  clientId: z.string().uuid().nullable().optional(),
  side: z.enum(['partner', 'direct']).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const POST = withUser(async (req, { user }) => {
  const b = await parseBody(req, Body);
  return json({ id: await createEntry(pool(), b, user.id) }, 201);
});
