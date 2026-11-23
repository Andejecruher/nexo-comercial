import crypto from 'crypto';
import { env } from '../config/env.config';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function tryDecode(raw: string, enc: 'base64' | 'hex'): Buffer | null {
  try {
    const b = Buffer.from(raw, enc);
    return b.length === 32 ? b : null;
  } catch {
    return null;
  }
}

function getKey(): Buffer {
  const rawEnc = env.ENCRYPTION_KEY;
  if (rawEnc) {
    const b64 = tryDecode(rawEnc, 'base64');
    if (b64) return b64;
    const hex = tryDecode(rawEnc, 'hex');
    if (hex) return hex;
    throw new Error('ENCRYPTION_KEY is present but invalid — must be 32 bytes (base64 or hex)');
  }

  const raw = env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var missing');

  const b64 = tryDecode(raw, 'base64');
  if (b64) return b64;
  const hex = tryDecode(raw, 'hex');
  if (hex) return hex;

  // Fallback: derive 32 bytes from ENCRYPTION_KEY (sha256) — backwards compatible
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encrypt(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('Invalid encrypted payload');
  const iv = buf.slice(0, IV_LEN);
  const tag = buf.slice(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.slice(IV_LEN + TAG_LEN);
  const dec = crypto.createDecipheriv(ALGO, key, iv);
  dec.setAuthTag(tag);
  const plain = Buffer.concat([dec.update(ct), dec.final()]);
  return plain.toString('utf8');
}

export function reveal<T>(payload: string | null | undefined): T | undefined {
  if (!payload) return undefined;
  return JSON.parse(decrypt(payload)) as T;
}
