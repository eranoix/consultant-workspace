import type { Db } from '../db';
import { isDue, jobHealth, lateJobs, secondsLate, unwatched, effectiveGraceSec, type JobHeartbeat } from '@/lib/domain/heartbeat';
import { runMailIntake } from './intake';
import { syncNotesFromMail } from './notes';
import { deliverOutbox, evaluateScheduled, raiseCronLate } from './alerts';
import { ensureOccurrences } from './goals';
import { addDays } from '@/lib/domain/time';

export interface JobDefinition {
  name: string;
  description: string;
  intervalSec: number;
  graceSec: number;
  watchedBy: string;
  run: (db: Db, now: Date) => Promise<Record<string, unknown>>;
}

interface JobRow {
  name: string;
  description: string;
  interval_sec: number;
  grace_sec: number;
  enabled: boolean;
  watched_by: string | null;
  last_started_at: Date | null;
  last_finished_at: Date | null;
  last_success_at: Date | null;
  last_error_at: Date | null;
  last_error: string | null;
  last_duration_ms: number | null;
  run_count: string;
  fail_count: string;
  run_requested_at: Date | null;
}

export function toHeartbeat(r: JobRow): JobHeartbeat {
  return {
    name: r.name,
    intervalSec: r.interval_sec,
    graceSec: r.grace_sec,
    enabled: r.enabled,
    watchedBy: r.watched_by,
    lastSuccessAt: r.last_success_at,
    lastStartedAt: r.last_started_at,
    lastErrorAt: r.last_error_at,
  };
}

async function checkWatched(db: Db, watcher: string, now: Date) {
  const { rows } = await db.query<JobRow>('SELECT * FROM cron_jobs');
  const late = lateJobs(rows.map(toHeartbeat), now, watcher).map((j) => ({
    name: j.name,
    minutesLate: Math.ceil(secondsLate(j, now) / 60),
    watchedBy: j.watchedBy,
  }));
  const raised = await raiseCronLate(db, late, watcher);
  return { watching: rows.filter((r) => r.watched_by === watcher).map((r) => r.name), late: late.map((l) => l.name), raised };
}

export const JOBS: JobDefinition[] = [
  {
    name: 'intake-email',
    description: 'Reads new mail from INBOX, summarizes it and queues candidate tasks for review',
    intervalSec: 300,
    graceSec: 120,
    watchedBy: 'dead-man-switch',
    run: (db) => runMailIntake(db, 'email'),
  },
  {
    name: 'intake-meetings',
    description: 'Reads meeting notes from the Meetings folder and queues them for review',
    intervalSec: 300,
    graceSec: 120,
    watchedBy: 'dead-man-switch',
    run: (db) => runMailIntake(db, 'meeting'),
  },
  {
    name: 'notes-sync',
    description: 'Copies notes from the Notes mail folder; never deletes',
    intervalSec: 900,
    graceSec: 300,
    watchedBy: 'dead-man-switch',
    run: (db) => syncNotesFromMail(db),
  },
  {
    name: 'alerts-evaluate',
    description: 'Evaluates time-based alert rules and watches the dead-man switch',
    intervalSec: 60,
    graceSec: 60,
    watchedBy: 'dead-man-switch',
    run: async (db, now) => ({ ...(await evaluateScheduled(db, now)), watchdog: await checkWatched(db, 'alerts-evaluate', now) }),
  },
  {
    name: 'notify-deliver',
    description: 'Delivers queued alert messages (outbox, email, WhatsApp)',
    intervalSec: 60,
    graceSec: 60,
    watchedBy: 'dead-man-switch',
    run: (db) => deliverOutbox(db),
  },
  {
    name: 'goals-occurrences',
    description: 'Materialises recurring key results four weeks ahead',
    intervalSec: 3600,
    graceSec: 900,
    watchedBy: 'dead-man-switch',
    run: async (db, now) => {
      const today = now.toISOString().slice(0, 10);
      return { created: await ensureOccurrences(db, addDays(today, -7), addDays(today, 28)) };
    },
  },
  {
    name: 'dead-man-switch',
    description: 'Raises an alert when any job misses its heartbeat; itself watched by alerts-evaluate',
    intervalSec: 60,
    graceSec: 60,
    watchedBy: 'alerts-evaluate',
    run: (db, now) => checkWatched(db, 'dead-man-switch', now),
  },
];

export async function registerJobs(db: Db) {
  for (const j of JOBS) {
    await db.query(
      `INSERT INTO cron_jobs (name, description, interval_sec, grace_sec, watched_by) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
      [j.name, j.description, j.intervalSec, j.graceSec, j.watchedBy],
    );
  }
}

export async function runJob(db: Db, def: JobDefinition, now = new Date()) {
  const started = Date.now();
  await db.query('UPDATE cron_jobs SET last_started_at = $2 WHERE name = $1', [def.name, now]);
  const run = await db.query<{ id: string }>('INSERT INTO job_runs (job, started_at) VALUES ($1, $2) RETURNING id', [def.name, now]);
  try {
    const detail = await def.run(db, now);
    const ms = Date.now() - started;
    await db.query(
      `UPDATE cron_jobs SET last_finished_at = now(), last_success_at = now(), last_duration_ms = $2, run_count = run_count + 1 WHERE name = $1`,
      [def.name, ms],
    );
    await db.query('UPDATE job_runs SET finished_at = now(), ok = true, detail = $2 WHERE id = $1', [run.rows[0]!.id, JSON.stringify(detail)]);
    return { ok: true, detail };
  } catch (err) {
    const message = (err as Error).message;
    await db.query(
      `UPDATE cron_jobs SET last_finished_at = now(), last_error_at = now(), last_error = $2, last_duration_ms = $3,
              run_count = run_count + 1, fail_count = fail_count + 1 WHERE name = $1`,
      [def.name, message, Date.now() - started],
    );
    await db.query('UPDATE job_runs SET finished_at = now(), ok = false, detail = $2 WHERE id = $1', [run.rows[0]!.id, JSON.stringify({ error: message })]);
    return { ok: false, error: message };
  }
}

export async function runDue(db: Db, now = new Date(), log: (s: string) => void = () => {}) {
  const { rows } = await db.query<JobRow>('SELECT * FROM cron_jobs');
  for (const row of rows) {
    const def = JOBS.find((j) => j.name === row.name);
    if (!def) continue;
    if (!isDue({ enabled: row.enabled, intervalSec: row.interval_sec, lastStartedAt: row.last_started_at, runRequestedAt: row.run_requested_at }, now)) continue;
    const res = await runJob(db, def, new Date());
    log(`${def.name}: ${res.ok ? 'ok' : 'FAILED ' + res.error}`);
  }
}

export async function requestRun(db: Db, name: string) {
  await db.query('UPDATE cron_jobs SET run_requested_at = now() WHERE name = $1', [name]);
}

export async function jobsHealth(db: Db, now = new Date()) {
  const { rows } = await db.query<JobRow>('SELECT * FROM cron_jobs ORDER BY name');
  const beats = rows.map(toHeartbeat);
  const recent = await db.query<{ job: string; ok: boolean | null; started_at: string; finished_at: string | null; detail: unknown }>(
    `SELECT job, ok, started_at, finished_at, detail FROM (
       SELECT r.*, row_number() OVER (PARTITION BY job ORDER BY started_at DESC) AS n FROM job_runs r) x
     WHERE n <= 12 ORDER BY started_at DESC`,
  );
  return {
    now: now.toISOString(),
    unwatched: unwatched(beats),
    jobs: rows.map((r, i) => ({
      name: r.name,
      description: r.description,
      intervalSec: r.interval_sec,
      graceSec: effectiveGraceSec({ intervalSec: r.interval_sec, graceSec: r.grace_sec }),
      enabled: r.enabled,
      watchedBy: r.watched_by,
      lastSuccessAt: r.last_success_at,
      lastStartedAt: r.last_started_at,
      lastErrorAt: r.last_error_at,
      lastError: r.last_error,
      lastDurationMs: r.last_duration_ms,
      runCount: Number(r.run_count),
      failCount: Number(r.fail_count),
      health: jobHealth(beats[i]!, now),
      secondsLate: secondsLate(beats[i]!, now),
      recent: recent.rows.filter((x) => x.job === r.name),
    })),
  };
}

export async function intakeHealth(db: Db) {
  const { rows } = await db.query<{
    channel: string;
    runs_24h: number;
    failed_24h: number;
    created_24h: number;
    last_success: string | null;
    last_error: string | null;
    last_error_at: string | null;
  }>(
    `SELECT ch AS channel,
            (SELECT count(*)::int FROM intake_runs r WHERE r.channel = ch AND r.started_at > now() - interval '24 hours') AS runs_24h,
            (SELECT count(*)::int FROM intake_runs r WHERE r.channel = ch AND r.error IS NOT NULL AND r.started_at > now() - interval '24 hours') AS failed_24h,
            (SELECT coalesce(sum(created), 0)::int FROM intake_runs r WHERE r.channel = ch AND r.started_at > now() - interval '24 hours') AS created_24h,
            (SELECT max(finished_at) FROM intake_runs r WHERE r.channel = ch AND r.error IS NULL) AS last_success,
            (SELECT r.error FROM intake_runs r WHERE r.channel = ch AND r.error IS NOT NULL ORDER BY started_at DESC LIMIT 1) AS last_error,
            (SELECT max(started_at) FROM intake_runs r WHERE r.channel = ch AND r.error IS NOT NULL) AS last_error_at
       FROM unnest(ARRAY['email', 'meeting', 'notes']) AS ch`,
  );
  const pending = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM sources WHERE status = 'pending' AND direction = 'inbound'");
  return { channels: rows, pendingReview: pending.rows[0]!.n };
}
