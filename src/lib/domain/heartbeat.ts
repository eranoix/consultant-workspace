export interface JobHeartbeat {
  name: string;
  intervalSec: number;
  graceSec: number;
  enabled: boolean;
  watchedBy: string | null;
  lastSuccessAt: Date | null;
  lastStartedAt: Date | null;
  lastErrorAt: Date | null;
  sinceAt?: Date | null;
}

export type JobHealth = 'ok' | 'late' | 'failing' | 'never' | 'disabled';

export function effectiveGraceSec(job: Pick<JobHeartbeat, 'intervalSec' | 'graceSec'>): number {
  return Math.max(job.graceSec, Math.ceil(job.intervalSec / 2));
}

export function deadlineOf(job: JobHeartbeat): Date | null {
  const base = job.lastSuccessAt ?? job.sinceAt ?? null;
  if (!base) return null;
  return new Date(base.getTime() + (job.intervalSec + effectiveGraceSec(job)) * 1000);
}

export function secondsLate(job: JobHeartbeat, now: Date): number {
  const deadline = deadlineOf(job);
  if (!deadline) return 0;
  return Math.max(0, Math.floor((now.getTime() - deadline.getTime()) / 1000));
}

export function jobHealth(job: JobHeartbeat, now: Date): JobHealth {
  if (!job.enabled) return 'disabled';
  if (!job.lastSuccessAt && !job.sinceAt) return 'never';
  if (secondsLate(job, now) > 0) return 'late';
  if (job.lastErrorAt && (!job.lastSuccessAt || job.lastErrorAt > job.lastSuccessAt)) return 'failing';
  return 'ok';
}

export function lateJobs(jobs: JobHeartbeat[], now: Date, watcher?: string): JobHeartbeat[] {
  return jobs.filter(
    (j) => j.enabled && (watcher === undefined || j.watchedBy === watcher) && jobHealth(j, now) === 'late',
  );
}

export function unwatched(jobs: JobHeartbeat[]): string[] {
  const enabled = new Set(jobs.filter((j) => j.enabled).map((j) => j.name));
  return jobs
    .filter((j) => j.enabled && (!j.watchedBy || j.watchedBy === j.name || !enabled.has(j.watchedBy)))
    .map((j) => j.name);
}

export function isDue(
  job: Pick<JobHeartbeat, 'enabled' | 'intervalSec' | 'lastStartedAt'> & { runRequestedAt?: Date | null },
  now: Date,
): boolean {
  if (!job.enabled) return false;
  if (job.runRequestedAt && (!job.lastStartedAt || job.runRequestedAt > job.lastStartedAt)) return true;
  if (!job.lastStartedAt) return true;
  return now.getTime() - job.lastStartedAt.getTime() >= job.intervalSec * 1000;
}
