/**
 * Rate limiter con ventana fija sobre PostgreSQL.
 *
 * Reemplaza los contadores INCR/EXPIRE de Redis por filas en `rate_limit_counters`:
 * una fila por (scope, bucketKey, windowStart). El upsert con
 * `count + 1` es atómico en Postgres (INSERT ... ON CONFLICT DO UPDATE),
 * por lo que es seguro usarlo desde múltiples instancias concurrentes.
 */
import type { PrismaClient } from '@prisma/client';

export class PostgresRateLimiter {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Incrementa el contador de (scope, bucketKey) en la ventana fija actual
   * y devuelve el conteo resultante.
   */
  async increment(scope: string, bucketKey: string, windowSeconds: number): Promise<number> {
    const windowStart = this.windowStart(windowSeconds);
    const { count } = await this.prisma.rateLimitCounter.upsert({
      where: {
        scope_bucketKey_windowStart: { scope, bucketKey, windowStart },
      },
      create: { scope, bucketKey, windowStart, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    return count;
  }

  /** Segundos restantes de la ventana actual para encabezado/error "intentá nuevamente". */
  remainingSeconds(_scope: string, _bucketKey: string, windowSeconds: number): number {
    const windowStart = this.windowStart(windowSeconds);
    const end = windowStart.getTime() + windowSeconds * 1000;
    return Math.max(1, Math.ceil((end - Date.now()) / 1000));
  }

  /**
   * Purguea buckets viejos de un scope. Devuelve la cantidad de filas borradas.
   * Programar a diario (ej. en el boot del worker) para evitar acumulación.
   */
  async prune(scope: string, olderThanHours = 24): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanHours * 3_600_000);
    const result = await this.prisma.rateLimitCounter.deleteMany({
      where: { scope, windowStart: { lt: cutoff } },
    });
    return result.count;
  }

  private windowStart(windowSeconds: number): Date {
    const now = Date.now();
    const start = Math.floor(now / (windowSeconds * 1000)) * (windowSeconds * 1000);
    return new Date(start);
  }
}