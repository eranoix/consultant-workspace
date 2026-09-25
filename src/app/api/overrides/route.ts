import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export const GET = withUser(async () => {
  const { rows } = await pool().query(
    `SELECT o.id, o.kind, o.pattern, o.side, o.client_id, c.name AS client_name, o.note, o.created_at
       FROM side_overrides o LEFT JOIN clients c ON c.id = o.client_id ORDER BY o.kind, o.pattern`,
  );
  return json({ overrides: rows });
});

const Body = z.object({
  kind: z.enum(['sender', 'domain', 'keyword']),
  pattern: z.string().trim().toLowerCase().min(2).max(200),
  side: z.enum(['partner', 'direct']),
  clientId: z.string().uuid().nullable().optional(),
  note: z.string().max(300).optional(),
});

export const POST = withUser(async (req) => {
  const b = await parseBody(req, Body);
  const { rows } = await pool().query<{ id: string }>(
    'INSERT INTO side_overrides (kind, pattern, side, client_id, note) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [b.kind, b.pattern, b.side, b.clientId ?? null, b.note ?? null],
  );
  return json({ id: rows[0]!.id }, 201);
});
