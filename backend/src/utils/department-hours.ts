/**
 * department-hours — evaluación de horario de atención de departamentos.
 *
 * El horario estructurado se guarda en Department.serviceSchedule (JSON) y permite
 * determinar si un departamento está abierto en un instante dado (TZ-aware).
 *
 * Formato:
 * {
 *   "alwaysOpen": false,
 *   "timezone": "America/Mexico_City",
 *   "days": {
 *     "1": [{ "open": "08:00", "close": "15:00" }],   // 0=Domingo ... 6=Sábado
 *     "2": [{ "open": "08:00", "close": "15:00" }]
 *   }
 * }
 */

export interface ServiceTimeRange {
  /** Hora de apertura "HH:MM" (24h). */
  open: string;
  /** Hora de cierre "HH:MM" (24h). */
  close: string;
}

export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WeeklyServiceSchedule {
  /** Si true, el departamento atiende siempre (p. ej. seguridad/emergencias). */
  alwaysOpen?: boolean;
  /** Zona horaria IANA. Si falta, se usa el fallback recibido en isOpenAt. */
  timezone?: string;
  /** Rangos por día de la semana (0=Domingo ... 6=Sábado). */
  days?: Partial<Record<WeekdayIndex, ServiceTimeRange[]>>;
}

const HHMM_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const WEEKDAY_TO_INDEX: Record<string, WeekdayIndex> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Convierte "HH:MM" a minutos desde medianoche, o null si es inválido. */
function toMinutes(value: string): number | null {
  const match = HHMM_REGEX.exec(value.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Parsea/valida un valor arbitrario (JSON de Prisma) a WeeklyServiceSchedule.
 * Devuelve null si no es un horario válido (se interpreta como "sin restricción").
 */
export function parseServiceSchedule(value: unknown): WeeklyServiceSchedule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const schedule: WeeklyServiceSchedule = {};

  if (raw.alwaysOpen === true) {
    schedule.alwaysOpen = true;
  }

  if (typeof raw.timezone === 'string' && raw.timezone.trim().length > 0) {
    schedule.timezone = raw.timezone.trim();
  }

  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    const days: Partial<Record<WeekdayIndex, ServiceTimeRange[]>> = {};
    for (const [key, ranges] of Object.entries(raw.days as Record<string, unknown>)) {
      const dayIndex = Number(key);
      if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
        continue;
      }
      if (!Array.isArray(ranges)) {
        continue;
      }
      const parsedRanges = ranges
        .filter(
          (r): r is { open: unknown; close: unknown } =>
            !!r && typeof r === 'object' && 'open' in r && 'close' in r,
        )
        .map((r) => ({ open: String(r.open), close: String(r.close) }))
        .filter((r) => toMinutes(r.open) !== null && toMinutes(r.close) !== null);

      if (parsedRanges.length > 0) {
        days[dayIndex as WeekdayIndex] = parsedRanges;
      }
    }
    if (Object.keys(days).length > 0) {
      schedule.days = days;
    }
  }

  if (!schedule.alwaysOpen && !schedule.days) {
    return null;
  }

  return schedule;
}

/** Partes (día de semana 0-6 y minutos desde medianoche) en una zona horaria. */
function getZonedWeekdayAndMinutes(
  date: Date,
  timeZone: string,
): { weekday: WeekdayIndex; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const weekdayLabel = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '';
    const minuteRaw = parts.find((p) => p.type === 'minute')?.value ?? '';

    const weekday = WEEKDAY_TO_INDEX[weekdayLabel];
    if (weekday === undefined) {
      return null;
    }

    // hour12:false puede devolver "24" a medianoche en algunos entornos.
    const hour = Number(hourRaw) % 24;
    const minute = Number(minuteRaw);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null;
    }

    return { weekday, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

function rangeCoversMinutes(range: ServiceTimeRange, minutes: number): boolean {
  const openM = toMinutes(range.open);
  const closeM = toMinutes(range.close);
  if (openM === null || closeM === null) {
    return false;
  }
  if (closeM > openM) {
    return minutes >= openM && minutes < closeM;
  }
  // Rango que cruza medianoche (p. ej. 22:00–02:00).
  return minutes >= openM || minutes < closeM;
}

/**
 * Determina si un horario está abierto en un instante dado.
 *
 * @param schedule    Horario estructurado (o null = sin restricción → abierto).
 * @param date        Instante a evaluar.
 * @param fallbackTz  Zona horaria por defecto si el schedule no define una.
 */
export function isOpenAt(
  schedule: WeeklyServiceSchedule | null,
  date: Date,
  fallbackTz: string,
): boolean {
  // Sin horario estructurado → no se aplica restricción.
  if (!schedule) {
    return true;
  }
  if (schedule.alwaysOpen) {
    return true;
  }
  if (!schedule.days) {
    return true;
  }

  const tz = schedule.timezone ?? fallbackTz;
  const zoned = getZonedWeekdayAndMinutes(date, tz);
  if (!zoned) {
    // Si no se puede determinar la hora, no bloquear (fail-open).
    return true;
  }

  const ranges = schedule.days[zoned.weekday];
  if (!ranges || ranges.length === 0) {
    return false;
  }

  return ranges.some((range) => rangeCoversMinutes(range, zoned.minutes));
}
