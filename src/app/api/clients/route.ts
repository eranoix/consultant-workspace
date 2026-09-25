import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { listClients } from '@/lib/server/services/clients';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req) => {
  const counts = new URL(req.url).searchParams.get('counts') === '1';
  return json({ clients: await listClients(pool(), { withCounts: counts }) });
});

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  side: z.enum(['partner', 'direct']),
  domains: z.array(z.string().trim().toLowerCase().min(3)).default([]),
  aliases: z.array(z.string().trim().min(2)).default([]),
  engagement: z.string().max(200).nullable().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#64748b'),
});

export const POST = withUser(async (req) => {
  const b = await parseBody(req, Body);
  const { rows } = await pool().query<{ id: string }>(
    'INSERT INTO clients (name, side, domains, aliases, engagement, color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [b.name, b.side, b.domains, b.aliases, b.engagement ?? null, b.color],
  );
  return json({ id: rows[0]!.id }, 201);
});
