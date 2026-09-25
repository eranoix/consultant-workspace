import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { alertAction } from '@/lib/server/services/alerts';

export const POST = withUser<{ id: string }>(async (req, { params }) => {
  const b = await parseBody(req, z.object({ action: z.enum(['acknowledge', 'snooze', 'resolve', 'reopen']), minutes: z.number().int().min(5).max(10080).optional() }));
  await alertAction(pool(), params.id, b.action, b.minutes);
  return json({ ok: true });
});
