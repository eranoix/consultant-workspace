import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

/**
 * Coarse gate: pages under /app and the internal /api need a valid session
 * cookie. Route handlers still resolve the user themselves (a deleted user
 * keeps a valid cookie until it expires); this only keeps anonymous traffic
 * away from them. The token API (/api/v1), the public booking API, sign-in
 * and the health check authenticate on their own terms.
 */
const PUBLIC_API = [/^\/api\/v1\//, /^\/api\/public\//, /^\/api\/auth\//, /^\/api\/health$/];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_API.some((re) => re.test(pathname))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/app/:path*', '/api/:path*'],
};
