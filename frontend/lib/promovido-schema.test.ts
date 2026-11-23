import { describe, expect, it } from 'vitest';
import { normalizeBirthDate, promovidoSchema, toE164Phone } from './promovido-schema';

const validBase = {
  firstName: 'ARLY DAYANARA',
  paternalLastName: 'LAM',
  curp: 'LARA961120MCSMQR01',
  voterKey: 'LMRQAR96112007M700',
  neighborhoodId: '33333333-3333-3333-3333-333333333333',
  sectionId: '11111111-1111-1111-1111-111111111111',
  leaderId: '22222222-2222-2222-2222-222222222222',
};

describe('promovidoSchema', () => {
  it('accepts a voter key with a vowel in the prefix (real OCR value)', () => {
    const result = promovidoSchema.safeParse({
      ...validBase,
      voterKey: 'LMRQAR96112007M700',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a voter key with invalid characters', () => {
    const result = promovidoSchema.safeParse({
      ...validBase,
      voterKey: 'LMRQAR-96112007M700',
    });
    expect(result.success).toBe(false);
  });

  it('requires a catalog neighborhood selection', () => {
    const withoutNeighborhood: Omit<typeof validBase, 'neighborhoodId'> = {
      firstName: validBase.firstName,
      paternalLastName: validBase.paternalLastName,
      curp: validBase.curp,
      voterKey: validBase.voterKey,
      sectionId: validBase.sectionId,
      leaderId: validBase.leaderId,
    };
    const result = promovidoSchema.safeParse(withoutNeighborhood);
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ['neighborhoodId'],
        message: 'Seleccioná una colonia del catálogo.',
      }),
    );
  });

  it('matches CURP date segment with ISO birth date in a UTC-negative timezone', () => {
    const result = promovidoSchema.safeParse({
      ...validBase,
      birthDate: '1996-11-20',
    });
    expect(result.success).toBe(true);
  });

  it('normalizes OCR birth date format DD/MM/YYYY before validating against CURP', () => {
    const result = promovidoSchema.safeParse({
      ...validBase,
      birthDate: '20/11/1996',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an E.164 Mexican phone number', () => {
    const result = promovidoSchema.safeParse({
      ...validBase,
      phone: '+529991234567',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an omitted phone', () => {
    const result = promovidoSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('rejects an invalid phone', () => {
    const result = promovidoSchema.safeParse({
      ...validBase,
      phone: 'not-a-phone',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toContainEqual(
      expect.objectContaining({
        path: ['phone'],
        message: 'Ingresá un teléfono válido.',
      }),
    );
  });

  it('still rejects a mismatched CURP/birthDate', () => {
    const result = promovidoSchema.safeParse({
      ...validBase,
      birthDate: '1996-11-19',
    });
    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) => issue.path.includes('curp') && issue.message.includes('fecha'),
      ),
    ).toBe(true);
  });
});

describe('toE164Phone', () => {
  it('converts a 10-digit MX number to E.164', () => {
    expect(toE164Phone('9991234567')).toBe('+529991234567');
  });

  it('keeps a valid E.164 number', () => {
    expect(toE164Phone('+529991234567')).toBe('+529991234567');
  });

  it('returns empty for invalid values', () => {
    expect(toE164Phone('abc')).toBe('');
    expect(toE164Phone('')).toBe('');
  });
});

describe('normalizeBirthDate', () => {
  it('returns ISO dates unchanged', () => {
    expect(normalizeBirthDate('1996-11-20')).toBe('1996-11-20');
  });

  it('converts DD/MM/YYYY to ISO', () => {
    expect(normalizeBirthDate('20/11/1996')).toBe('1996-11-20');
  });

  it('returns unparseable values as-is', () => {
    expect(normalizeBirthDate('not a date')).toBe('not a date');
  });
});
