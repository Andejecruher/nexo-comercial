import {
  EventStatus,
  EventVisibility,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaService } from '../services/prisma.service';

const eventSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  eventType: true,
  status: true,
  visibility: true,
  startsAt: true,
  endsAt: true,
  locationName: true,
  neighborhood: true,
  address: true,
  latitude: true,
  longitude: true,
  capacity: true,
  organizerUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const publicEventSelect = {
  id: true,
  title: true,
  description: true,
  eventType: true,
  startsAt: true,
  endsAt: true,
  locationName: true,
  address: true,
  capacity: true,
} as const;

export type EventRecord = Prisma.EventGetPayload<{ select: typeof eventSelect }>;
export type PublicEventRow = Prisma.EventGetPayload<{ select: typeof publicEventSelect }>;

export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string): Promise<{ id: string } | null> {
    return this.prisma.event.findUnique({ where: { slug }, select: { id: true } });
  }

  async create(data: Prisma.EventUncheckedCreateInput): Promise<EventRecord> {
    return this.prisma.event.create({ data, select: eventSelect });
  }

  async list(params: {
    where: Prisma.EventWhereInput;
    cursor?: string;
    limit: number;
  }): Promise<{ items: EventRecord[]; hasNextPage: boolean }> {
    const rows = await this.prisma.event.findMany({
      where: params.where,
      orderBy: { startsAt: 'asc' },
      take: params.limit + 1,
      ...(params.cursor !== undefined ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: eventSelect,
    });

    const hasNextPage = rows.length > params.limit;
    const items = hasNextPage ? rows.slice(0, params.limit) : rows;
    return { items, hasNextPage };
  }

  async findById(id: string): Promise<EventRecord | null> {
    return this.prisma.event.findFirst({
      where: { id },
      select: eventSelect,
    });
  }

  async findByIdWithSlug(id: string): Promise<{ id: string; slug: string } | null> {
    return this.prisma.event.findUnique({ where: { id }, select: { id: true, slug: true } });
  }

  async update(id: string, data: Prisma.EventUncheckedUpdateInput): Promise<EventRecord> {
    return this.prisma.event.update({ where: { id }, data, select: eventSelect });
  }

  async findInvitationEvent(eventId: string): Promise<{
    id: string;
    title: string;
    status: EventStatus;
    visibility: EventVisibility;
    startsAt: Date;
    locationName: string | null;
  } | null> {
    return this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        status: true,
        visibility: true,
        startsAt: true,
        locationName: true,
      },
    });
  }

  async findCitizenIdsByTagIds(tagIds: string[]): Promise<string[]> {
    const rows = await this.prisma.citizenTag.findMany({
      where: { tagId: { in: tagIds } },
      select: { citizenId: true },
      distinct: ['citizenId'],
    });
    return rows.map((r) => r.citizenId);
  }

  async findCitizenIdsByNeighborhoodIds(neighborhoodIds: string[]): Promise<string[]> {
    const rows = await this.prisma.citizen.findMany({
      where: { neighborhoodId: { in: neighborhoodIds } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async findRegistrationsAndCitizensForInvite(
    eventId: string,
    citizenIds: string[],
  ): Promise<{
    registrations: Array<{ id: string; citizenId: string; registrationStatus: RegistrationStatus }>;
    citizens: Array<{ id: string; phone: string; name: string | null }>;
  }> {
    const [registrations, citizens] = await Promise.all([
      this.prisma.eventRegistration.findMany({
        where: { eventId, citizenId: { in: citizenIds } },
        select: { id: true, citizenId: true, registrationStatus: true },
      }),
      this.prisma.citizen.findMany({
        where: { id: { in: citizenIds } },
        select: { id: true, phone: true, name: true },
      }),
    ]);

    return {
      registrations,
      citizens: citizens.filter(
        (citizen): citizen is { id: string; phone: string; name: string | null } =>
          citizen.phone !== null,
      ),
    };
  }

  async updateRegistrationToInvited(registrationId: string): Promise<void> {
    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: { registrationStatus: RegistrationStatus.invited },
    });
  }

  async createInvitedRegistration(eventId: string, citizenId: string): Promise<void> {
    await this.prisma.eventRegistration.create({
      data: {
        eventId,
        citizenId,
        registrationStatus: RegistrationStatus.invited,
        sourceChannel: 'whatsapp',
      },
    });
  }

  /**
   * Lista próximos eventos publicados (a partir de `fromUtc`, por defecto ahora),
   * ordenados por fecha de inicio ascendente. Usado por la IA (getMunicipalInfo).
   */
  async listUpcomingPublished(
    limit: number,
    fromUtc: Date = new Date(),
  ): Promise<PublicEventRow[]> {
    return this.prisma.event.findMany({
      where: {
        visibility: EventVisibility.public,
        status: EventStatus.published,
        startsAt: { gte: fromUtc },
      },
      orderBy: { startsAt: 'asc' },
      take: limit,
      select: publicEventSelect,
    });
  }

  async listPublishedInRange(rangeStartUtc: Date, rangeEndUtc: Date): Promise<PublicEventRow[]> {
    return this.prisma.event.findMany({
      where: {
        visibility: EventVisibility.public,
        status: EventStatus.published,
        startsAt: { gte: rangeStartUtc, lte: rangeEndUtc },
      },
      orderBy: { startsAt: 'asc' },
      select: publicEventSelect,
    });
  }

  /**
   * Lista eventos publicados dentro de una semana calendario (rango UTC),
   * con extremo superior EXCLUSIVO (`lt`). Usado por la IA (getWeeklyEvents).
   */
  async listPublishedInWeek(
    weekStartUtc: Date,
    weekEndUtc: Date,
    limit: number,
  ): Promise<PublicEventRow[]> {
    return this.prisma.event.findMany({
      where: {
        visibility: EventVisibility.public,
        status: EventStatus.published,
        startsAt: { gte: weekStartUtc, lt: weekEndUtc },
      },
      orderBy: { startsAt: 'asc' },
      take: limit,
      select: publicEventSelect,
    });
  }

  /**
   * Cuenta registros ACTIVOS (invited/registered/confirmed) por evento.
   * NO cuenta cancelled ni waitlist. Devuelve {} si no hay eventIds.
   */
  async countActiveRegistrationsByEvent(eventIds: string[]): Promise<Record<string, number>> {
    if (eventIds.length === 0) {
      return {};
    }

    const rows = await this.prisma.eventRegistration.groupBy({
      by: ['eventId'],
      where: {
        eventId: { in: eventIds },
        registrationStatus: {
          in: [
            RegistrationStatus.invited,
            RegistrationStatus.registered,
            RegistrationStatus.confirmed,
          ],
        },
      },
      _count: { _all: true },
    });

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.eventId] = row._count._all;
      return acc;
    }, {});
  }

  async findPublishedInRangeById(
    eventId: string,
    rangeStartUtc: Date,
    rangeEndUtc: Date,
  ): Promise<{ id: string } | null> {
    return this.prisma.event.findFirst({
      where: {
        id: eventId,
        visibility: EventVisibility.public,
        status: EventStatus.published,
        startsAt: { gte: rangeStartUtc, lte: rangeEndUtc },
      },
      select: { id: true },
    });
  }
}
