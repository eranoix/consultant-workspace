import { z } from 'zod';
import { pool, tx } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { editSource, getSource } from '@/lib/server/services/approvals';

export const GET = withUser<{ id: string }>(async (_req, { params }) => json(await getSource(pool(), params.id)));

const Patch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  clientId: z.string().uuid().nullable().optional(),
  side: z.enum(['partner', 'direct']).nullable().optional(),
});

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  const body = await parseBody(req, Patch);
  await tx((db) => editSource(db, params.id, body));
  return json(await getSource(pool(), params.id));
});
