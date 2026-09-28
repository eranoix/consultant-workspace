import { describe, expect, it } from 'vitest';
import { effectiveGraceSec, isDue, jobHealth, lateJobs, secondsLate, unwatched, type JobHeartbeat } from '@/lib/domain/heartbeat';

const now = new Date('2026-09-25T12:00:00Z');
const ago = (sec: number) => new Date(now.getTime() - sec * 1000);
const job = (over: Partial<JobHeartbeat>): JobHeartbeat => ({
  name: 'j',
  intervalSec: 60,
  graceSec: 10,
  enabled: true,
  watchedBy: 'dead-man-switch',
  lastSuccessAt: ago(30),
  lastStartedAt: ago(31),
  lastErrorAt: null,
  ...over,
});

describe('heartbeats', () => {
  it('never uses a grace margin tighter than half an interval', () => {
    expect(effectiveGraceSec({ intervalSec: 60, graceSec: 5 })).toBe(30);
    expect(effectiveGraceSec({ intervalSec: 60, graceSec: 120 })).toBe(120);
  });

  it('is healthy within interval plus grace and late after it', () => {
    expect(jobHealth(job({ lastSuccessAt: ago(89) }), now)).toBe('ok');
    expect(jobHealth(job({ lastSuccessAt: ago(91) }), now)).toBe('late');
    expect(secondsLate(job({ lastSuccessAt: ago(150) }), now)).toBe(60);
  });

  it('does not call a busy minute a dead job', () => {
    expect(jobHealth(job({ lastSuccessAt: ago(80) }), now)).toBe('ok');
  });

  it('reports failing when the last attempt errored after the last success', () => {
    expect(jobHealth(job({ lastErrorAt: ago(5) }), now)).toBe('failing');
    expect(jobHealth(job({ lastErrorAt: ago(3600) }), now)).toBe('ok');
  });

  it('ignores disabled jobs and knows a job that never ran', () => {
    expect(jobHealth(job({ enabled: false, lastSuccessAt: ago(99999) }), now)).toBe('disabled');
    expect(jobHealth(job({ lastSuccessAt: null, lastStartedAt: null }), now)).toBe('never');
  });
});

describe('the dead-man switch watches itself', () => {
  const jobs = [
    job({ name: 'intake-email', watchedBy: 'dead-man-switch', lastSuccessAt: ago(600) }),
    job({ name: 'alerts-evaluate', watchedBy: 'dead-man-switch' }),
    job({ name: 'dead-man-switch', watchedBy: 'alerts-evaluate', lastSuccessAt: ago(900) }),
  ];

  it('lets each watcher see only the jobs it is responsible for', () => {
    expect(lateJobs(jobs, now, 'dead-man-switch').map((j) => j.name)).toEqual(['intake-email']);
    expect(lateJobs(jobs, now, 'alerts-evaluate').map((j) => j.name)).toEqual(['dead-man-switch']);
  });

  it('lets an independent observer see everything that is late', () => {
    expect(lateJobs(jobs, now).map((j) => j.name).sort()).toEqual(['dead-man-switch', 'intake-email']);
  });

  it('flags jobs whose watcher is missing, disabled or themselves', () => {
    expect(unwatched(jobs)).toEqual([]);
    expect(unwatched([job({ name: 'a', watchedBy: 'a' })])).toEqual(['a']);
    expect(unwatched([job({ name: 'a', watchedBy: 'b' }), job({ name: 'b', watchedBy: 'a', enabled: false })])).toEqual(['a']);
  });
});

describe('scheduling', () => {
  it('runs when due by interval or when someone asked', () => {
    expect(isDue({ enabled: true, intervalSec: 60, lastStartedAt: ago(30) }, now)).toBe(false);
    expect(isDue({ enabled: true, intervalSec: 60, lastStartedAt: ago(61) }, now)).toBe(true);
    expect(isDue({ enabled: true, intervalSec: 3600, lastStartedAt: ago(30), runRequestedAt: ago(5) }, now)).toBe(true);
    expect(isDue({ enabled: false, intervalSec: 1, lastStartedAt: null }, now)).toBe(false);
  });
});
