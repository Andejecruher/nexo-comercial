/**
 * GetMunicipalInfoTool — internal AI tool (consulta informativa).
 *
 * Responsabilidad:
 *  - Responder consultas informativas del municipio (eventos, servicios,
 *    departamentos, horarios, ubicaciones, requisitos, contacto, FAQ).
 *  - EVENTOS y DEPARTAMENTOS: fuente DINÁMICA (repositorios reales).
 *  - Resto de categorías: fuente estática (seed) hasta exponer su datasource.
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 * No lanza AppError — devuelve error estructurado { error } para que el orchestrador lo maneje.
 */
import { z } from 'zod';
import { isOpenAt, parseServiceSchedule } from '../../utils/department-hours';

/** Fuente de eventos publicados (subset usado por la tool). */
export interface MunicipalEventsSource {
  listUpcomingPublished(
    limit: number,
    fromUtc?: Date,
  ): Promise<
    Array<{
      title: string;
      description: string | null;
      startsAt: Date;
      endsAt: Date | null;
      locationName: string | null;
      address: string | null;
    }>
  >;
}

/** Fuente de departamentos activos (subset usado por la tool). */
export interface MunicipalDepartmentsSource {
  listActive(limit: number): Promise<
    Array<{
      name: string;
      slug: string;
      description: string | null;
      serviceHours: string | null;
      serviceSchedule?: unknown;
      keywords: string[];
    }>
  >;
}

const EVENTS_LIMIT = 5;
const DEPARTMENTS_LIMIT = 20;

export const municipalInfoCategories = [
  'eventos',
  'servicios',
  'departamentos',
  'horarios',
  'requisitos',
  'contacto',
  'faq',
  'general',
] as const;

export type MunicipalInfoCategory = (typeof municipalInfoCategories)[number];

const getMunicipalInfoSchema = z.object({
  category: z.enum(municipalInfoCategories).optional(),
  query: z.string().trim().min(2).max(200).optional(),
});

export interface MunicipalInfoItem {
  title: string;
  detail: string;
  keywords: string[];
}

/** Palabras que indican que la consulta es sobre eventos (para el modo general). */
const EVENT_QUERY_KEYWORDS = [
  'evento',
  'eventos',
  'actividad',
  'actividades',
  'taller',
  'talleres',
  'feria',
  'concierto',
  'agenda',
];

/** Palabras que indican que la consulta es sobre departamentos (modo general). */
const DEPARTMENT_QUERY_KEYWORDS = [
  'departamento',
  'departamentos',
  'area',
  'área',
  'dependencia',
  'dependencias',
  'direccion municipal',
  'oficina',
];

/**
 * Catálogo informativo estático (seed) para categorías sin datasource propio.
 * `eventos` y `departamentos` NO están aquí: se resuelven dinámicamente.
 */
const MUNICIPAL_INFO: Record<
  Exclude<MunicipalInfoCategory, 'general' | 'eventos' | 'departamentos'>,
  MunicipalInfoItem[]
> = {
  servicios: [
    {
      title: 'Reportes de servicios públicos',
      detail:
        'Puedes reportar baches, alumbrado, agua o limpia. El reporte se canaliza al área correspondiente.',
      keywords: [
        'servicio',
        'servicios',
        'bache',
        'alumbrado',
        'agua',
        'limpia',
        'basura',
        'reporte',
      ],
    },
    {
      title: 'Atención ciudadana',
      detail:
        'Atendemos dudas, solicitudes y orientación sobre trámites municipales por este medio.',
      keywords: ['atencion', 'atención', 'tramite', 'trámite', 'solicitud', 'orientacion'],
    },
  ],
  horarios: [
    {
      title: 'Horario de atención',
      detail:
        'Atención presencial de lunes a viernes de 9:00 a 16:00 hrs. Por WhatsApp respondemos todos los días.',
      keywords: ['horario', 'horarios', 'hora', 'abierto', 'atienden', 'cuando'],
    },
  ],
  requisitos: [
    {
      title: 'Requisitos generales de trámites',
      detail:
        'La mayoría de trámites requieren identificación oficial y comprobante de domicilio. El requisito exacto depende del trámite.',
      keywords: [
        'requisito',
        'requisitos',
        'documento',
        'documentos',
        'identificacion',
        'comprobante',
      ],
    },
  ],
  contacto: [
    {
      title: 'Canales de contacto',
      detail:
        'Puedes escribirnos por este WhatsApp o acudir al Palacio Municipal en horario de atención.',
      keywords: ['contacto', 'telefono', 'teléfono', 'whatsapp', 'correo', 'comunicar'],
    },
  ],
  faq: [
    {
      title: '¿Cómo hago un reporte?',
      detail:
        'Cuéntame qué necesitas reportar y lo canalizo al área correspondiente; si aplica, te transfiero al departamento.',
      keywords: ['como', 'cómo', 'reportar', 'reporte', 'queja', 'denuncia'],
    },
  ],
};

export class GetMunicipalInfoTool {
  readonly key = 'getMunicipalInfo';

  /**
   * @param eventsSource      Repositorio real de eventos publicados (opcional para tests).
   * @param departmentsSource Repositorio real de departamentos activos (opcional para tests).
   * @param timeZone          Zona horaria para formatear fechas de eventos.
   */
  constructor(
    private readonly eventsSource?: MunicipalEventsSource,
    private readonly departmentsSource?: MunicipalDepartmentsSource,
    private readonly timeZone: string = 'America/Mexico_City',
  ) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = getMunicipalInfoSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const { category, query } = parsed.data;
    const normalizedQuery = query ? normalize(query) : undefined;

    // 1a. Eventos → fuente dinámica (repositorio real).
    if (category === 'eventos') {
      return this.getEventos();
    }

    // 1b. Departamentos → fuente dinámica (repositorio real).
    if (category === 'departamentos') {
      return this.getDepartamentos(normalizedQuery);
    }

    // 1c. Otra categoría explícita (estática).
    if (category && category !== 'general') {
      const items = MUNICIPAL_INFO[category];
      return buildResult(category, filterByQuery(items, normalizedQuery));
    }

    // 2. Sin categoría o 'general': buscar por query.
    if (normalizedQuery) {
      // Si la consulta es sobre eventos, resolver dinámicamente.
      if (isEventRelated(normalizedQuery)) {
        return this.getEventos();
      }

      // Si la consulta es sobre departamentos, resolver dinámicamente.
      if (isDepartmentRelated(normalizedQuery)) {
        return this.getDepartamentos(normalizedQuery);
      }

      const matches: { category: MunicipalInfoCategory; item: MunicipalInfoItem }[] = [];
      for (const [cat, items] of Object.entries(MUNICIPAL_INFO)) {
        for (const item of items) {
          if (matchesQuery(item, normalizedQuery)) {
            matches.push({ category: cat as MunicipalInfoCategory, item });
          }
        }
      }

      if (matches.length > 0) {
        return {
          found: true,
          source: 'static-seed',
          items: matches.map((m) => ({
            category: m.category,
            title: m.item.title,
            detail: m.item.detail,
          })),
        };
      }

      return {
        found: false,
        source: 'static-seed',
        message:
          'No hay información específica para esa consulta. Ofrece escalar o transferir si aplica.',
        availableCategories: municipalInfoCategories.filter((c) => c !== 'general'),
      };
    }

    // 3. Sin filtros: resumen de categorías disponibles.
    return {
      found: true,
      source: 'static-seed',
      availableCategories: municipalInfoCategories.filter((c) => c !== 'general'),
    };
  }

  /** Resuelve eventos próximos publicados desde el repositorio real. */
  private async getEventos(): Promise<unknown> {
    if (!this.eventsSource) {
      return {
        found: false,
        source: 'events-db',
        category: 'eventos',
        items: [],
        message: 'No hay una fuente de eventos disponible en este momento.',
      };
    }

    try {
      const events = await this.eventsSource.listUpcomingPublished(EVENTS_LIMIT);
      return {
        found: events.length > 0,
        source: 'events-db',
        category: 'eventos',
        items: events.map((event) => ({
          title: event.title,
          detail: this.formatEvent(event),
        })),
        ...(events.length === 0
          ? { message: 'Por ahora no hay eventos próximos publicados.' }
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

  private formatEvent(event: {
    description: string | null;
    startsAt: Date;
    locationName: string | null;
    address: string | null;
  }): string {
    const when = new Intl.DateTimeFormat('es-MX', {
      timeZone: this.timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(event.startsAt);

    const place = event.locationName ?? event.address ?? undefined;
    const parts = [`📅 ${when}`];
    if (place) {
      parts.push(`📍 ${place}`);
    }
    if (event.description?.trim()) {
      parts.push(event.description.trim());
    }
    return parts.join(' · ');
  }

  /** Resuelve departamentos activos desde el repositorio real. */
  private async getDepartamentos(normalizedQuery?: string): Promise<unknown> {
    if (!this.departmentsSource) {
      return {
        found: false,
        source: 'departments-db',
        category: 'departamentos',
        items: [],
        message: 'No hay una fuente de departamentos disponible en este momento.',
      };
    }

    try {
      const departments = await this.departmentsSource.listActive(DEPARTMENTS_LIMIT);

      const filtered =
        normalizedQuery && !isDepartmentRelated(normalizedQuery)
          ? departments.filter((dept) => departmentMatchesQuery(dept, normalizedQuery))
          : departments;

      const result = filtered.length > 0 ? filtered : departments;

      return {
        found: result.length > 0,
        source: 'departments-db',
        category: 'departamentos',
        items: result.map((dept) => {
          const openNow = isOpenAt(
            parseServiceSchedule(dept.serviceSchedule),
            new Date(),
            this.timeZone,
          );
          return {
            title: dept.name,
            slug: dept.slug,
            openNow,
            detail: formatDepartment(dept, openNow),
          };
        }),
        ...(result.length === 0
          ? { message: 'No hay departamentos disponibles por el momento.' }
          : {}),
      };
    } catch (err: unknown) {
      return {
        error: 'EXECUTION_ERROR',
        source: 'departments-db',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function isEventRelated(normalizedQuery: string): boolean {
  return EVENT_QUERY_KEYWORDS.some(
    (k) => normalizedQuery.includes(normalize(k)) || normalize(k).includes(normalizedQuery),
  );
}

function isDepartmentRelated(normalizedQuery: string): boolean {
  return DEPARTMENT_QUERY_KEYWORDS.some(
    (k) => normalizedQuery.includes(normalize(k)) || normalize(k).includes(normalizedQuery),
  );
}

function formatDepartment(
  dept: {
    slug: string;
    description: string | null;
    serviceHours: string | null;
  },
  openNow: boolean,
): string {
  const parts: string[] = [];
  if (dept.description?.trim()) {
    parts.push(dept.description.trim());
  } else {
    parts.push(`Área municipal. Para canalizar tu solicitud usa el slug "${dept.slug}".`);
  }
  if (dept.serviceHours?.trim()) {
    parts.push(`🕒 Horario: ${dept.serviceHours.trim()}`);
  }
  parts.push(openNow ? '🟢 Abierto ahora' : '🔴 Cerrado ahora');
  return parts.join(' · ');
}

function departmentMatchesQuery(
  dept: { name: string; slug: string; keywords: string[] },
  normalizedQuery: string,
): boolean {
  if (
    normalize(dept.name).includes(normalizedQuery) ||
    normalize(dept.slug).includes(normalizedQuery)
  ) {
    return true;
  }
  return dept.keywords.some(
    (k) => normalizedQuery.includes(normalize(k)) || normalize(k).includes(normalizedQuery),
  );
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchesQuery(item: MunicipalInfoItem, normalizedQuery: string): boolean {
  if (normalize(item.title).includes(normalizedQuery)) {
    return true;
  }
  return item.keywords.some(
    (k) => normalizedQuery.includes(normalize(k)) || normalize(k).includes(normalizedQuery),
  );
}

function filterByQuery(
  items: MunicipalInfoItem[],
  normalizedQuery: string | undefined,
): MunicipalInfoItem[] {
  if (!normalizedQuery) {
    return items;
  }
  const filtered = items.filter((item) => matchesQuery(item, normalizedQuery));
  return filtered.length > 0 ? filtered : items;
}

function buildResult(category: MunicipalInfoCategory, items: MunicipalInfoItem[]) {
  return {
    found: items.length > 0,
    source: 'static-seed',
    category,
    items: items.map((item) => ({ title: item.title, detail: item.detail })),
  };
}
