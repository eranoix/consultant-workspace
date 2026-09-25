import { describe, expect, it } from 'vitest';
import { dedupeKey, evaluateCondition, inCooldown, matchRule, renderTemplate, type RuleLike } from '@/lib/domain/rules';

const unanswered: RuleLike = {
  event: 'email.unanswered',
  match: 'all',
  enabled: true,
  conditions: [
    { field: 'side', op: 'equals', value: 'direct' },
    { field: 'hours_unanswered', op: 'gt', value: '24' },
  ],
};

describe('alert rules', () => {
  it('fires on the right event when every condition holds', () => {
    expect(matchRule(unanswered, 'email.unanswered', { side: 'direct', hours_unanswered: 30 })).toBe(true);
    expect(matchRule(unanswered, 'email.unanswered', { side: 'direct', hours_unanswered: 3 })).toBe(false);
    expect(matchRule(unanswered, 'email.received', { side: 'direct', hours_unanswered: 30 })).toBe(false);
  });

  it('supports any-of rules and ignores disabled ones', () => {
    const any = { ...unanswered, match: 'any' as const };
    expect(matchRule(any, 'email.unanswered', { side: 'partner', hours_unanswered: 30 })).toBe(true);
    expect(matchRule({ ...unanswered, enabled: false }, 'email.unanswered', { side: 'direct', hours_unanswered: 30 })).toBe(false);
  });

  it('compares text case-insensitively and numbers numerically', () => {
    expect(evaluateCondition({ field: 'subject', op: 'contains', value: 'URGENT' }, { subject: 'Urgent: board moved' })).toBe(true);
    expect(evaluateCondition({ field: 'n', op: 'gte', value: '10' }, { n: '9' })).toBe(false);
    expect(evaluateCondition({ field: 'n', op: 'lt', value: 'abc' }, { n: 1 })).toBe(false);
    expect(evaluateCondition({ field: 'side', op: 'in', value: 'partner, direct' }, { side: 'direct' })).toBe(true);
    expect(evaluateCondition({ field: 'missing', op: 'not_contains', value: 'x' }, {})).toBe(true);
  });

  it('dedupes per rule and entity, with a cooldown after resolution', () => {
    expect(dedupeKey('r1', 'task:1')).toBe('r1:task:1');
    const now = new Date('2026-09-25T12:00:00Z');
    expect(inCooldown(new Date(now.getTime() - 10 * 60_000), 30, now)).toBe(true);
    expect(inCooldown(new Date(now.getTime() - 40 * 60_000), 30, now)).toBe(false);
    expect(inCooldown(null, 30, now)).toBe(false);
  });

  it('fills alert titles from the payload', () => {
    expect(renderTemplate('Overdue: {title} ({missing})', { title: 'Send deck' })).toBe('Overdue: Send deck ({missing})');
  });
});
