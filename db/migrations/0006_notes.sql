CREATE TABLE IF NOT EXISTS note_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  uuid REFERENCES note_folders(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  position   double precision NOT NULL DEFAULT 0,
  mail_path  text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id    uuid REFERENCES note_folders(id) ON DELETE SET NULL,
  title        text NOT NULL DEFAULT '',
  content      jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}',
  content_text text NOT NULL DEFAULT '',
  origin       text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual', 'mail')),
  external_id  text UNIQUE,
  pinned       boolean NOT NULL DEFAULT false,
  missing_upstream_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_folder_idx ON notes (folder_id, updated_at DESC);

DROP TRIGGER IF EXISTS notes_touch ON notes;
CREATE TRIGGER notes_touch BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
