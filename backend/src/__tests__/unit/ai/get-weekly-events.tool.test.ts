/**
 * Unit tests: GetWeeklyEventsTool
 *
 * Casos:
 *  - Input inválido → error estructurado INVALID_INPUT
 *  - Rango de semana correcto (lunes 00:00 local → lunes próximo, extremo EXCLUSIVO)
 *    con fechas conocidas cerca del límite (domingo y lunes como "now" inyectado)
 *  - Filtros en memoria: dia_semana, categoria, ubicacion (sin acentos) y requiere_registro
 *  - Derivación de cupo: abierto / disponible / agotado
 *  - found=false con message cuando no hay eventos
 *  - Fuente ausente → no-source message
 *  - Error de la fuente → { error: 'EXECUTION_ERROR', ... }
 *  - limite aplicado DESPUÉS de los filtros
 */
import { EventType } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import {
  EventRegistrationsSource,
  GetWeeklyEventsTool,
  WeeklyEventsSource,
} from '../../../ai/tools/get-weekly-events.tool';

/** Reloj congelado: martes 2026-09-01 18:30Z (= 12:30 local, UTC-6). */
const FROZEN_NOW = new Date('2026-09-01T18:30:00.000Z');

type FakeEvent = {
  id: string;
  title: string;
  description: string | null;
  // EventType | string — cualquier string adicional (fakes/tests).
  eventType: EventType | (string & {});
  startsAt: Date;
  endsAt: Date | null;
  locationName: string | null;
  address: string | null;
  capacity: number | null;
};

function makeEvent(overrides: Partial<FakeEvent> = {}): FakeEvent {
  return {
    id: 'evt-001',
    title: 'Evento de prueba',
    description: null,
    eventType: EventType.townhall,
    startsAt: new Date('2026-09-01T15:00:00.000Z'), // martes 09:00 local
    endsAt: null,
    locationName: 'Parque Central',
    address: 'Av. Central 100',
    capacity: null,
    ...overrides,
  };
}

function makeEventsSource(events: FakeEvent[]) {
  return {
    listPublishedInWeek: jest.fn<WeeklyEventsSource['listPublishedInWeek']>().mockResolvedValue(events),
  };
}

function makeRegistrationsSource(counts: Record<string, number> = {}) {
  return {
    countActiveRegistrationsByEvent:
      jest
        .fn<EventRegistrationsSource['countActiveRegistrationsByEvent']>()
        .mockResolvedValue(counts),
  };
}

function makeTool(
  eventsSource: ReturnType<typeof makeEventsSource> | undefined,
  registrationsSource: ReturnType<typeof makeRegistrationsSource> = makeRegistrationsSource(),
  now: Date = FROZEN_NOW,
): GetWeeklyEventsTool {
  return new GetWeeklyEventsTool(eventsSource, registrationsSource, now);
}

describe('GetWeeklyEventsTool', () => {
  it('devuelve INVALID_INPUT cuando categoria no está en el enum', async () => {
    const tool = makeTool(makeEventsSource([]));
    const result = await tool.execute({ categoria: 'festival' });

    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
    expect(result).toHaveProperty('details');
  });

  it('calcula el rango de la semana (lunes 00:00 local → lunes próximo, extremo exclusivo)', async () => {
    const eventsSource = makeEventsSource([]);
    const tool = makeTool(eventsSource);

    await tool.execute({});

    expect(eventsSource.listPublishedInWeek).toHaveBeenCalledTimes(1);
    expect(eventsSource.listPublishedInWeek).toHaveBeenCalledWith(
      new Date('2026-08-31T06:00:00.000Z'), // lunes 00:00 local
      new Date('2026-09-07T06:00:00.000Z'), // lunes próximo 00:00 local (exclusivo)
      50,
    );
  });

  it('trata un DOMINGO como parte de la semana en curso', async () => {
    const eventsSource = makeEventsSource([]);
    const tool = makeTool(eventsSource, undefined, new Date('2026-09-06T20:00:00.000Z'));

    await tool.execute({});

    expect(eventsSource.listPublishedInWeek).toHaveBeenCalledWith(
      new Date('2026-08-31T06:00:00.000Z'),
      new Date('2026-09-07T06:00:00.000Z'),
      50,
    );
  });

  it('trata un LUNES como inicio de la nueva semana', async () => {
    const eventsSource = makeEventsSource([]);
    const tool = makeTool(eventsSource, undefined, new Date('2026-09-07T06:30:00.000Z'));

    await tool.execute({});

    expect(eventsSource.listPublishedInWeek).toHaveBeenCalledWith(
      new Date('2026-09-07T06:00:00.000Z'),
      new Date('2026-09-14T06:00:00.000Z'),
      50,
    );
  });

  it('filtra por dia_semana comparando el día local normalizado sin acentos', async () => {
    const events = [
      makeEvent({ id: 'e-martes', title: 'Audiencia', startsAt: new Date('2026-09-01T15:00:00.000Z') }),
      makeEvent({
        id: 'e-sabado',
        title: 'Feria',
        eventType: EventType.community,
        startsAt: new Date('2026-09-05T17:00:00.000Z'), // sábado 11:00 local
      }),
    ];
    const tool = makeTool(makeEventsSource(events));

    const result = (await tool.execute({ dia_semana: 'sabado' })) as {
      found: boolean;
      items: Array<{ id: string }>;
    };

    expect(result.found).toBe(true);
    expect(result.items.map((item) => item.id)).toEqual(['e-sabado']);
  });

  it('filtra por categoria (map asamblea → townhall)', async () => {
    const events = [
      makeEvent({ id: 'e-asamblea', title: 'Audiencia' }),
      makeEvent({ id: 'e-generico', title: 'Taller', eventType: EventType.community }),
    ];
    const tool = makeTool(makeEventsSource(events));

    const result = (await tool.execute({ categoria: 'asamblea' })) as {
      found: boolean;
      items: Array<{ id: string }>;
    };

    expect(result.items.map((item) => item.id)).toEqual(['e-asamblea']);
  });

  it('filtra por ubicacion normalizando (match con/sin acentos y en minúsculas)', async () => {
    const events = [
      makeEvent({ id: 'e-parque', title: 'Concierto', locationName: 'Parque Central' }),
      makeEvent({
        id: 'e-agora',
        title: 'Mesa de trabajo',
        locationName: 'Ágora Municipal',
        address: 'Calle Hidalgo 45',
      }),
    ];
    const tool = makeTool(makeEventsSource(events));

    const porAgora = (await tool.execute({ ubicacion: 'agora' })) as { items: Array<{ id: string }> };
    expect(porAgora.items.map((item) => item.id)).toEqual(['e-agora']);

    const porParque = (await tool.execute({ ubicacion: 'parque' })) as {
      items: Array<{ id: string }>;
    };
    expect(porParque.items.map((item) => item.id)).toEqual(['e-parque']);

    // Address también cuenta
    const porHidalgo = (await tool.execute({ ubicacion: 'hidalgo' })) as {
      items: Array<{ id: string }>;
    };
    expect(porHidalgo.items.map((item) => item.id)).toEqual(['e-agora']);
  });

  it('filtra por requiere_registro (true → solo con cupo; false → solo entrada libre)', async () => {
    const events = [
      makeEvent({ id: 'e-cupo', title: 'Audiencia', capacity: 80 }),
      makeEvent({ id: 'e-libre', title: 'Feria', capacity: null }),
    ];
    const tool = makeTool(makeEventsSource(events));

    const conRegistro = (await tool.execute({ requiere_registro: true })) as {
      items: Array<{ id: string }>;
    };
    expect(conRegistro.items.map((item) => item.id)).toEqual(['e-cupo']);

    const sinRegistro = (await tool.execute({ requiere_registro: false })) as {
      items: Array<{ id: string }>;
    };
    expect(sinRegistro.items.map((item) => item.id)).toEqual(['e-libre']);
  });

  it('deriva cupo abierto cuando capacity es null', async () => {
    const tool = makeTool(makeEventsSource([makeEvent({ id: 'e-libre', capacity: null })]));

    const result = (await tool.execute({})) as { items: Array<{ cupo: unknown }> };

    expect(result.items[0].cupo).toEqual({
      requiereRegistro: false,
      total: null,
      registrados: null,
      disponibles: null,
      estado: 'abierto',
    });
  });

  it('deriva cupo disponible con lugares restantes correctos', async () => {
    const tool = makeTool(
      makeEventsSource([makeEvent({ id: 'e-cupo', title: 'Audiencia', capacity: 80 })]),
      makeRegistrationsSource({ 'e-cupo': 12 }),
    );

    const result = (await tool.execute({})) as { items: Array<{ cupo: unknown }> };

    expect(result.items[0].cupo).toEqual({
      requiereRegistro: true,
      total: 80,
      registrados: 12,
      disponibles: 68,
      estado: 'disponible',
    });
  });

  it('deriva cupo agotado cuando registrados >= capacity (nunca negativos)', async () => {
    const tool = makeTool(
      makeEventsSource([makeEvent({ id: 'e-lleno', title: 'Mitin', capacity: 5 })]),
      makeRegistrationsSource({ 'e-lleno': 7 }),
    );

    const result = (await tool.execute({})) as { items: Array<{ cupo: unknown }> };

    expect(result.items[0].cupo).toEqual({
      requiereRegistro: true,
      total: 5,
      registrados: 7,
      disponibles: 0,
      estado: 'agotado',
    });
  });

  it('devuelve found=false con message cuando no hay eventos publicados', async () => {
    const tool = makeTool(makeEventsSource([]));

    const result = (await tool.execute({})) as {
      found: boolean;
      source: string;
      message: string;
      items: unknown[];
      semana: { inicio: string; fin: string };
    };

    expect(result.found).toBe(false);
    expect(result.source).toBe('events-db');
    expect(result.message).toBe('No hay eventos publicados para esa semana o con esos filtros.');
    expect(result.items).toEqual([]);
    expect(result.semana).toEqual({
      inicio: '2026-08-31T06:00:00.000Z',
      fin: '2026-09-07T06:00:00.000Z',
    });
  });

  it('devuelve found=false con message cuando no hay fuente inyectada', async () => {
    const tool = makeTool(undefined);

    const result = (await tool.execute({})) as { found: boolean; message: string; items: unknown[] };

    expect(result.found).toBe(false);
    expect(result.message).toBe('No hay una fuente de eventos disponible en este momento.');
    expect(result.items).toEqual([]);
  });

  it('devuelve EXECUTION_ERROR cuando la fuente falla', async () => {
    const eventsSource = makeEventsSource([]);
    eventsSource.listPublishedInWeek.mockRejectedValue(new Error('boom db'));
    const tool = makeTool(eventsSource);

    const result = (await tool.execute({})) as { error: string; source: string; message: string };

    expect(result).toMatchObject({
      error: 'EXECUTION_ERROR',
      source: 'events-db',
      message: 'boom db',
    });
  });

  it('aplica limite DESPUÉS de los filtros (y usa default 5 cuando se omite)', async () => {
    const events = Array.from({ length: 6 }, (_, i) =>
      makeEvent({ id: `e-${i}`, title: `Asamblea ${i}`, eventType: EventType.townhall }),
    );
    const tool = makeTool(makeEventsSource(events));

    const conLimite = (await tool.execute({ categoria: 'asamblea', limite: 3 })) as {
      items: Array<{ id: string }>;
    };
    expect(conLimite.items).toHaveLength(3);

    const porDefecto = (await tool.execute({ categoria: 'asamblea' })) as {
      items: Array<{ id: string }>;
    };
    expect(porDefecto.items).toHaveLength(5);
  });

  it('arma el output completo con semana, items y tipo en español', async () => {
    const events = [
      makeEvent({
        id: 'e-mitin',
        title: 'Mitin de campaña',
        description: 'Evento abierto. Requiere identificación.',
        eventType: EventType.rally,
        startsAt: new Date('2026-09-05T15:00:00.000Z'),
        endsAt: new Date('2026-09-05T18:00:00.000Z'),
        locationName: 'Plaza Principal',
        address: 'Centro',
        capacity: 10,
      }),
    ];
    const tool = makeTool(makeEventsSource(events), makeRegistrationsSource({ 'e-mitin': 4 }));

    const result = (await tool.execute({})) as {
      found: boolean;
      source: string;
      semana: { inicio: string; fin: string };
      items: Array<{
        id: string;
        titulo: string;
        descripcion: string | null;
        tipo: string;
        inicio: string;
        fin: string | null;
        ubicacion: { nombre: string | null; direccion: string | null };
        cupo: { estado: string };
        infoAdicional: string | null;
      }>;
    };

    expect(result.found).toBe(true);
    expect(result.source).toBe('events-db');
    expect(result.items[0]).toMatchObject({
      id: 'e-mitin',
      titulo: 'Mitin de campaña',
      descripcion: 'Evento abierto. Requiere identificación.',
      tipo: 'mitin',
      inicio: '2026-09-05T15:00:00.000Z',
      fin: '2026-09-05T18:00:00.000Z',
      ubicacion: { nombre: 'Plaza Principal', direccion: 'Centro' },
      cupo: { estado: 'disponible' },
      infoAdicional: 'Evento abierto. Requiere identificación.',
    });
    expect(result.semana.inicio).toBe('2026-08-31T06:00:00.000Z');
    expect(result.semana.fin).toBe('2026-09-07T06:00:00.000Z');
  });
});