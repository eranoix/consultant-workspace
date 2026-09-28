import type { Db } from '../db';
import { HttpError } from '../errors';
import { dedupeKey, inCooldown, matchRule, renderTemplate, type Condition, type Payload } from '@/lib/domain/rules';
import { deliver, type Channel } from '../adapters/notifier';
import { getSettings } from '../settings';
import { dateInZone } from '@/lib/domain/time';

export interface RuleRow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  event: string;
  match: 'all' | 'any';
  conditions: Condition[];
  severity: 'info' | 'warning' | 'critical';
  channels: Channel[];
  cooldown_min: number;
  system: boolean;
  open_alerts?: number;
  last_fired_at?: string | null;
}

export interface Entity {
  type: string;
  id: string;
  label?: string;
}

export async function listRules(db: Db): Promise<RuleRow[]> {
  const { rows } = await db.query<RuleRow>(
    `SELECT r.*, (SELECT count(*)::int FROM alerts a WHERE a.rule_id = r.id AND a.status <> 'resolved') AS open_alerts,
            (SELECT max(a.created_at) FROM alerts a WHERE a.rule_id = r.id) AS last_fired_at
       FROM alert_rules r ORDER BY r.system DESC, r.event, r.name`,
  );
  return rows;
}

export async function emit(db: Db, event: string, payload: Payload, entity: Entity | null, now = new Date()): Promise<number> {
  const rules = (await db.query<RuleRow>('SELECT * FROM alert_rules WHERE enabled AND event = $1', [event])).rows;
  let raised = 0;
  for (const rule of rules) {
    if (!matchRule(rule, event, payload)) continue;
    const key = dedupeKey(rule.id, entity ? `${entity.type}:${entity.id}` : null);
    const last = await db.query<{ resolved_at: Date | null }>(
      "SELECT resolved_at FROM alerts WHERE dedupe_key = $1 AND status = 'resolved' ORDER BY resolved_at DESC LIMIT 1",
      [key],
    );
    if (inCooldown(last.rows[0]?.resolved_at ?? null, rule.cooldown_min, now)) continue;
    const title = renderTemplate(rule.name, payload);
    const body = entity?.label ? `${entity.label}` : Object.entries(payload).map(([k, v]) => `${k}: ${v ?? ''}`).join(', ');
    const ins = await db.query<{ id: string }>(
      `INSERT INTO alerts (rule_id, severity, title, body, entity_type, entity_id, dedupe_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (dedupe_key) WHERE status <> 'resolved' DO NOTHING RETURNING id`,
      [rule.id, rule.severity, title, body, entity?.type ?? null, entity?.id ?? null, key],
    );
    const alertId = ins.rows[0]?.id;
    if (!alertId) continue;
    raised += 1;
    const recipient = process.env.NOTIFY_RECIPIENT || 'maya@lumen.example.com';
    for (const channel of rule.channels) {
      await db.query(
        'INSERT INTO notification_outbox (alert_id, channel, recipient, subject, body) VALUES ($1,$2,$3,$4,$5)',
        [alertId, channel, recipient, `[${rule.severity}] ${title}`, body],
      );
    }
  }
  return raised;
}

async function resolveGone(db: Db, ruleIds: string[], liveKeys: Set<string>) {
  if (!ruleIds.length) return 0;
  const { rows } = await db.query<{ id: string; dedupe_key: string }>(
    "SELECT id, dedupe_key FROM alerts WHERE rule_id = ANY($1::uuid[]) AND status <> 'resolved'",
    [ruleIds],
  );
  const gone = rows.filter((r) => !liveKeys.has(r.dedupe_key)).map((r) => r.id);
  if (gone.length) await db.query("UPDATE alerts SET status = 'resolved', resolved_at = now() WHERE id = ANY($1::uuid[])", [gone]);
  return gone.length;
}

export async function evaluateScheduled(db: Db, now = new Date()) {
  const settings = await getSettings(db);
  const today = dateInZone(now.getTime(), settings.profile.timeZone);
  const derived: { event: string; payload: Payload; entity: Entity }[] = [];

  const overdue = await db.query<{ id: string; title: string; client: string | null; side: string | null; status: string; priority: string; days: number }>(
    `SELECT t.id, t.title, c.name AS client, t.side, t.status, t.priority, ($1::date - t.due_date)::int AS days
       FROM tasks t LEFT JOIN clients c ON c.id = t.client_id
      WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date <= $1::date`,
    [today],
  );
  for (const t of overdue.rows) {
    const base = { title: t.title, client: t.client, side: t.side, status: t.status, priority: t.priority };
    if (t.days > 0) derived.push({ event: 'task.overdue', payload: { ...base, days_overdue: t.days }, entity: { type: 'task', id: t.id, label: t.title } });
    else derived.push({ event: 'task.due_today', payload: base, entity: { type: 'task', id: t.id, label: t.title } });
  }

  const unanswered = await db.query<{ id: string; thread_id: string; title: string; from_email: string; client: string | null; side: string | null; hours: number }>(
    `SELECT DISTINCT ON (s.thread_id) s.id, s.thread_id, s.title, s.from_email, c.name AS client, s.side,
            floor(extract(epoch FROM ($1::timestamptz - s.occurred_at)) / 3600)::int AS hours, s.direction
       FROM sources s LEFT JOIN clients c ON c.id = s.client_id
      WHERE s.kind = 'email' AND s.thread_id IS NOT NULL AND s.occurred_at > $1::timestamptz - interval '14 days'
      ORDER BY s.thread_id, s.occurred_at DESC`,
    [now],
  );
  for (const u of unanswered.rows as (typeof unanswered.rows[number] & { direction: string })[]) {
    if (u.direction !== 'inbound') continue;
    derived.push({
      event: 'email.unanswered',
      payload: { from_email: u.from_email, from_domain: u.from_email.split('@')[1] ?? '', subject: u.title, client: u.client, side: u.side, hours_unanswered: u.hours },
      entity: { type: 'thread', id: u.thread_id, label: u.title },
    });
  }

  const intake = await db.query<{ channel: string; hours: number | null }>(
    `SELECT ch AS channel,
            floor(extract(epoch FROM ($1::timestamptz - (SELECT max(finished_at) FROM intake_runs r WHERE r.channel = ch AND r.error IS NULL))) / 3600)::int AS hours
       FROM unnest(ARRAY['email', 'meeting', 'notes']) AS ch`,
    [now],
  );
  for (const i of intake.rows) {
    derived.push({ event: 'intake.stalled', payload: { channel: i.channel, hours_since_success: i.hours ?? 9999 }, entity: { type: 'intake', id: i.channel, label: `${i.channel} intake` } });
  }

  const rules = (await db.query<RuleRow>(
    "SELECT * FROM alert_rules WHERE enabled AND event IN ('task.overdue', 'task.due_today', 'email.unanswered', 'intake.stalled')",
  )).rows;
  const live = new Set<string>();
  let raised = 0;
  for (const d of derived) {
    for (const r of rules) {
      if (matchRule(r, d.event, d.payload)) live.add(dedupeKey(r.id, `${d.entity.type}:${d.entity.id}`));
    }
    raised += await emit(db, d.event, d.payload, d.entity, now);
  }
  const resolved = await resolveGone(db, rules.map((r) => r.id), live);
  return { derived: derived.length, raised, resolved };
}

export async function raiseCronLate(db: Db, late: { name: string; minutesLate: number; watchedBy: string | null }[], watcher: string) {
  const rules = (await db.query<RuleRow>("SELECT * FROM alert_rules WHERE enabled AND event = 'cron.late'")).rows;
  const live = new Set<string>();
  let raised = 0;
  for (const j of late) {
    const payload = { job: j.name, minutes_late: j.minutesLate, watched_by: j.watchedBy };
    for (const r of rules) if (matchRule(r, 'cron.late', payload)) live.add(dedupeKey(r.id, `job:${j.name}`));
    raised += await emit(db, 'cron.late', payload, { type: 'job', id: j.name, label: `${j.name} is ${j.minutesLate} min late` });
  }
  const { rows } = await db.query<{ id: string; entity_id: string; dedupe_key: string }>(
    `SELECT a.id, a.entity_id, a.dedupe_key FROM alerts a JOIN cron_jobs j ON j.name = a.entity_id
      WHERE a.entity_type = 'job' AND a.status <> 'resolved' AND j.watched_by = $1`,
    [watcher],
  );
  const gone = rows.filter((r) => !live.has(r.dedupe_key)).map((r) => r.id);
  if (gone.length) await db.query("UPDATE alerts SET status = 'resolved', resolved_at = now() WHERE id = ANY($1::uuid[])", [gone]);
  return raised;
}

export async function deliverOutbox(db: Db, limit = 50) {
  const { rows } = await db.query<{ id: string; channel: Channel; recipient: string; subject: string; body: string; attempts: number }>(
    `SELECT id, channel, recipient, subject, body, attempts FROM notification_outbox
      WHERE status = 'queued' OR (status = 'failed' AND attempts < 3)
      ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
    [limit],
  );
  let sent = 0;
  let failed = 0;
  for (const m of rows) {
    const res = await deliver(m);
    if (res.ok) {
      sent += 1;
      await db.query("UPDATE notification_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, delivered_via = $2, last_error = NULL WHERE id = $1", [m.id, res.via]);
    } else {
      failed += 1;
      await db.query(
        `UPDATE notification_outbox SET attempts = attempts + 1, last_error = $2,
                status = CASE WHEN attempts + 1 >= 3 THEN 'sent' ELSE 'failed' END,
                delivered_via = CASE WHEN attempts + 1 >= 3 THEN 'outbox (after 3 failed attempts)' ELSE delivered_via END,
                sent_at = CASE WHEN attempts + 1 >= 3 THEN now() ELSE sent_at END
          WHERE id = $1`,
        [m.id, res.error ?? 'failed'],
      );
    }
  }
  return { sent, failed };
}

export async function listAlerts(db: Db, status: 'live' | 'resolved' | 'all' = 'live', limit = 100) {
  const where =
    status === 'live'
      ? "WHERE a.status IN ('open', 'acknowledged') OR (a.status = 'snoozed' AND a.snoozed_until <= now())"
      : status === 'resolved'
        ? "WHERE a.status = 'resolved'"
        : '';
  const { rows } = await db.query(
    `SELECT a.*, r.name AS rule_name, r.event
       FROM alerts a LEFT JOIN alert_rules r ON r.id = a.rule_id ${where}
      ORDER BY CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, a.created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function alertAction(db: Db, id: string, action: 'acknowledge' | 'snooze' | 'resolve' | 'reopen', minutes = 60) {
  const sql = {
    acknowledge: "UPDATE alerts SET status = 'acknowledged' WHERE id = $1",
    snooze: "UPDATE alerts SET status = 'snoozed', snoozed_until = now() + make_interval(mins => $2) WHERE id = $1",
    resolve: "UPDATE alerts SET status = 'resolved', resolved_at = now() WHERE id = $1",
    reopen: "UPDATE alerts SET status = 'open', resolved_at = NULL, snoozed_until = NULL WHERE id = $1",
  }[action];
  const { rowCount } = await db.query(sql, action === 'snooze' ? [id, minutes] : [id]);
  if (!rowCount) throw new HttpError(404, 'Alert not found');
}

export interface RuleInput {
  name: string;
  description?: string;
  enabled?: boolean;
  event: string;
  match?: 'all' | 'any';
  conditions?: Condition[];
  severity?: 'info' | 'warning' | 'critical';
  channels?: Channel[];
  cooldownMin?: number;
}

export async function saveRule(db: Db, id: string | null, input: Partial<RuleInput>) {
  if (!id) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO alert_rules (name, description, enabled, event, match, conditions, severity, channels, cooldown_min)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        input.name,
        input.description ?? '',
        input.enabled ?? true,
        input.event,
        input.match ?? 'all',
        JSON.stringify(input.conditions ?? []),
        input.severity ?? 'warning',
        input.channels ?? ['outbox'],
        input.cooldownMin ?? 60,
      ],
    );
    return rows[0]!.id;
  }
  const current = (await db.query<RuleRow>('SELECT * FROM alert_rules WHERE id = $1', [id])).rows[0];
  if (!current) throw new HttpError(404, 'Rule not found');
  if (current.system && input.event && input.event !== current.event) throw new HttpError(400, 'The event of a system rule cannot change');
  await db.query(
    `UPDATE alert_rules SET name = $2, description = $3, enabled = $4, event = $5, match = $6, conditions = $7,
            severity = $8, channels = $9, cooldown_min = $10 WHERE id = $1`,
    [
      id,
      input.name ?? current.name,
      input.description ?? current.description,
      input.enabled ?? current.enabled,
      input.event ?? current.event,
      input.match ?? current.match,
      JSON.stringify(input.conditions ?? current.conditions),
      input.severity ?? current.severity,
      input.channels ?? current.channels,
      input.cooldownMin ?? current.cooldown_min,
    ],
  );
  return id;
}

export async function deleteRule(db: Db, id: string) {
  const { rows } = await db.query<{ system: boolean }>('SELECT system FROM alert_rules WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Rule not found');
  if (rows[0].system) throw new HttpError(400, 'System rules can be disabled, not deleted');
  await db.query('DELETE FROM alert_rules WHERE id = $1', [id]);
}

export async function listOutbox(db: Db, limit = 100) {
  const { rows } = await db.query(
    `SELECT o.id, o.channel, o.recipient, o.subject, o.body, o.status, o.attempts, o.last_error, o.delivered_via, o.created_at, o.sent_at
       FROM notification_outbox o ORDER BY o.created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}
