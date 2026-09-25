import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { createNote, listNotes } from '@/lib/server/services/notes';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req) => {
  const q = new URL(req.url).searchParams;
  return json({ notes: await listNotes(pool(), { folderId: q.get('folder'), q: q.get('q') ?? undefined }) });
});

export const POST = withUser(async (req) => {
  const b = await parseBody(req, z.object({ folderId: z.string().uuid().nullable().optional(), title: z.string().max(300).optional() }));
  return json({ id: await createNote(pool(), b) }, 201);
});
