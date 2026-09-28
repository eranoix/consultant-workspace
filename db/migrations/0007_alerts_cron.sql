CREATE TABLE IF NOT EXISTS alert_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled     boolean NOT NULL DEFAULT true,
  event       text NOT NULL CHECK (event IN (
                'email.received', 'email.unanswered', 'task.overdue', 'task.due_today',
                'cron.late', 'intake.stalled', 'booking.created')),
  match       text NOT NULL DEFAULT 'all' CHECK (match IN ('all', 'any')),
  conditions  jsonb NOT NULL DEFAULT '[]',
  severity    text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  channels    text[] NOT NULL DEFAULT '{outbox}',
  cooldown_min int NOT NULL DEFAULT 60 CHECK (cooldown_min >= 0),
  system      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       uuid REFERENCES alert_rules(id) ON DELETE SET NULL,
  severity      text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  entity_type   text,
  entity_id     text,
  dedupe_key    text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'snoozed', 'resolved')),
  snoozed_until timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_live_dedupe ON alerts (dedupe_key) WHERE status <> 'resolved';
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id   uuid REFERENCES alerts(id) ON DELETE CASCADE,
  channel    text NOT NULL CHECK (channel IN ('outbox', 'email', 'whatsapp')),
  recipient  text NOT NULL,
  subject    text NOT NULL,
  body       text NOT NULL,
  status     text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  attempts   int NOT NULL DEFAULT 0,
  last_error text,
  delivered_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);
CREATE INDEX IF NOT EXISTS notification_outbox_queue_idx ON notification_outbox (status, created_at);

CREATE TABLE IF NOT EXISTS cron_jobs (
  name             text PRIMARY KEY,
  description      text NOT NULL DEFAULT '',
  interval_sec     int NOT NULL CHECK (interval_sec > 0),
  grace_sec        int NOT NULL DEFAULT 60,
  enabled          boolean NOT NULL DEFAULT true,
  watched_by       text,
  last_started_at  timestamptz,
  last_finished_at timestamptz,
  last_success_at  timestamptz,
  last_error_at    timestamptz,
  last_error       text,
  last_duration_ms int,
  run_count        bigint NOT NULL DEFAULT 0,
  fail_count       bigint NOT NULL DEFAULT 0,
  run_requested_at timestamptz
);

CREATE TABLE IF NOT EXISTS job_runs (
  id          bigserial PRIMARY KEY,
  job         text NOT NULL REFERENCES cron_jobs(name) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  ok          boolean,
  detail      jsonb
);
CREATE INDEX IF NOT EXISTS job_runs_recent_idx ON job_runs (job, started_at DESC);

DROP TRIGGER IF EXISTS alert_rules_touch ON alert_rules;
CREATE TRIGGER alert_rules_touch BEFORE UPDATE ON alert_rules FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS alerts_touch ON alerts;
CREATE TRIGGER alerts_touch BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS alerts_notify ON alerts;
CREATE TRIGGER alerts_notify AFTER INSERT OR UPDATE OR DELETE ON alerts FOR EACH ROW EXECUTE FUNCTION notify_change();
