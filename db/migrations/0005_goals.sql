CREATE TABLE IF NOT EXISTS goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES goals(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  side        text CHECK (side IN ('partner', 'direct')),
  client_id   uuid REFERENCES clients(id) ON DELETE SET NULL,
  rrule       text,
  starts_on   date NOT NULL DEFAULT current_date,
  due_on      date,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'archived')),
  position    double precision NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE OR REPLACE FUNCTION goals_two_levels() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM goals WHERE id = NEW.parent_id AND parent_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'goals are two levels deep: a key result cannot have children';
  END IF;
  IF NEW.parent_id IS NOT NULL AND TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM goals WHERE parent_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'an objective with key results cannot become a key result';
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS goal_occurrences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id      uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  occurs_on    date NOT NULL,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'doing', 'done', 'skipped')),
  position     double precision NOT NULL DEFAULT 0,
  completed_at timestamptz,
  UNIQUE (goal_id, occurs_on)
);
CREATE INDEX IF NOT EXISTS goal_occurrences_day_idx ON goal_occurrences (occurs_on);

DROP TRIGGER IF EXISTS goals_levels ON goals;
CREATE TRIGGER goals_levels BEFORE INSERT OR UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION goals_two_levels();
DROP TRIGGER IF EXISTS goals_touch ON goals;
CREATE TRIGGER goals_touch BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS goal_occurrences_notify ON goal_occurrences;
CREATE TRIGGER goal_occurrences_notify AFTER INSERT OR UPDATE OR DELETE ON goal_occurrences FOR EACH ROW EXECUTE FUNCTION notify_change();
DROP TRIGGER IF EXISTS goals_notify ON goals;
CREATE TRIGGER goals_notify AFTER INSERT OR UPDATE OR DELETE ON goals FOR EACH ROW EXECUTE FUNCTION notify_change();
