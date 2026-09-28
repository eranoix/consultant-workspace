import { pool } from '@/lib/server/db';
import { json, parseBody } from '@/lib/server/http';
import { preflight, withToken } from '@/lib/server/tokenApi';
import { deleteTask, getTask, TaskPatch, updateTask } from '@/lib/server/services/board';

export const GET = withToken<{ id: string }>('tasks:read', async (_req, { params }) => json(await getTask(pool(), params.id)));

export const PATCH = withToken<{ id: string }>('tasks:update', async (req, { params }) => {
  const { status: _status, ...patch } = await parseBody(req, TaskPatch);
  return json(await updateTask(pool(), params.id, patch));
});

export const DELETE = withToken<{ id: string }>('tasks:delete', async (_req, { params }) => {
  await deleteTask(pool(), params.id);
  return json({ ok: true });
});

export const OPTIONS = preflight;
