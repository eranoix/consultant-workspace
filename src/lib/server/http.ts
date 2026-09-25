import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { currentUser, type CurrentUser } from './auth';

import { HttpError } from './errors';

export { HttpError };

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'Invalid request', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 },
    );
  }
  // Postgres constraint violations are the client's problem, not a crash.
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === '23505') return NextResponse.json({ error: 'Already exists' }, { status: 409 });
  if (pgCode === '23P01') return NextResponse.json({ error: 'That time is no longer available' }, { status: 409 });
  if (pgCode === '23503' || pgCode === '23514' || pgCode === '22P02') {
    return NextResponse.json({ error: 'Invalid reference or value' }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, 'Body must be JSON');
  }
  return schema.parse(raw);
}

type Ctx<P> = { params: Promise<P> };

/**
 * Route handler wrapper for the signed-in app API: resolves the user (401
 * otherwise), awaits the params, and turns thrown errors into JSON.
 */
export function withUser<P = Record<string, string>>(
  handler: (req: Request, ctx: { user: CurrentUser; params: P }) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      const user = await currentUser();
      if (!user) throw new HttpError(401, 'Sign in required');
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await handler(req, { user, params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
