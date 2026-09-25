import { describe, expect, it } from 'vitest';
import { can, formatToken, parseToken, permissionsFor, ROLE_PERMISSIONS, ROUTE_PERMISSIONS, tokenState } from '@/lib/domain/tokens';

describe('token permissions', () => {
  it('gives each role a strictly growing set', () => {
    const v = new Set(ROLE_PERMISSIONS.viewer);
    const c = new Set(ROLE_PERMISSIONS.contributor);
    const m = new Set(ROLE_PERMISSIONS.manager);
    for (const p of v) expect(c.has(p)).toBe(true);
    for (const p of c) expect(m.has(p)).toBe(true);
    expect(c.size).toBeGreaterThan(v.size);
    expect(m.size).toBeGreaterThan(c.size);
  });

  it('lets a viewer read but not create, and a contributor create and move but not delete', () => {
    expect(can(ROLE_PERMISSIONS.viewer, 'tasks:read')).toBe(true);
    expect(can(ROLE_PERMISSIONS.viewer, 'tasks:create')).toBe(false);
    expect(can(ROLE_PERMISSIONS.contributor, 'tasks:move')).toBe(true);
    expect(can(ROLE_PERMISSIONS.contributor, 'tasks:delete')).toBe(false);
    expect(can(ROLE_PERMISSIONS.manager, 'tasks:delete')).toBe(true);
  });

  it('keeps only known permissions on a custom token, and adds read', () => {
    expect(permissionsFor('custom', ['tasks:move', 'root:everything'])).toEqual(['tasks:read', 'tasks:move']);
    expect(() => permissionsFor('custom', ['nope'])).toThrow();
  });

  it('maps every token API route to a permission a role can hold', () => {
    const all = new Set(ROLE_PERMISSIONS.manager);
    for (const r of ROUTE_PERMISSIONS) expect(all.has(r.permission)).toBe(true);
  });
});

describe('token format and state', () => {
  it('round-trips and rejects malformed tokens', () => {
    const t = formatToken('abcd2345', 'a'.repeat(32));
    expect(parseToken(`Bearer ${t}`)).toEqual({ prefix: 'abcd2345', token: t });
    expect(parseToken('Bearer cwk_short_x')).toBeNull();
    expect(parseToken(null)).toBeNull();
  });

  it('reports revoked before expired', () => {
    const past = new Date(Date.now() - 1000);
    expect(tokenState({ revokedAt: past, expiresAt: past })).toBe('revoked');
    expect(tokenState({ revokedAt: null, expiresAt: past })).toBe('expired');
    expect(tokenState({ revokedAt: null, expiresAt: null })).toBe('active');
  });
});
