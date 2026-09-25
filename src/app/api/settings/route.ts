import { z } from 'zod';
import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { getSettings, putSetting } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const GET = withUser(async () => json(await getSettings(pool())));

const Body = z.object({
  profile: z.object({ name: z.string().min(1).max(100), practice: z.string().min(1).max(100), timeZone: z.string().min(3).max(60) }).partial().optional(),
  partner: z.object({ name: z.string().min(1).max(100), shortName: z.string().min(1).max(40), domains: z.array(z.string().toLowerCase().min(3)).max(10) }).partial().optional(),
});

export const PUT = withUser(async (req) => {
  const b = await parseBody(req, Body);
  const db = pool();
  const current = await getSettings(db);
  if (b.profile) {
    if (b.profile.timeZone) new Intl.DateTimeFormat('en', { timeZone: b.profile.timeZone });
    await putSetting(db, 'profile', { ...current.profile, ...b.profile });
  }
  if (b.partner) await putSetting(db, 'partner', { ...current.partner, ...b.partner });
  return json(await getSettings(db));
});
