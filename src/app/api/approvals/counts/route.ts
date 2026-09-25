import { pool } from '@/lib/server/db';
import { json, withUser } from '@/lib/server/http';
import { approvalCounts } from '@/lib/server/services/approvals';

export const dynamic = 'force-dynamic';
export const GET = withUser(async () => json(await approvalCounts(pool())));
