import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { listOutbox } from '@/lib/server/services/alerts';

export const dynamic = 'force-dynamic';
export const GET = withUser(async () => json({ messages: await listOutbox(pool()) }));
