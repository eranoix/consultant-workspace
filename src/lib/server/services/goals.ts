import type { Db } from '../db';
import { HttpError } from '../errors';
import { occurrenceDates, parseRRule } from '@/lib/domain/rrule';
import { addDays } from '@/lib/domain/time';

export interface GoalRow {
  id: string;
  parent_id: string | null;
  title: string;
  description: string;
  side: 'partner' | 'direct' | null;
  client_id: string | null;
  client_name: string | null;
  rrule: string | null;
  starts_on: string;
  due_on: string | null;
  status: 'active' | 'achieved' | 'archived';
  position: number;
}

export interface OccurrenceRow {
  id: string;
  goal_id: string;
  occurs_on: string;
  status: 'open' | 'doing' | 'done' | 'skipped';
  position: number;
  completed_at: string | null;
}

const GOAL_SQL = `
  SELECT g.id, g.parent_id, g.title, g.description, g.side, g.client_id, c.name AS client_name, g.rrule,
         to_char(g.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(g.due_on, 'YYYY-MM-DD') AS due_on, g.status, g.position
    FROM goals g LEFT JOIN clients c ON c.id = g.client_id`;

export async function ensureOccurrences(db: Db, from: string, to: string): Promise<number> {
  const { rows } = await db.query<GoalRow>(`${GOAL_SQL} WHERE g.status = 'active' AND g.parent_id IS NOT NULL`);
  let created = 0;
  for (const g of rows) {
    let dates: string[];
    try {
      dates = occurrenceDates({ rrule: g.rrule, startsOn: g.starts_on, dueOn: g.due_on }, from, to);
    } catch {
      continue;
    }
    if (!dates.length) continue;
    const res = await db.query(
      `INSERT INTO goal_occurrences (goal_id, occurs_on, position)
       SELECT $1, d::date, extract(epoch FROM d::date) FROM unnest($2::text[]) AS d
       ON CONFLICT (goal_id, occurs_on) DO NOTHING`,
      [g.id, dates],
    );
    created += res.rowCount ?? 0;
  }
  return created;
}

export async function listGoals(db: Db, from: string, to: string) {
  await ensureOccurrences(db, from, to);
  const goals = (await db.query<GoalRow>(`${GOAL_SQL} WHERE g.status <> 'archived' ORDER BY g.parent_id NULLS FIRST, g.position, g.created_at`)).rows;
  const occurrences = (
    await db.query<OccurrenceRow>(
      `SELECT id, goal_id, to_char(occurs_on, 'YYYY-MM-DD') AS occurs_on, status, position, completed_at
         FROM goal_occurrences WHERE occurs_on BETWEEN $1 AND $2 ORDER BY occurs_on, position`,
      [from, to],
    )
  ).rows;
  const progress = (
    await db.query<{ goal_id: string; done: number; due: number }>(
      `SELECT goal_id, count(*) FILTER (WHERE status = 'done')::int AS done,
              count(*) FILTER (WHERE occurs_on <= current_date AND status <> 'skipped')::int AS due
         FROM goal_occurrences GROUP BY goal_id`,
    )
  ).rows;
  return { goals, occurrences, progress };
}

export async function completedByDay(db: Db, days = 30) {
  const { rows } = await db.query<{ day: string; id: string; title: string; parent_title: string | null; occurs_on: string }>(
    `SELECT to_char(o.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, o.id, g.title, p.title AS parent_title,
            to_char(o.occurs_on, 'YYYY-MM-DD') AS occurs_on
       FROM goal_occurrences o JOIN goals g ON g.id = o.goal_id LEFT JOIN goals p ON p.id = g.parent_id
      WHERE o.status = 'done' AND o.completed_at > now() - make_interval(days => $1)
      ORDER BY o.completed_at DESC`,
    [days],
  );
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.day, [...(groups.get(r.day) ?? []), r]);
  return [...groups.entries()].map(([day, items]) => ({ day, items }));
}

export interface GoalInput {
  parentId?: string | null;
  title: string;
  description?: string;
  side?: 'partner' | 'direct' | null;
  clientId?: string | null;
  rrule?: string | null;
  startsOn?: string;
  dueOn?: string | null;
}

function checkRule(rrule: string | null | undefined) {
  if (!rrule) return;
  try {
    parseRRule(rrule);
  } catch (e) {
    throw new HttpError(400, `Invalid recurrence: ${(e as Error).message}`);
  }
}

export async function createGoal(db: Db, input: GoalInput) {
  checkRule(input.rrule);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO goals (parent_id, title, description, side, client_id, rrule, starts_on, due_on, position)
     VALUES ($1,$2,$3,$4,$5,$6, coalesce($7::date, current_date), $8, extract(epoch FROM now())) RETURNING id`,
    [input.parentId ?? null, input.title, input.description ?? '', input.side ?? null, input.clientId ?? null, input.rrule ?? null, input.startsOn ?? null, input.dueOn ?? null],
  );
  const today = new Date().toISOString().slice(0, 10);
  await ensureOccurrences(db, addDays(today, -14), addDays(today, 28));
  return rows[0]!.id;
}

export async function updateGoal(db: Db, id: string, patch: Partial<GoalInput> & { status?: GoalRow['status'] }) {
  checkRule(patch.rrule);
  const map: Record<string, string> = {
    title: 'title', description: 'description', side: 'side', clientId: 'client_id', rrule: 'rrule',
    startsOn: 'starts_on', dueOn: 'due_on', status: 'status', parentId: 'parent_id',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v === undefined) continue;
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  }
  if (!sets.length) return;
  const { rowCount } = await db.query(`UPDATE goals SET ${sets.join(', ')} WHERE id = $1`, params);
  if (!rowCount) throw new HttpError(404, 'Goal not found');
  if (patch.rrule !== undefined || patch.startsOn !== undefined || patch.dueOn !== undefined) {
    await db.query("DELETE FROM goal_occurrences WHERE goal_id = $1 AND occurs_on >= current_date AND status = 'open'", [id]);
  }
}

export async function deleteGoal(db: Db, id: string) {
  await db.query('DELETE FROM goals WHERE id = $1', [id]);
}

export async function setOccurrence(db: Db, id: string, status: OccurrenceRow['status'], position?: number) {
  const { rowCount } = await db.query(
    `UPDATE goal_occurrences SET status = $2,
            completed_at = CASE WHEN $2 = 'done' THEN coalesce(completed_at, now()) ELSE NULL END,
            position = coalesce($3, position)
      WHERE id = $1`,
    [id, status, position ?? null],
  );
  if (!rowCount) throw new HttpError(404, 'Occurrence not found');
}

export async function todayRing(db: Db, today: string) {
  await ensureOccurrences(db, today, today);
  const { rows } = await db.query<{ done: number; total: number }>(
    `SELECT count(*) FILTER (WHERE o.status = 'done')::int AS done, count(*) FILTER (WHERE o.status <> 'skipped')::int AS total
       FROM goal_occurrences o JOIN goals g ON g.id = o.goal_id WHERE o.occurs_on = $1 AND g.status = 'active'`,
    [today],
  );
  const items = (
    await db.query<{ id: string; title: string; status: string }>(
      `SELECT o.id, g.title, o.status FROM goal_occurrences o JOIN goals g ON g.id = o.goal_id
        WHERE o.occurs_on = $1 AND g.status = 'active' AND o.status <> 'skipped' ORDER BY o.status = 'done', g.title`,
      [today],
    )
  ).rows;
  return { ...rows[0]!, items };
}
