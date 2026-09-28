CREATE TABLE IF NOT EXISTS integration_credentials (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          text NOT NULL,
  account_label     text NOT NULL,
  ciphertext        bytea NOT NULL,
  iv                bytea NOT NULL,
  auth_tag          bytea NOT NULL,
  key_version       int NOT NULL,
  fingerprint       text NOT NULL,
  scopes            text[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error', 'revoked')),
  access_expires_at timestamptz,
  last_refreshed_at timestamptz,
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, account_label)
);

ALTER TABLE integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_credentials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_credentials_own ON integration_credentials;
CREATE POLICY integration_credentials_own ON integration_credentials
  USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

DROP TRIGGER IF EXISTS integration_credentials_touch ON integration_credentials;
CREATE TRIGGER integration_credentials_touch BEFORE UPDATE ON integration_credentials FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
