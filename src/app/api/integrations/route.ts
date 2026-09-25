import { z } from 'zod';
import { json, parseBody, withUser } from '@/lib/server/http';
import { connect, listCredentials, PROVIDERS } from '@/lib/server/services/integrations';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (_req, { user }) => json({ providers: PROVIDERS, credentials: await listCredentials(user.id) }));

/** Mock OAuth: stands in for the provider's consent screen and callback. */
export const POST = withUser(async (req, { user }) => {
  const b = await parseBody(req, z.object({ provider: z.string().min(1), account: z.string().min(1) }));
  await connect(user.id, b.provider, b.account);
  return json({ ok: true }, 201);
});
