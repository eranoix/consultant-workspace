/**
 * Signed session cookie, verifiable in the edge middleware and in Node alike.
 *
 * Web Crypto only (no node:crypto), because the middleware runs on the edge
 * runtime. The cookie is `base64url(payload).base64url(hmac)`, HttpOnly and
 * SameSite=Lax; nothing in it is secret, it only has to be unforgeable.
 */

export const SESSION_COOKIE = 'cw_session';
export const SESSION_TTL_SEC = 60 * 60 * 12;

export interface SessionPayload {
  uid: string;
  name: string;
  email: string;
  exp: number;
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production' && !process.env.CI) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return 'development-only-session-secret-not-for-production';
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signSession(payload: SessionPayload, secret = sessionSecret()): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(
  token: string | undefined,
  secret = sessionSecret(),
  now = Date.now(),
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  let ok = false;
  try {
    // verify() compares in constant time.
    ok = await crypto.subtle.verify('HMAC', await key(secret), fromB64url(sig) as BufferSource, enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}
