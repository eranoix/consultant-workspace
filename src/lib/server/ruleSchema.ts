import { z } from 'zod';
import { EVENTS, OPERATORS } from '@/lib/domain/rules';

export const ConditionSchema = z.object({ field: z.string().min(1).max(60), op: z.enum(OPERATORS), value: z.string().max(300) });

export const RuleSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().optional(),
  event: z.enum(EVENTS),
  match: z.enum(['all', 'any']).optional(),
  conditions: z.array(ConditionSchema).max(10).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  channels: z.array(z.enum(['outbox', 'email', 'whatsapp'])).min(1).optional(),
  cooldownMin: z.number().int().min(0).max(10080).optional(),
});
