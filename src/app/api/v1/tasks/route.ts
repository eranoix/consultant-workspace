import { pool } from '@/lib/server/db';
import { json, parseBody } from '@/lib/server/http';
import { preflight, withToken } from '@/lib/server/tokenApi';
import { createTask, listTasks, TaskCreate } from '@/lib/server/services/board';

export const dynamic = 'force-dynamic';

export const GET = withToken('tasks:read', async (req) => {
  const q = new URL(req.url).searchParams;
  const tasks = await listTasks(pool(), {
    status: q.get('status') ?? undefined,
    side: q.get('side') ?? undefined,
    clientId: q.get('client') ?? undefined,
    q: q.get('q') ?? undefined,
    includeDone: q.get('includeDone') === '1',
    limit: Number(q.get('limit') ?? 200),
  });
  return json({ tasks });
});

export const POST = withToken('tasks:create', async (req, { token }) => {
  const input = await parseBody(req, TaskCreate);
  return json(await createTask(pool(), input, { tokenId: token.id, origin: 'api' }), 201);
});

export const OPTIONS = preflight;
