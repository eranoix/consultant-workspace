import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { createToken, listTokens } from '@/lib/server/services/tokens';

export const dynamic = 'force-dynamic';

export const GET = withUser(async () => json({ tokens: await listTokens(pool()) }));

const Body = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.enum(['viewer', 'contributor', 'manager', 'custom']),
  permissions: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export const POST = withUser(async (req, { user }) => {
  const b = await parseBody(req, Body);
  return json(await createToken(pool(), b, user.id), 201);
});
