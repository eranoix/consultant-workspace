import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { listAlerts } from '@/lib/server/services/alerts';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req) => {
  const s = new URL(req.url).searchParams.get('status');
  const status = s === 'resolved' || s === 'all' ? s : 'live';
  return json({ alerts: await listAlerts(pool(), status) });
});
