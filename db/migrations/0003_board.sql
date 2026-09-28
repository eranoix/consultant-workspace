CREATE TABLE IF NOT EXISTS api_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  prefix       text NOT NULL UNIQUE,
  token_hash   text NOT NULL,
  role         text NOT NULL CHECK (role IN ('viewer', 'contributor', 'manager', 'custom')),
  permissions  text[] NOT NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz
);

CREATE TABLE IF NOT EXISTS tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  description  text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'backlog'
               CHECK (status IN ('backlog', 'todo', 'doing', 'review', 'done')),
  position     double precision NOT NULL DEFAULT 0,
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  side         text CHECK (side IN ('partner', 'direct')),
  due_date     date,
  estimate_min int CHECK (estimate_min BETWEEN 5 AND 1440),
  priority     text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  origin       text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'approval', 'api')),
  source_id    uuid REFERENCES sources(id) ON DELETE SET NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  api_token_id uuid REFERENCES api_tokens(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS tasks_column_idx ON tasks (status, position);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks (due_date) WHERE status <> 'done';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidate_tasks_task_fk') THEN
    ALTER TABLE candidate_tasks
      ADD CONSTRAINT candidate_tasks_task_fk FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION tasks_completed_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at := coalesce(NEW.completed_at, now());
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_completed ON tasks;
CREATE TRIGGER tasks_completed BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION tasks_completed_at();
DROP TRIGGER IF EXISTS tasks_touch ON tasks;
CREATE TRIGGER tasks_touch BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS tasks_notify ON tasks;
CREATE TRIGGER tasks_notify AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION notify_change();
