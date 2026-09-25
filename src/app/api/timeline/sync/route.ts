import { z } from 'zod';
import { tx } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { syncWeek, timeZoneOf } from '@/lib/server/services/timeline';
import { mondayOf } from '@/lib/domain/time';

export const POST = withUser(async (req) => {
  const { week } = await parseBody(req, z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  const result = await tx(async (db) => syncWeek(db, mondayOf(week), await timeZoneOf(db)));
  return json({ result });
});
