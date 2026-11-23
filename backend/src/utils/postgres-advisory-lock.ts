/**
 * Deterministic lock id for PostgreSQL `pg_advisory_xact_lock`.
 *
 * PostgreSQL `bigint` (int8) is signed, so the 64-bit value derived from a
 * hex fingerprint must be interpreted as two's complement. The first 16 hex
 * chars of the fingerprint (8 bytes) are treated as unsigned by the HMAC,
 * then mapped to the signed range using `BigInt.asIntN(64, ...)`.
 */
const FINGERPRINT_HEX_LEN = 16;
const HEX_PREFIX = '0x';

export function advisoryLockIdFromFingerprint(fingerprint: string | null | undefined): bigint {
  if (!fingerprint || fingerprint.length < FINGERPRINT_HEX_LEN) {
    throw new Error('Fingerprint must be at least 16 hex characters');
  }

  const prefix = fingerprint.slice(0, FINGERPRINT_HEX_LEN);
  if (!/^[0-9a-fA-F]+$/.test(prefix)) {
    throw new Error('Fingerprint prefix must be hexadecimal');
  }

  return BigInt.asIntN(64, BigInt(`${HEX_PREFIX}${prefix}`));
}
