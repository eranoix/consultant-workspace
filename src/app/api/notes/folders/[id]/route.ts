import { z } from 'zod';
import { pool, tx } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { deleteFolder, updateFolder } from '@/lib/server/services/notes';

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  const b = await parseBody(req, z.object({ name: z.string().trim().min(1).max(120).optional(), parentId: z.string().uuid().nullable().optional(), position: z.number().optional() }));
  await updateFolder(pool(), params.id, b);
  return json({ ok: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await tx((db) => deleteFolder(db, params.id));
  return json({ ok: true });
});
