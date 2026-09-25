/**
 * The weekly timeline: where the consultant's hours actually went. Shared by
 * every admin (one timeline, not one per person), synced to one calendar.
 */
import type { PoolClient } from 'pg';
import type { Db } from '../db';
import { HttpError } from '../errors';
import { addDays, zonedTimeToUtc, dateInZone } from '@/lib/domain/time';
import { calendarProvider } from '../adapters/calendar';
import { getSettings } from '../settings';
import { sideOfClient } from './clients';

export interface EntryRow {
  id: string;
  task_id: string | null;
  title: string;
  starts_at: string;
  duration_min: number;
  side: 'partner' | 'direct' | null;
  client_id: string | null;
  client_name: string | null;
  client_color: string | null;
  notes: string | null;
  task_status: string | null;
  synced: boolean;
}

export function weekBounds(weekStart: string, timeZone: string) {
  return { from: new Date(zonedTimeToUtc(weekStart, '00:00', timeZone)), to: new Date(zonedTimeToUtc(addDays(weekStart, 7), '00:00', timeZone)) };
}

export async function listEntries(db: Db, weekStart: string, timeZone: string): Promise<EntryRow[]> {
  const { from, to } = weekBounds(weekStart, timeZone);
  const { rows } = await db.query<EntryRow>(
    `SELECT e.id, e.task_id, e.title, e.starts_at, e.duration_min, e.side, e.client_id, c.name AS client_name, c.color AS client_color,
            e.notes, t.status AS task_status,
            EXISTS (SELECT 1 FROM calendar_sync_links l WHERE l.origin = 'timeline' AND l.origin_id = e.id
                      AND l.fingerprint = md5(e.title || '|' || e.starts_at::text || '|' || e.duration_min::text)) AS synced
       FROM timeline_entries e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN tasks t ON t.id = e.task_id
      WHERE e.starts_at >= $1 AND e.starts_at < $2
      ORDER BY e.starts_at`,
    [from, to],
  );
  return rows;
}

export async function getWeekState(db: Db, weekStart: string) {
  const { rows } = await db.query<{ processed_at: string | null; report: WeekReport | null; synced_at: string | null; sync_result: unknown }>(
    'SELECT processed_at, report, synced_at, sync_result FROM timeline_weeks WHERE week_start = $1',
    [weekStart],
  );
  return rows[0] ?? { processed_at: null, report: null, synced_at: null, sync_result: null };
}

export async function createEntry(
  db: Db,
  input: { taskId?: string | null; title?: string; startsAt: string; durationMin: number; clientId?: string | null; side?: 'partner' | 'direct' | null; notes?: string | null },
  userId: string,
) {
  let title = input.title ?? '';
  let clientId = input.clientId ?? null;
  let side = input.side ?? null;
  if (input.taskId) {
    const { rows } = await db.query<{ title: string; client_id: string | null; side: 'partner' | 'direct' | null }>(
      'SELECT title, client_id, side FROM tasks WHERE id = $1',
      [input.taskId],
    );
    const t = rows[0];
    if (!t) throw new HttpError(404, 'Task not found');
    title ||= t.title;
    clientId ??= t.client_id;
    side ??= t.side;
  }
  if (!title) throw new HttpError(400, 'A title or a task is required');
  side = (await sideOfClient(db, clientId)) ?? side;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO timeline_entries (task_id, title, starts_at, duration_min, side, client_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [input.taskId ?? null, title, input.startsAt, input.durationMin, side, clientId, input.notes ?? null, userId],
  );
  return rows[0]!.id;
}

export async function updateEntry(
  db: Db,
  id: string,
  patch: { title?: string; startsAt?: string; durationMin?: number; clientId?: string | null; side?: 'partner' | 'direct' | null; notes?: string | null },
) {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.title !== undefined) set('title', patch.title);
  if (patch.startsAt !== undefined) set('starts_at', patch.startsAt);
  if (patch.durationMin !== undefined) set('duration_min', patch.durationMin);
  if (patch.notes !== undefined) set('notes', patch.notes);
  if (patch.clientId !== undefined) {
    set('client_id', patch.clientId);
    const s = await sideOfClient(db, patch.clientId);
    if (s) set('side', s);
  } else if (patch.side !== undefined) set('side', patch.side);
  if (!sets.length) return;
  const { rowCount } = await db.query(`UPDATE timeline_entries SET ${sets.join(', ')} WHERE id = $1`, params);
  if (!rowCount) throw new HttpError(404, 'Entry not found');
}

export async function deleteEntry(db: Db, id: string) {
  await db.query('DELETE FROM timeline_entries WHERE id = $1', [id]);
}

export interface WeekReport {
  totalMin: number;
  bySide: { partner: number; direct: number; unassigned: number };
  byClient: { name: string; side: string | null; minutes: number }[];
  byDay: { date: string; minutes: number }[];
  merged: number;
  warnings: { kind: 'no_client' | 'overlap' | 'long_day' | 'empty_day'; message: string }[];
}

/**
 * "Process my week": merge back-to-back blocks of the same task into one
 * card, then total the week by side, client and day and list what needs
 * attention before the timesheet goes out.
 */
export async function processWeek(db: PoolClient, weekStart: string, timeZone: string, userId: string): Promise<WeekReport> {
  let entries = await listEntries(db, weekStart, timeZone);
  let merged = 0;
  for (let i = 0; i < entries.length - 1; i += 1) {
    const a = entries[i]!;
    const b = entries[i + 1]!;
    const aEnd = new Date(a.starts_at).getTime() + a.duration_min * 60_000;
    if (a.task_id && a.task_id === b.task_id && aEnd === new Date(b.starts_at).getTime() && a.duration_min + b.duration_min <= 720) {
      await db.query('UPDATE timeline_entries SET duration_min = $2 WHERE id = $1', [a.id, a.duration_min + b.duration_min]);
      await db.query('DELETE FROM timeline_entries WHERE id = $1', [b.id]);
      a.duration_min += b.duration_min;
      entries.splice(i + 1, 1);
      i -= 1;
      merged += 1;
    }
  }
  entries = await listEntries(db, weekStart, timeZone);

  const bySide = { partner: 0, direct: 0, unassigned: 0 };
  const byClient = new Map<string, { name: string; side: string | null; minutes: number }>();
  const byDay = new Map<string, number>();
  const warnings: WeekReport['warnings'] = [];
  for (let d = 0; d < 5; d += 1) byDay.set(addDays(weekStart, d), 0);
  let prevEnd = 0;
  let prevTitle = '';
  for (const e of entries) {
    const start = new Date(e.starts_at).getTime();
    const day = dateInZone(start, timeZone);
    byDay.set(day, (byDay.get(day) ?? 0) + e.duration_min);
    if (e.side === 'partner') bySide.partner += e.duration_min;
    else if (e.side === 'direct') bySide.direct += e.duration_min;
    else bySide.unassigned += e.duration_min;
    const key = e.client_name ?? '(no client)';
    const c = byClient.get(key) ?? { name: key, side: e.side, minutes: 0 };
    c.minutes += e.duration_min;
    byClient.set(key, c);
    if (!e.client_id) warnings.push({ kind: 'no_client', message: `"${e.title}" on ${day} has no client` });
    if (start < prevEnd) warnings.push({ kind: 'overlap', message: `"${e.title}" overlaps "${prevTitle}" on ${day}` });
    prevEnd = Math.max(prevEnd, start + e.duration_min * 60_000);
    prevTitle = e.title;
  }
  for (const [date, minutes] of byDay) {
    if (minutes > 10 * 60) warnings.push({ kind: 'long_day', message: `${date} has ${(minutes / 60).toFixed(1)} hours logged` });
    if (minutes === 0 && date <= dateInZone(Date.now(), timeZone)) warnings.push({ kind: 'empty_day', message: `${date} has nothing logged` });
  }
  const report: WeekReport = {
    totalMin: bySide.partner + bySide.direct + bySide.unassigned,
    bySide,
    byClient: [...byClient.values()].sort((a, b) => b.minutes - a.minutes),
    byDay: [...byDay.entries()].sort().map(([date, minutes]) => ({ date, minutes })),
    merged,
    warnings,
  };
  await db.query(
    `INSERT INTO timeline_weeks (week_start, processed_at, processed_by, report) VALUES ($1, now(), $2, $3)
     ON CONFLICT (week_start) DO UPDATE SET processed_at = now(), processed_by = $2, report = $3`,
    [weekStart, userId, JSON.stringify(report)],
  );
  return report;
}

export interface SyncResult {
  calendar: string;
  provider: string;
  created: number;
  updated: number;
  unchanged: number;
  deleted: number;
}

/**
 * One-click sync of a week to the timeline calendar. Every event is written
 * as BUSY, so the hours count in the calendar's own free/busy and in any
 * timesheet built from it. Idempotent: an unchanged entry is not re-written,
 * and an entry deleted here is deleted there.
 */
export async function syncWeek(db: PoolClient, weekStart: string, timeZone: string): Promise<SyncResult> {
  const { rows: accounts } = await db.query<{ id: string; label: string; provider: 'mock' | 'google'; external_id: string }>(
    'SELECT id, label, provider, external_id FROM calendar_accounts WHERE is_timeline_target LIMIT 1',
  );
  const account = accounts[0];
  if (!account) throw new HttpError(409, 'No calendar is selected for the timeline (Settings > Integrations)');
  const provider = calendarProvider(db, account.provider);
  const { from, to } = weekBounds(weekStart, timeZone);
  const { rows: entries } = await db.query<{ id: string; title: string; starts_at: Date; duration_min: number; notes: string | null; client_name: string | null; fp: string }>(
    // The fingerprint is computed by the same SQL expression listEntries uses,
    // so the "synced" dot on each card and this check cannot disagree.
    `SELECT e.id, e.title, e.starts_at, e.duration_min, e.notes, c.name AS client_name,
            md5(e.title || '|' || e.starts_at::text || '|' || e.duration_min::text) AS fp
       FROM timeline_entries e LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.starts_at >= $1 AND e.starts_at < $2`,
    [from, to],
  );
  const { rows: links } = await db.query<{ origin_id: string; external_event_id: string; fingerprint: string }>(
    `SELECT l.origin_id, l.external_event_id, l.fingerprint FROM calendar_sync_links l
      WHERE l.account_id = $1 AND l.origin = 'timeline'`,
    [account.id],
  );
  const linkBy = new Map(links.map((l) => [l.origin_id, l]));
  const result: SyncResult = { calendar: account.label, provider: provider.name, created: 0, updated: 0, unchanged: 0, deleted: 0 };
  const alive = new Set<string>();
  for (const e of entries) {
    alive.add(e.id);
    const fp = e.fp;
    const link = linkBy.get(e.id);
    if (link && link.fingerprint === fp) {
      result.unchanged += 1;
      continue;
    }
    const start = new Date(e.starts_at);
    const externalId = await provider.upsertEvent(account.external_id, link?.external_event_id ?? null, {
      title: e.client_name ? `${e.title} (${e.client_name})` : e.title,
      description: e.notes ?? undefined,
      startsAt: start,
      endsAt: new Date(start.getTime() + e.duration_min * 60_000),
      busy: true,
    });
    await db.query(
      `INSERT INTO calendar_sync_links (account_id, origin, origin_id, external_event_id, fingerprint)
       VALUES ($1, 'timeline', $2, $3, $4)
       ON CONFLICT (account_id, origin, origin_id) DO UPDATE SET external_event_id = $3, fingerprint = $4, synced_at = now()`,
      [account.id, e.id, externalId, fp],
    );
    if (link) result.updated += 1;
    else result.created += 1;
  }
  // Links whose entry is gone (deleted, or merged away by "process my week").
  const { rows: orphans } = await db.query<{ origin_id: string; external_event_id: string }>(
    `SELECT l.origin_id, l.external_event_id FROM calendar_sync_links l
      WHERE l.account_id = $1 AND l.origin = 'timeline'
        AND NOT EXISTS (SELECT 1 FROM timeline_entries e WHERE e.id = l.origin_id)`,
    [account.id],
  );
  for (const o of orphans) {
    await provider.deleteEvent(account.external_id, o.external_event_id);
    await db.query("DELETE FROM calendar_sync_links WHERE account_id = $1 AND origin = 'timeline' AND origin_id = $2", [account.id, o.origin_id]);
    result.deleted += 1;
  }
  await db.query(
    `INSERT INTO timeline_weeks (week_start, synced_at, sync_result) VALUES ($1, now(), $2)
     ON CONFLICT (week_start) DO UPDATE SET synced_at = now(), sync_result = $2`,
    [weekStart, JSON.stringify(result)],
  );
  return result;
}

export async function timeZoneOf(db: Db): Promise<string> {
  return (await getSettings(db)).profile.timeZone;
}
