import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { deleteGoal, updateGoal } from '@/lib/server/services/goals';

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Patch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  side: z.enum(['partner', 'direct']).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  rrule: z.string().max(200).nullable().optional(),
  startsOn: Iso.optional(),
  dueOn: Iso.nullable().optional(),
  status: z.enum(['active', 'achieved', 'archived']).optional(),
});

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  await updateGoal(pool(), params.id, await parseBody(req, Patch));
  return json({ ok: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await deleteGoal(pool(), params.id);
  return json({ ok: true });
});
