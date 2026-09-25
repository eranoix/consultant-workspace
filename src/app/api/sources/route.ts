import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { listSources } from '@/lib/server/services/approvals';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req) => {
  const q = new URL(req.url).searchParams;
  const rows = await listSources(pool(), {
    kind: q.get('kind') ?? undefined,
    status: q.get('status') ?? undefined,
    side: q.get('side') ?? undefined,
    clientId: q.get('client') ?? undefined,
    decision: q.get('decision') ?? undefined,
    q: q.get('q') ?? undefined,
    limit: Number(q.get('limit') ?? 100),
  });
  return json({ sources: rows });
});
