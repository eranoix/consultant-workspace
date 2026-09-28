CREATE TABLE IF NOT EXISTS mock_mailbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid         bigserial UNIQUE,
  folder      text NOT NULL,
  message_id  text NOT NULL UNIQUE,
  thread_id   text,
  from_email  text NOT NULL,
  from_name   text,
  to_emails   text[] NOT NULL DEFAULT '{}',
  subject     text NOT NULL,
  body_text   text NOT NULL DEFAULT '',
  body_html   text,
  received_at timestamptz NOT NULL,
  modified_at timestamptz
);
CREATE INDEX IF NOT EXISTS mock_mailbox_folder_idx ON mock_mailbox (folder, uid);

CREATE TABLE IF NOT EXISTS sources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('meeting', 'email')),
  external_id  text UNIQUE,
  title        text NOT NULL,
  body         text NOT NULL,
  from_email   text,
  from_name    text,
  participants text[] NOT NULL DEFAULT '{}',
  thread_id    text,
  direction    text NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  occurred_at  timestamptz NOT NULL,
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  side         text CHECK (side IN ('partner', 'direct')),
  side_reason  text,
  client_locked boolean NOT NULL DEFAULT false,
  summary      jsonb,
  summarized_at timestamptz,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  reviewed_at  timestamptz,
  reviewed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sources_queue_idx ON sources (status, kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS sources_thread_idx ON sources (thread_id);

CREATE TABLE IF NOT EXISTS candidate_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title       text NOT NULL,
  details     text NOT NULL DEFAULT '',
  client_id   uuid REFERENCES clients(id) ON DELETE SET NULL,
  side        text CHECK (side IN ('partner', 'direct')),
  due_date    date,
  decision    text NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'approved', 'no_action')),
  decided_at  timestamptz,
  decided_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  position    int NOT NULL DEFAULT 0,
  task_id     uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidate_tasks_source_idx ON candidate_tasks (source_id, position);
CREATE INDEX IF NOT EXISTS candidate_tasks_decision_idx ON candidate_tasks (decision);

CREATE TABLE IF NOT EXISTS intake_runs (
  id          bigserial PRIMARY KEY,
  channel     text NOT NULL CHECK (channel IN ('email', 'meeting', 'notes')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  fetched     int NOT NULL DEFAULT 0,
  created     int NOT NULL DEFAULT 0,
  skipped     int NOT NULL DEFAULT 0,
  error       text
);
CREATE INDEX IF NOT EXISTS intake_runs_recent_idx ON intake_runs (channel, started_at DESC);

DROP TRIGGER IF EXISTS sources_touch ON sources;
CREATE TRIGGER sources_touch BEFORE UPDATE ON sources FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS candidate_tasks_touch ON candidate_tasks;
CREATE TRIGGER candidate_tasks_touch BEFORE UPDATE ON candidate_tasks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS sources_notify ON sources;
CREATE TRIGGER sources_notify AFTER INSERT OR UPDATE OR DELETE ON sources FOR EACH ROW EXECUTE FUNCTION notify_change();
DROP TRIGGER IF EXISTS candidate_tasks_notify ON candidate_tasks;
CREATE TRIGGER candidate_tasks_notify AFTER INSERT OR UPDATE OR DELETE ON candidate_tasks FOR EACH ROW EXECUTE FUNCTION notify_change();
