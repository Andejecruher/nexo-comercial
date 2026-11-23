/**
 * Unit tests: phone normalizer
 */
import { describe, expect, it } from '@jest/globals';
import {
  formatPhoneForMeta,
  isMexicanNumber,
  normalizePhone,
  normalizePhoneForStorage,
} from '../../utils/phone-normalizer';

describe('normalizePhoneForStorage — formato canónico DB (solo dígitos, sin +)', () => {
  it('quita el + y el prefijo 521 de Meta (13 dígitos) al canónico 52', () => {
    expect(normalizePhoneForStorage('+5219612345678')).toBe('529612345678');
  });

  it('formato Meta sin + (13 dígitos, 521…) se lleva al canónico 5296…', () => {
    expect(normalizePhoneForStorage('5219612345678')).toBe('529612345678');
  });

  it('el canónico 52… (12 dígitos) no se altera', () => {
    expect(normalizePhoneForStorage('529612345678')).toBe('529612345678');
  });

  it('quita espacios, guiones y paréntesis', () => {
    expect(normalizePhoneForStorage('+52 961 234 5678')).toBe('529612345678');
  });

  it('+52... y 52... mismo número producen el mismo resultado', () => {
    expect(normalizePhoneForStorage('+521234567890')).toBe(
      normalizePhoneForStorage('521234567890'),
    );
  });
});

describe('normalizePhone — E.164 con + para uso outbound/display', () => {
  it('debe agregar + si no lo tiene (formato Meta sin +)', () => {
    expect(normalizePhone('5219612345678')).toBe('+5219612345678');
  });

  it('no debe duplicar + si ya lo tiene', () => {
    expect(normalizePhone('+5219612345678')).toBe('+5219612345678');
  });

  it('debe limpiar espacios', () => {
    expect(normalizePhone('521 961 234 5678')).toBe('+5219612345678');
  });
});

describe('isMexicanNumber', () => {
  it('número mexicano sin + → true', () => {
    expect(isMexicanNumber('5219612345678')).toBe(true);
  });

  it('número mexicano con + → true', () => {
    expect(isMexicanNumber('+5219612345678')).toBe(true);
  });

  it('número USA → false', () => {
    expect(isMexicanNumber('15551234567')).toBe(false);
  });
});

describe('formatPhoneForMeta — DB (52, 12 dígitos) → Meta (521, 13 dígitos)', () => {
  it('52 + 10 dígitos → 521 + 10 dígitos', () => {
    expect(formatPhoneForMeta('529612345678')).toBe('5219612345678');
  });

  it('ya en formato 521 (13 dígitos) no se altera', () => {
    expect(formatPhoneForMeta('5219612345678')).toBe('5219612345678');
  });

  it('con + y espacios se normaliza a 521 sin +', () => {
    expect(formatPhoneForMeta('+52 961 234 5678')).toBe('5219612345678');
  });

  it('+521 (13 dígitos) se lleva a 521 sin +', () => {
    expect(formatPhoneForMeta('+5219612345678')).toBe('5219612345678');
  });

  it('10 dígitos sin 52 se asumen mexicanos y se prefijan con 521', () => {
    expect(formatPhoneForMeta('3223188252')).toBe('5213223188252');
  });

  it('10 dígitos con espacios o guiones se limpian y se prefijan con 521', () => {
    expect(formatPhoneForMeta('322 318-8252')).toBe('5213223188252');
  });

  it('número de otro país no se altera', () => {
    expect(formatPhoneForMeta('34600123456')).toBe('34600123456');
  });

  it('es idempotente al aplicarse repetidamente', () => {
    const once = formatPhoneForMeta('529612345678');
    expect(formatPhoneForMeta(once)).toBe(once);
  });

  it('conserva vacíos e inválidos según el contrato actual', () => {
    expect(formatPhoneForMeta('')).toBe('');
    expect(formatPhoneForMeta('teléfono inválido')).toBe('teléfono inválido');
  });
});

describe('Escenario de duplicados — +52 vs 52 deben unificarse', () => {
  it('normalizePhoneForStorage("+521234567890") === normalizePhoneForStorage("521234567890")', () => {
    const a = normalizePhoneForStorage('+521234567890');
    const b = normalizePhoneForStorage('521234567890');
    expect(a).toBe(b);
    expect(a).toBe('521234567890');
  });
});
