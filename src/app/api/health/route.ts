import { query } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

/** Liveness plus a database round trip; used by the compose healthcheck. */
export async function GET(): Promise<Response> {
  try {
    await query('SELECT 1');
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
