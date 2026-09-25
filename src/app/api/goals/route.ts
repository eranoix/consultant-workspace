import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { createGoal, listGoals } from '@/lib/server/services/goals';
import { timeZoneOf } from '@/lib/server/services/timeline';
import { addDays, dateInZone } from '@/lib/domain/time';

export const dynamic = 'force-dynamic';

const Iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = withUser(async (req) => {
  const db = pool();
  const today = dateInZone(Date.now(), await timeZoneOf(db));
  const q = new URL(req.url).searchParams;
  const from = Iso.safeParse(q.get('from')).data ?? addDays(today, -7);
  const to = Iso.safeParse(q.get('to')).data ?? addDays(today, 14);
  return json({ today, from, to, ...(await listGoals(db, from, to)) });
});

const Body = z.object({
  parentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  side: z.enum(['partner', 'direct']).nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  rrule: z.string().max(200).nullable().optional(),
  startsOn: Iso.optional(),
  dueOn: Iso.nullable().optional(),
});

export const POST = withUser(async (req) => json({ id: await createGoal(pool(), await parseBody(req, Body)) }, 201));
