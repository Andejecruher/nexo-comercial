import { describe, expect, it } from 'vitest';
import {
  formatPhoneDisplay,
  telHref,
  toDigitsE164,
  toE164Phone,
  whatsappHref,
} from './phone-utils';

describe('phone-utils', () => {
  it('converts national and E.164 numbers without changing canonical semantics', () => {
    expect(toE164Phone('9991234567')).toBe('+529991234567');
    expect(toE164Phone('+529991234567')).toBe('+529991234567');
    expect(toDigitsE164('+52 999 123 4567')).toBe('529991234567');
  });

  it('returns empty canonical values for invalid numbers', () => {
    expect(toE164Phone('abc')).toBe('');
    expect(toE164Phone('')).toBe('');
    expect(toDigitsE164('abc')).toBe('');
  });

  it('keeps display formatting and invalid-value fallback behavior', () => {
    expect(formatPhoneDisplay('529991234567')).toBe('+52 999 123 4567');
    expect(formatPhoneDisplay('not-a-phone')).toBe('');
    expect(formatPhoneDisplay('')).toBe('');
  });

  it('keeps WhatsApp and telephone link semantics', () => {
    expect(whatsappHref('9991234567')).toBe('https://wa.me/529991234567');
    expect(whatsappHref('+529991234567')).toBe('https://wa.me/529991234567');
    expect(telHref('9991234567')).toBe('tel:+529991234567');
    expect(whatsappHref('')).toBe('#');
  });
});
