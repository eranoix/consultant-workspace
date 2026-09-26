/**
 * Versioned, idempotent migrations.
 *
 *   npm run db:migrate            apply what is new
 *   npm run db:migrate -- --reset drop everything first (refused in production)
 *
 * Each file in db/migrations runs once, in its own transaction, in file-name
 * order, with its checksum recorded; a file changed after it was applied is an
 * error, not a silent skip.
 *
 * It also creates the application role named in DATABASE_URL: the app must
 * connect as a non-superuser for row level security to apply.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { loadEnv } from './env';

loadEnv();

const MIGRATIONS_DIR = path.resolve(process.env.MIGRATIONS_DIR ?? 'db/migrations');

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

export async function migrate(opts: { reset?: boolean; log?: (s: string) => void } = {}): Promise<void> {
  const log = opts.log ?? ((s: string) => console.log(s));
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL or DATABASE_URL must be set');

  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    if (opts.reset) {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_RESET !== '1') {
        throw new Error('refusing --reset with NODE_ENV=production (set ALLOW_DB_RESET=1 to force)');
      }
      log('reset: dropping schema public');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    }

    // Serialise concurrent runners (two containers starting at once).
    await client.query('SELECT pg_advisory_lock(727401)');

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

    const applied = new Map(
      (await client.query<{ version: string; checksum: string }>('SELECT version, checksum FROM schema_migrations'))
        .rows.map((r) => [r.version, r.checksum]),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    let ran = 0;
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const version = file.replace(/\.sql$/, '');
      const known = applied.get(version);
      if (known) {
        if (known !== checksum) {
          throw new Error(`${file} changed after it was applied; add a new migration instead of editing it`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [version, checksum]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${file}: ${(err as Error).message}`);
      }
      log(`applied ${file}`);
      ran += 1;
    }
    log(ran ? `migrations: ${ran} applied` : 'migrations: up to date');

    await ensureAppRole(client, adminUrl, log);
    await client.query('SELECT pg_advisory_unlock(727401)');
  } finally {
    await client.end();
  }
}

async function ensureAppRole(client: Client, adminUrl: string, log: (s: string) => void): Promise<void> {
  const appUrl = process.env.DATABASE_URL;
  if (!appUrl) return;
  const app = new URL(appUrl);
  const admin = new URL(adminUrl);
  const role = decodeURIComponent(app.username);
  if (!role || role === decodeURIComponent(admin.username)) return;

  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  const password = decodeURIComponent(app.password);
  // Password literals cannot be bound as parameters in DDL; format() quotes it.
  const pw = (await client.query<{ q: string }>('SELECT quote_literal($1) AS q', [password])).rows[0]!.q;
  if (!exists.rowCount) {
    await client.query(`CREATE ROLE ${quoteIdent(role)} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pw}`);
    log(`created role ${role}`);
  } else {
    await client.query(`ALTER ROLE ${quoteIdent(role)} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${pw}`);
  }
  const r = quoteIdent(role);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${r}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${r}`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${r}`);
  await client.query(`REVOKE ALL ON schema_migrations FROM ${r}`);
}

const isMain = process.argv[1] && /migrate\.(ts|mjs|js)$/.test(process.argv[1]);
if (isMain) {
  migrate({ reset: process.argv.includes('--reset') }).catch((err) => {
    console.error(`migrate failed: ${(err as Error).message}`);
    process.exit(1);
  });
}
