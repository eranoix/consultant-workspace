import type { PoolClient } from 'pg';
import type { Db } from '../db';
import {
  ApprovalError,
  assertCanComplete,
  assertCanDecide,
  completionPlan,
  undoPlan,
  type BoardStatus,
  type Decision,
  type SourceStatus,
} from '@/lib/domain/approval';
import type { Side } from '@/lib/domain/side';
import { HttpError } from '../errors';
import { sideOfClient } from './clients';
import { nextPosition } from './board';

export interface SourceListItem {
  id: string;
  kind: 'meeting' | 'email';
  title: string;
  from_email: string | null;
  from_name: string | null;
  occurred_at: string;
  client_id: string | null;
  client_name: string | null;
  side: Side | null;
  side_reason: string | null;
  status: SourceStatus;
  reviewed_at: string | null;
  summary: { summary: string; topics: string[]; keyDecisions: string[]; provider: string } | null;
  task_total: number;
  task_pending: number;
  task_approved: number;
  task_no_action: number;
}

export interface CandidateRow {
  id: string;
  source_id: string;
  title: string;
  details: string;
  client_id: string | null;
  client_name: string | null;
  side: Side | null;
  due_date: string | null;
  decision: Decision;
  decided_at: string | null;
  task_id: string | null;
  task_status: BoardStatus | null;
  source_title?: string;
  source_kind?: 'meeting' | 'email';
  source_status?: SourceStatus;
}

const LIST_SQL = `
  SELECT s.id, s.kind, s.title, s.from_email, s.from_name, s.occurred_at, s.client_id, c.name AS client_name,
         s.side, s.side_reason, s.status, s.reviewed_at, s.summary,
         count(ct.id)::int AS task_total,
         count(ct.id) FILTER (WHERE ct.decision = 'pending')::int AS task_pending,
         count(ct.id) FILTER (WHERE ct.decision = 'approved')::int AS task_approved,
         count(ct.id) FILTER (WHERE ct.decision = 'no_action')::int AS task_no_action
    FROM sources s
    LEFT JOIN clients c ON c.id = s.client_id
    LEFT JOIN candidate_tasks ct ON ct.source_id = s.id`;

export async function listSources(
  db: Db,
  f: { kind?: string; status?: string; side?: string; clientId?: string; decision?: string; q?: string; limit?: number },
): Promise<SourceListItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.kind) add('s.kind = ?', f.kind);
  if (f.status) add('s.status = ?', f.status);
  if (f.side) add('s.side = ?', f.side);
  if (f.clientId) add('s.client_id = ?', f.clientId);
  if (f.q) add("(s.title ILIKE '%' || ? || '%')", f.q);
  where.push("NOT (s.direction = 'outbound')");
  let having = '';
  if (f.decision === 'approved') having = "HAVING count(ct.id) FILTER (WHERE ct.decision = 'approved') > 0";
  if (f.decision === 'no_action') having = "HAVING count(ct.id) FILTER (WHERE ct.decision = 'approved') = 0";
  params.push(Math.min(f.limit ?? 100, 200));
  const order = f.status === 'reviewed' ? 's.reviewed_at DESC NULLS LAST' : 's.occurred_at DESC';
  const { rows } = await db.query<SourceListItem>(
    `${LIST_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     GROUP BY s.id, c.name ${having} ORDER BY ${order} LIMIT $${params.length}`,
    params,
  );
  return rows;
}

const CANDIDATE_SQL = `
  SELECT ct.id, ct.source_id, ct.title, ct.details, ct.client_id, c.name AS client_name, ct.side,
         to_char(ct.due_date, 'YYYY-MM-DD') AS due_date, ct.decision, ct.decided_at, ct.task_id, t.status AS task_status,
         s.title AS source_title, s.kind AS source_kind, s.status AS source_status
    FROM candidate_tasks ct
    JOIN sources s ON s.id = ct.source_id
    LEFT JOIN clients c ON c.id = ct.client_id
    LEFT JOIN tasks t ON t.id = ct.task_id`;

export async function getSource(db: Db, id: string) {
  const { rows } = await db.query<SourceListItem & { body: string; participants: string[]; thread_id: string | null }>(
    `${LIST_SQL.replace('s.summary,', 's.summary, s.body, s.participants, s.thread_id,')} WHERE s.id = $1 GROUP BY s.id, c.name`,
    [id],
  );
  const source = rows[0];
  if (!source) throw new HttpError(404, 'Not found');
  const tasks = await db.query<CandidateRow>(`${CANDIDATE_SQL} WHERE ct.source_id = $1 ORDER BY ct.position, ct.created_at`, [id]);
  const thread = source.thread_id
    ? (
        await db.query<{ id: string; title: string; from_email: string | null; occurred_at: string; direction: string }>(
          'SELECT id, title, from_email, occurred_at, direction FROM sources WHERE thread_id = $1 ORDER BY occurred_at',
          [source.thread_id],
        )
      ).rows
    : [];
  return { ...source, tasks: tasks.rows, thread };
}

export async function listCandidates(db: Db, f: { decision?: string; side?: string; kind?: string; limit?: number }) {
  const where: string[] = ["s.direction = 'inbound'"];
  const params: unknown[] = [];
  if (f.decision) {
    params.push(f.decision);
    where.push(`ct.decision = $${params.length}`);
  }
  if (f.side) {
    params.push(f.side);
    where.push(`ct.side = $${params.length}`);
  }
  if (f.kind) {
    params.push(f.kind);
    where.push(`s.kind = $${params.length}`);
  }
  params.push(Math.min(f.limit ?? 150, 300));
  const { rows } = await db.query<CandidateRow>(
    `${CANDIDATE_SQL} WHERE ${where.join(' AND ')} ORDER BY s.occurred_at DESC, ct.position LIMIT $${params.length}`,
    params,
  );
  return rows;
}

async function lockSource(db: PoolClient, id: string): Promise<{ status: SourceStatus }> {
  const { rows } = await db.query<{ status: SourceStatus }>('SELECT status FROM sources WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw new HttpError(404, 'Not found');
  return rows[0];
}

async function candidate(db: PoolClient, id: string) {
  const { rows } = await db.query<{ id: string; source_id: string; decision: Decision; task_id: string | null }>(
    'SELECT id, source_id, decision, task_id FROM candidate_tasks WHERE id = $1',
    [id],
  );
  if (!rows[0]) throw new HttpError(404, 'Not found');
  return rows[0];
}

function asHttp(err: unknown): never {
  if (err instanceof ApprovalError) throw new HttpError(409, err.message, err.code);
  throw err;
}

export async function decide(db: PoolClient, candidateId: string, decision: Decision, userId: string) {
  const c = await candidate(db, candidateId);
  const src = await lockSource(db, c.source_id);
  try {
    assertCanDecide(src.status, decision);
  } catch (e) {
    asHttp(e);
  }
  await db.query('UPDATE candidate_tasks SET decision = $2, decided_at = now(), decided_by = $3 WHERE id = $1', [
    candidateId,
    decision,
    userId,
  ]);
}

export async function undo(db: PoolClient, candidateId: string) {
  const c = await candidate(db, candidateId);
  const src = await lockSource(db, c.source_id);
  const board = c.task_id
    ? (await db.query<{ status: BoardStatus }>('SELECT status FROM tasks WHERE id = $1', [c.task_id])).rows[0]?.status ?? null
    : null;
  const plan = undoPlan({ id: c.id, decision: c.decision, taskId: c.task_id }, board);
  if (plan.kind === 'refuse') throw new HttpError(409, plan.reason, 'in_progress');
  if (plan.kind === 'reset-and-remove-board-task') {
    await db.query('UPDATE candidate_tasks SET task_id = NULL WHERE id = $1', [c.id]);
    await db.query('DELETE FROM tasks WHERE id = $1', [plan.taskId]);
  }
  await db.query("UPDATE candidate_tasks SET decision = 'pending', decided_at = NULL, decided_by = NULL WHERE id = $1", [c.id]);
  if (src.status === 'reviewed') {
    await db.query("UPDATE sources SET status = 'pending', reviewed_at = NULL, reviewed_by = NULL WHERE id = $1", [c.source_id]);
  }
}

export interface CandidatePatch {
  title?: string;
  details?: string;
  clientId?: string | null;
  side?: Side | null;
  dueDate?: string | null;
}

export async function editCandidate(db: PoolClient, candidateId: string, patch: CandidatePatch) {
  const c = await candidate(db, candidateId);
  const sets: string[] = [];
  const params: unknown[] = [c.id];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.title !== undefined) set('title', patch.title);
  if (patch.details !== undefined) set('details', patch.details);
  if (patch.dueDate !== undefined) set('due_date', patch.dueDate);
  if (patch.clientId !== undefined) {
    set('client_id', patch.clientId);
    const side = await sideOfClient(db, patch.clientId);
    if (side) set('side', side);
    else if (patch.side !== undefined) set('side', patch.side);
  } else if (patch.side !== undefined) {
    set('side', patch.side);
    params.push(patch.side);
    sets.push(`client_id = CASE WHEN (SELECT side FROM clients WHERE id = client_id) IS DISTINCT FROM $${params.length} THEN NULL ELSE client_id END`);
  }
  if (!sets.length) return;
  await db.query(`UPDATE candidate_tasks SET ${sets.join(', ')} WHERE id = $1`, params);
  if (c.task_id) {
    await db.query(
      `UPDATE tasks t SET title = ct.title, description = ct.details, client_id = ct.client_id, side = ct.side, due_date = ct.due_date
         FROM candidate_tasks ct WHERE ct.id = $1 AND t.id = ct.task_id AND t.status = 'backlog'`,
      [c.id],
    );
  }
}

export async function editSource(db: PoolClient, id: string, patch: { title?: string; clientId?: string | null; side?: Side | null }) {
  await lockSource(db, id);
  if (patch.title !== undefined) await db.query('UPDATE sources SET title = $2 WHERE id = $1', [id, patch.title]);
  if (patch.clientId === undefined && patch.side === undefined) return;
  let side = patch.side ?? null;
  const clientId = patch.clientId === undefined ? undefined : patch.clientId;
  if (clientId) side = (await sideOfClient(db, clientId)) ?? side;
  if (clientId !== undefined) {
    await db.query("UPDATE sources SET client_id = $2, side = coalesce($3, side), client_locked = true, side_reason = 'manual' WHERE id = $1", [id, clientId, side]);
    await db.query("UPDATE candidate_tasks SET client_id = $2, side = coalesce($3, side) WHERE source_id = $1 AND decision = 'pending'", [id, clientId, side]);
  } else if (side) {
    await db.query(
      `UPDATE sources SET side = $2, client_locked = true, side_reason = 'manual',
              client_id = CASE WHEN (SELECT c.side FROM clients c WHERE c.id = client_id) IS DISTINCT FROM $2 THEN NULL ELSE client_id END
        WHERE id = $1`,
      [id, side],
    );
    await db.query(
      `UPDATE candidate_tasks SET side = $2,
              client_id = CASE WHEN (SELECT c.side FROM clients c WHERE c.id = client_id) IS DISTINCT FROM $2 THEN NULL ELSE client_id END
        WHERE source_id = $1 AND decision = 'pending'`,
      [id, side],
    );
  }
}

export async function completeReview(db: PoolClient, sourceId: string, userId: string) {
  const src = await lockSource(db, sourceId);
  const { rows } = await db.query<{
    id: string;
    decision: Decision;
    task_id: string | null;
    title: string;
    details: string;
    client_id: string | null;
    side: Side | null;
    due_date: string | null;
  }>(
    "SELECT id, decision, task_id, title, details, client_id, side, to_char(due_date, 'YYYY-MM-DD') AS due_date FROM candidate_tasks WHERE source_id = $1 ORDER BY position",
    [sourceId],
  );
  try {
    assertCanComplete(src.status, rows.map((r) => ({ id: r.id, decision: r.decision, taskId: r.task_id })));
  } catch (e) {
    asHttp(e);
  }
  const plan = completionPlan(rows.map((r) => ({ id: r.id, decision: r.decision, taskId: r.task_id })));
  const sourceRow = await db.query<{ client_id: string | null; side: Side | null }>('SELECT client_id, side FROM sources WHERE id = $1', [sourceId]);
  const fallback = sourceRow.rows[0];
  const created: string[] = [];
  for (const cid of plan.toCreate) {
    const r = rows.find((x) => x.id === cid)!;
    const clientId = r.client_id ?? fallback?.client_id ?? null;
    const side = r.side ?? fallback?.side ?? null;
    const pos = await nextPosition(db, 'backlog');
    const t = await db.query<{ id: string }>(
      `INSERT INTO tasks (title, description, status, position, client_id, side, due_date, origin, source_id, created_by)
       VALUES ($1, $2, 'backlog', $3, $4, $5, $6, 'approval', $7, $8) RETURNING id`,
      [r.title, r.details, pos, clientId, side, r.due_date, sourceId, userId],
    );
    await db.query('UPDATE candidate_tasks SET task_id = $2 WHERE id = $1', [cid, t.rows[0]!.id]);
    created.push(t.rows[0]!.id);
  }
  await db.query("UPDATE sources SET status = 'reviewed', reviewed_at = now(), reviewed_by = $2 WHERE id = $1", [sourceId, userId]);
  return { created: created.length, approved: plan.approved, noAction: plan.noAction };
}

export async function approvalCounts(db: Db) {
  const { rows } = await db.query<{ meetings: number; emails: number; tasks: number; reviewed_week: number }>(
    `SELECT count(*) FILTER (WHERE kind = 'meeting' AND status = 'pending' AND direction = 'inbound')::int AS meetings,
            count(*) FILTER (WHERE kind = 'email' AND status = 'pending' AND direction = 'inbound')::int AS emails,
            (SELECT count(*)::int FROM candidate_tasks ct JOIN sources s ON s.id = ct.source_id WHERE ct.decision = 'pending' AND s.status = 'pending') AS tasks,
            count(*) FILTER (WHERE status = 'reviewed' AND reviewed_at > now() - interval '7 days')::int AS reviewed_week
       FROM sources`,
  );
  return rows[0]!;
}
