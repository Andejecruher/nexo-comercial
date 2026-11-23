import type {
  DepartmentDayOfWeek,
  DepartmentScheduleException,
  DepartmentExceptionRecurrenceType,
} from '@/lib/catalog-api';

const DAY_LABELS: Record<DepartmentDayOfWeek, string> = {
  MONDAY: 'lunes',
  TUESDAY: 'martes',
  WEDNESDAY: 'miércoles',
  THURSDAY: 'jueves',
  FRIDAY: 'viernes',
  SATURDAY: 'sábado',
  SUNDAY: 'domingo',
};
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function dateLabel(value?: string | null): string {
  if (!value) return 'sin fecha';
  const [year, month, day] = value.split('-').map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

function monthDayLabel(month?: number, day?: number): string {
  if (!month || !day) return 'fecha anual incompleta';
  return `${day} de ${MONTHS[month - 1]}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function formatExceptionRecurrence(exception: DepartmentScheduleException): string {
  const recurrenceType: DepartmentExceptionRecurrenceType = exception.recurrenceType ?? 'NONE';
  if (recurrenceType === 'NONE') {
    return exception.startDate === exception.endDate
      ? `El ${dateLabel(exception.startDate)}.`
      : `Del ${dateLabel(exception.startDate)} al ${dateLabel(exception.endDate)}.`;
  }
  const validity = exception.recurrenceEndsOn
    ? `, del ${dateLabel(exception.recurrenceStartsOn)} al ${dateLabel(exception.recurrenceEndsOn)}`
    : exception.recurrenceStartsOn
      ? `, desde el ${dateLabel(exception.recurrenceStartsOn)}`
      : '';
  if (recurrenceType === 'YEARLY') {
    const start = monthDayLabel(exception.yearlyStartMonth, exception.yearlyStartDay);
    const end = monthDayLabel(exception.yearlyEndMonth, exception.yearlyEndDay);
    return start === end
      ? `Cada año, el ${start}${validity}.`
      : `Cada año, del ${start} al ${end}${validity}.`;
  }
  const days = list((exception.weekdays ?? []).map((day) => DAY_LABELS[day]));
  if (recurrenceType === 'WEEKLY') return `Cada semana en ${days}${validity}.`;
  return `Todos los ${days}${validity}.`;
}

export function getRecurrenceStatus(
  exception: DepartmentScheduleException,
  today = new Date(),
): 'Activa' | 'Futura' | 'Finalizada' {
  const iso = today.toISOString().slice(0, 10);
  if ((exception.recurrenceType ?? 'NONE') === 'NONE') {
    if (exception.startDate && iso < exception.startDate) return 'Futura';
    if (exception.endDate && iso > exception.endDate) return 'Finalizada';
    return 'Activa';
  }
  if (exception.recurrenceStartsOn && iso < exception.recurrenceStartsOn) return 'Futura';
  if (exception.recurrenceEndsOn && iso > exception.recurrenceEndsOn) return 'Finalizada';
  return 'Activa';
}

export function isValidMonthDay(month?: number, day?: number): boolean {
  if (!month || !day || month < 1 || month > 12) return false;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= max;
}
