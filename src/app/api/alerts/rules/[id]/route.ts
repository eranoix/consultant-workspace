import { pool } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { deleteRule, saveRule } from '@/lib/server/services/alerts';
import { RuleSchema } from '@/lib/server/ruleSchema';

export const PATCH = withUser<{ id: string }>(async (req, { params }) => {
  const b = await parseBody(req, RuleSchema.partial());
  await saveRule(pool(), params.id, b);
  return json({ ok: true });
});

export const DELETE = withUser<{ id: string }>(async (_req, { params }) => {
  await deleteRule(pool(), params.id);
  return json({ ok: true });
});
