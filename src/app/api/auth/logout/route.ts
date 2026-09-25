import { endSession } from '@/lib/server/auth';
import { json } from '@/lib/server/http';

export async function POST() {
  await endSession();
  return json({ ok: true });
}
