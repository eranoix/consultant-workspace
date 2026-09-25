import { pool } from '@/lib/server/db';
import { json } from '@/lib/server/http';
import { preflight, withToken } from '@/lib/server/tokenApi';
import { listClients } from '@/lib/server/services/clients';

export const dynamic = 'force-dynamic';

export const GET = withToken('clients:read', async () => {
  const clients = await listClients(pool());
  return json({ clients: clients.map(({ id, name, side, engagement, active }) => ({ id, name, side, engagement, active })) });
});

export const OPTIONS = preflight;
