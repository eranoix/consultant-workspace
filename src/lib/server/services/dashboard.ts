import type { Db } from '../db';
import { getSettings } from '../settings';
import { addDays, dateInZone, mondayOf, zonedTimeToUtc } from '@/lib/domain/time';
import { approvalCounts } from './approvals';
import { jobsHealth } from './cron';

export interface Insight {
  id: string;
  tone: 'critical' | 'warning' | 'info' | 'good';
  params: Record<string, string | number>;
  href: string;
}

export async function daySummary(db: Db, now = new Date()) {
  const settings = await getSettings(db);
  const tz = settings.profile.timeZone;
  const today = dateInZone(now.getTime(), tz);
  const week = mondayOf(today);
  const dayFrom = new Date(zonedTimeToUtc(today, '00:00', tz));
  const dayTo = new Date(zonedTimeToUtc(addDays(today, 1), '00:00', tz));

  const [approvals, tasks, timeline, bookings, weekState, alerts, health] = await Promise.all([
    approvalCounts(db),
    db.query<{ overdue: number; due_today: number; doing: number; done_today: number; no_client: number }>(
      `SELECT count(*) FILTER (WHERE status <> 'done' AND due_date < $1::date)::int AS overdue,
              count(*) FILTER (WHERE status <> 'done' AND due_date = $1::date)::int AS due_today,
              count(*) FILTER (WHERE status = 'doing')::int AS doing,
              count(*) FILTER (WHERE status = 'done' AND completed_at >= $2)::int AS done_today,
              count(*) FILTER (WHERE status <> 'done' AND client_id IS NULL)::int AS no_client
         FROM tasks`,
      [today, dayFrom],
    ),
    db.query<{ today_min: number; week_min: number; partner_min: number; direct_min: number }>(
      `SELECT coalesce(sum(duration_min) FILTER (WHERE starts_at >= $1 AND starts_at < $2), 0)::int AS today_min,
              coalesce(sum(duration_min), 0)::int AS week_min,
              coalesce(sum(duration_min) FILTER (WHERE side = 'partner'), 0)::int AS partner_min,
              coalesce(sum(duration_min) FILTER (WHERE side = 'direct'), 0)::int AS direct_min
         FROM timeline_entries WHERE starts_at >= $3 AND starts_at < $4`,
      [dayFrom, dayTo, new Date(zonedTimeToUtc(week, '00:00', tz)), new Date(zonedTimeToUtc(addDays(week, 7), '00:00', tz))],
    ),
    db.query<{ id: string; starts_at: string; customer_name: string; service_name: string }>(
      `SELECT b.id, b.starts_at, b.customer_name, s.name AS service_name FROM bookings b JOIN services s ON s.id = b.service_id
        WHERE b.status = 'confirmed' AND b.starts_at >= $1 ORDER BY b.starts_at LIMIT 3`,
      [now],
    ),
    db.query<{ processed_at: string | null; synced_at: string | null }>('SELECT processed_at, synced_at FROM timeline_weeks WHERE week_start = $1', [week]),
    db.query<{ critical: number; open: number }>(
      "SELECT count(*) FILTER (WHERE severity = 'critical')::int AS critical, count(*)::int AS open FROM alerts WHERE status IN ('open', 'acknowledged')",
    ),
    jobsHealth(db, now),
  ]);

  const t = tasks.rows[0]!;
  const tl = timeline.rows[0]!;
  const ws = weekState.rows[0];
  const a = alerts.rows[0]!;
  const insights: Insight[] = [];
  const lateJobs = health.jobs.filter((j) => j.health === 'late');
  if (lateJobs.length) insights.push({ id: 'jobs_late', tone: 'critical', params: { count: lateJobs.length, names: lateJobs.map((j) => j.name).join(', ') }, href: '/app/alerts?tab=jobs' });
  if (t.overdue) insights.push({ id: 'overdue', tone: 'critical', params: { count: t.overdue }, href: '/app/board?due=overdue' });
  if (approvals.meetings + approvals.emails)
    insights.push({ id: 'review', tone: 'warning', params: { meetings: approvals.meetings, emails: approvals.emails, tasks: approvals.tasks }, href: '/app/approvals' });
  if (t.due_today) insights.push({ id: 'due_today', tone: 'warning', params: { count: t.due_today }, href: '/app/board?due=today' });
  if (a.critical) insights.push({ id: 'critical_alerts', tone: 'critical', params: { count: a.critical }, href: '/app/alerts' });
  if (t.no_client) insights.push({ id: 'no_client', tone: 'info', params: { count: t.no_client }, href: '/app/board?client=none' });
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  if (weekday >= 3 && !ws?.processed_at) insights.push({ id: 'process_week', tone: 'info', params: { hours: (tl.week_min / 60).toFixed(1) }, href: '/app/timeline' });
  if (tl.week_min > 0 && !ws?.synced_at) insights.push({ id: 'sync_week', tone: 'info', params: {}, href: '/app/timeline' });
  if (!insights.length) insights.push({ id: 'all_clear', tone: 'good', params: {}, href: '/app/board' });

  return {
    today,
    timeZone: tz,
    name: settings.profile.name.split(' ')[0],
    counts: { ...approvals, ...t, ...tl, openAlerts: a.open, criticalAlerts: a.critical },
    nextBookings: bookings.rows,
    week: { start: week, processedAt: ws?.processed_at ?? null, syncedAt: ws?.synced_at ?? null },
    insights,
  };
}
