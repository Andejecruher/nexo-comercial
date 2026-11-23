import crypto from 'crypto';
import { env } from '../config/env.config';

/**
 * HMAC key used for deterministic, non-reversible fingerprints of PII.
 * We derive a fixed 32-byte key from ENCRYPTION_KEY when HMAC_INDEX_KEY is
 * not provided, so existing environments do not require a new secret. In
 * production it is recommended to set HMAC_INDEX_KEY explicitly and rotate
 * it independently of the encryption key.
 */
function getHmacKey(): string {
  if (env.HMAC_INDEX_KEY) return env.HMAC_INDEX_KEY;
  return crypto
    .createHmac('sha256', 'voz-ciudadana-index-key')
    .update(env.ENCRYPTION_KEY)
    .digest('hex');
}

let cachedKey: string | undefined;
function hmacKey(): string {
  cachedKey ??= getHmacKey();
  return cachedKey;
}

/**
 * Normaliza un valor para indexación:
 * - mayúsculas
 * - sin espacios
 * - sin acentos (NFD)
 * El valor normalizado es lo que se hashea, no se almacena en texto plano.
 */
function indexable(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .trim();
}

/**
 * Produce un fingerprint HMAC-SHA256 truncado a 32 hex chars. Es determinista
 * (mismo valor + misma llave => mismo fingerprint) y no reversible sin la llave.
 */
export function fingerprint(value: string | null | undefined): string | null {
  const normalized = indexable(value);
  if (!normalized) return null;
  return crypto.createHmac('sha256', hmacKey()).update(normalized).digest('hex').slice(0, 32);
}

/**
 * Blind index HMAC-SHA256 (hex completo) de un valor que se guarda cifrado.
 * Permite filtrar en SQL por igualdad sin descifrar ni exponer el valor.
 * Normaliza con trim + mayúsculas para que el mismo dato produzca el mismo hash.
 */
export function generateBlindIndex(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? '';
  if (!normalized) return null;
  return crypto.createHmac('sha256', hmacKey()).update(normalized).digest('hex');
}

/**
 * Tokens de búsqueda por nombre: produce un arreglo de tokens normalizados y
 * hasheados para búsquedas parciales sin exponer el nombre en texto plano.
 */
export function nameSearchTokens(fullName: string | null | undefined): string[] {
  if (!fullName) return [];
  const key = hmacKey();
  const tokens = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  const result = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j <= tokens.length; j += 1) {
      const phrase = tokens.slice(i, j).join('');
      if (!phrase) continue;
      result.add(crypto.createHmac('sha256', key).update(phrase).digest('hex').slice(0, 32));
    }
  }
  return Array.from(result);
}

/**
 * Normaliza un número telefónico al canónico de DB: dígitos E.164 sin "+".
 * Ej: "529611234567" (prefijo país + número nacional, sin "+").
 *
 * Compat-read con legado:
 *   - 10 dígitos (nacional MX) → se antepone "52"
 *   - 11 dígitos iniciando con "1" (marcado mexicano 1 + 10) → "52" + resto
 *   - 12 dígitos iniciando con "52" → tal cual (ya canónico)
 *   - "+52…" / E.164 con "+" → se elimina el "+"
 *
 * Devuelve null si el valor no es un número reconocible.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `52${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('52')) return digits;
  return null;
}
