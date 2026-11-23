import { formatDateTimeValue, maskDateTimeInput, parseDateTimeInput } from '@/lib/date-time-picker';
import { describe, expect, it } from 'vitest';

describe('maskDateTimeInput', () => {
  it('enmascara dígitos como DD/MM/YYYY', () => {
    expect(maskDateTimeInput('10052026', 'date')).toBe('10/05/2026');
    expect(maskDateTimeInput('10/05', 'date')).toBe('10/05');
  });

  it('enmascara dígitos como DD/MM/YYYY HH:mm', () => {
    expect(maskDateTimeInput('100520260930', 'datetime')).toBe('10/05/2026 09:30');
  });
});

describe('parseDateTimeInput', () => {
  it('parsea una fecha local válida', () => {
    const parsed = parseDateTimeInput('10/05/2026', 'date');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(4);
    expect(parsed?.getDate()).toBe(10);
  });

  it('parsea fecha y hora locales', () => {
    const parsed = parseDateTimeInput('10/05/2026 09:30', 'datetime');
    expect(parsed?.getHours()).toBe(9);
    expect(parsed?.getMinutes()).toBe(30);
  });

  it('rechaza fechas inexistentes y valores incompletos', () => {
    expect(parseDateTimeInput('32/13/2026', 'date')).toBeUndefined();
    expect(parseDateTimeInput('10/05/2026', 'datetime')).toBeUndefined();
    expect(parseDateTimeInput('abc', 'date')).toBeUndefined();
  });
});

describe('formatDateTimeValue', () => {
  it('formatea en el patrón local esperado', () => {
    const value = new Date(2026, 4, 10, 9, 30);
    expect(formatDateTimeValue(value, 'date')).toBe('10/05/2026');
    expect(formatDateTimeValue(value, 'datetime')).toBe('10/05/2026 09:30');
  });
});
