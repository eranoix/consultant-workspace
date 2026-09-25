import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { HttpError, json, parseBody, withUser } from '@/lib/server/http';

const Patch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  side: z.enum(['partner', 'direct']).optional(),
  domains: z.array(z.string().trim().toLowerCase().min(3)).optional(),
  aliases: z.array(z.string().trim().min(2)).optional(),
  engagement: z.string().max(200).nullable().optional(),
  active: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  const b = await parseBody(req, Patch);
  const cols: Record<string, unknown> = { name: b.name, side: b.side, domains: b.domains, aliases: b.aliases, engagement: b.engagement, active: b.active, color: b.color };
  const sets: string[] = [];
  const values: unknown[] = [params.id];
  for (const [k, v] of Object.entries(cols)) {
    if (v === undefined) continue;
    values.push(v);
    sets.push(`${k} = $${values.length}`);
  }
  if (sets.length) {
    const { rowCount } = await pool().query(`UPDATE clients SET ${sets.join(', ')} WHERE id = $1`, values);
    if (!rowCount) throw new HttpError(404, 'Client not found');
  }
  return json({ ok: true });
});
