CREATE TABLE IF NOT EXISTS calendar_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,
  provider    text NOT NULL CHECK (provider IN ('mock', 'google')),
  external_id text NOT NULL,
  side        text CHECK (side IN ('partner', 'direct')),
  is_timeline_target boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS calendar_accounts_one_target
  ON calendar_accounts (is_timeline_target) WHERE is_timeline_target;

CREATE TABLE IF NOT EXISTS mock_calendar_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id text NOT NULL,
  title       text NOT NULL,
  description text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  busy        boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS mock_calendar_events_range_idx ON mock_calendar_events (calendar_id, starts_at);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      uuid REFERENCES tasks(id) ON DELETE SET NULL,
  title        text NOT NULL,
  starts_at    timestamptz NOT NULL,
  duration_min int NOT NULL CHECK (duration_min BETWEEN 5 AND 720),
  side         text CHECK (side IN ('partner', 'direct')),
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  notes        text,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timeline_entries_range_idx ON timeline_entries (starts_at);

CREATE TABLE IF NOT EXISTS timeline_weeks (
  week_start   date PRIMARY KEY,
  processed_at timestamptz,
  processed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  report       jsonb,
  synced_at    timestamptz,
  sync_result  jsonb
);

CREATE TABLE IF NOT EXISTS calendar_sync_links (
  account_id        uuid NOT NULL REFERENCES calendar_accounts(id) ON DELETE CASCADE,
  origin            text NOT NULL CHECK (origin IN ('timeline', 'booking')),
  origin_id         uuid NOT NULL,
  external_event_id text NOT NULL,
  fingerprint       text NOT NULL,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, origin, origin_id)
);

DROP TRIGGER IF EXISTS timeline_entries_touch ON timeline_entries;
CREATE TRIGGER timeline_entries_touch BEFORE UPDATE ON timeline_entries FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS timeline_entries_notify ON timeline_entries;
CREATE TRIGGER timeline_entries_notify AFTER INSERT OR UPDATE OR DELETE ON timeline_entries FOR EACH ROW EXECUTE FUNCTION notify_change();
DROP TRIGGER IF EXISTS mock_calendar_events_touch ON mock_calendar_events;
CREATE TRIGGER mock_calendar_events_touch BEFORE UPDATE ON mock_calendar_events FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
