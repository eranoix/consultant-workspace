/**
 * The approval gate between intake and the board.
 *
 * Nothing a summarizer proposes reaches the board on its own: every candidate
 * needs Approve or No action from a person, and a source can only be marked
 * Done once all of its tasks are classified.
 */

export type Decision = 'pending' | 'approved' | 'no_action';
export type SourceStatus = 'pending' | 'reviewed';
export type BoardStatus = 'backlog' | 'todo' | 'doing' | 'review' | 'done';

export interface CandidateLike {
  id: string;
  decision: Decision;
  taskId: string | null;
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    public code: 'unclassified' | 'already_reviewed' | 'in_progress' | 'invalid',
  ) {
    super(message);
  }
}

export function unclassified<T extends CandidateLike>(tasks: T[]): T[] {
  return tasks.filter((t) => t.decision === 'pending');
}

/** Throws unless the review can be completed. */
export function assertCanComplete(status: SourceStatus, tasks: CandidateLike[]): void {
  if (status === 'reviewed') throw new ApprovalError('Already reviewed', 'already_reviewed');
  const open = unclassified(tasks).length;
  if (open > 0) {
    throw new ApprovalError(
      `${open} task${open === 1 ? '' : 's'} still need Approve or No action`,
      'unclassified',
    );
  }
}

export interface CompletionPlan {
  /** Approved candidates that do not have a board task yet. */
  toCreate: string[];
  approved: number;
  noAction: number;
}

/**
 * What completing a review does. Only APPROVED candidates without a board
 * task produce one; re-completing a reopened review never duplicates.
 */
export function completionPlan(tasks: CandidateLike[]): CompletionPlan {
  return {
    toCreate: tasks.filter((t) => t.decision === 'approved' && !t.taskId).map((t) => t.id),
    approved: tasks.filter((t) => t.decision === 'approved').length,
    noAction: tasks.filter((t) => t.decision === 'no_action').length,
  };
}

export type UndoAction =
  | { kind: 'reset' }
  | { kind: 'reset-and-remove-board-task'; taskId: string }
  | { kind: 'refuse'; reason: string };

/**
 * Undoing a decision. An Approve whose board task is still in the backlog
 * takes the task back with it; once work on the task has started, undo is
 * refused rather than pulling work out from under a person.
 */
export function undoPlan(candidate: CandidateLike, boardStatus: BoardStatus | null): UndoAction {
  if (candidate.decision === 'pending') return { kind: 'refuse', reason: 'Nothing to undo' };
  if (candidate.decision === 'no_action' || !candidate.taskId || boardStatus === null) return { kind: 'reset' };
  if (boardStatus === 'backlog') return { kind: 'reset-and-remove-board-task', taskId: candidate.taskId };
  return { kind: 'refuse', reason: 'That task is already in progress on the board' };
}

/** A decision can change while the review is open; after it, only via undo. */
export function assertCanDecide(status: SourceStatus, next: Decision): void {
  if (next === 'pending') throw new ApprovalError('Use undo to reset a decision', 'invalid');
  if (status === 'reviewed') throw new ApprovalError('Already reviewed: undo first', 'already_reviewed');
}

/** Editing a candidate never changes its decision, so an edit cannot bypass the gate. */
export function editableFields<T extends Record<string, unknown>>(patch: T): Omit<T, 'decision'> {
  const { decision: _decision, ...rest } = patch as T & { decision?: unknown };
  return rest;
}
