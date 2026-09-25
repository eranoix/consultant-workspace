import type { Db } from './db';
import { pool } from './db';

export interface WorkspaceSettings {
  profile: { name: string; practice: string; email: string; ownDomains: string[]; timeZone: string };
  partner: { name: string; shortName: string; domains: string[] };
  workday: { start: string; end: string };
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  profile: {
    name: 'Maya Okafor',
    practice: 'Lumen Advisory',
    email: 'maya@lumen.example.com',
    ownDomains: ['lumen.example.com'],
    timeZone: 'America/New_York',
  },
  partner: { name: 'Harbor & Vale Consulting', shortName: 'Harbor & Vale', domains: ['harborvale.example.com'] },
  workday: { start: '08:00', end: '18:00' },
};

export async function getSettings(db: Db = pool()): Promise<WorkspaceSettings> {
  const { rows } = await db.query<{ key: string; value: unknown }>(
    "SELECT key, value FROM workspace_settings WHERE key IN ('profile', 'partner', 'workday')",
  );
  const out = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
  for (const r of rows) out[r.key] = { ...out[r.key], ...(r.value as Record<string, unknown>) };
  return out as unknown as WorkspaceSettings;
}

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const { rows } = await db.query<{ value: T }>('SELECT value FROM workspace_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? fallback;
}

export async function putSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.query(
    `INSERT INTO workspace_settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
