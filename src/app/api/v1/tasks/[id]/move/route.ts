import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody } from '@/lib/server/http';
import { preflight, withToken } from '@/lib/server/tokenApi';
import { moveTask, STATUSES } from '@/lib/server/services/board';

const Body = z.object({ status: z.enum(STATUSES), beforeId: z.string().uuid().nullable().optional(), afterId: z.string().uuid().nullable().optional() });

export const POST = withToken<{ id: string }>('tasks:move', async (req, { params }) => {
  const b = await parseBody(req, Body);
  return json(await moveTask(pool(), params.id, b.status, b.beforeId, b.afterId));
});

export const OPTIONS = preflight;
