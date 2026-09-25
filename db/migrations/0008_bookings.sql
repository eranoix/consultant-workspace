-- 0008 bookings: the public booking page. Services choose which calendar
-- they book into; the database itself refuses two confirmed bookings that
-- overlap, whatever the application code does.

CREATE TABLE IF NOT EXISTS services (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,
  name                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  duration_min        int NOT NULL CHECK (duration_min BETWEEN 5 AND 480),
  step_min            int NOT NULL CHECK (step_min BETWEEN 5 AND 480),
  buffer_after_min    int NOT NULL DEFAULT 0 CHECK (buffer_after_min >= 0),
  min_notice_min      int NOT NULL DEFAULT 120,
  max_advance_days    int NOT NULL DEFAULT 30,
  calendar_account_id uuid REFERENCES calendar_accounts(id) ON DELETE SET NULL,
  price_label         text,
  active              boolean NOT NULL DEFAULT true,
  position            int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday    int NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time text NOT NULL CHECK (start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  end_time   text NOT NULL CHECK (end_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  CHECK (end_time > start_time)
);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  date    date PRIMARY KEY,
  kind    text NOT NULL CHECK (kind IN ('closed', 'open')),
  windows jsonb NOT NULL DEFAULT '[]',
  note    text
);

CREATE TABLE IF NOT EXISTS bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id     uuid NOT NULL REFERENCES services(id),
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  reserved_until timestamptz NOT NULL,
  customer_name  text NOT NULL,
  customer_email text NOT NULL,
  company        text,
  notes          text,
  status         text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  manage_token   text NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  cancelled_at   timestamptz,
  CHECK (ends_at > starts_at AND reserved_until >= ends_at)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_no_overlap') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
      EXCLUDE USING gist (tstzrange(starts_at, reserved_until, '[)') WITH &&)
      WHERE (status = 'confirmed');
  END IF;
END $$;

DROP TRIGGER IF EXISTS bookings_notify ON bookings;
CREATE TRIGGER bookings_notify AFTER INSERT OR UPDATE OR DELETE ON bookings FOR EACH ROW EXECUTE FUNCTION notify_change();
