import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { HttpError, json, parseBody, withUser } from '@/lib/server/http';
import { JOBS, requestRun } from '@/lib/server/services/cron';

export const POST = withUser<{ name: string }>(async (req, { params }) => {
  if (!JOBS.some((j) => j.name === params.name)) throw new HttpError(404, 'Unknown job');
  const b = await parseBody(req, z.object({ action: z.enum(['run', 'enable', 'disable']) }));
  if (b.action === 'run') await requestRun(pool(), params.name);
  else await pool().query('UPDATE cron_jobs SET enabled = $2 WHERE name = $1', [params.name, b.action === 'enable']);
  return json({ ok: true });
});
