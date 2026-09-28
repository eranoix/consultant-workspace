import { randomBytes } from 'node:crypto';
import { asUser } from '../db';
import { HttpError } from '../errors';
import { credentialAad, fingerprint, keyringFromEnv, needsRotation, open, seal } from '../crypto';

export interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  scopes: string[];
  accounts: string[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Timeline sync and booking availability',
    scopes: ['calendar.events', 'calendar.freebusy'],
    accounts: ['Own practice', 'Partner firm'],
  },
  { id: 'mail', name: 'Mail (IMAP)', description: 'Email intake and notes sync', scopes: ['mail.read'], accounts: ['Inbox'] },
  { id: 'whatsapp', name: 'WhatsApp relay', description: 'Alert delivery to a phone', scopes: ['messages.send'], accounts: ['Alerts'] },
];

export interface CredentialView {
  id: string;
  provider: string;
  account_label: string;
  fingerprint: string;
  key_version: number;
  scopes: string[];
  status: string;
  access_expires_at: string | null;
  last_refreshed_at: string | null;
  last_error: string | null;
  created_at: string;
  needs_rotation: boolean;
}

export async function listCredentials(userId: string): Promise<CredentialView[]> {
  const ring = keyringFromEnv();
  return asUser(userId, async (db) => {
    const { rows } = await db.query<Omit<CredentialView, 'needs_rotation'>>(
      `SELECT id, provider, account_label, fingerprint, key_version, scopes, status, access_expires_at, last_refreshed_at, last_error, created_at
         FROM integration_credentials ORDER BY provider, account_label`,
    );
    return rows.map((r) => ({ ...r, needs_rotation: needsRotation({ keyVersion: r.key_version }, ring) }));
  });
}

export async function connect(userId: string, providerId: string, account: string) {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider || !provider.accounts.includes(account)) throw new HttpError(400, 'Unknown provider or account');
  const refreshToken = `mock-refresh-${randomBytes(24).toString('base64url')}`;
  const ring = keyringFromEnv();
  const sealed = seal(refreshToken, credentialAad(userId, providerId, account), ring);
  await asUser(userId, (db) =>
    db.query(
      `INSERT INTO integration_credentials (user_id, provider, account_label, ciphertext, iv, auth_tag, key_version, fingerprint, scopes, status, access_expires_at, last_refreshed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'connected', now() + interval '1 hour', now())
       ON CONFLICT (user_id, provider, account_label) DO UPDATE SET
         ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, auth_tag = EXCLUDED.auth_tag, key_version = EXCLUDED.key_version,
         fingerprint = EXCLUDED.fingerprint, scopes = EXCLUDED.scopes, status = 'connected', last_error = NULL,
         access_expires_at = EXCLUDED.access_expires_at, last_refreshed_at = now()`,
      [userId, providerId, account, sealed.ciphertext, sealed.iv, sealed.authTag, sealed.keyVersion, fingerprint(refreshToken), provider.scopes],
    ),
  );
}

export async function refresh(userId: string, id: string) {
  const ring = keyringFromEnv();
  return asUser(userId, async (db) => {
    const { rows } = await db.query<{ provider: string; account_label: string; ciphertext: Buffer; iv: Buffer; auth_tag: Buffer; key_version: number }>(
      'SELECT provider, account_label, ciphertext, iv, auth_tag, key_version FROM integration_credentials WHERE id = $1',
      [id],
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, 'Connection not found');
    const aad = credentialAad(userId, row.provider, row.account_label);
    let token: string;
    try {
      token = open({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag, keyVersion: row.key_version }, aad, ring);
    } catch (e) {
      await db.query("UPDATE integration_credentials SET status = 'error', last_error = $2 WHERE id = $1", [id, (e as Error).message]);
      return { ok: false, error: (e as Error).message };
    }
    const rotated = needsRotation({ keyVersion: row.key_version }, ring);
    if (rotated) {
      const s = seal(token, aad, ring);
      await db.query('UPDATE integration_credentials SET ciphertext = $2, iv = $3, auth_tag = $4, key_version = $5 WHERE id = $1', [
        id,
        s.ciphertext,
        s.iv,
        s.authTag,
        s.keyVersion,
      ]);
    }
    await db.query(
      "UPDATE integration_credentials SET status = 'connected', last_error = NULL, last_refreshed_at = now(), access_expires_at = now() + interval '1 hour' WHERE id = $1",
      [id],
    );
    return { ok: true, rotated, fingerprint: fingerprint(token) };
  });
}

export async function disconnect(userId: string, id: string) {
  await asUser(userId, (db) => db.query('DELETE FROM integration_credentials WHERE id = $1', [id]));
}

export async function probe(providerId: string): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const latency = { 'google-calendar': 450, mail: 900, whatsapp: 1300 }[providerId] ?? 300;
  await new Promise((r) => setTimeout(r, latency));
  const detail =
    providerId === 'mail'
      ? `Mail provider: ${process.env.MAIL_PROVIDER || 'mock'}`
      : providerId === 'google-calendar'
        ? `Calendar provider: ${process.env.CALENDAR_PROVIDER || 'mock'}`
        : process.env.NOTIFY_WHATSAPP_WEBHOOK
          ? 'Relay webhook configured'
          : 'No relay configured: alerts fall back to the outbox';
  return { ok: true, latencyMs: latency, detail };
}
