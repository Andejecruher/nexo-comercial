import { describe, expect, it } from '@jest/globals';
import {
  normalizeIntervals,
  subtractIntervals,
  parseAvailabilityInstant,
} from '../../utils/department-schedule';

describe('department-schedule utilities', () => {
  it('ordena intervalos y rechaza solapamientos', () => {
    expect(
      normalizeIntervals([
        { startTime: '14:00', endTime: '16:00' },
        { startTime: '08:00', endTime: '12:00' },
      ]),
    ).toEqual([
      { startTime: '08:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '16:00' },
    ]);
    expect(() =>
      normalizeIntervals([
        { startTime: '08:00', endTime: '12:00' },
        { startTime: '11:00', endTime: '13:00' },
      ]),
    ).toThrow('solapados');
  });

  it('rechaza duración cero e intervalos que cruzan medianoche', () => {
    expect(() => normalizeIntervals([{ startTime: '08:00', endTime: '08:00' }])).toThrow('inicio');
    expect(() => normalizeIntervals([{ startTime: '22:00', endTime: '02:00' }])).toThrow(
      'medianoche',
    );
  });

  it('resta cierres parciales sin crear horarios abiertos fuera del horario regular', () => {
    expect(
      subtractIntervals(
        [{ startTime: '08:00', endTime: '16:00' }],
        [{ startTime: '11:00', endTime: '13:00' }],
      ),
    ).toEqual([
      { startTime: '08:00', endTime: '11:00' },
      { startTime: '13:00', endTime: '16:00' },
    ]);
    expect(
      subtractIntervals(
        [{ startTime: '08:00', endTime: '10:00' }],
        [{ startTime: '11:00', endTime: '13:00' }],
      ),
    ).toEqual([{ startTime: '08:00', endTime: '10:00' }]);
  });

  it('exige timestamp ISO 8601 con offset explícito', () => {
    expect(
      parseAvailabilityInstant('2026-09-15T11:30:00-06:00', 'America/Mexico_City').localDate,
    ).toBe('2026-09-15');
    expect(() => parseAvailabilityInstant('2026-09-15T11:30:00', 'America/Mexico_City')).toThrow(
      'ISO 8601',
    );
  });
});
import {
  compareMonthDay,
  getApplicableExceptions,
  isLeapYear,
  isValidMonthDay,
  matchesNonRecurringDate,
  matchesSpecificWeekdayRecurrence,
  matchesWeeklyRecurrence,
  matchesYearlyRecurrence,
  resolveExceptionPrecedence,
  type RecurringExceptionLike,
} from '../../utils/department-schedule';

describe('department exception recurrence utilities', () => {
  it('compara mes/día y valida años bisiestos', () => {
    expect(compareMonthDay({ month: 9, day: 16 }, { month: 9, day: 17 })).toBeLessThan(0);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isValidMonthDay(2, 29)).toBe(true);
    expect(isValidMonthDay(4, 31)).toBe(false);
  });

  it('mantiene compatibilidad con excepciones puntuales y periodos NONE', () => {
    const exception: RecurringExceptionLike = {
      recurrenceType: 'NONE',
      startDate: '2026-09-15',
      endDate: '2026-09-20',
    };
    expect(matchesNonRecurringDate(exception, '2026-09-15')).toBe(true);
    expect(matchesNonRecurringDate(exception, '2026-09-20')).toBe(true);
    expect(matchesNonRecurringDate(exception, '2026-09-21')).toBe(false);
  });

  it('evalúa recurrencias anuales simples, periodos y cruce de año', () => {
    const yearly: RecurringExceptionLike = {
      recurrenceType: 'YEARLY',
      recurrenceStartsOn: '2026-01-01',
      yearlyStartMonth: 12,
      yearlyStartDay: 30,
      yearlyEndMonth: 1,
      yearlyEndDay: 2,
    };
    expect(matchesYearlyRecurrence(yearly, '2026-12-31')).toBe(true);
    expect(matchesYearlyRecurrence(yearly, '2027-01-01')).toBe(true);
    expect(matchesYearlyRecurrence(yearly, '2027-01-03')).toBe(false);
  });

  it('aplica 29 de febrero solo en años bisiestos', () => {
    const leapOnly: RecurringExceptionLike = {
      recurrenceType: 'YEARLY',
      recurrenceStartsOn: '2026-01-01',
      yearlyStartMonth: 2,
      yearlyStartDay: 29,
      yearlyEndMonth: 2,
      yearlyEndDay: 29,
    };
    expect(matchesYearlyRecurrence(leapOnly, '2028-02-29')).toBe(true);
    expect(matchesYearlyRecurrence(leapOnly, '2027-02-28')).toBe(false);
  });

  it('respeta vigencias inclusivas en días específicos', () => {
    const fridays: RecurringExceptionLike = {
      recurrenceType: 'SPECIFIC_WEEKDAYS',
      recurrenceStartsOn: '2026-08-01',
      recurrenceEndsOn: '2026-12-31',
      weekdays: ['FRIDAY'],
    };
    expect(matchesSpecificWeekdayRecurrence(fridays, '2026-08-07')).toBe(true);
    expect(matchesSpecificWeekdayRecurrence(fridays, '2026-08-08')).toBe(false);
    expect(matchesSpecificWeekdayRecurrence(fridays, '2027-01-01')).toBe(false);
  });

  it('evalúa patrón WEEKLY con ancla y días activos', () => {
    const weekly: RecurringExceptionLike = {
      recurrenceType: 'WEEKLY',
      recurrenceStartsOn: '2026-08-01',
      weeklyAnchorDate: '2026-08-03',
      weekdays: ['TUESDAY', 'THURSDAY'],
    };
    expect(matchesWeeklyRecurrence(weekly, '2026-08-04')).toBe(true);
    expect(matchesWeeklyRecurrence(weekly, '2026-08-06')).toBe(true);
    expect(matchesWeeklyRecurrence(weekly, '2026-08-05')).toBe(false);
  });

  it('resuelve precedencia: puntual sobre anual sobre semanal sobre días específicos', () => {
    const applicable = getApplicableExceptions(
      [
        {
          recurrenceType: 'SPECIFIC_WEEKDAYS',
          recurrenceStartsOn: '2026-01-01',
          weekdays: ['FRIDAY'],
        },
        {
          recurrenceType: 'YEARLY',
          recurrenceStartsOn: '2026-01-01',
          yearlyStartMonth: 9,
          yearlyStartDay: 18,
          yearlyEndMonth: 9,
          yearlyEndDay: 18,
        },
        { recurrenceType: 'NONE', startDate: '2026-09-18', endDate: '2026-09-18' },
      ],
      '2026-09-18',
    );
    expect(resolveExceptionPrecedence(applicable)?.recurrenceType).toBe('NONE');
  });
});
