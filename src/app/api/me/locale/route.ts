import { cookies } from 'next/headers';
import { z } from 'zod';
import { query } from '@/lib/server/db';
import { json, parseBody, withUser } from '@/lib/server/http';
import { LOCALE_COOKIE } from '@/i18n/server';

export const PUT = withUser(async (req, { user }) => {
  const { locale } = await parseBody(req, z.object({ locale: z.enum(['en', 'pt']) }));
  await query('UPDATE users SET locale = $2 WHERE id = $1', [user.id, locale]);
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return json({ ok: true });
});
