import { Prisma } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';

const departmentInclude = {
  schedules: {
    include: { intervals: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { dayOfWeek: 'asc' },
  },
  scheduleExceptions: {
    include: { intervals: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  },
} as const;

const departmentSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  serviceHours: true,
  serviceSchedule: true,
  isActive: true,
  keywords: true,
  createdAt: true,
  updatedAt: true,
  ...departmentInclude,
} as const;

export type DepartmentRecord = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;
export type DepartmentTx = Prisma.TransactionClient;

export class DepartmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(fn: (tx: DepartmentTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  async list(params: {
    where: Prisma.DepartmentWhereInput;
    cursor?: string;
    limit: number;
  }): Promise<DepartmentRecord[]> {
    return this.prisma.department.findMany({
      where: params.where,
      orderBy: { id: 'asc' },
      take: params.limit + 1,
      ...(params.cursor !== undefined ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: departmentSelect,
    });
  }

  async listActive(limit: number): Promise<DepartmentRecord[]> {
    return this.prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      take: limit,
      select: departmentSelect,
    });
  }

  async listActiveForResolution(): Promise<Array<{ slug: string; name: string }>> {
    return this.prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { slug: true, name: true },
    });
  }

  async findBySlug(slug: string): Promise<{ id: string } | null> {
    return this.prisma.department.findUnique({ where: { slug }, select: { id: true } });
  }

  async findForAvailabilityBySlug(slug: string, localDate: Date): Promise<DepartmentRecord | null> {
    return this.prisma.department.findUnique({
      where: { slug },
      select: {
        ...departmentSelect,
        scheduleExceptions: {
          where: {
            OR: [
              {
                recurrenceType: 'NONE',
                startDate: { lte: localDate },
                endDate: { gte: localDate },
              },
              {
                recurrenceType: { not: 'NONE' },
                recurrenceStartsOn: { lte: localDate },
                OR: [{ recurrenceEndsOn: null }, { recurrenceEndsOn: { gte: localDate } }],
              },
            ],
          },
          include: { intervals: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findHoursBySlug(slug: string): Promise<{
    slug: string;
    name: string;
    isActive: boolean;
    serviceHours: string | null;
    serviceSchedule: Prisma.JsonValue | null;
  } | null> {
    return this.prisma.department.findUnique({
      where: { slug },
      select: { slug: true, name: true, isActive: true, serviceHours: true, serviceSchedule: true },
    });
  }

  async findById(id: string): Promise<DepartmentRecord | null> {
    return this.prisma.department.findUnique({ where: { id }, select: departmentSelect });
  }

  async findByIds(ids: string[]): Promise<{ id: string; slug: string; isActive: boolean }[]> {
    if (ids.length === 0) return [];
    return this.prisma.department.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, isActive: true },
    });
  }

  async findByIdWithSlug(id: string): Promise<{ id: string; slug: string } | null> {
    return this.prisma.department.findUnique({ where: { id }, select: { id: true, slug: true } });
  }

  async create(
    data: {
      slug: string;
      name: string;
      description?: string;
      isActive: boolean;
      keywords: string[];
      serviceHours?: string;
      serviceSchedule?: Prisma.InputJsonValue;
    },
    tx: DepartmentTx = this.prisma,
  ): Promise<DepartmentRecord> {
    return tx.department.create({ data, select: departmentSelect });
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      keywords?: string[];
      serviceHours?: string | null;
      serviceSchedule?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    },
    tx: DepartmentTx = this.prisma,
  ): Promise<DepartmentRecord> {
    return tx.department.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.keywords !== undefined ? { keywords: data.keywords } : {}),
        ...(data.serviceHours !== undefined ? { serviceHours: data.serviceHours } : {}),
        ...(data.serviceSchedule !== undefined ? { serviceSchedule: data.serviceSchedule } : {}),
      },
      select: departmentSelect,
    });
  }

  async replaceSchedules(
    departmentId: string,
    schedule: Array<{
      dayOfWeek: Prisma.DepartmentScheduleCreateWithoutDepartmentInput['dayOfWeek'];
      isOpen: boolean;
      intervals: Array<{ startTime: string; endTime: string }>;
    }>,
    tx: DepartmentTx,
  ): Promise<void> {
    await tx.departmentSchedule.deleteMany({ where: { departmentId } });
    for (const day of schedule) {
      await tx.departmentSchedule.create({
        data: {
          departmentId,
          dayOfWeek: day.dayOfWeek,
          isOpen: day.isOpen,
          intervals: { create: day.intervals.map((i, idx) => ({ ...i, sortOrder: idx })) },
        },
      });
    }
  }

  async replaceExceptions(
    departmentId: string,
    exceptions: Array<{
      type: Prisma.DepartmentScheduleExceptionCreateWithoutDepartmentInput['type'];
      recurrenceType: Prisma.DepartmentScheduleExceptionCreateWithoutDepartmentInput['recurrenceType'];
      startDate?: Date;
      endDate?: Date;
      recurrenceStartsOn?: Date;
      recurrenceEndsOn?: Date | null;
      yearlyStartMonth?: number;
      yearlyStartDay?: number;
      yearlyEndMonth?: number;
      yearlyEndDay?: number;
      weeklyAnchorDate?: Date;
      weekdays?: Prisma.DepartmentScheduleExceptionCreateWithoutDepartmentInput['weekdays'];
      reason?: string;
      intervals: Array<{ startTime: string; endTime: string }>;
    }>,
    tx: DepartmentTx,
  ): Promise<void> {
    await tx.departmentScheduleException.deleteMany({ where: { departmentId } });
    for (const item of exceptions) {
      await tx.departmentScheduleException.create({
        data: {
          departmentId,
          type: item.type,
          recurrenceType: item.recurrenceType,
          startDate: item.startDate,
          endDate: item.endDate,
          recurrenceStartsOn: item.recurrenceStartsOn,
          recurrenceEndsOn: item.recurrenceEndsOn,
          yearlyStartMonth: item.yearlyStartMonth,
          yearlyStartDay: item.yearlyStartDay,
          yearlyEndMonth: item.yearlyEndMonth,
          yearlyEndDay: item.yearlyEndDay,
          weeklyAnchorDate: item.weeklyAnchorDate,
          weekdays: item.weekdays ?? [],
          reason: item.reason,
          intervals: { create: item.intervals.map((i, idx) => ({ ...i, sortOrder: idx })) },
        },
      });
    }
  }
}
