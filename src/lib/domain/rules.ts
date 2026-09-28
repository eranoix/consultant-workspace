export const EVENTS = [
  'email.received',
  'email.unanswered',
  'task.overdue',
  'task.due_today',
  'cron.late',
  'intake.stalled',
  'booking.created',
] as const;
export type AlertEvent = (typeof EVENTS)[number];

export const OPERATORS = ['equals', 'not_equals', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
export type Operator = (typeof OPERATORS)[number];

export interface Condition {
  field: string;
  op: Operator;
  value: string;
}

export interface RuleLike {
  event: string;
  match: 'all' | 'any';
  conditions: Condition[];
  enabled: boolean;
}

export type Payload = Record<string, string | number | boolean | null | undefined>;

export const EVENT_FIELDS: Record<AlertEvent, string[]> = {
  'email.received': ['from_email', 'from_domain', 'subject', 'client', 'side', 'thread_size'],
  'email.unanswered': ['from_email', 'from_domain', 'subject', 'client', 'side', 'hours_unanswered'],
  'task.overdue': ['title', 'client', 'side', 'status', 'days_overdue', 'priority'],
  'task.due_today': ['title', 'client', 'side', 'status', 'priority'],
  'cron.late': ['job', 'minutes_late', 'watched_by'],
  'intake.stalled': ['channel', 'hours_since_success'],
  'booking.created': ['service', 'customer_email', 'company', 'hours_until'],
};

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function evaluateCondition(c: Condition, payload: Payload): boolean {
  const raw = payload[c.field];
  const actual = raw === null || raw === undefined ? '' : String(raw).toLowerCase();
  const expected = c.value.trim().toLowerCase();
  switch (c.op) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      return expected !== '' && actual.includes(expected);
    case 'not_contains':
      return expected === '' || !actual.includes(expected);
    case 'in':
      return expected.split(',').map((s) => s.trim()).filter(Boolean).includes(actual);
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = asNumber(raw);
      const b = asNumber(c.value);
      if (a === null || b === null) return false;
      if (c.op === 'gt') return a > b;
      if (c.op === 'gte') return a >= b;
      if (c.op === 'lt') return a < b;
      return a <= b;
    }
    default:
      return false;
  }
}

export function matchRule(rule: RuleLike, event: string, payload: Payload): boolean {
  if (!rule.enabled || rule.event !== event) return false;
  if (rule.conditions.length === 0) return true;
  return rule.match === 'all'
    ? rule.conditions.every((c) => evaluateCondition(c, payload))
    : rule.conditions.some((c) => evaluateCondition(c, payload));
}

export function dedupeKey(ruleId: string, entity: string | null | undefined): string {
  return `${ruleId}:${entity ?? '-'}`;
}

export function inCooldown(lastResolvedAt: Date | null, cooldownMin: number, now: Date): boolean {
  if (!lastResolvedAt || cooldownMin <= 0) return false;
  return now.getTime() - lastResolvedAt.getTime() < cooldownMin * 60_000;
}

export function renderTemplate(tpl: string, payload: Payload): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (payload[k] === undefined || payload[k] === null ? m : String(payload[k])));
}
