import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { listCandidates } from '@/lib/server/services/approvals';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req) => {
  const q = new URL(req.url).searchParams;
  const rows = await listCandidates(pool(), {
    decision: q.get('decision') ?? undefined,
    side: q.get('side') ?? undefined,
    kind: q.get('kind') ?? undefined,
  });
  return json({ candidates: rows });
});
