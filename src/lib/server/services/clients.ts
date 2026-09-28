import type { Db } from '../db';
import type { ClientRef, InferContext, Side, SideOverride } from '@/lib/domain/side';
import { getSettings } from '../settings';

export interface ClientRow {
  id: string;
  name: string;
  aliases: string[];
  domains: string[];
  side: Side;
  engagement: string | null;
  active: boolean;
  color: string;
  open_tasks?: number;
}

export async function listClients(db: Db, opts: { withCounts?: boolean } = {}): Promise<ClientRow[]> {
  const counts = opts.withCounts
    ? `, (SELECT count(*)::int FROM tasks t WHERE t.client_id = c.id AND t.status <> 'done') AS open_tasks`
    : '';
  const { rows } = await db.query<ClientRow>(
    `SELECT c.id, c.name, c.aliases, c.domains, c.side, c.engagement, c.active, c.color${counts}
       FROM clients c ORDER BY c.active DESC, c.name`,
  );
  return rows;
}

export async function inferContext(db: Db): Promise<InferContext> {
  const clients = await db.query<ClientRef & { active: boolean }>('SELECT id, name, aliases, domains, side, active FROM clients');
  const overrides = await db.query<{ kind: SideOverride['kind']; pattern: string; side: Side; client_id: string | null }>(
    'SELECT kind, pattern, side, client_id FROM side_overrides',
  );
  const settings = await getSettings(db);
  return {
    clients: clients.rows,
    overrides: overrides.rows.map((o) => ({ kind: o.kind, pattern: o.pattern, side: o.side, clientId: o.client_id })),
    partnerDomains: settings.partner.domains,
    ownDomains: settings.profile.ownDomains,
  };
}

export async function sideOfClient(db: Db, clientId: string | null | undefined): Promise<Side | null> {
  if (!clientId) return null;
  const { rows } = await db.query<{ side: Side }>('SELECT side FROM clients WHERE id = $1', [clientId]);
  return rows[0]?.side ?? null;
}
