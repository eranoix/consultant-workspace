import { describe, expect, it } from 'vitest';
import { ApprovalError, assertCanComplete, assertCanDecide, completionPlan, editableFields, undoPlan, type CandidateLike } from '@/lib/domain/approval';

const c = (id: string, decision: CandidateLike['decision'], taskId: string | null = null): CandidateLike => ({ id, decision, taskId });

describe('completing a review', () => {
  it('refuses while any task is unclassified', () => {
    expect(() => assertCanComplete('pending', [c('a', 'approved'), c('b', 'pending')])).toThrow(ApprovalError);
    try {
      assertCanComplete('pending', [c('a', 'pending'), c('b', 'pending')]);
    } catch (e) {
      expect((e as ApprovalError).code).toBe('unclassified');
      expect((e as Error).message).toMatch(/2 tasks/);
    }
  });

  it('allows it when every task is approved or no action, or there are none', () => {
    expect(() => assertCanComplete('pending', [c('a', 'approved'), c('b', 'no_action')])).not.toThrow();
    expect(() => assertCanComplete('pending', [])).not.toThrow();
  });

  it('refuses a review that is already complete', () => {
    expect(() => assertCanComplete('reviewed', [c('a', 'approved')])).toThrow(/Already reviewed/);
  });

  it('creates board tasks only for approved candidates, never for pending or no action', () => {
    const plan = completionPlan([c('a', 'approved'), c('b', 'no_action'), c('c', 'approved'), c('d', 'pending')]);
    expect(plan.toCreate).toEqual(['a', 'c']);
    expect(plan.approved).toBe(2);
    expect(plan.noAction).toBe(1);
  });

  it('does not duplicate tasks when a reopened review is completed again', () => {
    expect(completionPlan([c('a', 'approved', 'task-1'), c('b', 'approved')]).toCreate).toEqual(['b']);
  });
});

describe('deciding and undoing', () => {
  it('only accepts real decisions while the review is open', () => {
    expect(() => assertCanDecide('pending', 'approved')).not.toThrow();
    expect(() => assertCanDecide('pending', 'pending')).toThrow();
    expect(() => assertCanDecide('reviewed', 'no_action')).toThrow(/undo first/);
  });

  it('resets a no action, or an approve not yet on the board', () => {
    expect(undoPlan(c('a', 'no_action'), null)).toEqual({ kind: 'reset' });
    expect(undoPlan(c('a', 'approved'), null)).toEqual({ kind: 'reset' });
  });

  it('takes an untouched backlog task back off the board', () => {
    expect(undoPlan(c('a', 'approved', 't1'), 'backlog')).toEqual({ kind: 'reset-and-remove-board-task', taskId: 't1' });
  });

  it('refuses once the task is being worked on', () => {
    expect(undoPlan(c('a', 'approved', 't1'), 'doing').kind).toBe('refuse');
    expect(undoPlan(c('a', 'pending'), null).kind).toBe('refuse');
  });

  it('never lets an edit carry a decision', () => {
    expect(editableFields({ title: 'x', decision: 'approved' })).toEqual({ title: 'x' });
  });
});
