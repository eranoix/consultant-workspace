import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db';
import { HttpError } from '../errors';
import { sha256Hex } from '../crypto';
import { can, formatToken, parseToken, permissionsFor, randomString, tokenState, type Permission, type TokenRole } from '@/lib/domain/tokens';

export interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  role: TokenRole;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by_name: string | null;
}

export async function listTokens(db: Db): Promise<(TokenRow & { state: string })[]> {
  const { rows } = await db.query<TokenRow & { expires_at: Date | null; revoked_at: Date | null }>(
    `SELECT t.id, t.name, t.prefix, t.role, t.permissions, t.created_at, t.last_used_at, t.expires_at, t.revoked_at, u.name AS created_by_name
       FROM api_tokens t LEFT JOIN users u ON u.id = t.created_by ORDER BY t.revoked_at NULLS FIRST, t.created_at DESC`,
  );
  return rows.map((r) => ({
    ...r,
    state: tokenState({ revokedAt: r.revoked_at ? new Date(r.revoked_at) : null, expiresAt: r.expires_at ? new Date(r.expires_at) : null }),
  }));
}

export async function createToken(
  db: Db,
  input: { name: string; role: TokenRole; permissions?: string[]; expiresInDays?: number | null },
  userId: string,
): Promise<{ token: string; id: string; prefix: string }> {
  let permissions: Permission[];
  try {
    permissions = permissionsFor(input.role, input.permissions);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const prefix = randomString(8, randomBytes(8));
  const secret = randomString(32, randomBytes(32));
  const token = formatToken(prefix, secret);
  const expires = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO api_tokens (name, prefix, token_hash, role, permissions, created_by, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.name, prefix, sha256Hex(token), input.role, permissions, userId, expires],
  );
  return { token, id: rows[0]!.id, prefix };
}

export async function revokeToken(db: Db, id: string): Promise<void> {
  await db.query('UPDATE api_tokens SET revoked_at = coalesce(revoked_at, now()) WHERE id = $1', [id]);
}

export interface TokenPrincipal {
  id: string;
  name: string;
  permissions: string[];
}

export async function authenticate(db: Db, header: string | null, needed: Permission): Promise<TokenPrincipal> {
  const parsed = parseToken(header);
  if (!parsed) throw new HttpError(401, 'Missing or malformed bearer token', 'unauthenticated');
  const { rows } = await db.query<{ id: string; name: string; token_hash: string; permissions: string[]; revoked_at: Date | null; expires_at: Date | null }>(
    'SELECT id, name, token_hash, permissions, revoked_at, expires_at FROM api_tokens WHERE prefix = $1',
    [parsed.prefix],
  );
  const row = rows[0];
  const hash = Buffer.from(sha256Hex(parsed.token), 'hex');
  if (!row || !timingSafeEqual(hash, Buffer.from(row.token_hash, 'hex'))) {
    throw new HttpError(401, 'Invalid token', 'unauthenticated');
  }
  const state = tokenState({ revokedAt: row.revoked_at, expiresAt: row.expires_at });
  if (state !== 'active') throw new HttpError(401, `Token ${state}`, 'unauthenticated');
  if (!can(row.permissions, needed)) throw new HttpError(403, `This token lacks the ${needed} permission`, 'forbidden');
  await db.query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [row.id]);
  return { id: row.id, name: row.name, permissions: row.permissions };
}
