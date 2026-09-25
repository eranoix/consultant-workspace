import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { revokeToken } from '@/lib/server/services/tokens';

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await revokeToken(pool(), params.id);
  return json({ ok: true });
});
