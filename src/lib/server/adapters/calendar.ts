import type { Db } from '../db';

export interface CalendarEventInput {
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  busy: boolean;
}

export interface BusyInterval {
  start: number;
  end: number;
}

export interface CalendarProvider {
  name: 'mock' | 'google';
  listBusy(calendarId: string, from: Date, to: Date): Promise<BusyInterval[]>;
  upsertEvent(calendarId: string, externalId: string | null, ev: CalendarEventInput): Promise<string>;
  deleteEvent(calendarId: string, externalId: string): Promise<void>;
}

export class MockCalendar implements CalendarProvider {
  name = 'mock' as const;
  constructor(private db: Db) {}

  async listBusy(calendarId: string, from: Date, to: Date): Promise<BusyInterval[]> {
    const { rows } = await this.db.query<{ starts_at: Date; ends_at: Date }>(
      `SELECT starts_at, ends_at FROM mock_calendar_events
        WHERE calendar_id = $1 AND busy AND starts_at < $3 AND ends_at > $2`,
      [calendarId, from, to],
    );
    return rows.map((r) => ({ start: r.starts_at.getTime(), end: r.ends_at.getTime() }));
  }

  async upsertEvent(calendarId: string, externalId: string | null, ev: CalendarEventInput): Promise<string> {
    if (externalId) {
      const { rowCount } = await this.db.query(
        `UPDATE mock_calendar_events SET title = $3, description = $4, starts_at = $5, ends_at = $6, busy = $7
          WHERE id = $1 AND calendar_id = $2`,
        [externalId, calendarId, ev.title, ev.description ?? null, ev.startsAt, ev.endsAt, ev.busy],
      );
      if (rowCount) return externalId;
    }
    const { rows } = await this.db.query<{ id: string }>(
      `INSERT INTO mock_calendar_events (calendar_id, title, description, starts_at, ends_at, busy)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [calendarId, ev.title, ev.description ?? null, ev.startsAt, ev.endsAt, ev.busy],
    );
    return rows[0]!.id;
  }

  async deleteEvent(calendarId: string, externalId: string): Promise<void> {
    await this.db.query('DELETE FROM mock_calendar_events WHERE id = $1 AND calendar_id = $2', [externalId, calendarId]);
  }
}

export class GoogleCalendar implements CalendarProvider {
  name = 'google' as const;
  private accessToken: { value: string; expires: number } | null = null;

  constructor(
    private clientId: string,
    private clientSecret: string,
    private refreshToken: string,
  ) {}

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expires > Date.now() + 30_000) return this.accessToken.value;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error(`Google token refresh failed: HTTP ${res.status}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 404 && method === 'DELETE') return undefined as T;
    if (!res.ok) throw new Error(`Google Calendar ${method} ${path}: HTTP ${res.status}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async listBusy(calendarId: string, from: Date, to: Date): Promise<BusyInterval[]> {
    const data = await this.call<{ calendars: Record<string, { busy: { start: string; end: string }[] }> }>(
      'POST',
      '/freeBusy',
      { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: calendarId }] },
    );
    return (data.calendars[calendarId]?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  }

  async upsertEvent(calendarId: string, externalId: string | null, ev: CalendarEventInput): Promise<string> {
    const body = {
      summary: ev.title,
      description: ev.description,
      start: { dateTime: ev.startsAt.toISOString() },
      end: { dateTime: ev.endsAt.toISOString() },
      transparency: ev.busy ? 'opaque' : 'transparent',
    };
    const cal = encodeURIComponent(calendarId);
    const out = externalId
      ? await this.call<{ id: string }>('PUT', `/calendars/${cal}/events/${encodeURIComponent(externalId)}`, body)
      : await this.call<{ id: string }>('POST', `/calendars/${cal}/events`, body);
    return out.id;
  }

  async deleteEvent(calendarId: string, externalId: string): Promise<void> {
    await this.call('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(externalId)}`);
  }
}

export function calendarProvider(db: Db, kind: 'mock' | 'google', env: NodeJS.ProcessEnv = process.env): CalendarProvider {
  if (kind === 'google') {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
      throw new Error('Google Calendar is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)');
    }
    return new GoogleCalendar(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REFRESH_TOKEN);
  }
  return new MockCalendar(db);
}
