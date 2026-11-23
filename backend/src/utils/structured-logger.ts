/**
 * Logger estructurado JSON compartido.
 *
 * Centraliza el patrón repetido de logging en consola con forma
 * { ts, level, service, event, correlationId, ...data } usado por los
 * servicios de orquestación/FSM, evitando duplicar el helper en cada módulo.
 */
export type StructuredLogLevel = 'info' | 'warn' | 'error' | 'debug';

export type StructuredLogger = (
  level: StructuredLogLevel,
  event: string,
  correlationId?: string,
  data?: Record<string, unknown>,
) => void;

const LOG_LEVEL_PRIORITY: Record<StructuredLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function isLogLevelEnabled(
  level: StructuredLogLevel,
  configuredLevel: string | undefined = process.env.LOG_LEVEL,
): boolean {
  const threshold =
    configuredLevel && configuredLevel in LOG_LEVEL_PRIORITY
      ? LOG_LEVEL_PRIORITY[configuredLevel as StructuredLogLevel]
      : LOG_LEVEL_PRIORITY.info;
  return LOG_LEVEL_PRIORITY[level] >= threshold;
}

export function createLogRateLimiter(
  intervalMs = 60_000,
  now: () => number = Date.now,
): (key: string) => boolean {
  const lastLoggedAt = new Map<string, number>();
  return (key: string): boolean => {
    const currentTime = now();
    const previousTime = lastLoggedAt.get(key);
    if (previousTime !== undefined && currentTime - previousTime < intervalMs) {
      return false;
    }
    lastLoggedAt.set(key, currentTime);
    return true;
  };
}

function writeLog(level: StructuredLogLevel, entry: Record<string, unknown>): void {
  const serialized = JSON.stringify(entry);
  if (level === 'error') {
    console.error(serialized);
    return;
  }
  if (level === 'warn') {
    console.warn(serialized);
    return;
  }
  if (level === 'debug') {
    console.debug(serialized);
    return;
  }
  console.log(serialized);
}

/**
 * Crea un logger estructurado para un servicio dado.
 *
 * @param service    - Nombre del servicio emisor (campo `service`)
 * @param baseFields - Campos estáticos adicionales incluidos en cada entrada
 */
export function createStructuredLogger(
  service: string,
  baseFields?: Record<string, unknown>,
): StructuredLogger {
  return function log(level, event, correlationId, data): void {
    if (!isLogLevelEnabled(level)) {
      return;
    }

    const entry = {
      ts: new Date().toISOString(),
      level,
      service,
      ...(baseFields ?? {}),
      event,
      correlationId,
      ...data,
    };
    writeLog(level, entry);
  };
}
