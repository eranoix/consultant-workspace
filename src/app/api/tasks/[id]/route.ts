import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { deleteTask, getTask, TaskPatch, updateTask } from '@/lib/server/services/board';

export const GET = withUser<{ id: string }>(async (_req, { params }) => json(await getTask(pool(), params.id)));

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  const patch = await parseBody(req, TaskPatch);
  return json(await updateTask(pool(), params.id, patch));
});

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await deleteTask(pool(), params.id);
  return json({ ok: true });
});
