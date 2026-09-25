/**
 * Board API tokens: a person or a tool gets a bearer token with exactly the
 * permissions its role grants, and nothing more.
 */

export const PERMISSIONS = [
  'tasks:read',
  'tasks:create',
  'tasks:update',
  'tasks:move',
  'tasks:delete',
  'clients:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type TokenRole = 'viewer' | 'contributor' | 'manager' | 'custom';

export const ROLE_PERMISSIONS: Record<Exclude<TokenRole, 'custom'>, Permission[]> = {
  viewer: ['tasks:read', 'clients:read'],
  contributor: ['tasks:read', 'clients:read', 'tasks:create', 'tasks:move'],
  manager: ['tasks:read', 'clients:read', 'tasks:create', 'tasks:move', 'tasks:update', 'tasks:delete'],
};

export function isPermission(p: string): p is Permission {
  return (PERMISSIONS as readonly string[]).includes(p);
}

/** The permission set stored with a token. Custom roles keep only known ones. */
export function permissionsFor(role: TokenRole, custom: string[] = []): Permission[] {
  if (role === 'custom') {
    const set = new Set(custom.filter(isPermission));
    if (set.size === 0) throw new Error('A custom token needs at least one permission');
    // Every write implies being able to read what you wrote.
    set.add('tasks:read');
    return PERMISSIONS.filter((p) => set.has(p));
  }
  return [...ROLE_PERMISSIONS[role]];
}

export function can(granted: readonly string[], needed: Permission): boolean {
  return granted.includes(needed);
}

/**
 * Token format: `cwk_<prefix>_<secret>`. The prefix is stored in clear to find
 * the row and to show in lists; the whole token is stored only as a SHA-256
 * hash. Base32-ish lowercase alphabet so it survives copy and paste anywhere.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function randomString(len: number, bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  return out;
}

export function formatToken(prefix: string, secret: string): string {
  return `cwk_${prefix}_${secret}`;
}

export function parseToken(raw: string | null | undefined): { prefix: string; token: string } | null {
  if (!raw) return null;
  const token = raw.replace(/^Bearer\s+/i, '').trim();
  const m = /^cwk_([a-z0-9]{8})_([a-z0-9]{32})$/.exec(token);
  if (!m) return null;
  return { prefix: m[1]!, token };
}

export type TokenState = 'active' | 'revoked' | 'expired';

export function tokenState(t: { revokedAt: Date | null; expiresAt: Date | null }, now = new Date()): TokenState {
  if (t.revokedAt) return 'revoked';
  if (t.expiresAt && t.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'active';
}

/** Which permission each token API route needs. One table, used by routes and docs. */
export const ROUTE_PERMISSIONS: { method: string; path: string; permission: Permission; summary: string }[] = [
  { method: 'GET', path: '/api/v1/tasks', permission: 'tasks:read', summary: 'List tasks (filter by status, client, side)' },
  { method: 'GET', path: '/api/v1/tasks/{id}', permission: 'tasks:read', summary: 'Read one task' },
  { method: 'POST', path: '/api/v1/tasks', permission: 'tasks:create', summary: 'Create a task in any column' },
  { method: 'PATCH', path: '/api/v1/tasks/{id}', permission: 'tasks:update', summary: 'Edit title, description, client, due date' },
  { method: 'POST', path: '/api/v1/tasks/{id}/move', permission: 'tasks:move', summary: 'Move a task to another column' },
  { method: 'DELETE', path: '/api/v1/tasks/{id}', permission: 'tasks:delete', summary: 'Delete a task' },
  { method: 'GET', path: '/api/v1/clients', permission: 'clients:read', summary: 'List clients and their side' },
];
