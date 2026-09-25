import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { deleteEntry, updateEntry } from '@/lib/server/services/timeline';

const Patch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  startsAt: z.string().datetime().optional(),
  durationMin: z.number().int().min(5).max(720).optional(),
  clientId: z.string().uuid().nullable().optional(),
  side: z.enum(['partner', 'direct']).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  await updateEntry(pool(), params.id, await parseBody(req, Patch));
  return json({ ok: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await deleteEntry(pool(), params.id);
  return json({ ok: true });
});
