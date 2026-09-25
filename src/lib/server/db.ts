import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * One pool per process. Next's dev server re-evaluates modules on every edit,
 * so the pool lives on globalThis: otherwise each hot reload would open a new
 * pool and the old one would keep its connections until Postgres ran out.
 */
const globalForDb = globalThis as unknown as { __cwPool?: Pool };

export function pool(): Pool {
  if (!globalForDb.__cwPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    globalForDb.__cwPool = new Pool({ connectionString, max: 10 });
  }
  return globalForDb.__cwPool;
}

export type Db = Pick<PoolClient, 'query'>;

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool().query<T>(sql, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Run `fn` in one transaction; any throw rolls the whole thing back. */
export async function tx<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * A transaction that row level security sees as `userId`. Only the tables
 * with per-person rows (preferences, integration credentials) have policies;
 * `set_config(..., true)` scopes the setting to this transaction, so a pooled
 * connection can never carry one person's identity into the next request.
 */
export async function asUser<T>(userId: string, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  return tx(async (db) => {
    await db.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    return fn(db);
  });
}
