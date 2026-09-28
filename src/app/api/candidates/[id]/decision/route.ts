import { z } from 'zod';
import { tx } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { decide, undo } from '@/lib/server/services/approvals';

export const POST = withUser<{ id: string }>(async (req, { user, params }) => {
  const { decision } = await parseBody(req, z.object({ decision: z.enum(['approved', 'no_action']) }));
  await tx((db) => decide(db, params.id, decision, user.id));
  return json({ ok: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await tx((db) => undo(db, params.id));
  return json({ ok: true });
});
