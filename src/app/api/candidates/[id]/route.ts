import { z } from 'zod';
import { tx } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { editCandidate } from '@/lib/server/services/approvals';

const Patch = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  details: z.string().max(5000).optional(),
  clientId: z.string().uuid().nullable().optional(),
  side: z.enum(['partner', 'direct']).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

// Editing never approves: the body has no decision field, and the service
// ignores one if it were sent.
export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  const body = await parseBody(req, Patch);
  await tx((db) => editCandidate(db, params.id, body));
  return json({ ok: true });
});
