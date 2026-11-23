import { describe, expect, it } from '@jest/globals';
import { advisoryLockIdFromFingerprint } from '../../utils/postgres-advisory-lock';

describe('advisoryLockIdFromFingerprint', () => {
  it('maps the reported problematic fingerprint to a signed bigint', () => {
    const fingerprint = '80d6f7a2d91b7c92'; // first 16 hex chars of the reported value
    const lockId = advisoryLockIdFromFingerprint(fingerprint);
    expect(typeof lockId).toBe('bigint');
    expect(lockId).toBeLessThanOrEqual(2n ** 63n - 1n);
    expect(lockId).toBeGreaterThanOrEqual(-(2n ** 63n));
  });

  it('accepts the full 32-char fingerprint and uses only the first 16 hex chars', () => {
    const full = '80d6f7a2d91b7c92aabbccddeeff0011';
    const lockId = advisoryLockIdFromFingerprint(full);
    expect(lockId).toBe(advisoryLockIdFromFingerprint('80d6f7a2d91b7c92'));
  });

  it('preserves values below the signed int8 max unchanged', () => {
    const fingerprint = '0000000000000001';
    expect(advisoryLockIdFromFingerprint(fingerprint)).toBe(1n);
  });

  it('maps the largest unsigned int64 value to -1', () => {
    const fingerprint = 'ffffffffffffffff';
    expect(advisoryLockIdFromFingerprint(fingerprint)).toBe(-1n);
  });

  it('maps the signed int8 boundary correctly', () => {
    // 0x7fffffffffffffff -> max signed int64
    expect(advisoryLockIdFromFingerprint('7fffffffffffffff')).toBe(2n ** 63n - 1n);
    // 0x8000000000000000 -> min signed int64
    expect(advisoryLockIdFromFingerprint('8000000000000000')).toBe(-(2n ** 63n));
  });

  it('throws for null or undefined fingerprints', () => {
    expect(() => advisoryLockIdFromFingerprint(null)).toThrow();
    expect(() => advisoryLockIdFromFingerprint(undefined)).toThrow();
  });

  it('throws for short or non-hex fingerprints', () => {
    expect(() => advisoryLockIdFromFingerprint('123')).toThrow();
    expect(() => advisoryLockIdFromFingerprint('gggggggggggggggg')).toThrow();
  });
});
