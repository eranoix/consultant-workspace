import { json, withUser } from '@/lib/server/http';
import { disconnect, refresh } from '@/lib/server/services/integrations';

export const POST = withUser<{ id: string }>(async (_req, { user, params }) => json(await refresh(user.id, params.id)));

export const DELETE = withUser<{ id: string }>(async (_req, { user, params }) => {
  await disconnect(user.id, params.id);
  return json({ ok: true });
});
