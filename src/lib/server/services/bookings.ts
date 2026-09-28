import { randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Db } from '../db';
import { HttpError } from '../errors';
import { slots, type Calendar, type Interval } from '@/lib/engine/availability';
import { calendarProvider } from '../adapters/calendar';
import { getSettings } from '../settings';
import { addDays, zonedTimeToUtc } from '@/lib/domain/time';
import { emit } from './alerts';

export interface ServiceRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  duration_min: number;
  step_min: number;
  buffer_after_min: number;
  min_notice_min: number;
  max_advance_days: number;
  calendar_account_id: string | null;
  calendar_label: string | null;
  price_label: string | null;
  active: boolean;
}

export async function listServices(db: Db, activeOnly = true): Promise<ServiceRow[]> {
  const { rows } = await db.query<ServiceRow>(
    `SELECT s.*, a.label AS calendar_label FROM services s LEFT JOIN calendar_accounts a ON a.id = s.calendar_account_id
      ${activeOnly ? 'WHERE s.active' : ''} ORDER BY s.position, s.name`,
  );
  return rows;
}

export async function serviceBySlug(db: Db, slug: string): Promise<ServiceRow> {
  const { rows } = await db.query<ServiceRow>(
    `SELECT s.*, a.label AS calendar_label FROM services s LEFT JOIN calendar_accounts a ON a.id = s.calendar_account_id
      WHERE s.slug = $1 AND s.active`,
    [slug],
  );
  if (!rows[0]) throw new HttpError(404, 'Service not found');
  return rows[0];
}

async function calendarModel(db: Db): Promise<Calendar> {
  const settings = await getSettings(db);
  const rules = await db.query<{ weekday: number; start_time: string; end_time: string }>('SELECT weekday, start_time, end_time FROM availability_rules');
  const exceptions = await db.query<{ date: string; kind: 'closed' | 'open'; windows: { start: string; end: string }[] }>(
    "SELECT to_char(date, 'YYYY-MM-DD') AS date, kind, windows FROM availability_exceptions",
  );
  return {
    timeZone: settings.profile.timeZone,
    weekly: rules.rows.map((r) => ({ weekday: r.weekday, start: r.start_time, end: r.end_time })),
    exceptions: exceptions.rows,
  };
}

async function busyFor(db: Db, service: ServiceRow, from: Date, to: Date): Promise<Interval[]> {
  const booked = await db.query<{ starts_at: Date; reserved_until: Date }>(
    "SELECT starts_at, reserved_until FROM bookings WHERE status = 'confirmed' AND starts_at < $2 AND reserved_until > $1",
    [from, to],
  );
  const busy: Interval[] = booked.rows.map((b) => ({ start: b.starts_at.getTime(), end: b.reserved_until.getTime() }));
  if (service.calendar_account_id) {
    const acc = await db.query<{ provider: 'mock' | 'google'; external_id: string }>('SELECT provider, external_id FROM calendar_accounts WHERE id = $1', [
      service.calendar_account_id,
    ]);
    const a = acc.rows[0];
    if (a) {
      const events = await calendarProvider(db, a.provider).listBusy(a.external_id, from, to);
      busy.push(...events);
    }
  }
  return busy;
}

export async function slotsForDay(db: Db, service: ServiceRow, date: string, now = Date.now()) {
  const cal = await calendarModel(db);
  const from = zonedTimeToUtc(date, '00:00', cal.timeZone);
  const to = zonedTimeToUtc(addDays(date, 1), '00:00', cal.timeZone);
  const busy = await busyFor(db, service, new Date(from), new Date(to));
  return {
    timeZone: cal.timeZone,
    slots: slots({
      calendar: cal,
      service: {
        durationMin: service.duration_min,
        stepMin: service.step_min,
        bufferAfterMin: service.buffer_after_min,
        minNoticeMin: service.min_notice_min,
        maxAdvanceDays: service.max_advance_days,
      },
      from,
      to,
      busy,
      now,
    }),
  };
}

export async function openDays(db: Db, service: ServiceRow, fromDate: string, days = 21) {
  const out: { date: string; count: number }[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = addDays(fromDate, i);
    const { slots: s } = await slotsForDay(db, service, d);
    out.push({ date: d, count: s.length });
  }
  return out;
}

export async function createBooking(
  db: PoolClient,
  input: { slug: string; startsAt: string; name: string; email: string; company?: string; notes?: string },
) {
  const service = await serviceBySlug(db, input.slug);
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) throw new HttpError(400, 'Invalid start time');
  const settings = await getSettings(db);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: settings.profile.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
  const { slots: available } = await slotsForDay(db, service, day);
  if (!available.some((s) => s.start === start.getTime())) throw new HttpError(409, 'That time is no longer available');
  const end = new Date(start.getTime() + service.duration_min * 60_000);
  const reserved = new Date(end.getTime() + service.buffer_after_min * 60_000);
  const token = randomBytes(18).toString('base64url');
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (service_id, starts_at, ends_at, reserved_until, customer_name, customer_email, company, notes, manage_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [service.id, start, end, reserved, input.name, input.email, input.company ?? null, input.notes ?? null, token],
  );
  const bookingId = rows[0]!.id;
  if (service.calendar_account_id) {
    const acc = (await db.query<{ id: string; provider: 'mock' | 'google'; external_id: string }>('SELECT id, provider, external_id FROM calendar_accounts WHERE id = $1', [service.calendar_account_id])).rows[0];
    if (acc) {
      const eventId = await calendarProvider(db, acc.provider).upsertEvent(acc.external_id, null, {
        title: `${service.name}: ${input.name}${input.company ? ` (${input.company})` : ''}`,
        description: input.notes,
        startsAt: start,
        endsAt: end,
        busy: true,
      });
      await db.query(
        "INSERT INTO calendar_sync_links (account_id, origin, origin_id, external_event_id, fingerprint) VALUES ($1, 'booking', $2, $3, 'booking')",
        [acc.id, bookingId, eventId],
      );
    }
  }
  await emit(
    db,
    'booking.created',
    { service: service.name, customer_email: input.email, company: input.company ?? '', hours_until: Math.round((start.getTime() - Date.now()) / 3600_000) },
    { type: 'booking', id: bookingId, label: `${service.name} with ${input.name}` },
  );
  return { id: bookingId, token, startsAt: start.toISOString(), endsAt: end.toISOString(), service: service.name };
}

export async function bookingByToken(db: Db, token: string) {
  const { rows } = await db.query(
    `SELECT b.id, b.starts_at, b.ends_at, b.customer_name, b.customer_email, b.company, b.status, s.name AS service_name, s.slug
       FROM bookings b JOIN services s ON s.id = b.service_id WHERE b.manage_token = $1`,
    [token],
  );
  if (!rows[0]) throw new HttpError(404, 'Booking not found');
  return rows[0];
}

export async function cancelBooking(db: PoolClient, where: { token?: string; id?: string }) {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = now()
      WHERE ${where.token ? 'manage_token = $1' : 'id = $1'} AND status = 'confirmed' RETURNING id`,
    [where.token ?? where.id],
  );
  const id = rows[0]?.id;
  if (!id) throw new HttpError(404, 'Booking not found or already cancelled');
  const links = await db.query<{ account_id: string; external_event_id: string; provider: 'mock' | 'google'; external_id: string }>(
    `SELECT l.account_id, l.external_event_id, a.provider, a.external_id FROM calendar_sync_links l
       JOIN calendar_accounts a ON a.id = l.account_id WHERE l.origin = 'booking' AND l.origin_id = $1`,
    [id],
  );
  for (const l of links.rows) {
    await calendarProvider(db, l.provider).deleteEvent(l.external_id, l.external_event_id);
    await db.query("DELETE FROM calendar_sync_links WHERE account_id = $1 AND origin = 'booking' AND origin_id = $2", [l.account_id, id]);
  }
}

export async function listBookings(db: Db, scope: 'upcoming' | 'past' = 'upcoming') {
  const { rows } = await db.query(
    `SELECT b.id, b.starts_at, b.ends_at, b.customer_name, b.customer_email, b.company, b.notes, b.status, b.created_at,
            s.name AS service_name, a.label AS calendar_label
       FROM bookings b JOIN services s ON s.id = b.service_id LEFT JOIN calendar_accounts a ON a.id = s.calendar_account_id
      WHERE ${scope === 'upcoming' ? 'b.ends_at >= now()' : 'b.ends_at < now()'}
      ORDER BY b.starts_at ${scope === 'upcoming' ? 'ASC' : 'DESC'} LIMIT 100`,
  );
  return rows;
}

export async function setServiceCalendar(db: Db, serviceId: string, accountId: string | null) {
  await db.query('UPDATE services SET calendar_account_id = $2 WHERE id = $1', [serviceId, accountId]);
}

export async function listCalendars(db: Db) {
  const { rows } = await db.query<{ id: string; label: string; provider: string; external_id: string; side: string | null; is_timeline_target: boolean }>(
    'SELECT id, label, provider, external_id, side, is_timeline_target FROM calendar_accounts ORDER BY label',
  );
  return rows;
}

export async function availabilityRules(db: Db) {
  const { rows } = await db.query<{ weekday: number; start_time: string; end_time: string }>(
    'SELECT weekday, start_time, end_time FROM availability_rules ORDER BY weekday, start_time',
  );
  return rows;
}
