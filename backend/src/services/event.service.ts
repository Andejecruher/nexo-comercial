/**
 * EventService — lógica de negocio para eventos ciudadanos.
 */
import {
  EventStatus,
  EventType,
  EventVisibility,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import { z } from 'zod';

import type { EventRecord, EventRepository } from '../repositories';
import { WaTextOutbound } from '../types/whatsapp.types';
import { AppError } from '../utils/app-error';
import { OutboxProcessorService } from './events/outbox-processor.service';

export function toSlug(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 255);

  return slug.length >= 2 ? slug : 'evento';
}

const IsoDateSchema = z.coerce.date();

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

function isUniqueConstraint(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}

function assertEndAfterStart(startsAt: Date, endsAt: Date | undefined): void {
  if (endsAt !== undefined && endsAt.getTime() <= startsAt.getTime()) {
    throw AppError.badRequest('La fecha de fin debe ser posterior a la de inicio');
  }
}

export const CreateEventSchema = z
  .object({
    title: z.string().trim().min(2).max(255),
    description: optionalTrimmed(10_000),
    eventType: z.nativeEnum(EventType).optional(),
    status: z.nativeEnum(EventStatus).optional(),
    visibility: z.nativeEnum(EventVisibility).optional(),
    startsAt: IsoDateSchema,
    endsAt: IsoDateSchema.optional(),
    locationName: optionalTrimmed(255),
    neighborhood: optionalTrimmed(255),
    address: optionalTrimmed(500),
    capacity: z.number().int().positive().optional(),
  })
  .strict()
  .refine((d) => d.endsAt === undefined || d.endsAt.getTime() > d.startsAt.getTime(), {
    message: 'La fecha de fin debe ser posterior a la de inicio',
    path: ['endsAt'],
  });

export const UpdateEventSchema = z
  .object({
    title: z.string().trim().min(2).max(255).optional(),
    description: optionalTrimmed(10_000),
    eventType: z.nativeEnum(EventType).optional(),
    status: z.nativeEnum(EventStatus).optional(),
    visibility: z.nativeEnum(EventVisibility).optional(),
    startsAt: IsoDateSchema.optional(),
    endsAt: IsoDateSchema.optional(),
    locationName: optionalTrimmed(255),
    neighborhood: optionalTrimmed(255),
    address: optionalTrimmed(500),
    capacity: z.number().int().positive().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: 'Al menos un campo debe ser enviado' })
  .refine(
    (d) =>
      d.startsAt === undefined ||
      d.endsAt === undefined ||
      d.endsAt.getTime() > d.startsAt.getTime(),
    {
      message: 'La fecha de fin debe ser posterior a la de inicio',
      path: ['endsAt'],
    },
  );

export const EventIdParamSchema = z.object({ id: z.string().uuid() });

export const EventListFiltersSchema = z.object({
  search: z.string().trim().min(1).max(255).optional(),
  status: z.nativeEnum(EventStatus).optional(),
  eventType: z.nativeEnum(EventType).optional(),
  visibility: z.nativeEnum(EventVisibility).optional(),
  organizerUserId: z.string().uuid().optional(),
});

export const InviteBodySchema = z
  .object({
    message: z.string().trim().min(1).max(1024),
    tagIds: z.array(z.string().uuid()).min(1).optional(),
    neighborhoodIds: z.array(z.string().uuid()).min(1).optional(),
  })
  .refine(
    (d) =>
      (d.tagIds !== undefined && d.tagIds.length > 0) ||
      (d.neighborhoodIds !== undefined && d.neighborhoodIds.length > 0),
    { message: 'Debe especificar al menos tagIds o neighborhoodIds para segmentar la invitación' },
  );

type CreateEventInput = z.infer<typeof CreateEventSchema>;
type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
type EventListFilters = z.infer<typeof EventListFiltersSchema>;
type InviteBody = z.infer<typeof InviteBodySchema>;

export type EventResponse = {
  id: string;
  title: string;
  slug: string;
  description: string | undefined;
  eventType: string;
  status: string;
  visibility: EventVisibility;
  startsAt: Date;
  endsAt: Date | undefined;
  locationName: string | undefined;
  neighborhood: string | undefined;
  address: string | undefined;
  latitude: string | undefined;
  longitude: string | undefined;
  capacity: number | undefined;
  organizerUserId: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type EventListResult = {
  items: EventResponse[];
  meta: {
    nextCursor: string | undefined;
    hasNextPage: boolean;
    count: number;
  };
};

export type InviteResult = {
  queued: number;
  alreadyInvited: number;
};

export class EventService {
  constructor(
    private readonly events: EventRepository,
    private readonly outboxProcessor: OutboxProcessorService,
  ) {}

  async create(input: CreateEventInput, organizerUserId: string): Promise<EventResponse> {
    assertEndAfterStart(input.startsAt, input.endsAt);

    let slug = await this.allocateUniqueSlug(toSlug(input.title));

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await this.events.create({
          title: input.title,
          slug,
          description: input.description,
          eventType: input.eventType,
          status: input.status ?? EventStatus.draft,
          visibility: input.visibility ?? EventVisibility.public,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          locationName: input.locationName,
          neighborhood: input.neighborhood,
          address: input.address,
          capacity: input.capacity,
          organizerUserId,
        });

        return this.toResponse(created);
      } catch (err) {
        if (!isUniqueConstraint(err) || attempt === 4) throw err;
        slug = await this.allocateUniqueSlug(`${toSlug(input.title)}-${attempt + 2}`);
      }
    }

    throw AppError.conflict('Ya existe un evento con ese slug');
  }

  async list(params: {
    cursor: string | undefined;
    limit: number;
    filters: EventListFilters;
  }): Promise<EventListResult> {
    const where: Prisma.EventWhereInput = {};

    if (params.filters.status !== undefined) where.status = params.filters.status;
    if (params.filters.eventType !== undefined) where.eventType = params.filters.eventType;
    if (params.filters.visibility !== undefined) where.visibility = params.filters.visibility;
    if (params.filters.organizerUserId !== undefined)
      where.organizerUserId = params.filters.organizerUserId;
    if (params.filters.search !== undefined) {
      const s = params.filters.search.trim();
      where.OR = [
        { title: { contains: s, mode: 'insensitive' } },
        { slug: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
        { locationName: { contains: s, mode: 'insensitive' } },
        { neighborhood: { contains: s, mode: 'insensitive' } },
      ];
    }

    const { items, hasNextPage } = await this.events.list({
      where,
      cursor: params.cursor,
      limit: params.limit,
    });

    return {
      items: items.map((r) => this.toResponse(r)),
      meta: {
        nextCursor: hasNextPage ? items[items.length - 1]?.id : undefined,
        hasNextPage,
        count: items.length,
      },
    };
  }

  async getById(id: string): Promise<EventResponse> {
    const event = await this.events.findById(id);
    if (!event) throw AppError.notFound('Evento no encontrado');
    return this.toResponse(event);
  }

  async update(id: string, input: UpdateEventInput): Promise<EventResponse> {
    const existing = await this.events.findById(id);
    if (!existing) throw AppError.notFound('Evento no encontrado');

    const nextStartsAt = input.startsAt ?? existing.startsAt;
    const nextEndsAt = input.endsAt ?? existing.endsAt ?? undefined;
    assertEndAfterStart(nextStartsAt, nextEndsAt);

    const updated = await this.events.update(id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.locationName !== undefined ? { locationName: input.locationName } : {}),
      ...(input.neighborhood !== undefined ? { neighborhood: input.neighborhood } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    });

    return this.toResponse(updated);
  }

  async invite(eventId: string, input: InviteBody): Promise<InviteResult> {
    const event = await this.events.findInvitationEvent(eventId);
    if (!event) throw AppError.notFound('Evento no encontrado');
    if (event.status === EventStatus.cancelled) {
      throw AppError.badRequest('No se pueden enviar invitaciones a un evento cancelado');
    }
    if (event.status === EventStatus.completed) {
      throw AppError.badRequest('No se pueden enviar invitaciones a un evento ya completado');
    }

    const citizenIdsByTag =
      input.tagIds && input.tagIds.length > 0
        ? await this.events.findCitizenIdsByTagIds(input.tagIds)
        : [];
    const citizenIdsByNeighborhood =
      input.neighborhoodIds && input.neighborhoodIds.length > 0
        ? await this.events.findCitizenIdsByNeighborhoodIds(input.neighborhoodIds)
        : [];

    const allCitizenIds = [...new Set([...citizenIdsByTag, ...citizenIdsByNeighborhood])];
    if (allCitizenIds.length === 0) return { queued: 0, alreadyInvited: 0 };

    const { registrations: existingRegs, citizens } =
      await this.events.findRegistrationsAndCitizensForInvite(eventId, allCitizenIds);

    const regByCitizen = new Map(existingRegs.map((r) => [r.citizenId, r]));
    const citizenMap = new Map(citizens.map((c) => [c.id, c]));

    let queued = 0;
    let alreadyInvited = 0;

    const ACTIVE_STATUSES: RegistrationStatus[] = [
      RegistrationStatus.invited,
      RegistrationStatus.registered,
      RegistrationStatus.confirmed,
      RegistrationStatus.waitlist,
    ];

    for (const citizenId of allCitizenIds) {
      const citizen = citizenMap.get(citizenId);
      if (!citizen) continue;

      const existing = regByCitizen.get(citizenId);
      if (existing && ACTIVE_STATUSES.includes(existing.registrationStatus)) {
        alreadyInvited++;
        continue;
      }

      if (existing) {
        await this.events.updateRegistrationToInvited(existing.id);
      } else {
        await this.events.createInvitedRegistration(eventId, citizenId);
      }

      const idempotencyKey = `invite:${eventId}:${citizenId}`;
      const waPayload: WaTextOutbound = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: citizen.phone,
        type: 'text',
        text: { body: input.message },
      };

      await this.outboxProcessor.enqueue(citizen.phone, waPayload, idempotencyKey);
      queued++;
    }

    return { queued, alreadyInvited };
  }

  private async allocateUniqueSlug(base: string): Promise<string> {
    const root = toSlug(base);
    for (let i = 0; i < 50; i++) {
      const suffix = i === 0 ? '' : `-${i + 1}`;
      const candidate = `${root.slice(0, 255 - suffix.length)}${suffix}`;
      const existing = await this.events.findBySlug(candidate);
      if (!existing) return candidate;
    }
    throw AppError.conflict('No se pudo generar un slug único');
  }

  private toResponse(item: EventRecord): EventResponse {
    return {
      id: item.id,
      title: item.title,
      slug: item.slug,
      description: item.description ?? undefined,
      eventType: item.eventType,
      status: item.status,
      visibility: item.visibility,
      startsAt: item.startsAt,
      endsAt: item.endsAt ?? undefined,
      locationName: item.locationName ?? undefined,
      neighborhood: item.neighborhood ?? undefined,
      address: item.address ?? undefined,
      latitude: item.latitude?.toString() ?? undefined,
      longitude: item.longitude?.toString() ?? undefined,
      capacity: item.capacity ?? undefined,
      organizerUserId: item.organizerUserId ?? undefined,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
