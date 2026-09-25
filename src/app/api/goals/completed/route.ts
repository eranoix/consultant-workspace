import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { completedByDay } from '@/lib/server/services/goals';

export const dynamic = 'force-dynamic';
export const GET = withUser(async () => json({ groups: await completedByDay(pool()) }));
