import { describe, expect, it } from 'vitest';
import { describeRRule, formatRRule, occurrenceDates, parseRRule } from '@/lib/domain/rrule';

describe('RRULE parsing', () => {
  it('parses the subset goals use and prints it back', () => {
    const rule = parseRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6');
    expect(rule).toEqual({ frequency: 'weekly', interval: 2, byWeekday: [1, 3], count: 6 });
    expect(formatRRule(rule)).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6');
  });

  it('rejects what it does not support instead of guessing', () => {
    expect(() => parseRRule('FREQ=HOURLY')).toThrow();
    expect(() => parseRRule('FREQ=WEEKLY;BYDAY=XX')).toThrow();
    expect(() => parseRRule('FREQ=DAILY;INTERVAL=0')).toThrow();
  });

  it('describes a rule in words', () => {
    expect(describeRRule('FREQ=WEEKLY;BYDAY=FR')).toBe('Every week on Fri');
    expect(describeRRule(null)).toBe('Once');
  });
});

describe('goal occurrences', () => {
  it('expands a weekly rule inside a window', () => {
    const dates = occurrenceDates({ rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', startsOn: '2026-09-01' }, '2026-09-07', '2026-09-20');
    expect(dates).toEqual(['2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17']);
  });

  it('never produces dates before the start', () => {
    expect(occurrenceDates({ rrule: 'FREQ=DAILY', startsOn: '2026-09-10' }, '2026-09-08', '2026-09-11')).toEqual(['2026-09-10', '2026-09-11']);
  });

  it('respects COUNT across windows', () => {
    const all = occurrenceDates({ rrule: 'FREQ=DAILY;COUNT=3', startsOn: '2026-09-01' }, '2026-08-01', '2026-12-31');
    expect(all).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('stops at the goal due date when the rule has no end', () => {
    expect(occurrenceDates({ rrule: 'FREQ=WEEKLY;BYDAY=MO', startsOn: '2026-09-01', dueOn: '2026-09-15' }, '2026-09-01', '2026-10-31')).toEqual(['2026-09-07', '2026-09-14']);
  });

  it('skips the 31st in short months instead of inventing a date', () => {
    expect(occurrenceDates({ rrule: 'FREQ=MONTHLY;BYMONTHDAY=31', startsOn: '2026-08-31' }, '2026-08-01', '2026-12-31')).toEqual(['2026-08-31', '2026-10-31', '2026-12-31']);
  });

  it('gives a one-off goal a single occurrence on its due date', () => {
    expect(occurrenceDates({ rrule: null, startsOn: '2026-09-01', dueOn: '2026-09-20' }, '2026-09-14', '2026-09-20')).toEqual(['2026-09-20']);
    expect(occurrenceDates({ rrule: null, startsOn: '2026-09-01', dueOn: '2026-09-20' }, '2026-09-01', '2026-09-19')).toEqual([]);
  });
});
