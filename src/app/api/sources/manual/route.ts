import { z } from 'zod';
import { tx } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { ingest } from '@/lib/server/services/intake';

const Body = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(50_000),
  participants: z.array(z.string().email()).max(30).optional(),
  occurredAt: z.string().datetime().optional(),
});

export const POST = withUser(async (req) => {
  const b = await parseBody(req, Body);
  const res = await tx((db) =>
    ingest(db, { kind: 'meeting', title: b.title, body: b.body, participants: b.participants, occurredAt: b.occurredAt ? new Date(b.occurredAt) : new Date() }),
  );
  return json(res, 201);
});
