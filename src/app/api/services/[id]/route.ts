import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  const b = await parseBody(req, z.object({ calendarAccountId: z.string().uuid().nullable().optional(), active: z.boolean().optional() }));
  if (b.calendarAccountId !== undefined) await pool().query('UPDATE services SET calendar_account_id = $2 WHERE id = $1', [params.id, b.calendarAccountId]);
  if (b.active !== undefined) await pool().query('UPDATE services SET active = $2 WHERE id = $1', [params.id, b.active]);
  return json({ ok: true });
});
