import { expand, describe as describeRule, type RecurrenceRule, InvalidRule } from '@/lib/engine/recurrence';

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function parseRRule(raw: string): RecurrenceRule {
  const parts = new Map<string, string>();
  for (const piece of raw.replace(/^RRULE:/i, '').split(';')) {
    if (!piece.trim()) continue;
    const [k, v] = piece.split('=');
    if (!k || v === undefined) throw new InvalidRule(`Malformed RRULE part "${piece}"`);
    parts.set(k.trim().toUpperCase(), v.trim().toUpperCase());
  }
  const freq = parts.get('FREQ');
  const frequency = freq === 'DAILY' ? 'daily' : freq === 'WEEKLY' ? 'weekly' : freq === 'MONTHLY' ? 'monthly' : null;
  if (!frequency) throw new InvalidRule(`Unsupported FREQ "${freq ?? ''}"`);
  const rule: RecurrenceRule = { frequency };
  const interval = parts.get('INTERVAL');
  if (interval) {
    const n = Number(interval);
    if (!Number.isInteger(n) || n < 1) throw new InvalidRule('INTERVAL must be a positive integer');
    rule.interval = n;
  }
  const byday = parts.get('BYDAY');
  if (byday) {
    rule.byWeekday = byday.split(',').map((d) => {
      const i = DAYS.indexOf(d);
      if (i < 0) throw new InvalidRule(`Unknown BYDAY "${d}"`);
      return i;
    });
  }
  const bymonthday = parts.get('BYMONTHDAY');
  if (bymonthday) rule.byMonthDay = bymonthday.split(',').map(Number);
  const count = parts.get('COUNT');
  if (count) rule.count = Number(count);
  const until = parts.get('UNTIL');
  if (until) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(until);
    if (!m) throw new InvalidRule('UNTIL must start with YYYYMMDD');
    rule.until = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  }
  return rule;
}

export function formatRRule(rule: RecurrenceRule): string {
  const out = [`FREQ=${rule.frequency.toUpperCase()}`];
  if (rule.interval && rule.interval > 1) out.push(`INTERVAL=${rule.interval}`);
  if (rule.byWeekday?.length) out.push(`BYDAY=${rule.byWeekday.map((d) => DAYS[d]).join(',')}`);
  if (rule.byMonthDay?.length) out.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.count != null) out.push(`COUNT=${rule.count}`);
  if (rule.until != null) out.push(`UNTIL=${new Date(rule.until).toISOString().slice(0, 10).replace(/-/g, '')}`);
  return out.join(';');
}

export function isoToNoonUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d, 12);
}

export function noonUtcToIso(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function occurrenceDates(
  goal: { rrule: string | null; startsOn: string; dueOn?: string | null },
  from: string,
  to: string,
): string[] {
  if (!goal.rrule) {
    const d = goal.dueOn ?? goal.startsOn;
    return d >= from && d <= to ? [d] : [];
  }
  const rule = parseRRule(goal.rrule);
  if (goal.dueOn && rule.until == null && rule.count == null) rule.until = isoToNoonUtc(goal.dueOn) + 12 * 3600_000 - 1000;
  return expand({ rule, start: isoToNoonUtc(goal.startsOn), timeZone: 'UTC', to: isoToNoonUtc(to), limit: 2000 })
    .map(noonUtcToIso)
    .filter((d) => d >= from);
}

export function describeRRule(raw: string | null): string {
  if (!raw) return 'Once';
  try {
    return describeRule(parseRRule(raw));
  } catch {
    return raw;
  }
}
