import { AttendanceStatus, EventStatus, Prisma, RegistrationStatus } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';

const registrationSelect = {
  id: true,
  eventId: true,
  citizenId: true,
  registrationStatus: true,
  attendanceStatus: true,
  checkedInAt: true,
  sourceChannel: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  citizen: {
    select: { id: true, name: true, phone: true },
  },
} as const;

export type RegistrationRecord = Prisma.EventRegistrationGetPayload<{
  select: typeof registrationSelect;
}>;

export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEventByIdWithStatusCapacity(eventId: string): Promise<{
    id: string;
    status: EventStatus;
    capacity: number | null;
  } | null> {
    // Sin filtro de visibilidad: el panel admin gestiona asistencia de eventos
    // públicos y privados. Las superficies públicas filtran antes de llegar aquí.
    return this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, capacity: true },
    });
  }

  async eventExists(eventId: string): Promise<boolean> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    return !!event;
  }

  async findCitizenByIdMinimal(citizenId: string): Promise<{ id: string } | null> {
    return this.prisma.citizen.findUnique({ where: { id: citizenId }, select: { id: true } });
  }

  async findRegistrationByEventCitizen(
    eventId: string,
    citizenId: string,
  ): Promise<{
    id: string;
    registrationStatus: RegistrationStatus;
  } | null> {
    return this.prisma.eventRegistration.findUnique({
      where: { eventId_citizenId: { eventId, citizenId } },
      select: { id: true, registrationStatus: true },
    });
  }

  async countActiveRegistrationsForCapacity(eventId: string): Promise<number> {
    return this.prisma.eventRegistration.count({
      where: {
        eventId,
        registrationStatus: {
          in: [RegistrationStatus.registered, RegistrationStatus.confirmed],
        },
      },
    });
  }

  async updateRegistration(
    registrationId: string,
    data: {
      registrationStatus?: RegistrationStatus;
      attendanceStatus?: AttendanceStatus;
      checkedInAt?: Date | null;
      notes?: string;
    },
  ): Promise<RegistrationRecord> {
    return this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        ...(data.registrationStatus !== undefined
          ? { registrationStatus: data.registrationStatus }
          : {}),
        ...(data.attendanceStatus !== undefined ? { attendanceStatus: data.attendanceStatus } : {}),
        ...(data.checkedInAt !== undefined ? { checkedInAt: data.checkedInAt } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      select: registrationSelect,
    });
  }

  async createRegistration(data: {
    eventId: string;
    citizenId: string;
    registrationStatus: RegistrationStatus;
    notes?: string;
    sourceChannel: 'web' | 'whatsapp' | 'event' | 'referral' | 'other';
  }): Promise<RegistrationRecord> {
    return this.prisma.eventRegistration.create({
      data,
      select: registrationSelect,
    });
  }

  async checkIn(
    registrationId: string,
    params: {
      eventId: string;
      checkedInByUserId?: string;
      notes?: string;
      checkedAt: Date;
    },
  ): Promise<RegistrationRecord> {
    const [updated] = await this.prisma.$transaction([
      this.prisma.eventRegistration.update({
        where: { id: registrationId },
        data: {
          attendanceStatus: AttendanceStatus.attended,
          checkedInAt: params.checkedAt,
        },
        select: registrationSelect,
      }),
      this.prisma.eventCheckin.create({
        data: {
          eventId: params.eventId,
          registrationId,
          checkedInBy: params.checkedInByUserId,
          notes: params.notes,
        },
      }),
    ]);

    return updated;
  }

  async findRegistrationByIdAndEvent(
    registrationId: string,
    eventId: string,
  ): Promise<RegistrationRecord | null> {
    return this.prisma.eventRegistration.findFirst({
      where: { id: registrationId, eventId },
      select: registrationSelect,
    });
  }

  async listRegistrations(params: {
    eventId: string;
    cursor?: string;
    limit: number;
    registrationStatus?: RegistrationStatus;
    attendanceStatus?: AttendanceStatus;
  }): Promise<{ items: RegistrationRecord[]; hasNextPage: boolean }> {
    const where: Prisma.EventRegistrationWhereInput = { eventId: params.eventId };
    if (params.registrationStatus !== undefined)
      where.registrationStatus = params.registrationStatus;
    if (params.attendanceStatus !== undefined) where.attendanceStatus = params.attendanceStatus;

    const rows = await this.prisma.eventRegistration.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: params.limit + 1,
      ...(params.cursor !== undefined ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: registrationSelect,
    });

    const hasNextPage = rows.length > params.limit;
    const items = hasNextPage ? rows.slice(0, params.limit) : rows;
    return { items, hasNextPage };
  }
}
