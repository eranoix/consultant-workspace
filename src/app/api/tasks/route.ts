import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { createTask, listTasks, TaskCreate } from '@/lib/server/services/board';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req) => {
  const q = new URL(req.url).searchParams;
  const tasks = await listTasks(pool(), {
    status: q.get('status') ?? undefined,
    side: q.get('side') ?? undefined,
    clientId: q.get('client') ?? undefined,
    q: q.get('q') ?? undefined,
    includeDone: q.get('includeDone') === '1',
  });
  return json({ tasks });
});

export const POST = withUser(async (req, { user }) => {
  const input = await parseBody(req, TaskCreate);
  return json(await createTask(pool(), input, { userId: user.id }), 201);
});
