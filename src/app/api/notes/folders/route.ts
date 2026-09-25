import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { createFolder, listFolders } from '@/lib/server/services/notes';

export const dynamic = 'force-dynamic';

export const GET = withUser(async () => json({ folders: await listFolders(pool()) }));

export const POST = withUser(async (req) => {
  const b = await parseBody(req, z.object({ name: z.string().trim().min(1).max(120), parentId: z.string().uuid().nullable().optional() }));
  return json({ id: await createFolder(pool(), b.name, b.parentId ?? null) }, 201);
});
