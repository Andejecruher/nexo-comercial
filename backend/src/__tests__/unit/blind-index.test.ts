import { describe, expect, it } from '@jest/globals';
import { sexBlindIndex } from '../../services/ine/promovido-validations';
import { generateBlindIndex } from '../../utils/hmac-index';

describe('generateBlindIndex', () => {
  it('is deterministic for the same value', () => {
    expect(generateBlindIndex('H')).toBe(generateBlindIndex('H'));
  });

  it('produces a full hex sha256 digest', () => {
    expect(generateBlindIndex('H')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizes whitespace and casing', () => {
    expect(generateBlindIndex('  h  ')).toBe(generateBlindIndex('H'));
  });

  it('distinguishes different values', () => {
    expect(generateBlindIndex('H')).not.toBe(generateBlindIndex('M'));
  });

  it('returns null for empty or missing values', () => {
    expect(generateBlindIndex('')).toBeNull();
    expect(generateBlindIndex('   ')).toBeNull();
    expect(generateBlindIndex(null)).toBeNull();
    expect(generateBlindIndex(undefined)).toBeNull();
  });
});

describe('sexBlindIndex', () => {
  it('collapses every spelling of a sex into the canonical hash', () => {
    const expected = generateBlindIndex('H');
    expect(sexBlindIndex('H')).toBe(expected);
    expect(sexBlindIndex('h')).toBe(expected);
    expect(sexBlindIndex('Hombre')).toBe(expected);
    expect(sexBlindIndex('MASCULINO')).toBe(expected);
  });

  it('keeps male and female hashes apart', () => {
    expect(sexBlindIndex('H')).not.toBe(sexBlindIndex('M'));
    expect(sexBlindIndex('FEMENINO')).toBe(sexBlindIndex('M'));
  });

  it('returns null when the sex is unknown or absent', () => {
    expect(sexBlindIndex('X')).toBeNull();
    expect(sexBlindIndex(undefined)).toBeNull();
  });
});
