import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface Sealed {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export interface Keyring {
  current: { version: number; key: Buffer };
  previous?: { version: number; key: Buffer };
}

export class CryptoError extends Error {}

export function parseKey(b64: string | undefined, name: string): Buffer {
  if (!b64) throw new CryptoError(`${name} is not set`);
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new CryptoError(`${name} must be 32 bytes, base64 encoded (got ${key.length})`);
  return key;
}

export function keyringFromEnv(env: NodeJS.ProcessEnv = process.env): Keyring {
  const current = parseKey(env.ENCRYPTION_KEY, 'ENCRYPTION_KEY');
  const ring: Keyring = { current: { version: keyVersion(current), key: current } };
  if (env.ENCRYPTION_KEY_PREVIOUS) {
    const prev = parseKey(env.ENCRYPTION_KEY_PREVIOUS, 'ENCRYPTION_KEY_PREVIOUS');
    ring.previous = { version: keyVersion(prev), key: prev };
  }
  return ring;
}

export function keyVersion(key: Buffer): number {
  return createHash('sha256').update(key).digest().readUInt32BE(0) & 0x7fffffff;
}

export function seal(plaintext: string, aad: string, ring: Keyring): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ring.current.key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: ring.current.version };
}

export function open(sealed: Sealed, aad: string, ring: Keyring): string {
  const entry =
    sealed.keyVersion === ring.current.version
      ? ring.current
      : sealed.keyVersion === ring.previous?.version
        ? ring.previous
        : null;
  if (!entry) throw new CryptoError('No key available for this ciphertext (was the key rotated twice?)');
  try {
    const decipher = createDecipheriv('aes-256-gcm', entry.key, sealed.iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(sealed.authTag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new CryptoError('Decryption failed: wrong key, wrong row, or tampered data');
  }
}

export function needsRotation(sealed: Pick<Sealed, 'keyVersion'>, ring: Keyring): boolean {
  return sealed.keyVersion !== ring.current.version;
}

export function fingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 12);
}

export function credentialAad(userId: string, provider: string, account: string): string {
  return `integration:${userId}:${provider}:${account}`;
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
