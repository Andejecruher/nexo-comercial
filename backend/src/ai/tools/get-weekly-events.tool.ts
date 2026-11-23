/**
 * GetWeeklyEventsTool — internal AI tool (consulta de eventos de la semana actual).
 *
 * Responsabilidad:
 *  - Responder consultas de eventos municipales de la SEMANA ACTUAL (lunes a
 *    domingo en America/Mexico_City) con datos de cupo/aforo.
 *  - Filtros opcionales: categoria, dia_semana, ubicacion, requiere_registro y limite.
 *  - Fuente DINÁMICA (repositorios reales inyectables para tests sin DB).
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 * No lanza — devuelve error estructurado { error } para que el orchestrador lo maneje.
 */
import { EventType } from '@prisma/client';
import { addDays, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { z } from 'zod';

/** Zona horaria fija del municipio. */
const TZ = 'America/Mexico_City';

/** Cap de fetch contra la fuente (los filtros se aplican en memoria después). */
const FETCH_LIMIT = 50;

/** Fuente de eventos publicados (subset usado por la tool). */
export interface WeeklyEventsSource {
  listPublishedInWeek(
    weekStartUtc: Date,
    weekEndUtc: Date,
    limit: number,
  ): Promise<
    Array<{
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
    }>
  >;
}

/** Fuente de registros activos por evento (subset usado por la tool). */
export interface EventRegistrationsSource {
  countActiveRegistrationsByEvent(eventIds: string[]): Promise<Record<string, number>>;
}

const categorias = ['asamblea', 'comunidad', 'voluntariado', 'campana', 'mitin'] as const;
const diasSemana = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo',
] as const;

const getWeeklyEventsSchema = z.object({
  categoria: z.enum(categorias).optional(),
  // Sin acentos adrede: 'miercoles' y 'sabado' no llevan tilde en el schema.
  dia_semana: z.enum(diasSemana).optional(),
  ubicacion: z.string().trim().min(2).max(120).optional(),
  requiere_registro: z.boolean().optional(),
  limite: z.number().int().min(1).max(10).default(5),
});

type Categoria = (typeof categorias)[number];

/** Mapeo categoria (schema LLM) → EventType (Prisma). */
const CATEGORIA_TO_EVENT_TYPE: Record<Categoria, EventType> = {
  asamblea: EventType.townhall,
  comunidad: EventType.community,
  voluntariado: EventType.volunteer,
  campana: EventType.campaign,
  mitin: EventType.rally,
};

/** Etiqueta en español para exponer el tipo de evento al LLM. */
const EVENT_TYPE_TO_TIPO: Record<string, string> = {
  [EventType.townhall]: 'asamblea',
  [EventType.community]: 'comunidad',
  [EventType.volunteer]: 'voluntariado',
  [EventType.campaign]: 'campana',
  [EventType.rally]: 'mitin',
};

export class GetWeeklyEventsTool {
  readonly key = 'getWeeklyEvents';

  /**
   * @param eventsSource       Repositorio real de eventos publicados (opcional para tests).
   * @param registrationsSource Repositorio real de registros por evento (opcional para tests).
   * @param now                Reloj inyectable congelado para tests (por defecto: hora actual).
   */
  constructor(
    private readonly eventsSource?: WeeklyEventsSource,
    private readonly registrationsSource?: EventRegistrationsSource,
    private readonly now?: Date,
  ) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = getWeeklyEventsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const { categoria, dia_semana, ubicacion, requiere_registro, limite } = parsed.data;

    if (!this.eventsSource) {
      return {
        found: false,
        source: 'events-db',
        items: [],
        message: 'No hay una fuente de eventos disponible en este momento.',
      };
    }

    const week = this.getWeekBounds();

    try {
      const events = await this.eventsSource.listPublishedInWeek(
        week.startUtc,
        week.endUtc,
        FETCH_LIMIT,
      );

      const counts = this.registrationsSource
        ? await this.registrationsSource.countActiveRegistrationsByEvent(
            events.map((event) => event.id),
          )
        : {};

      const filtered = events.filter((event) =>
        this.matches(event, { categoria, dia_semana, ubicacion, requiere_registro }),
      );

      const items = filtered.slice(0, limite).map((event) => ({
        id: event.id,
        titulo: event.title,
        descripcion: event.description,
        tipo: EVENT_TYPE_TO_TIPO[event.eventType] ?? String(event.eventType),
        inicio: event.startsAt.toISOString(),
        fin: event.endsAt ? event.endsAt.toISOString() : null,
        ubicacion: { nombre: event.locationName, direccion: event.address },
        cupo: this.deriveCupo(event, counts[event.id] ?? 0),
        // Descripción completa para que el LLM extraiga requisitos/costo/público.
        infoAdicional: event.description,
      }));

      return {
        found: items.length > 0,
        source: 'events-db',
        semana: { inicio: week.startIso, fin: week.endIso },
        items,
        ...(items.length === 0
          ? { message: 'No hay eventos publicados para esa semana o con esos filtros.' }
          : {}),
      };
    } catch (err: unknown) {
      return {
        error: 'EXECUTION_ERROR',
        source: 'events-db',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Lunes 00:00 local → lunes próximo 00:00 local (extremo superior EXCLUSIVO), en UTC. */
  private getWeekBounds(): {
    startUtc: Date;
    endUtc: Date;
    startIso: string;
    endIso: string;
  } {
    const now = this.now ?? new Date();
    const zoned = toZonedTime(now, TZ);
    const mondayLocal = startOfWeek(zoned, { weekStartsOn: 1 });
    const nextMondayLocal = addDays(mondayLocal, 7);
    const startUtc = fromZonedTime(mondayLocal, TZ);
    const endUtc = fromZonedTime(nextMondayLocal, TZ);
    return {
      startUtc,
      endUtc,
      startIso: startUtc.toISOString(),
      endIso: endUtc.toISOString(),
    };
  }

  /** Filtros en memoria (NO en SQL). */
  private matches(
    event: {
      eventType: EventType | (string & {});
      startsAt: Date;
      locationName: string | null;
      address: string | null;
      capacity: number | null;
    },
    filters: {
      categoria?: Categoria;
      dia_semana?: (typeof diasSemana)[number];
      ubicacion?: string;
      requiere_registro?: boolean;
    },
  ): boolean {
    if (filters.categoria !== undefined && event.eventType !== CATEGORIA_TO_EVENT_TYPE[filters.categoria]) {
      return false;
    }
    if (filters.dia_semana !== undefined && this.getWeekday(event.startsAt) !== filters.dia_semana) {
      return false;
    }
    if (filters.ubicacion !== undefined && !this.matchesUbicacion(event, filters.ubicacion)) {
      return false;
    }
    if (filters.requiere_registro === true && event.capacity === null) {
      return false;
    }
    if (filters.requiere_registro === false && event.capacity !== null) {
      return false;
    }
    return true;
  }

  /** Día de semana en español normalizado sin acentos (lunes...domingo). */
  private getWeekday(startsAt: Date): string {
    return normalize(formatInTimeZone(startsAt, TZ, 'EEEE', { locale: es }));
  }

  /** Match por ubicación: el término (normalizado) está en locationName o address. */
  private matchesUbicacion(
    event: { locationName: string | null; address: string | null },
    termino: string,
  ): boolean {
    const needle = normalize(termino);
    if (event.locationName && normalize(event.locationName).includes(needle)) {
      return true;
    }
    if (event.address && normalize(event.address).includes(needle)) {
      return true;
    }
    return false;
  }

  /**
   * Deriva cupo/aforo por evento:
   *  - capacity null → entrada libre (abierto), sin totales.
   *  - capacity != null → requiereRegistro con total/registrados/disponibles y estado.
   */
  private deriveCupo(
    event: { capacity: number | null },
    registrados: number,
  ): {
    requiereRegistro: boolean;
    total: number | null;
    registrados: number | null;
    disponibles: number | null;
    estado: 'disponible' | 'agotado' | 'abierto';
  } {
    if (event.capacity === null) {
      return {
        requiereRegistro: false,
        total: null,
        registrados: null,
        disponibles: null,
        estado: 'abierto',
      };
    }

    const disponibles = Math.max(0, event.capacity - registrados);
    return {
      requiereRegistro: true,
      total: event.capacity,
      registrados,
      disponibles,
      estado: disponibles > 0 ? 'disponible' : 'agotado',
    };
  }
}

/** Normaliza texto: sin acentos y en minúsculas. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}