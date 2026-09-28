import { query } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    await query('SELECT 1');
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
