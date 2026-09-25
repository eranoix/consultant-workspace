import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { deleteNote, getNote, updateNote } from '@/lib/server/services/notes';

export const GET = withUser<{ id: string }>(async (_req, { params }) => json(await getNote(pool(), params.id)));

const Patch = z.object({
  title: z.string().max(300).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  contentText: z.string().max(200_000).optional(),
  folderId: z.string().uuid().nullable().optional(),
  pinned: z.boolean().optional(),
});

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  await updateNote(pool(), params.id, await parseBody(req, Patch));
  return json({ ok: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await deleteNote(pool(), params.id);
  return json({ ok: true });
});
