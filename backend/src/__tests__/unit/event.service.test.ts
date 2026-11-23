import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventStatus, EventType, EventVisibility } from '@prisma/client';

import {
  CreateEventSchema,
  EventService,
  InviteBodySchema,
  toSlug,
  UpdateEventSchema,
} from '../../services/event.service';
import { AppError } from '../../utils/app-error';

type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

const ORGANIZER_ID = '550e8400-e29b-41d4-a716-446655440001';
const EVENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TAG_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    title: 'Asamblea vecinal',
    slug: 'asamblea-vecinal',
    description: null,
    eventType: EventType.townhall,
    status: EventStatus.draft,
    visibility: EventVisibility.public,
    startsAt: new Date('2026-05-10T18:00:00.000Z'),
    endsAt: null,
    locationName: 'Salón Municipal',
    neighborhood: 'Centro',
    address: null,
    latitude: null,
    longitude: null,
    capacity: null,
    organizerUserId: ORGANIZER_ID,
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    updatedAt: new Date('2026-04-27T00:00:00.000Z'),
    ...overrides,
  };
}

function makeInvitationEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    title: 'Asamblea vecinal',
    status: EventStatus.published,
    visibility: EventVisibility.public,
    startsAt: new Date('2026-05-10T18:00:00.000Z'),
    locationName: 'Salón Municipal',
    ...overrides,
  };
}

function createService() {
  const events = {
    findBySlug: jest.fn<AsyncFn<[string], { id: string } | null>>(),
    create: jest.fn<AsyncFn<[unknown], ReturnType<typeof makeRecord>>>(),
    findById: jest.fn<AsyncFn<[string], ReturnType<typeof makeRecord> | null>>(),
    update: jest.fn<AsyncFn<[string, unknown], ReturnType<typeof makeRecord>>>(),
    list: jest.fn<
      AsyncFn<
        [{ where?: unknown; cursor?: unknown; limit?: unknown }],
        { items: ReturnType<typeof makeRecord>[]; hasNextPage: boolean }
      >
    >(),
    findInvitationEvent:
      jest.fn<AsyncFn<[string], ReturnType<typeof makeInvitationEvent> | null>>(),
    findCitizenIdsByTagIds: jest.fn<AsyncFn<[string[]], string[]>>(),
    findRegistrationsAndCitizensForInvite: jest.fn<
      AsyncFn<
        [string, string[]],
        {
          registrations: Array<{
            id: string;
            citizenId: string;
            registrationStatus: string;
          }>;
          citizens: Array<{ id: string; phone: string; name: string | null }>;
        }
      >
    >(),
    createInvitedRegistration: jest.fn<AsyncFn<[string, string], void>>(),
  };
  const outbox = { enqueue: jest.fn<AsyncFn<[unknown, unknown, unknown], unknown>>() };
  const service = new EventService(events as never, outbox as never);
  return { service, events, outbox };
}

describe('toSlug', () => {
  it('normaliza acentos y caracteres especiales', () => {
    expect(toSlug('Jornada en Ñuñez / Centro')).toBe('jornada-en-nunez-centro');
  });

  it('usa un fallback cuando el título no produce un slug válido', () => {
    expect(toSlug('!!!')).toBe('evento');
  });
});

describe('CreateEventSchema', () => {
  it('rechaza slug, coordenadas y organizador enviados por el cliente', () => {
    const result = CreateEventSchema.safeParse({
      title: 'Asamblea vecinal',
      startsAt: '2026-05-10T18:00:00.000Z',
      slug: 'cliente-slug',
      organizerUserId: ORGANIZER_ID,
      latitude: -16.75,
    });
    expect(result.success).toBe(false);
  });

  it('rechaza un fin anterior o igual al inicio', () => {
    const result = CreateEventSchema.safeParse({
      title: 'Asamblea vecinal',
      startsAt: '2026-05-10T18:00:00.000Z',
      endsAt: '2026-05-10T17:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('acepta visibility public o private', () => {
    const result = CreateEventSchema.safeParse({
      title: 'Reunión de equipo',
      startsAt: '2026-05-10T18:00:00.000Z',
      visibility: 'private',
    });
    expect(result.success).toBe(true);
  });

  it('rechaza un valor de visibility desconocido', () => {
    const result = CreateEventSchema.safeParse({
      title: 'Reunión de equipo',
      startsAt: '2026-05-10T18:00:00.000Z',
      visibility: 'internal',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateEventSchema', () => {
  it('no permite cambiar el slug', () => {
    const result = UpdateEventSchema.safeParse({ slug: 'nuevo-slug' });
    expect(result.success).toBe(false);
  });

  it('acepta cambiar la visibilidad', () => {
    const result = UpdateEventSchema.safeParse({ visibility: 'private' });
    expect(result.success).toBe(true);
  });
});

describe('EventService.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asigna el organizador autenticado y genera el slug desde el título', async () => {
    const { service, events } = createService();
    events.findBySlug.mockResolvedValue(null);
    events.create.mockResolvedValue(makeRecord());

    const created = await service.create(
      CreateEventSchema.parse({
        title: 'Asamblea vecinal',
        startsAt: '2026-05-10T18:00:00.000Z',
        neighborhood: 'Centro',
      }),
      ORGANIZER_ID,
    );

    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'asamblea-vecinal',
        organizerUserId: ORGANIZER_ID,
        neighborhood: 'Centro',
      }),
    );
    expect(created.organizerUserId).toBe(ORGANIZER_ID);
    expect(created.neighborhood).toBe('Centro');
  });

  it('por defecto crea un evento público', async () => {
    const { service, events } = createService();
    events.findBySlug.mockResolvedValue(null);
    events.create.mockResolvedValue(makeRecord());

    await service.create(
      CreateEventSchema.parse({
        title: 'Asamblea vecinal',
        startsAt: '2026-05-10T18:00:00.000Z',
      }),
      ORGANIZER_ID,
    );

    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: EventVisibility.public }),
    );
  });

  it('crea un evento privado cuando se envía visibility private', async () => {
    const { service, events } = createService();
    events.findBySlug.mockResolvedValue(null);
    events.create.mockResolvedValue(makeRecord({ visibility: EventVisibility.private }));

    const created = await service.create(
      CreateEventSchema.parse({
        title: 'Reunión de equipo',
        startsAt: '2026-05-10T18:00:00.000Z',
        visibility: 'private',
      }),
      ORGANIZER_ID,
    );

    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: EventVisibility.private }),
    );
    expect(created.visibility).toBe(EventVisibility.private);
  });

  it('añade un sufijo cuando el slug ya existe', async () => {
    const { service, events } = createService();
    events.findBySlug.mockImplementation(async (slug) =>
      slug === 'asamblea-vecinal' ? { id: 'other' } : null,
    );
    events.create.mockResolvedValue(makeRecord({ slug: 'asamblea-vecinal-2' }));

    await service.create(
      CreateEventSchema.parse({
        title: 'Asamblea vecinal',
        startsAt: '2026-05-10T18:00:00.000Z',
      }),
      ORGANIZER_ID,
    );

    expect(events.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'asamblea-vecinal-2' }),
    );
  });

  it('reintenta el slug cuando hay una carrera P2002', async () => {
    const { service, events } = createService();
    events.findBySlug.mockResolvedValue(null);
    events.create
      .mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      )
      .mockResolvedValueOnce(makeRecord({ slug: 'asamblea-vecinal-2' }));

    const created = await service.create(
      CreateEventSchema.parse({
        title: 'Asamblea vecinal',
        startsAt: '2026-05-10T18:00:00.000Z',
      }),
      ORGANIZER_ID,
    );

    expect(events.create).toHaveBeenCalledTimes(2);
    expect(created.slug).toBe('asamblea-vecinal-2');
  });
});

describe('EventService.list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lista eventos públicos y privados sin filtro de visibilidad', async () => {
    const { service, events } = createService();
    events.list.mockResolvedValue({ items: [], hasNextPage: false });

    await service.list({ cursor: undefined, limit: 20, filters: {} });

    expect(events.list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ visibility: expect.anything() }),
      }),
    );
  });

  it('aplica el filtro de visibilidad cuando se pide', async () => {
    const { service, events } = createService();
    events.list.mockResolvedValue({ items: [], hasNextPage: false });

    await service.list({
      cursor: undefined,
      limit: 20,
      filters: { visibility: EventVisibility.private },
    });

    expect(events.list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visibility: EventVisibility.private }),
      }),
    );
  });
});

describe('EventService.update', () => {
  it('rechaza un rango inválido combinando fechas existentes', async () => {
    const { service, events } = createService();
    events.findById.mockResolvedValue(
      makeRecord({
        startsAt: new Date('2026-05-10T18:00:00.000Z'),
        endsAt: new Date('2026-05-10T20:00:00.000Z'),
      }),
    );

    await expect(
      service.update(EVENT_ID, UpdateEventSchema.parse({ endsAt: '2026-05-10T17:00:00.000Z' })),
    ).rejects.toMatchObject({ statusCode: 400 } satisfies Partial<AppError>);
  });

  it('no reescribe el slug al cambiar el título', async () => {
    const { service, events } = createService();
    events.findById.mockResolvedValue(makeRecord());
    events.update.mockResolvedValue(makeRecord({ title: 'Nuevo título' }));

    await service.update(EVENT_ID, UpdateEventSchema.parse({ title: 'Nuevo título' }));

    expect(events.update).toHaveBeenCalledWith(
      EVENT_ID,
      expect.not.objectContaining({ slug: expect.anything() }),
    );
  });

  it('actualiza la visibilidad de un evento', async () => {
    const { service, events } = createService();
    events.findById.mockResolvedValue(makeRecord());
    events.update.mockResolvedValue(makeRecord({ visibility: EventVisibility.private }));

    const updated = await service.update(
      EVENT_ID,
      UpdateEventSchema.parse({ visibility: 'private' }),
    );

    expect(events.update).toHaveBeenCalledWith(
      EVENT_ID,
      expect.objectContaining({ visibility: EventVisibility.private }),
    );
    expect(updated.visibility).toBe(EventVisibility.private);
  });
});

describe('EventService.invite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('envía invitaciones masivas de un evento privado como si fuera público', async () => {
    const { service, events, outbox } = createService();
    const citizenId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    events.findInvitationEvent.mockResolvedValue(
      makeInvitationEvent({ visibility: EventVisibility.private }),
    );
    events.findCitizenIdsByTagIds.mockResolvedValue([citizenId]);
    events.findRegistrationsAndCitizensForInvite.mockResolvedValue({
      registrations: [],
      citizens: [{ id: citizenId, phone: '9611234567', name: 'María' }],
    });
    events.createInvitedRegistration.mockResolvedValue(undefined);

    const result = await service.invite(
      EVENT_ID,
      InviteBodySchema.parse({ message: 'Veni', tagIds: [TAG_ID] }),
    );

    expect(result).toEqual({ queued: 1, alreadyInvited: 0 });
    expect(events.createInvitedRegistration).toHaveBeenCalledWith(EVENT_ID, citizenId);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
  });
});
