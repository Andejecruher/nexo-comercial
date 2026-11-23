import { Prisma } from '@prisma/client';
import { addDays, parseISO } from 'date-fns';
import { z } from 'zod';
import type { DepartmentRecord, DepartmentRepository, DepartmentTx } from '../repositories';
import { AppError } from '../utils/app-error';
import {
  containsMinute,
  DEFAULT_DEPARTMENT_TIMEZONE,
  DepartmentDayOfWeek,
  DepartmentScheduleExceptionType,
  DepartmentExceptionRecurrenceType,
  getApplicableExceptions,
  isValidMonthDay,
  recurrenceSpecificity,
  resolveExceptionPrecedence,
  INDEX_TO_DAY,
  NEXT_AVAILABILITY_HORIZON_DAYS,
  normalizeIntervals,
  parseAvailabilityInstant,
  subtractIntervals,
  TimeInterval,
  timeToMinutes,
  zonedDateTimeIso,
} from '../utils/department-schedule';

const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido');
const KeywordSchema = z.string().trim().min(1).max(100);
const BooleanQuerySchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));
const DaySchema = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);
const ExceptionTypeSchema = z.enum(['PARTIALLY_OPEN', 'PARTIALLY_CLOSED', 'FULLY_CLOSED']);
const RecurrenceTypeSchema = z.enum(['NONE', 'YEARLY', 'WEEKLY', 'SPECIFIC_WEEKDAYS']);
const IntervalSchema = z
  .object({
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();
const ScheduleDaySchema = z
  .object({
    dayOfWeek: DaySchema,
    isOpen: z.boolean(),
    intervals: z.array(IntervalSchema).max(6).default([]),
  })
  .strict();
const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MonthDaySchema = z.number().int().min(1).max(31);
const ExceptionSchema = z
  .object({
    type: ExceptionTypeSchema,
    recurrenceType: RecurrenceTypeSchema.default('NONE'),
    startDate: DateOnlySchema.optional(),
    endDate: DateOnlySchema.optional(),
    recurrenceStartsOn: DateOnlySchema.optional(),
    recurrenceEndsOn: DateOnlySchema.nullish(),
    yearlyStartMonth: z.number().int().min(1).max(12).optional(),
    yearlyStartDay: MonthDaySchema.optional(),
    yearlyEndMonth: z.number().int().min(1).max(12).optional(),
    yearlyEndDay: MonthDaySchema.optional(),
    weeklyAnchorDate: DateOnlySchema.optional(),
    weekdays: z.array(DaySchema).max(7).optional(),
    reason: z.string().trim().max(500).optional(),
    intervals: z.array(IntervalSchema).max(6).default([]),
  })
  .strict();
const ScheduleSchema = z.array(ScheduleDaySchema).max(7).optional();
const ExceptionsSchema = z.array(ExceptionSchema).max(100).optional();

export const CreateDepartmentSchema = z
  .object({
    slug: SlugSchema,
    name: z.string().trim().min(2).max(255),
    description: z.string().trim().min(1).max(4000).optional(),
    isActive: z.boolean().optional(),
    keywords: z.array(KeywordSchema).max(50).optional(),
    schedule: ScheduleSchema,
    scheduleExceptions: ExceptionsSchema,
  })
  .strict();

export const UpdateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    description: z.string().trim().min(1).max(4000).optional(),
    isActive: z.boolean().optional(),
    keywords: z.array(KeywordSchema).max(50).optional(),
    schedule: ScheduleSchema,
    scheduleExceptions: ExceptionsSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Al menos un campo debe ser enviado',
  });
export const DepartmentIdParamSchema = z.object({ id: z.string().uuid() });
export const DepartmentSlugParamSchema = z.object({ slug: SlugSchema });
export const DepartmentAvailabilityQuerySchema = z.object({ at: z.string().trim().min(1) });
export const DepartmentListFiltersSchema = z.object({
  search: z.string().trim().min(1).max(255).optional(),
  isActive: BooleanQuerySchema.optional(),
});

type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;
type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;
type DepartmentListFilters = z.infer<typeof DepartmentListFiltersSchema>;

type ScheduleDayInput = {
  dayOfWeek: DepartmentDayOfWeek;
  isOpen: boolean;
  intervals: TimeInterval[];
};
type ExceptionInput = {
  type: DepartmentScheduleExceptionType;
  recurrenceType: DepartmentExceptionRecurrenceType;
  startDate?: string;
  endDate?: string;
  recurrenceStartsOn?: string;
  recurrenceEndsOn?: string | null;
  yearlyStartMonth?: number;
  yearlyStartDay?: number;
  yearlyEndMonth?: number;
  yearlyEndDay?: number;
  weeklyAnchorDate?: string;
  weekdays?: DepartmentDayOfWeek[];
  reason?: string;
  intervals: TimeInterval[];
};
export type AvailabilityReason =
  | 'DEPARTMENT_INACTIVE'
  | 'NO_SCHEDULE_CONFIGURED'
  | 'CLOSED_DAY'
  | 'OUTSIDE_BUSINESS_HOURS'
  | 'REGULAR_SCHEDULE'
  | 'EXCEPTION_PARTIALLY_OPEN'
  | 'EXCEPTION_PARTIALLY_CLOSED'
  | 'EXCEPTION_FULLY_CLOSED';
export type DepartmentResponse = {
  id: string;
  slug: string;
  name: string;
  description: string | undefined;
  isActive: boolean;
  keywords: string[];
  schedule: ScheduleDayInput[];
  scheduleExceptions: ExceptionInput[];
  createdAt: Date;
  updatedAt: Date;
};
export type DepartmentAvailabilityResponse = {
  department: { id: string; slug: string; name: string; status: 'ACTIVE' | 'INACTIVE' };
  requestedAt: string;
  timezone: string;
  isAvailable: boolean;
  reason: AvailabilityReason;
  effectiveSchedule: TimeInterval[];
  currentInterval: TimeInterval | null;
  appliedException?: {
    id?: string;
    type: DepartmentScheduleExceptionType;
    recurrenceType: DepartmentExceptionRecurrenceType;
    reason?: string;
  };
  recurrenceType?: DepartmentExceptionRecurrenceType;
  nextChangeAt?: string;
  nextAvailableAt?: string | null;
};

export type DepartmentListResult = {
  items: DepartmentResponse[];
  meta: { nextCursor: string | undefined; hasNextPage: boolean; count: number };
};

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ');
const normalizeKeywords = (keywords: string[] | undefined) =>
  keywords === undefined
    ? undefined
    : [...new Set(keywords.map((item) => item.trim().toLowerCase()).filter(Boolean))];
const parseDateOnly = (date: string) => parseISO(`${date}T00:00:00.000Z`);

function validateSchedule(
  schedule: ScheduleDayInput[] | undefined,
): ScheduleDayInput[] | undefined {
  if (schedule === undefined) return undefined;
  const seen = new Set<string>();
  return schedule.map((day) => {
    if (seen.has(day.dayOfWeek))
      throw AppError.badRequest('No se permiten días duplicados en el horario');
    seen.add(day.dayOfWeek);
    const intervals = normalizeIntervals(day.intervals);
    if (!day.isOpen && intervals.length > 0)
      throw AppError.badRequest('Un día cerrado no puede tener intervalos');
    if (day.isOpen && intervals.length === 0)
      throw AppError.badRequest('Un día abierto debe tener al menos un intervalo');
    return { ...day, intervals: day.isOpen ? intervals : [] };
  });
}

function validateExceptions(
  exceptions: ExceptionInput[] | undefined,
): ExceptionInput[] | undefined {
  if (exceptions === undefined) return undefined;
  const normalized = exceptions.map((item) => {
    const recurrenceType = item.recurrenceType ?? 'NONE';
    const intervals = normalizeIntervals(item.intervals, 'intervalos de excepción');
    if (item.type === 'FULLY_CLOSED' && intervals.length > 0)
      throw AppError.badRequest('FULLY_CLOSED no acepta intervalos');
    if (item.type !== 'FULLY_CLOSED' && intervals.length === 0)
      throw AppError.badRequest(`${item.type} requiere al menos un intervalo`);

    const normalizedItem: ExceptionInput = {
      ...item,
      recurrenceType,
      recurrenceEndsOn: item.recurrenceEndsOn ?? null,
      intervals: item.type === 'FULLY_CLOSED' ? [] : intervals,
    };

    if (recurrenceType === 'NONE') {
      if (!item.startDate || !item.endDate)
        throw AppError.badRequest('Las excepciones no recurrentes requieren fecha inicial y final');
      if (parseDateOnly(item.startDate) > parseDateOnly(item.endDate))
        throw AppError.badRequest('La fecha inicial no puede ser posterior a la fecha final');
      if (
        item.recurrenceStartsOn ||
        item.recurrenceEndsOn ||
        item.yearlyStartMonth ||
        item.yearlyStartDay ||
        item.yearlyEndMonth ||
        item.yearlyEndDay ||
        item.weeklyAnchorDate ||
        (item.weekdays?.length ?? 0) > 0
      )
        throw AppError.badRequest('NONE no acepta configuración recurrente');
      return normalizedItem;
    }

    if (!item.recurrenceStartsOn)
      throw AppError.badRequest('Las recurrencias requieren fecha de inicio de vigencia');
    if (
      item.recurrenceEndsOn &&
      parseDateOnly(item.recurrenceStartsOn) > parseDateOnly(item.recurrenceEndsOn)
    )
      throw AppError.badRequest('La vigencia final no puede ser anterior a la inicial');
    if (item.startDate || item.endDate)
      throw AppError.badRequest(
        'Las recurrencias no aceptan startDate/endDate como periodo principal',
      );

    if (recurrenceType === 'YEARLY') {
      if (
        !item.yearlyStartMonth ||
        !item.yearlyStartDay ||
        !item.yearlyEndMonth ||
        !item.yearlyEndDay
      )
        throw AppError.badRequest('YEARLY requiere mes y día inicial/final');
      if (
        !isValidMonthDay(item.yearlyStartMonth, item.yearlyStartDay) ||
        !isValidMonthDay(item.yearlyEndMonth, item.yearlyEndDay)
      )
        throw AppError.badRequest('La recurrencia anual contiene un día inválido para el mes');
      if ((item.weekdays?.length ?? 0) > 0 || item.weeklyAnchorDate)
        throw AppError.badRequest('YEARLY no acepta días de semana ni ancla semanal');
      return normalizedItem;
    }

    if (recurrenceType === 'SPECIFIC_WEEKDAYS') {
      if (!item.weekdays || item.weekdays.length === 0)
        throw AppError.badRequest('SPECIFIC_WEEKDAYS requiere al menos un día');
      if (new Set(item.weekdays).size !== item.weekdays.length)
        throw AppError.badRequest('No se permiten días recurrentes duplicados');
      if (
        item.yearlyStartMonth ||
        item.yearlyStartDay ||
        item.yearlyEndMonth ||
        item.yearlyEndDay ||
        item.weeklyAnchorDate
      )
        throw AppError.badRequest(
          'SPECIFIC_WEEKDAYS no acepta configuración anual ni ancla semanal',
        );
      return normalizedItem;
    }

    if (!item.weeklyAnchorDate) throw AppError.badRequest('WEEKLY requiere fecha ancla semanal');
    if (!item.weekdays || item.weekdays.length === 0)
      throw AppError.badRequest('WEEKLY requiere días activos dentro del patrón semanal');
    if (new Set(item.weekdays).size !== item.weekdays.length)
      throw AppError.badRequest('No se permiten días recurrentes duplicados');
    if (item.yearlyStartMonth || item.yearlyStartDay || item.yearlyEndMonth || item.yearlyEndDay)
      throw AppError.badRequest('WEEKLY no acepta configuración anual');
    return normalizedItem;
  });

  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      if (
        recurrenceSpecificity(normalized[i].recurrenceType) !==
        recurrenceSpecificity(normalized[j].recurrenceType)
      )
        continue;
      if (exceptionsConflict(normalized[i], normalized[j]))
        throw AppError.conflict(
          'No se permiten excepciones ambiguas del mismo nivel de recurrencia',
        );
    }
  }
  return normalized.sort(
    (a, b) => recurrenceSpecificity(b.recurrenceType) - recurrenceSpecificity(a.recurrenceType),
  );
}

function validityWindow(exception: ExceptionInput): { start: string; end: string } {
  if (exception.recurrenceType === 'NONE')
    return { start: exception.startDate ?? '0000-01-01', end: exception.endDate ?? '9999-12-31' };
  return {
    start: exception.recurrenceStartsOn ?? '0000-01-01',
    end: exception.recurrenceEndsOn ?? '9999-12-31',
  };
}

function windowsOverlap(a: ExceptionInput, b: ExceptionInput): boolean {
  const left = validityWindow(a);
  const right = validityWindow(b);
  return left.start <= right.end && right.start <= left.end;
}

function exceptionsConflict(a: ExceptionInput, b: ExceptionInput): boolean {
  if (!windowsOverlap(a, b)) return false;
  if (a.recurrenceType === 'NONE') return true;
  if (a.recurrenceType === 'YEARLY') {
    return Boolean(a.yearlyStartMonth && b.yearlyStartMonth);
  }
  const aDays = new Set(a.weekdays ?? []);
  return (b.weekdays ?? []).some((day) => aDays.has(day));
}

function scheduleToLegacyJson(
  schedule: ScheduleDayInput[] | undefined,
): Prisma.InputJsonValue | undefined {
  if (!schedule) return undefined;
  const days: Record<string, Array<{ open: string; close: string }>> = {};
  for (const day of schedule) {
    const index = {
      SUNDAY: 0,
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
    }[day.dayOfWeek];
    if (day.isOpen)
      days[String(index)] = day.intervals.map((i) => ({ open: i.startTime, close: i.endTime }));
  }
  return { timezone: DEFAULT_DEPARTMENT_TIMEZONE, days };
}

function toDateOnlyString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
function intervalsFrom(row: {
  intervals: Array<{ startTime: string; endTime: string }>;
}): TimeInterval[] {
  return row.intervals.map((i) => ({ startTime: i.startTime, endTime: i.endTime }));
}

export class DepartmentsService {
  constructor(private readonly departments: DepartmentRepository) {}

  async list(params: {
    cursor: string | undefined;
    limit: number;
    filters: DepartmentListFilters;
  }): Promise<DepartmentListResult> {
    const where: Prisma.DepartmentWhereInput = {};
    if (params.filters.isActive !== undefined) where.isActive = params.filters.isActive;
    if (params.filters.search !== undefined) {
      const search = params.filters.search.trim();
      const token = search.toLowerCase();
      where.OR = [
        { slug: { contains: token, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { keywords: { has: token } },
      ];
    }
    const rows = await this.departments.list({ where, cursor: params.cursor, limit: params.limit });
    const hasNextPage = rows.length > params.limit;
    const items = hasNextPage ? rows.slice(0, params.limit) : rows;
    return {
      items: items.map((item) => this.toResponse(item)),
      meta: {
        nextCursor: hasNextPage ? items[items.length - 1]?.id : undefined,
        hasNextPage,
        count: items.length,
      },
    };
  }

  async create(input: CreateDepartmentInput): Promise<DepartmentResponse> {
    const schedule = validateSchedule(input.schedule);
    const exceptions = validateExceptions(input.scheduleExceptions);
    const existing = await this.departments.findBySlug(input.slug);
    if (existing) throw AppError.conflict('Ya existe un departamento con ese slug');
    return this.runTransaction(async (tx) => {
      const created = await this.departments.create(
        {
          slug: input.slug,
          name: normalizeName(input.name),
          description: input.description,
          isActive: input.isActive ?? true,
          keywords: normalizeKeywords(input.keywords) ?? [],
          serviceSchedule: scheduleToLegacyJson(schedule),
        },
        tx,
      );
      if (schedule) await this.departments.replaceSchedules(created.id, schedule, tx);
      if (exceptions)
        await this.departments.replaceExceptions(
          created.id,
          exceptions.map((e) => ({
            ...e,
            startDate: e.startDate ? parseDateOnly(e.startDate) : undefined,
            endDate: e.endDate ? parseDateOnly(e.endDate) : undefined,
            recurrenceStartsOn: e.recurrenceStartsOn
              ? parseDateOnly(e.recurrenceStartsOn)
              : undefined,
            recurrenceEndsOn: e.recurrenceEndsOn ? parseDateOnly(e.recurrenceEndsOn) : null,
            weeklyAnchorDate: e.weeklyAnchorDate ? parseDateOnly(e.weeklyAnchorDate) : undefined,
          })),
          tx,
        );
      const reloaded = await tx.department.findUnique({
        where: { id: created.id },
        include: {
          schedules: { include: { intervals: { orderBy: { sortOrder: 'asc' } } } },
          scheduleExceptions: { include: { intervals: { orderBy: { sortOrder: 'asc' } } } },
        },
      });
      return this.toResponse(reloaded as DepartmentRecord);
    });
  }

  async update(id: string, input: UpdateDepartmentInput): Promise<DepartmentResponse> {
    const schedule = validateSchedule(input.schedule);
    const exceptions = validateExceptions(input.scheduleExceptions);
    const existing = await this.departments.findByIdWithSlug(id);
    if (!existing) throw AppError.notFound('Departamento no encontrado');
    return this.runTransaction(async (tx) => {
      const updatedRow = await this.departments.update(
        id,
        {
          name: input.name !== undefined ? normalizeName(input.name) : undefined,
          description: input.description,
          isActive: input.isActive,
          keywords:
            input.keywords !== undefined ? (normalizeKeywords(input.keywords) ?? []) : undefined,
          ...(schedule !== undefined
            ? { serviceSchedule: scheduleToLegacyJson(schedule) ?? Prisma.JsonNull }
            : {}),
        },
        tx,
      );
      if (schedule !== undefined) await this.departments.replaceSchedules(id, schedule, tx);
      if (exceptions !== undefined)
        await this.departments.replaceExceptions(
          id,
          exceptions.map((e) => ({
            ...e,
            startDate: e.startDate ? parseDateOnly(e.startDate) : undefined,
            endDate: e.endDate ? parseDateOnly(e.endDate) : undefined,
            recurrenceStartsOn: e.recurrenceStartsOn
              ? parseDateOnly(e.recurrenceStartsOn)
              : undefined,
            recurrenceEndsOn: e.recurrenceEndsOn ? parseDateOnly(e.recurrenceEndsOn) : null,
            weeklyAnchorDate: e.weeklyAnchorDate ? parseDateOnly(e.weeklyAnchorDate) : undefined,
          })),
          tx,
        );
      if (!tx?.department) return this.toResponse(updatedRow as DepartmentRecord);
      const updated = await tx.department.findUnique({
        where: { id },
        include: {
          schedules: { include: { intervals: { orderBy: { sortOrder: 'asc' } } } },
          scheduleExceptions: { include: { intervals: { orderBy: { sortOrder: 'asc' } } } },
        },
      });
      return this.toResponse(updated as DepartmentRecord);
    });
  }

  async deactivate(id: string): Promise<DepartmentResponse> {
    const existing = await this.departments.findById(id);
    if (!existing) throw AppError.notFound('Departamento no encontrado');
    if (existing.slug === 'general')
      throw AppError.badRequest('No se puede desactivar el departamento general');
    const updated = await this.departments.update(id, { isActive: false });
    return this.toResponse(updated);
  }

  async availability(slug: string, at: string): Promise<DepartmentAvailabilityResponse> {
    const parsed = parseAvailabilityInstant(at, DEFAULT_DEPARTMENT_TIMEZONE);
    const localDateObj = parseDateOnly(parsed.localDate);
    const department = await this.departments.findForAvailabilityBySlug(slug, localDateObj);
    if (!department) throw AppError.notFound('Departamento no encontrado');
    return this.evaluateAvailability(
      department,
      at,
      parsed.localDate,
      parsed.dayOfWeek,
      parsed.minute,
    );
  }

  private runTransaction<T>(fn: (tx: DepartmentTx) => Promise<T>): Promise<T> {
    if (typeof this.departments.transaction === 'function') {
      return this.departments.transaction(fn);
    }
    return fn(undefined as unknown as DepartmentTx);
  }

  private evaluateAvailability(
    department: DepartmentRecord,
    requestedAt: string,
    localDate: string,
    dayOfWeek: DepartmentDayOfWeek,
    minute: number,
  ): DepartmentAvailabilityResponse {
    const base = {
      department: {
        id: department.id,
        slug: department.slug,
        name: department.name,
        status: department.isActive ? ('ACTIVE' as const) : ('INACTIVE' as const),
      },
      requestedAt,
      timezone: DEFAULT_DEPARTMENT_TIMEZONE,
    };
    if (!department.isActive)
      return {
        ...base,
        isAvailable: false,
        reason: 'DEPARTMENT_INACTIVE' as AvailabilityReason,
        effectiveSchedule: [],
        currentInterval: null,
        nextAvailableAt: null,
      };
    const { intervals, reason, exception } = this.effectiveIntervals(
      department,
      localDate,
      dayOfWeek,
    );
    const currentInterval = intervals.find((i) => containsMinute(i, minute)) ?? null;
    if (currentInterval)
      return {
        ...base,
        isAvailable: true,
        reason,
        effectiveSchedule: intervals,
        currentInterval,
        ...(exception
          ? {
              appliedException: this.appliedException(exception),
              recurrenceType: exception.recurrenceType as DepartmentExceptionRecurrenceType,
            }
          : {}),
        nextChangeAt: zonedDateTimeIso(
          localDate,
          currentInterval.endTime,
          DEFAULT_DEPARTMENT_TIMEZONE,
        ),
      };
    return {
      ...base,
      isAvailable: false,
      reason: intervals.length === 0 ? reason : ('OUTSIDE_BUSINESS_HOURS' as AvailabilityReason),
      effectiveSchedule: intervals,
      currentInterval: null,
      ...(exception
        ? {
            appliedException: this.appliedException(exception),
            recurrenceType: exception.recurrenceType as DepartmentExceptionRecurrenceType,
          }
        : {}),
      nextAvailableAt: this.nextAvailableAt(department, localDate, minute),
    };
  }

  private effectiveIntervals(
    department: DepartmentRecord,
    localDate: string,
    dayOfWeek: DepartmentDayOfWeek,
  ): {
    intervals: TimeInterval[];
    reason: AvailabilityReason;
    exception?: DepartmentRecord['scheduleExceptions'][number];
  } {
    const exception = resolveExceptionPrecedence(
      getApplicableExceptions(department.scheduleExceptions, localDate),
    );
    const regular = department.schedules.find((s) => s.dayOfWeek === dayOfWeek);
    const regularIntervals = regular?.isOpen ? intervalsFrom(regular) : [];
    if (exception?.type === 'FULLY_CLOSED')
      return { intervals: [], reason: 'EXCEPTION_FULLY_CLOSED', exception };
    if (exception?.type === 'PARTIALLY_OPEN')
      return { intervals: intervalsFrom(exception), reason: 'EXCEPTION_PARTIALLY_OPEN', exception };
    if (exception?.type === 'PARTIALLY_CLOSED')
      return {
        intervals: subtractIntervals(regularIntervals, intervalsFrom(exception)),
        reason: 'EXCEPTION_PARTIALLY_CLOSED',
        exception,
      };
    if (department.schedules.length === 0)
      return { intervals: [], reason: 'NO_SCHEDULE_CONFIGURED' };
    if (!regular?.isOpen || regularIntervals.length === 0)
      return { intervals: [], reason: 'CLOSED_DAY' };
    return { intervals: regularIntervals, reason: 'REGULAR_SCHEDULE' };
  }

  private nextAvailableAt(
    department: DepartmentRecord,
    localDate: string,
    minute: number,
  ): string | null {
    for (let offset = 0; offset <= NEXT_AVAILABILITY_HORIZON_DAYS; offset += 1) {
      const date = addDays(parseDateOnly(localDate), offset).toISOString().slice(0, 10);
      const dayOfWeek = INDEX_TO_DAY[addDays(parseDateOnly(localDate), offset).getUTCDay()];
      const { intervals } = this.effectiveIntervals(department, date, dayOfWeek);
      for (const interval of intervals) {
        if (offset > 0 || timeToMinutes(interval.startTime) > minute)
          return zonedDateTimeIso(date, interval.startTime, DEFAULT_DEPARTMENT_TIMEZONE);
      }
      minute = -1;
    }
    return null;
  }

  private appliedException(exception: DepartmentRecord['scheduleExceptions'][number]): {
    id: string;
    type: DepartmentScheduleExceptionType;
    recurrenceType: DepartmentExceptionRecurrenceType;
    reason?: string;
  } {
    return {
      id: exception.id,
      type: exception.type as DepartmentScheduleExceptionType,
      recurrenceType: exception.recurrenceType as DepartmentExceptionRecurrenceType,
      reason: exception.reason ?? undefined,
    };
  }

  private toResponse(item: DepartmentRecord): DepartmentResponse {
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      description: item.description ?? undefined,
      isActive: item.isActive,
      keywords: item.keywords,
      schedule: (item.schedules ?? []).map((s) => ({
        dayOfWeek: s.dayOfWeek as DepartmentDayOfWeek,
        isOpen: s.isOpen,
        intervals: intervalsFrom(s),
      })),
      scheduleExceptions: (item.scheduleExceptions ?? []).map((e) => ({
        type: e.type as DepartmentScheduleExceptionType,
        recurrenceType: e.recurrenceType as DepartmentExceptionRecurrenceType,
        startDate: e.startDate ? toDateOnlyString(e.startDate) : undefined,
        endDate: e.endDate ? toDateOnlyString(e.endDate) : undefined,
        recurrenceStartsOn: e.recurrenceStartsOn
          ? toDateOnlyString(e.recurrenceStartsOn)
          : undefined,
        recurrenceEndsOn: e.recurrenceEndsOn ? toDateOnlyString(e.recurrenceEndsOn) : null,
        yearlyStartMonth: e.yearlyStartMonth ?? undefined,
        yearlyStartDay: e.yearlyStartDay ?? undefined,
        yearlyEndMonth: e.yearlyEndMonth ?? undefined,
        yearlyEndDay: e.yearlyEndDay ?? undefined,
        weeklyAnchorDate: e.weeklyAnchorDate ? toDateOnlyString(e.weeklyAnchorDate) : undefined,
        weekdays: e.weekdays as DepartmentDayOfWeek[],
        reason: e.reason ?? undefined,
        intervals: intervalsFrom(e),
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
