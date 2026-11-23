import { format, isValid, parse } from 'date-fns';

export type DateTimePickerMode = 'date' | 'datetime';

const DATE_FORMAT = 'dd/MM/yyyy';
const DATETIME_FORMAT = 'dd/MM/yyyy HH:mm';

export function dateTimeFormat(mode: DateTimePickerMode): string {
  return mode === 'datetime' ? DATETIME_FORMAT : DATE_FORMAT;
}

export function maskDateTimeInput(raw: string, mode: DateTimePickerMode): string {
  const digits = raw.replace(/\D/g, '').slice(0, mode === 'datetime' ? 12 : 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  const hour = digits.slice(8, 10);
  const minute = digits.slice(10, 12);

  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  if (mode === 'date' || digits.length <= 8) return `${day}/${month}/${year}`;
  if (digits.length <= 10) return `${day}/${month}/${year} ${hour}`;
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export function formatDateTimeValue(value: Date, mode: DateTimePickerMode): string {
  return format(value, dateTimeFormat(mode));
}

export function parseDateTimeInput(text: string, mode: DateTimePickerMode): Date | undefined {
  const pattern = dateTimeFormat(mode);
  const trimmed = text.trim();
  if (trimmed.length !== pattern.length) return undefined;

  const parsed = parse(trimmed, pattern, new Date());
  if (!isValid(parsed)) return undefined;
  if (format(parsed, pattern) !== trimmed) return undefined;
  return parsed;
}

export function mergeDateAndTime(date: Date, hours: number, minutes: number): Date {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function withDefaultTime(date: Date, hours = 9, minutes = 0): Date {
  return mergeDateAndTime(date, hours, minutes);
}
