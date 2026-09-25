import { cookies } from 'next/headers';
import { z } from 'zod';
import { LOCALE_COOKIE } from '@/i18n/server';
import { queryOne } from '@/lib/server/db';
import { startSession, verifyPassword } from '@/lib/server/auth';
import { errorResponse, HttpError, json, parseBody } from '@/lib/server/http';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const { email, password } = await parseBody(req, Body);
    const user = await queryOne<{ id: string; name: string; email: string; password_hash: string; locale: string }>(
      'SELECT id, name, email, password_hash, locale FROM users WHERE lower(email) = lower($1)',
      [email],
    );
    // Same answer and similar work for an unknown email and a wrong password.
    const ok = user ? await verifyPassword(password, user.password_hash) : await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    if (!user || !ok) throw new HttpError(401, 'Wrong email or password');
    await startSession(user);
    (await cookies()).set(LOCALE_COOKIE, user.locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
