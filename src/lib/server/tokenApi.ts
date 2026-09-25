import { pool } from './db';
import { errorResponse } from './http';
import { authenticate, type TokenPrincipal } from './services/tokens';
import type { Permission } from '@/lib/domain/tokens';

type Ctx<P> = { params: Promise<P> };

/**
 * Wrapper for /api/v1: bearer token in, one permission checked, JSON out.
 * CORS is open on purpose: the token is the credential, not the origin, and
 * scripts and tools call this from anywhere.
 */
export function withToken<P = Record<string, string>>(
  permission: Permission,
  handler: (req: Request, ctx: { token: TokenPrincipal; params: P }) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    let res: Response;
    try {
      const token = await authenticate(pool(), req.headers.get('authorization'), permission);
      const params = ctx?.params ? await ctx.params : ({} as P);
      res = await handler(req, { token, params });
    } catch (err) {
      res = errorResponse(err);
    }
    res.headers.set('Access-Control-Allow-Origin', '*');
    return res;
  };
}

export function preflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    },
  });
}
