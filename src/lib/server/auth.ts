import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_TTL_SEC, signSession, verifySession, type SessionPayload } from '@/lib/session';
import { queryOne } from './db';

export { hashPassword, verifyPassword } from './password';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin';
  locale: 'en' | 'pt';
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

export async function currentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;
  return queryOne<CurrentUser>('SELECT id, name, email, role, locale FROM users WHERE id = $1', [session.uid]);
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

export async function startSession(user: { id: string; name: string; email: string }): Promise<void> {
  const token = await signSession({
    uid: user.id,
    name: user.name,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (process.env.PUBLIC_URL ?? '').startsWith('https://'),
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
