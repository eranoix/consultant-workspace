import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { listRules, saveRule } from '@/lib/server/services/alerts';
import { RuleSchema } from '@/lib/server/ruleSchema';

export const dynamic = 'force-dynamic';

export const GET = withUser(async () => json({ rules: await listRules(pool()) }));

export const POST = withUser(async (req) => {
  const b = await parseBody(req, RuleSchema);
  return json({ id: await saveRule(pool(), null, b) }, 201);
});
