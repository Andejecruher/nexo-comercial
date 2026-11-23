import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const DEFAULT_DEPARTMENT_TIMEZONE = 'America/Mexico_City';
export const MAX_INTERVALS_PER_DAY = 6;
export const NEXT_AVAILABILITY_HORIZON_DAYS = 365;

export const DAY_TO_INDEX = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;
export type DepartmentDayOfWeek = keyof typeof DAY_TO_INDEX;
export const INDEX_TO_DAY = Object.fromEntries(
  Object.entries(DAY_TO_INDEX).map(([day, index]) => [index, day]),
) as Record<number, DepartmentDayOfWeek>;

export type DepartmentScheduleExceptionType =
  | 'PARTIALLY_OPEN'
  | 'PARTIALLY_CLOSED'
  | 'FULLY_CLOSED';
export type TimeInterval = { startTime: string; endTime: string };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ISO_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function assertValidTimeZone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  } catch {
    throw new Error(`Zona horaria inválida: ${timezone}`);
  }
}

export function timeToMinutes(value: string): number {
  const match = HHMM.exec(value);
  if (!match) throw new Error(`Hora inválida: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeIntervals(
  intervals: TimeInterval[],
  label = 'intervalos',
): TimeInterval[] {
  if (intervals.length > MAX_INTERVALS_PER_DAY) {
    throw new Error(`Máximo ${MAX_INTERVALS_PER_DAY} ${label} por día`);
  }
  const sorted = intervals
    .map((interval) => {
      const startTime = interval.startTime.trim();
      const endTime = interval.endTime.trim();
      const start = timeToMinutes(startTime);
      const end = timeToMinutes(endTime);
      if (start >= end) {
        throw new Error(
          'La hora de inicio debe ser menor que la hora de fin; no se permiten cruces de medianoche',
        );
      }
      return { startTime, endTime };
    })
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (prev.startTime === current.startTime && prev.endTime === current.endTime) {
      throw new Error('No se permiten intervalos duplicados');
    }
    if (timeToMinutes(current.startTime) < timeToMinutes(prev.endTime)) {
      throw new Error('No se permiten intervalos solapados');
    }
  }
  return sorted;
}

export function subtractIntervals(open: TimeInterval[], closed: TimeInterval[]): TimeInterval[] {
  let result = normalizeIntervals(open);
  for (const close of normalizeIntervals(closed)) {
    const cStart = timeToMinutes(close.startTime);
    const cEnd = timeToMinutes(close.endTime);
    const next: TimeInterval[] = [];
    for (const interval of result) {
      const start = timeToMinutes(interval.startTime);
      const end = timeToMinutes(interval.endTime);
      if (cEnd <= start || cStart >= end) {
        next.push(interval);
        continue;
      }
      if (cStart > start)
        next.push({ startTime: interval.startTime, endTime: minutesToTime(cStart) });
      if (cEnd < end) next.push({ startTime: minutesToTime(cEnd), endTime: interval.endTime });
    }
    result = next;
  }
  return normalizeIntervals(result);
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function containsMinute(interval: TimeInterval, minute: number): boolean {
  return minute >= timeToMinutes(interval.startTime) && minute < timeToMinutes(interval.endTime);
}

export function parseAvailabilityInstant(
  at: string,
  timezone: string,
): {
  date: Date;
  localDate: string;
  minute: number;
  dayOfWeek: DepartmentDayOfWeek;
  requestedAt: string;
} {
  if (!ISO_WITH_ZONE.test(at))
    throw new Error('El parámetro at debe ser ISO 8601 con zona u offset explícito');
  assertValidTimeZone(timezone);
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) throw new Error('Fecha-hora inválida');
  const localDate = formatInTimeZone(date, timezone, 'yyyy-MM-dd');
  const hour = Number(formatInTimeZone(date, timezone, 'HH'));
  const minute = Number(formatInTimeZone(date, timezone, 'mm'));
  const day = INDEX_TO_DAY[Number(formatInTimeZone(date, timezone, 'i')) % 7];
  return { date, localDate, minute: hour * 60 + minute, dayOfWeek: day, requestedAt: at };
}

export function zonedDateTimeIso(localDate: string, time: string, timezone: string): string {
  const utc = fromZonedTime(`${localDate}T${time}:00`, timezone);
  return formatInTimeZone(utc, timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export type DepartmentExceptionRecurrenceType = 'NONE' | 'YEARLY' | 'WEEKLY' | 'SPECIFIC_WEEKDAYS';

export type RecurringExceptionLike = {
  recurrenceType?: DepartmentExceptionRecurrenceType;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  recurrenceStartsOn?: Date | string | null;
  recurrenceEndsOn?: Date | string | null;
  yearlyStartMonth?: number | null;
  yearlyStartDay?: number | null;
  yearlyEndMonth?: number | null;
  yearlyEndDay?: number | null;
  weeklyAnchorDate?: Date | string | null;
  weekdays?: DepartmentDayOfWeek[];
};

export function dateOnlyString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) return false;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= max;
}

export function compareMonthDay(
  a: { month: number; day: number },
  b: { month: number; day: number },
): number {
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

function parseLocalDateParts(localDate: string): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: DepartmentDayOfWeek;
} {
  const [year, month, day] = localDate.split('-').map(Number);
  const dow = INDEX_TO_DAY[new Date(`${localDate}T00:00:00.000Z`).getUTCDay()];
  return { year, month, day, dayOfWeek: dow };
}

export function isExceptionActiveWithinValidity(
  exception: RecurringExceptionLike,
  localDate: string,
): boolean {
  const recurrenceType = exception.recurrenceType ?? 'NONE';
  if (recurrenceType === 'NONE') return true;
  const starts = exception.recurrenceStartsOn
    ? dateOnlyString(exception.recurrenceStartsOn)
    : undefined;
  const ends = exception.recurrenceEndsOn ? dateOnlyString(exception.recurrenceEndsOn) : undefined;
  return (!starts || starts <= localDate) && (!ends || ends >= localDate);
}

export function matchesNonRecurringDate(
  exception: RecurringExceptionLike,
  localDate: string,
): boolean {
  if ((exception.recurrenceType ?? 'NONE') !== 'NONE' || !exception.startDate || !exception.endDate)
    return false;
  return (
    dateOnlyString(exception.startDate) <= localDate &&
    dateOnlyString(exception.endDate) >= localDate
  );
}

export function matchesYearlyRecurrence(
  exception: RecurringExceptionLike,
  localDate: string,
): boolean {
  if (
    exception.recurrenceType !== 'YEARLY' ||
    !isExceptionActiveWithinValidity(exception, localDate)
  )
    return false;
  const { yearlyStartMonth, yearlyStartDay, yearlyEndMonth, yearlyEndDay } = exception;
  if (!yearlyStartMonth || !yearlyStartDay || !yearlyEndMonth || !yearlyEndDay) return false;
  const current = parseLocalDateParts(localDate);
  // 29 de febrero solo aplica en años bisiestos; no se desplaza a 28/02 ni 01/03.
  if (
    (yearlyStartMonth === 2 && yearlyStartDay === 29) ||
    (yearlyEndMonth === 2 && yearlyEndDay === 29)
  ) {
    if (!isLeapYear(current.year) && current.month === 2 && current.day === 28) return false;
  }
  if (!isValidMonthDay(current.month, current.day)) return false;
  const start = { month: yearlyStartMonth, day: yearlyStartDay };
  const end = { month: yearlyEndMonth, day: yearlyEndDay };
  const today = { month: current.month, day: current.day };
  if (compareMonthDay(start, end) <= 0) {
    return compareMonthDay(start, today) <= 0 && compareMonthDay(today, end) <= 0;
  }
  return compareMonthDay(start, today) <= 0 || compareMonthDay(today, end) <= 0;
}

export function matchesSpecificWeekdayRecurrence(
  exception: RecurringExceptionLike,
  localDate: string,
): boolean {
  if (
    exception.recurrenceType !== 'SPECIFIC_WEEKDAYS' ||
    !isExceptionActiveWithinValidity(exception, localDate)
  )
    return false;
  const { dayOfWeek } = parseLocalDateParts(localDate);
  return (exception.weekdays ?? []).includes(dayOfWeek);
}

export function matchesWeeklyRecurrence(
  exception: RecurringExceptionLike,
  localDate: string,
): boolean {
  if (
    exception.recurrenceType !== 'WEEKLY' ||
    !isExceptionActiveWithinValidity(exception, localDate)
  )
    return false;
  if (!exception.weeklyAnchorDate) return false;
  const anchor = dateOnlyString(exception.weeklyAnchorDate);
  if (localDate < anchor) return false;
  const anchorTime = new Date(`${anchor}T00:00:00.000Z`).getTime();
  const localTime = new Date(`${localDate}T00:00:00.000Z`).getTime();
  const days = Math.floor((localTime - anchorTime) / 86_400_000);
  if (days % 7 < 0) return false;
  const selected = exception.weekdays ?? [];
  if (selected.length === 0) return true;
  return selected.includes(parseLocalDateParts(localDate).dayOfWeek);
}

export function matchesExceptionDate(
  exception: RecurringExceptionLike,
  localDate: string,
): boolean {
  switch (exception.recurrenceType ?? 'NONE') {
    case 'NONE':
      return matchesNonRecurringDate(exception, localDate);
    case 'YEARLY':
      return matchesYearlyRecurrence(exception, localDate);
    case 'WEEKLY':
      return matchesWeeklyRecurrence(exception, localDate);
    case 'SPECIFIC_WEEKDAYS':
      return matchesSpecificWeekdayRecurrence(exception, localDate);
  }
}

export function recurrenceSpecificity(type: DepartmentExceptionRecurrenceType | undefined): number {
  return { NONE: 4, YEARLY: 3, WEEKLY: 2, SPECIFIC_WEEKDAYS: 1 }[type ?? 'NONE'];
}

export function getApplicableExceptions<T extends RecurringExceptionLike>(
  exceptions: T[],
  localDate: string,
): T[] {
  return exceptions.filter((exception) => matchesExceptionDate(exception, localDate));
}

export function resolveExceptionPrecedence<T extends RecurringExceptionLike>(
  exceptions: T[],
): T | undefined {
  return [...exceptions].sort(
    (a, b) => recurrenceSpecificity(b.recurrenceType) - recurrenceSpecificity(a.recurrenceType),
  )[0];
}
