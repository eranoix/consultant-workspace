import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { credentialAad, CryptoError, fingerprint, keyringFromEnv, keyVersion, needsRotation, open, parseKey, seal, type Keyring } from '@/lib/server/crypto';

const k1 = randomBytes(32);
const k2 = randomBytes(32);
const ring = (current: Buffer, previous?: Buffer): Keyring => ({
  current: { version: keyVersion(current), key: current },
  previous: previous ? { version: keyVersion(previous), key: previous } : undefined,
});
const aad = credentialAad('user-1', 'google-calendar', 'Own practice');

describe('AES-256-GCM credential store', () => {
  it('round-trips and never stores the plaintext', () => {
    const s = seal('refresh-token-123', aad, ring(k1));
    expect(s.ciphertext.toString('utf8')).not.toContain('refresh-token-123');
    expect(s.iv).toHaveLength(12);
    expect(s.authTag).toHaveLength(16);
    expect(open(s, aad, ring(k1))).toBe('refresh-token-123');
  });

  it('uses a fresh IV every time', () => {
    const a = seal('same', aad, ring(k1));
    const b = seal('same', aad, ring(k1));
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('refuses a ciphertext moved to another person or account', () => {
    const s = seal('secret', aad, ring(k1));
    expect(() => open(s, credentialAad('user-2', 'google-calendar', 'Own practice'), ring(k1))).toThrow(CryptoError);
  });

  it('detects tampering', () => {
    const s = seal('secret', aad, ring(k1));
    s.ciphertext[0] = s.ciphertext[0]! ^ 0xff;
    expect(() => open(s, aad, ring(k1))).toThrow(/tampered/);
  });

  it('still opens rows sealed with the previous key during a rotation', () => {
    const old = seal('secret', aad, ring(k1));
    const rotated = ring(k2, k1);
    expect(needsRotation(old, rotated)).toBe(true);
    expect(open(old, aad, rotated)).toBe('secret');
    const resealed = seal('secret', aad, rotated);
    expect(needsRotation(resealed, rotated)).toBe(false);
  });

  it('fails clearly once the old key is gone', () => {
    const old = seal('secret', aad, ring(k1));
    expect(() => open(old, aad, ring(k2))).toThrow(/No key available/);
  });

  it('validates the key from the environment', () => {
    expect(() => parseKey(undefined, 'ENCRYPTION_KEY')).toThrow(/not set/);
    expect(() => parseKey(Buffer.alloc(16).toString('base64'), 'ENCRYPTION_KEY')).toThrow(/32 bytes/);
    const r = keyringFromEnv({ ENCRYPTION_KEY: k1.toString('base64'), ENCRYPTION_KEY_PREVIOUS: k2.toString('base64') } as unknown as NodeJS.ProcessEnv);
    expect(r.current.version).toBe(keyVersion(k1));
    expect(r.previous?.version).toBe(keyVersion(k2));
  });

  it('fingerprints without revealing the secret', () => {
    expect(fingerprint('abc')).toHaveLength(12);
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
  });
});
