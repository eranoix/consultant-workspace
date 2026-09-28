import { dateInZone, zonedTimeToUtc } from '@/lib/engine/availability';

export { dateInZone, zonedTimeToUtc };

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

export function isoWeekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -isoWeekday(iso));
}

export function todayIn(timeZone: string, now = Date.now()): string {
  return dateInZone(now, timeZone);
}

export function minutesOfDay(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function hhmm(totalMin: number): string {
  const m = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function atMinutes(iso: string, minutes: number, timeZone: string): number {
  return zonedTimeToUtc(iso, hhmm(minutes), timeZone);
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export type DeadlineState = 'overdue' | 'today' | 'soon' | 'none';

export function deadlineState(due: string | null, today: string, done = false): DeadlineState {
  if (!due || done) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due <= addDays(today, 2)) return 'soon';
  return 'none';
}
