import {
  DepartmentDayOfWeek,
  DepartmentScheduleExceptionType,
  Prisma,
  PrismaClient,
} from '@prisma/client';

const DEFAULT_DEPARTMENT_TIMEZONE = 'America/Mexico_City';
const ALL_DAYS = [
  DepartmentDayOfWeek.MONDAY,
  DepartmentDayOfWeek.TUESDAY,
  DepartmentDayOfWeek.WEDNESDAY,
  DepartmentDayOfWeek.THURSDAY,
  DepartmentDayOfWeek.FRIDAY,
  DepartmentDayOfWeek.SATURDAY,
  DepartmentDayOfWeek.SUNDAY,
] as const;
const DAY_TO_LEGACY_INDEX: Record<DepartmentDayOfWeek, number> = {
  [DepartmentDayOfWeek.SUNDAY]: 0,
  [DepartmentDayOfWeek.MONDAY]: 1,
  [DepartmentDayOfWeek.TUESDAY]: 2,
  [DepartmentDayOfWeek.WEDNESDAY]: 3,
  [DepartmentDayOfWeek.THURSDAY]: 4,
  [DepartmentDayOfWeek.FRIDAY]: 5,
  [DepartmentDayOfWeek.SATURDAY]: 6,
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type TimeIntervalSeed = {
  startTime: string;
  endTime: string;
};

type WeeklyScheduleSeed = {
  dayOfWeek: DepartmentDayOfWeek;
  isOpen: boolean;
  intervals: TimeIntervalSeed[];
};

type ScheduleExceptionSeed = {
  type: DepartmentScheduleExceptionType;
  startDate: string;
  endDate: string;
  reason?: string;
  intervals: TimeIntervalSeed[];
};

type DepartmentSeed = {
  slug: string;
  name: string;
  description: string;
  serviceHours: string;
  isActive: boolean;
  keywords: string[];
  schedule: WeeklyScheduleSeed[];
  demoScheduleExceptions?: ScheduleExceptionSeed[];
};

type DepartmentTx = Prisma.TransactionClient;

type SeedDepartmentResult = {
  created: boolean;
  scheduleDays: number;
  scheduleIntervals: number;
  exceptionsCreated: number;
  exceptionsUpdated: number;
};

const SEED_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function createWeekdaySchedule(startTime = '08:00', endTime = '15:00'): WeeklyScheduleSeed[] {
  return ALL_DAYS.map((dayOfWeek) => {
    const isOpen =
      dayOfWeek !== DepartmentDayOfWeek.SATURDAY && dayOfWeek !== DepartmentDayOfWeek.SUNDAY;
    return {
      dayOfWeek,
      isOpen,
      intervals: isOpen ? [{ startTime, endTime }] : [],
    };
  });
}

function withDaySchedule(
  schedule: WeeklyScheduleSeed[],
  dayOfWeek: DepartmentDayOfWeek,
  intervals: TimeIntervalSeed[],
): WeeklyScheduleSeed[] {
  return schedule.map((day) =>
    day.dayOfWeek === dayOfWeek
      ? {
          dayOfWeek,
          isOpen: intervals.length > 0,
          intervals: intervals.map((interval) => ({ ...interval })),
        }
      : { ...day, intervals: day.intervals.map((interval) => ({ ...interval })) },
  );
}

function createDailySchedule(startTime: string, endTime: string): WeeklyScheduleSeed[] {
  return ALL_DAYS.map((dayOfWeek) => ({
    dayOfWeek,
    isOpen: true,
    intervals: [{ startTime, endTime }],
  }));
}

function createUtcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

const shouldSeedDemoExceptions =
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

const DEPARTMENTS: DepartmentSeed[] = [
  {
    slug: 'general',
    name: 'Atención General',
    description: 'Canal de atención ciudadana general y consultas no categorizadas.',
    serviceHours: 'Lunes a viernes de 9:00 a 16:00 hrs',
    isActive: true,
    schedule: createWeekdaySchedule('09:00', '16:00'),
    keywords: [],
    demoScheduleExceptions: [
      {
        type: DepartmentScheduleExceptionType.PARTIALLY_OPEN,
        startDate: '2027-01-05',
        endDate: '2027-01-05',
        reason: 'Horario especial de atención',
        intervals: [{ startTime: '09:00', endTime: '12:00' }],
      },
      {
        type: DepartmentScheduleExceptionType.PARTIALLY_CLOSED,
        startDate: '2027-01-06',
        endDate: '2027-01-06',
        reason: 'Suspensión parcial del servicio',
        intervals: [{ startTime: '11:00', endTime: '13:00' }],
      },
      {
        type: DepartmentScheduleExceptionType.FULLY_CLOSED,
        startDate: '2027-01-07',
        endDate: '2027-01-08',
        reason: 'Suspensión temporal de atención',
        intervals: [],
      },
    ],
  },
  {
    slug: 'obras_publicas',
    name: 'Obras Públicas',
    description: 'Baches, alumbrado, banquetas, drenaje, pavimentación y obra pública en general.',
    serviceHours:
      'Lunes a viernes de 8:00 a 15:00 hrs; lunes con atención vespertina de 16:00 a 18:00 hrs',
    isActive: true,
    schedule: withDaySchedule(createWeekdaySchedule(), DepartmentDayOfWeek.MONDAY, [
      { startTime: '08:00', endTime: '13:00' },
      { startTime: '16:00', endTime: '18:00' },
    ]),
    keywords: [
      'bache',
      'baches',
      'alumbrado',
      'luz',
      'poste',
      'banqueta',
      'drenaje',
      'alcantarilla',
      'pavimento',
      'calle',
      'obra',
      'construccion',
      'grieta',
      'fuga',
      'agua',
      'tubo',
    ],
  },
  {
    slug: 'seguridad',
    name: 'Seguridad Pública',
    description: 'Reportes de inseguridad, vandalismo, accidentes y emergencias.',
    serviceHours: 'Atención 24/7 para emergencias',
    isActive: true,
    schedule: createDailySchedule('00:00', '23:59'),
    keywords: [
      'robo',
      'asalto',
      'accidente',
      'violencia',
      'pelea',
      'emergencia',
      'policia',
      'seguridad',
      'vandalismo',
      'graffiti',
      'zona de riesgo',
      'peligro',
    ],
  },
  {
    slug: 'salud',
    name: 'Salud',
    description: 'Centro de salud, vacunas, saneamiento y servicios médicos municipales.',
    serviceHours: 'Lunes a viernes de 8:00 a 16:00 hrs',
    isActive: true,
    schedule: createWeekdaySchedule('08:00', '16:00'),
    keywords: [
      'salud',
      'medico',
      'doctor',
      'enfermedad',
      'vacuna',
      'clinica',
      'hospital',
      'dengue',
      'zancudo',
      'fumigacion',
      'basura',
      'sanidad',
      'plaga',
    ],
  },
  {
    slug: 'educacion',
    name: 'Educación',
    description: 'Escuelas, becas, programas educativos y cultura.',
    serviceHours: 'Lunes a viernes de 9:00 a 15:00 hrs',
    isActive: true,
    schedule: createWeekdaySchedule('09:00', '15:00'),
    keywords: [
      'escuela',
      'educacion',
      'primaria',
      'secundaria',
      'beca',
      'kinder',
      'preescolar',
      'maestro',
      'salon',
      'biblioteca',
      'cultura',
    ],
  },
  {
    slug: 'medio_ambiente',
    name: 'Medio Ambiente',
    description: 'Recolección de basura, parques, árboles, contaminación.',
    serviceHours: 'Lunes a sábado de 7:00 a 14:00 hrs',
    isActive: true,
    schedule: withDaySchedule(
      createWeekdaySchedule('07:00', '14:00'),
      DepartmentDayOfWeek.SATURDAY,
      [{ startTime: '07:00', endTime: '14:00' }],
    ),
    keywords: [
      'basura',
      'recoleccion',
      'reciclaje',
      'arbol',
      'parque',
      'jardin',
      'contaminacion',
      'quema',
      'humo',
      'residuos',
      'limpieza',
      'poda',
    ],
  },
  {
    slug: 'tramites',
    name: 'Trámites y Servicios',
    description: 'Pagos, licencias, permisos, actas y trámites municipales.',
    serviceHours: 'Lunes a viernes de 8:30 a 15:30 hrs',
    isActive: true,
    schedule: createWeekdaySchedule('08:30', '15:30'),
    keywords: [
      'tramite',
      'permiso',
      'licencia',
      'pago',
      'acta',
      'predial',
      'agua potable',
      'catastro',
      'certificado',
      'adeudo',
      'multa',
      'servicio',
    ],
  },
];

function timeToMinutes(value: string): number {
  if (!HHMM.test(value)) throw new Error(`Hora inválida: ${value}`);
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function normalizeIntervals(intervals: TimeIntervalSeed[], context: string): TimeIntervalSeed[] {
  const sorted = intervals
    .map((interval) => {
      const startTime = interval.startTime.trim();
      const endTime = interval.endTime.trim();
      if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
        throw new Error(
          `${context} tiene un intervalo inválido o cruza medianoche: ${startTime}-${endTime}`,
        );
      }
      return { startTime, endTime };
    })
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (prev.startTime === current.startTime && prev.endTime === current.endTime) {
      throw new Error(
        `${context} tiene intervalos duplicados: ${current.startTime}-${current.endTime}`,
      );
    }
    if (timeToMinutes(current.startTime) < timeToMinutes(prev.endTime)) {
      throw new Error(
        `${context} tiene intervalos solapados: ${prev.startTime}-${prev.endTime} y ${current.startTime}-${current.endTime}`,
      );
    }
  }
  return sorted;
}

function getScheduleExceptions(department: DepartmentSeed): ScheduleExceptionSeed[] {
  return shouldSeedDemoExceptions ? (department.demoScheduleExceptions ?? []) : [];
}

function validateDepartmentsSeed(departments: DepartmentSeed[]): void {
  const errors: string[] = [];
  const slugs = new Set<string>();
  for (const department of departments) {
    if (slugs.has(department.slug)) errors.push(`Slug duplicado: ${department.slug}`);
    slugs.add(department.slug);
    if (department.name.trim().length === 0)
      errors.push(`Department "${department.slug}" tiene nombre vacío.`);
    const seenDays = new Set<DepartmentDayOfWeek>();
    for (const day of department.schedule) {
      if (seenDays.has(day.dayOfWeek))
        errors.push(`Department "${department.slug}" tiene día duplicado: ${day.dayOfWeek}.`);
      seenDays.add(day.dayOfWeek);
      if (!day.isOpen && day.intervals.length > 0)
        errors.push(
          `Department "${department.slug}" tiene intervalos en día cerrado: ${day.dayOfWeek}.`,
        );
      if (day.isOpen && day.intervals.length === 0)
        errors.push(
          `Department "${department.slug}" tiene día abierto sin intervalos: ${day.dayOfWeek}.`,
        );
      try {
        normalizeIntervals(day.intervals, `Department "${department.slug}" ${day.dayOfWeek}`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    for (const expectedDay of ALL_DAYS) {
      if (!seenDays.has(expectedDay))
        errors.push(`Department "${department.slug}" no define ${expectedDay}.`);
    }
    const exceptions = getScheduleExceptions(department)
      .map((exception) => {
        if (!DATE_ONLY.test(exception.startDate) || !DATE_ONLY.test(exception.endDate))
          errors.push(`Department "${department.slug}" tiene fecha de excepción inválida.`);
        if (exception.startDate > exception.endDate)
          errors.push(
            `Department "${department.slug}" tiene excepción con fecha inicial posterior a final.`,
          );
        try {
          normalizeIntervals(
            exception.intervals,
            `Department "${department.slug}" excepción ${exception.type}`,
          );
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
        if (
          exception.type === DepartmentScheduleExceptionType.FULLY_CLOSED &&
          exception.intervals.length > 0
        )
          errors.push(`Department "${department.slug}" tiene FULLY_CLOSED con intervalos.`);
        if (
          exception.type !== DepartmentScheduleExceptionType.FULLY_CLOSED &&
          exception.intervals.length === 0
        )
          errors.push(`Department "${department.slug}" tiene ${exception.type} sin intervalos.`);
        return exception;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let i = 1; i < exceptions.length; i += 1) {
      if (exceptions[i].startDate <= exceptions[i - 1].endDate)
        errors.push(`Department "${department.slug}" tiene excepciones solapadas.`);
    }
  }
  if (errors.length > 0)
    throw new Error(`Seed configuration error:\n${errors.map((error) => `- ${error}`).join('\n')}`);
}

function scheduleToLegacyJson(schedule: WeeklyScheduleSeed[]): Prisma.InputJsonValue {
  const days: Record<string, Array<{ open: string; close: string }>> = {};
  for (const day of schedule) {
    if (day.isOpen) {
      days[String(DAY_TO_LEGACY_INDEX[day.dayOfWeek])] = day.intervals.map((interval) => ({
        open: interval.startTime,
        close: interval.endTime,
      }));
    }
  }
  return { timezone: DEFAULT_DEPARTMENT_TIMEZONE, days };
}

async function synchronizeDepartmentSchedule(
  tx: DepartmentTx,
  departmentId: string,
  schedule: WeeklyScheduleSeed[],
): Promise<{ days: number; intervals: number }> {
  const openDays = schedule.filter((day) => day.isOpen).map((day) => day.dayOfWeek);
  const closedDays = schedule.filter((day) => !day.isOpen).map((day) => day.dayOfWeek);
  await tx.departmentSchedule.createMany({
    data: schedule.map((day) => ({ departmentId, dayOfWeek: day.dayOfWeek, isOpen: day.isOpen })),
    skipDuplicates: true,
  });
  if (openDays.length > 0)
    await tx.departmentSchedule.updateMany({
      where: { departmentId, dayOfWeek: { in: openDays } },
      data: { isOpen: true },
    });
  if (closedDays.length > 0)
    await tx.departmentSchedule.updateMany({
      where: { departmentId, dayOfWeek: { in: closedDays } },
      data: { isOpen: false },
    });
  const rows = await tx.departmentSchedule.findMany({
    where: { departmentId, dayOfWeek: { in: schedule.map((day) => day.dayOfWeek) } },
    select: { id: true, dayOfWeek: true },
  });
  const scheduleIds = new Map(rows.map((row) => [row.dayOfWeek, row.id]));
  await tx.departmentScheduleInterval.deleteMany({
    where: { scheduleId: { in: rows.map((row) => row.id) } },
  });
  const intervals = schedule.flatMap((day) => {
    const scheduleId = scheduleIds.get(day.dayOfWeek);
    if (!scheduleId) throw new Error(`No se creó el horario ${day.dayOfWeek}.`);
    return day.intervals.map((interval, sortOrder) => ({ scheduleId, ...interval, sortOrder }));
  });
  if (intervals.length > 0) await tx.departmentScheduleInterval.createMany({ data: intervals });
  await tx.departmentSchedule.deleteMany({
    where: { departmentId, dayOfWeek: { notIn: schedule.map((day) => day.dayOfWeek) } },
  });
  return { days: schedule.length, intervals: intervals.length };
}

function exceptionKey(
  exception: Pick<ScheduleExceptionSeed, 'type' | 'startDate' | 'endDate' | 'reason'>,
): string {
  return [exception.type, exception.startDate, exception.endDate, exception.reason ?? ''].join('|');
}

async function synchronizeDepartmentExceptions(
  tx: DepartmentTx,
  departmentId: string,
  exceptions: ScheduleExceptionSeed[],
): Promise<{ created: number; updated: number }> {
  if (exceptions.length === 0) return { created: 0, updated: 0 };
  const existingRows = await tx.departmentScheduleException.findMany({
    where: {
      departmentId,
      OR: exceptions.map((exception) => ({
        type: exception.type,
        startDate: createUtcDate(exception.startDate),
        endDate: createUtcDate(exception.endDate),
        reason: exception.reason ?? null,
      })),
    },
    select: { id: true, type: true, startDate: true, endDate: true, reason: true },
  });
  const existingByKey = new Map(
    existingRows.map((row) => [
      exceptionKey({
        type: row.type,
        startDate: row.startDate?.toISOString().slice(0, 10) ?? '',
        endDate: row.endDate?.toISOString().slice(0, 10) ?? '',
        reason: row.reason ?? undefined,
      }),
      row.id,
    ]),
  );
  const synchronized: Array<{ id: string; exception: ScheduleExceptionSeed }> = [];
  let created = 0;
  for (const exception of exceptions) {
    const startDate = createUtcDate(exception.startDate);
    const endDate = createUtcDate(exception.endDate);
    const existingId = existingByKey.get(exceptionKey(exception));
    const row = existingId
      ? { id: existingId }
      : await tx.departmentScheduleException.create({
          data: {
            departmentId,
            type: exception.type,
            startDate,
            endDate,
            reason: exception.reason,
          },
          select: { id: true },
        });
    if (!existingId) created += 1;
    synchronized.push({ id: row.id, exception });
  }
  await tx.departmentExceptionInterval.deleteMany({
    where: { exceptionId: { in: synchronized.map((row) => row.id) } },
  });
  const intervals = synchronized.flatMap(({ id, exception }) =>
    exception.intervals.map((interval, sortOrder) => ({
      exceptionId: id,
      ...interval,
      sortOrder,
    })),
  );
  if (intervals.length > 0) await tx.departmentExceptionInterval.createMany({ data: intervals });
  return { created, updated: exceptions.length - created };
}

async function seedDepartment(
  prisma: PrismaClient,
  data: DepartmentSeed,
): Promise<SeedDepartmentResult> {
  const existing = await prisma.department.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  const department = await prisma.department.upsert({
    where: { slug: data.slug },
    update: {
      name: data.name,
      description: data.description,
      serviceHours: data.serviceHours,
      serviceSchedule: scheduleToLegacyJson(data.schedule),
      keywords: data.keywords,
      isActive: data.isActive,
    },
    create: {
      slug: data.slug,
      name: data.name,
      description: data.description,
      serviceHours: data.serviceHours,
      serviceSchedule: scheduleToLegacyJson(data.schedule),
      keywords: data.keywords,
      isActive: data.isActive,
    },
    select: { id: true },
  });
  const schedule = await prisma.$transaction(
    (tx) => synchronizeDepartmentSchedule(tx, department.id, data.schedule),
    SEED_TRANSACTION_OPTIONS,
  );
  const configuredExceptions = getScheduleExceptions(data);
  const exceptions =
    configuredExceptions.length === 0
      ? { created: 0, updated: 0 }
      : await prisma.$transaction(
          (tx) => synchronizeDepartmentExceptions(tx, department.id, configuredExceptions),
          SEED_TRANSACTION_OPTIONS,
        );
  return {
    created: existing === null,
    scheduleDays: schedule.days,
    scheduleIntervals: schedule.intervals,
    exceptionsCreated: exceptions.created,
    exceptionsUpdated: exceptions.updated,
  };
}

export async function seedDepartments(prisma: PrismaClient): Promise<void> {
  console.log('🌱 Seeding departments...');
  validateDepartmentsSeed(DEPARTMENTS);
  let created = 0;
  let updated = 0;
  let scheduleDays = 0;
  let scheduleIntervals = 0;
  let exceptionsCreated = 0;
  let exceptionsUpdated = 0;
  for (const department of DEPARTMENTS) {
    const result = await seedDepartment(prisma, department);
    if (result.created) created += 1;
    else updated += 1;
    scheduleDays += result.scheduleDays;
    scheduleIntervals += result.scheduleIntervals;
    exceptionsCreated += result.exceptionsCreated;
    exceptionsUpdated += result.exceptionsUpdated;
    console.log(
      `✓ Department ${result.created ? 'created' : 'updated'}: ${department.name}; schedule days=${result.scheduleDays}, intervals=${result.scheduleIntervals}, exceptions created=${result.exceptionsCreated}, updated=${result.exceptionsUpdated}`,
    );
  }
  console.log(
    `✅ Departments seed completed: ${DEPARTMENTS.length} processed (${created} created, ${updated} updated, ${scheduleDays} days, ${scheduleIntervals} intervals, ${exceptionsCreated} exceptions created, ${exceptionsUpdated} exceptions updated).`,
  );
}
