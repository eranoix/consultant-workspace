import { describe, expect, it } from 'vitest';
import { extractDue, mockSummarize } from '@/lib/server/llm';

const occurredAt = new Date('2026-09-22T15:00:00Z'); // a Tuesday

describe('mock summarizer', () => {
  it('turns meeting notes into topics, decisions and candidate tasks', () => {
    const s = mockSummarize({
      kind: 'meeting',
      title: 'Pilot review',
      occurredAt,
      body: `Attendees: Maya Okafor, Lena Fischer
Discussed: Mispick rate dropped to 1.4 percent
Decision: Keep the pilot at two aisles
Action: Maya to prepare the week 1 report by Friday
Action: Marco to fix the label printer`,
    });
    expect(s.participants).toEqual(['Maya Okafor', 'Lena Fischer']);
    expect(s.topics[0]).toMatch(/Mispick rate/);
    expect(s.keyDecisions).toEqual(['Keep the pilot at two aisles']);
    expect(s.tasks.map((t) => t.title)).toEqual(['Prepare the week 1 report', 'Fix the label printer']);
    expect(s.tasks[0]!.dueDate).toBe('2026-09-25');
    expect(s.provider).toBe('mock');
  });

  it('finds requests in an email', () => {
    const s = mockSummarize({
      kind: 'email',
      title: 'Checklist',
      occurredAt,
      body: 'Hi Maya,\nCould you add a line for the cold chain temperature?\nPlease also send a Spanish version by tomorrow.\nGrace',
    });
    expect(s.tasks.map((t) => t.title)).toEqual(['Add a line for the cold chain temperature', 'Send a Spanish version']);
    expect(s.tasks[1]!.dueDate).toBe('2026-09-23');
  });

  it('is deterministic', () => {
    const input = { kind: 'meeting' as const, title: 'x', occurredAt, body: 'Action: do the thing\nDecision: yes' };
    expect(mockSummarize(input)).toEqual(mockSummarize(input));
  });

  it('reads due phrases relative to the meeting date', () => {
    expect(extractDue('by 2026-10-02', occurredAt)).toBe('2026-10-02');
    expect(extractDue('before Monday', occurredAt)).toBe('2026-09-28');
    expect(extractDue('by next week', occurredAt)).toBe('2026-09-29');
    expect(extractDue('by end of month', occurredAt)).toBe('2026-09-30');
    expect(extractDue('sometime', occurredAt)).toBeNull();
  });
});
