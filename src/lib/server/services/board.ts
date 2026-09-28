import { z } from 'zod';
import type { Db } from '../db';
import { HttpError } from '../errors';
import { sideOfClient } from './clients';

export const STATUSES = ['backlog', 'todo', 'doing', 'review', 'done'] as const;
export type TaskStatus = (typeof STATUSES)[number];

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
  client_id: string | null;
  client_name: string | null;
  client_color: string | null;
  side: 'partner' | 'direct' | null;
  due_date: string | null;
  estimate_min: number | null;
  priority: 'low' | 'normal' | 'high';
  origin: 'manual' | 'approval' | 'api';
  source_id: string | null;
  source_title: string | null;
  source_kind: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  scheduled_min: number;
}

const SELECT = `
  SELECT t.id, t.title, t.description, t.status, t.position, t.client_id, c.name AS client_name, c.color AS client_color,
         t.side, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.estimate_min, t.priority, t.origin,
         t.source_id, s.title AS source_title, s.kind AS source_kind,
         t.created_at, t.updated_at, t.completed_at,
         coalesce((SELECT sum(e.duration_min) FROM timeline_entries e WHERE e.task_id = t.id), 0)::int AS scheduled_min
    FROM tasks t
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN sources s ON s.id = t.source_id`;

export const TaskCreate = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).optional().default(''),
  status: z.enum(STATUSES).optional().default('backlog'),
  clientId: z.string().uuid().nullable().optional(),
  side: z.enum(['partner', 'direct']).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimateMin: z.number().int().min(5).max(1440).nullable().optional(),
  priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
});
export type TaskCreateInput = z.infer<typeof TaskCreate>;

export const TaskPatch = TaskCreate.partial().extend({
  description: z.string().max(10_000).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  status: z.enum(STATUSES).optional(),
});
export type TaskPatchInput = z.infer<typeof TaskPatch>;

export async function listTasks(
  db: Db,
  f: { status?: string; clientId?: string; side?: string; q?: string; includeDone?: boolean; limit?: number } = {},
): Promise<TaskRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (f.status) add('t.status = ?', f.status);
  if (f.clientId === 'none') where.push('t.client_id IS NULL');
  else if (f.clientId) add('t.client_id = ?', f.clientId);
  if (f.side) add('t.side = ?', f.side);
  if (f.q) add("(t.title ILIKE '%' || ? || '%' OR t.description ILIKE '%' || ? || '%')", f.q);
  if (!f.includeDone && !f.status) where.push("(t.status <> 'done' OR t.completed_at > now() - interval '14 days')");
  params.push(Math.min(f.limit ?? 500, 1000));
  const { rows } = await db.query<TaskRow>(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.status, t.position LIMIT $${params.length}`,
    params,
  );
  return rows;
}

export async function getTask(db: Db, id: string): Promise<TaskRow> {
  const { rows } = await db.query<TaskRow>(`${SELECT} WHERE t.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Task not found');
  return rows[0];
}

export async function nextPosition(db: Db, status: string): Promise<number> {
  const { rows } = await db.query<{ p: number | null }>('SELECT max(position) AS p FROM tasks WHERE status = $1', [status]);
  return (rows[0]?.p ?? 0) + 1024;
}

async function resolveSide(db: Db, clientId: string | null | undefined, side: 'partner' | 'direct' | null | undefined) {
  const clientSide = await sideOfClient(db, clientId);
  return clientSide ?? side ?? null;
}

export async function createTask(
  db: Db,
  input: TaskCreateInput,
  who: { userId?: string | null; tokenId?: string | null; origin?: 'manual' | 'api' },
): Promise<TaskRow> {
  const side = await resolveSide(db, input.clientId, input.side);
  const pos = await nextPosition(db, input.status);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO tasks (title, description, status, position, client_id, side, due_date, estimate_min, priority, origin, created_by, api_token_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [
      input.title,
      input.description ?? '',
      input.status,
      pos,
      input.clientId ?? null,
      side,
      input.dueDate ?? null,
      input.estimateMin ?? null,
      input.priority ?? 'normal',
      who.origin ?? 'manual',
      who.userId ?? null,
      who.tokenId ?? null,
    ],
  );
  return getTask(db, rows[0]!.id);
}

export async function updateTask(db: Db, id: string, patch: TaskPatchInput): Promise<TaskRow> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.title !== undefined) set('title', patch.title);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.dueDate !== undefined) set('due_date', patch.dueDate);
  if (patch.estimateMin !== undefined) set('estimate_min', patch.estimateMin);
  if (patch.priority !== undefined) set('priority', patch.priority);
  if (patch.clientId !== undefined) {
    set('client_id', patch.clientId);
    const side = await resolveSide(db, patch.clientId, patch.side);
    if (side) set('side', side);
  } else if (patch.side !== undefined) {
    set('side', patch.side);
    params.push(patch.side);
    sets.push(`client_id = CASE WHEN (SELECT c.side FROM clients c WHERE c.id = client_id) IS DISTINCT FROM $${params.length} THEN NULL ELSE client_id END`);
  }
  if (patch.status !== undefined) {
    set('status', patch.status);
    params.push(await nextPosition(db, patch.status));
    sets.push(`position = CASE WHEN status = $${params.length - 1} THEN position ELSE $${params.length} END`);
  }
  if (sets.length) {
    const { rowCount } = await db.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $1`, params);
    if (!rowCount) throw new HttpError(404, 'Task not found');
  }
  return getTask(db, id);
}

export async function moveTask(db: Db, id: string, status: TaskStatus, beforeId?: string | null, afterId?: string | null) {
  const pos = async (tid: string | null | undefined) =>
    tid ? ((await db.query<{ position: number }>('SELECT position FROM tasks WHERE id = $1', [tid])).rows[0]?.position ?? null) : null;
  const before = await pos(beforeId);
  const after = await pos(afterId);
  let position: number;
  if (before !== null && after !== null) position = (before + after) / 2;
  else if (before !== null) position = before - 1024;
  else if (after !== null) position = after + 1024;
  else position = await nextPosition(db, status);
  const { rowCount } = await db.query('UPDATE tasks SET status = $2, position = $3 WHERE id = $1', [id, status, position]);
  if (!rowCount) throw new HttpError(404, 'Task not found');
  return getTask(db, id);
}

export async function deleteTask(db: Db, id: string): Promise<void> {
  const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1', [id]);
  if (!rowCount) throw new HttpError(404, 'Task not found');
}
