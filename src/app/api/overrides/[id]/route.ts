import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await pool().query('DELETE FROM side_overrides WHERE id = $1', [params.id]);
  return json({ ok: true });
});
