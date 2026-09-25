import { z } from 'zod';
import { json, parseBody, withUser } from '@/lib/server/http';
import { evaluateCondition, matchRule } from '@/lib/domain/rules';
import { RuleSchema } from '@/lib/server/ruleSchema';

// Try a rule against a sample payload before saving it.
export const POST = withUser(async (req) => {
  const b = await parseBody(req, z.object({ rule: RuleSchema, payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])) }));
  const rule = { event: b.rule.event, match: b.rule.match ?? 'all', conditions: b.rule.conditions ?? [], enabled: true } as const;
  return json({
    matches: matchRule(rule, b.rule.event, b.payload),
    conditions: rule.conditions.map((c) => ({ ...c, result: evaluateCondition(c, b.payload) })),
  });
});
