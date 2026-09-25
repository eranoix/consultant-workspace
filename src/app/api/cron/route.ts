import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { intakeHealth, jobsHealth } from '@/lib/server/services/cron';

export const dynamic = 'force-dynamic';

export const GET = withUser(async () => {
  const db = pool();
  const [jobs, intake] = await Promise.all([jobsHealth(db), intakeHealth(db)]);
  return json({ ...jobs, intake });
});
