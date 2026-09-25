import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { setOccurrence } from '@/lib/server/services/goals';

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  const b = await parseBody(req, z.object({ status: z.enum(['open', 'doing', 'done', 'skipped']), position: z.number().optional() }));
  await setOccurrence(pool(), params.id, b.status, b.position);
  return json({ ok: true });
});
