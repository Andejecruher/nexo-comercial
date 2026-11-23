import { endOfWeek, startOfWeek } from 'date-fns';
import { formatInTimeZone, fromZonedTime, toDate, toZonedTime } from 'date-fns-tz';

import { AppError } from './app-error';

export type PublicEventWeekBounds = {
  /** Inicio del lunes 00:00:00.000 en `timeZone`, como instante UTC */
  rangeStartUtc: Date;
  /** Fin del domingo 23:59:59.999 en `timeZone`, como instante UTC */
  rangeEndUtc: Date;
  weekStartsOn: string;
  weekEndsOn: string;
  timeZone: string;
};

const REF_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Interpreta `YYYY-MM-DD` como mediodía en la zona IANA indicada (ancla estable para la semana ISO).
 */
export function parseWeekReferenceDate(dateStr: string | undefined, timeZone: string): Date {
  if (dateStr === undefined || dateStr.trim() === '') {
    return new Date();
  }
  const trimmed = dateStr.trim();
  if (!REF_DATE_RE.test(trimmed)) {
    throw AppError.badRequest('referenceDate debe ser YYYY-MM-DD');
  }
  const anchor = toDate(`${trimmed}T12:00:00`, { timeZone });
  if (Number.isNaN(anchor.getTime())) {
    throw AppError.badRequest('referenceDate inválido');
  }
  return anchor;
}

/**
 * Semana calendario lunes–domingo en `timeZone`, inclusive en los extremos locales.
 */
export function getMondaySundayWeekBounds(
  timeZone: string,
  referenceUtc: Date,
): PublicEventWeekBounds {
  const zoned = toZonedTime(referenceUtc, timeZone);
  const startLocal = startOfWeek(zoned, { weekStartsOn: 1 });
  const endLocal = endOfWeek(zoned, { weekStartsOn: 1 });
  const rangeStartUtc = fromZonedTime(startLocal, timeZone);
  const rangeEndUtc = fromZonedTime(endLocal, timeZone);
  const weekStartsOn = formatInTimeZone(rangeStartUtc, timeZone, 'yyyy-MM-dd');
  const weekEndsOn = formatInTimeZone(rangeEndUtc, timeZone, 'yyyy-MM-dd');
  return { rangeStartUtc, rangeEndUtc, weekStartsOn, weekEndsOn, timeZone };
}
