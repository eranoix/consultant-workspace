import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { moveTask, STATUSES } from '@/lib/server/services/board';

const Body = z.object({
  status: z.enum(STATUSES),
  beforeId: z.string().uuid().nullable().optional(),
  afterId: z.string().uuid().nullable().optional(),
});

export const POST = withUser<{ id: string }>(async (req, { params }) => {
  const b = await parseBody(req, Body);
  return json(await moveTask(pool(), params.id, b.status, b.beforeId, b.afterId));
});
