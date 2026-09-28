import { z } from 'zod';
import { asUser } from '@/lib/server/db';
import { HttpError, json, parseBody, withUser } from '@/lib/server/http';

const KEYS = ['board.view', 'timeline.backlog', 'timeline.view', 'goals.view', 'shortcuts', 'approvals.view'];

function checkKey(key: string) {
  if (!KEYS.includes(key)) throw new HttpError(404, 'Unknown preference');
}

export const GET = withUser<{ key: string }>(async (_req, { user, params }) => {
  checkKey(params.key);
  const value = await asUser(user.id, async (db) => {
    const { rows } = await db.query<{ value: unknown }>('SELECT value FROM user_preferences WHERE key = $1', [params.key]);
    return rows[0]?.value ?? null;
  });
  return json({ value });
});

export const PUT = withUser<{ key: string }>(async (req, { user, params }) => {
  checkKey(params.key);
  const { value } = await parseBody(req, z.object({ value: z.unknown() }));
  if (JSON.stringify(value ?? null).length > 8000) throw new HttpError(400, 'Preference too large');
  await asUser(user.id, (db) =>
    db.query(
      `INSERT INTO user_preferences (user_id, key, value) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [user.id, params.key, JSON.stringify(value ?? null)],
    ),
  );
  return json({ ok: true });
});
