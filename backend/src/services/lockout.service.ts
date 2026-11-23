/**
 * Servicio de rate limiting y lockout progresivo para login y refresh.
 *
 * Estrategia PostgreSQL (reemplaza Redis):
 *
 * Rate limit por IP (login/refresh):
 *   tabla `rate_limit_counters` (scope `login_ip` / `refresh_ip`, bucketKey = IP)
 *
 * Lockout por identidad (email normalizado):
 *   tabla `identity_lockouts` → fails, level, lockedUntil
 *
 * Lockout progresivo (niveles configurables via AUTH_LOCKOUT_DURATIONS):
 *   Nivel 0 → durations[0] (ej: 60s)
 *   Nivel 1 → durations[1] (ej: 300s)
 *   Nivel N >= durations.length → durations[last]
 */
import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.config';
import { AppError } from '../utils/app-error';
import { logSecurityEvent } from '../utils/security-logger';
import { PostgresRateLimiter } from './postgres-rate-limiter.service';

// ── Configuración ─────────────────────────────────────────────────────────────

/** Parsea la cadena de duraciones de lockout en array de números */
function parseLockoutDurations(): number[] {
  return env.AUTH_LOCKOUT_DURATIONS.split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

const SCOPES = {
  loginIp: 'login_ip',
  refreshIp: 'refresh_ip',
} as const;

// ── Servicio ──────────────────────────────────────────────────────────────────

export class LockoutService {
  private readonly durations: number[];
  private readonly rateLimiter: PostgresRateLimiter;

  constructor(private readonly prisma: PrismaClient) {
    this.durations = parseLockoutDurations();
    this.rateLimiter = new PostgresRateLimiter(prisma);
  }

  /**
   * Verifica si la IP está sobre el rate limit de login.
   * @throws AppError 429 si está limitada.
   */
  async checkIpRateLimit(ip: string): Promise<void> {
    const count = await this.rateLimiter.increment(
      SCOPES.loginIp,
      ip,
      env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    );

    if (count > env.AUTH_RATE_LIMIT_MAX) {
      const ttl = this.rateLimiter.remainingSeconds(
        SCOPES.loginIp,
        ip,
        env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      );
      logSecurityEvent({
        type: 'RATE_LIMIT_EXCEEDED',
        ip,
        detail: `login rate limit excedido: ${count} intentos en ventana`,
        metadata: { endpoint: 'login', count, ttlSeconds: ttl },
      });
      throw new AppError(
        `Demasiados intentos de inicio de sesión. Intentá nuevamente en ${Math.ceil(ttl / 60)} minutos.`,
        429,
        'RATE_LIMITED',
      );
    }
  }

  /**
   * Verifica si la IP está sobre el rate limit de refresh token.
   * Ventana más corta: 60 req / 5 min por IP (configurable).
   * @throws AppError 429 si está limitada.
   */
  async checkRefreshRateLimit(ip: string): Promise<void> {
    const windowSeconds = env.AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS;
    const max = env.AUTH_REFRESH_RATE_LIMIT_MAX;

    const count = await this.rateLimiter.increment(SCOPES.refreshIp, ip, windowSeconds);

    if (count > max) {
      const ttl = this.rateLimiter.remainingSeconds(SCOPES.refreshIp, ip, windowSeconds);
      logSecurityEvent({
        type: 'RATE_LIMIT_EXCEEDED',
        ip,
        detail: `refresh rate limit excedido: ${count} intentos en ventana`,
        metadata: { endpoint: 'refresh', count, ttlSeconds: ttl },
      });
      throw new AppError(
        `Demasiados intentos de renovación de sesión. Intentá nuevamente en ${Math.ceil(ttl / 60)} minutos.`,
        429,
        'RATE_LIMITED',
      );
    }
  }

  /**
   * Verifica si la identidad (email) está bloqueada.
   * @throws AppError 429 si hay lockout activo.
   */
  async checkLockout(email: string, context?: { ip?: string; userAgent?: string }): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const lockout = await this.prisma.identityLockout.findUnique({
      where: { identityKey: normalizedEmail },
      select: { lockedUntil: true },
    });

    const now = Date.now();
    if (lockout?.lockedUntil && lockout.lockedUntil.getTime() > now) {
      const ttl = Math.max(0, Math.ceil((lockout.lockedUntil.getTime() - now) / 1000));
      const wait = ttl > 0 ? ` Intentá nuevamente en ${Math.ceil(ttl / 60)} minutos.` : '';
      logSecurityEvent({
        type: 'ACCOUNT_LOCKED',
        email: normalizedEmail,
        ip: context?.ip,
        userAgent: context?.userAgent,
        detail: 'intento de login en cuenta bloqueada',
        metadata: { ttlSeconds: ttl },
      });
      throw new AppError(
        `Cuenta temporalmente bloqueada por múltiples intentos fallidos.${wait}`,
        429,
        'ACCOUNT_LOCKED',
      );
    }
  }

  /**
   * Registra un intento fallido de login para la identidad.
   * Si supera AUTH_LOCKOUT_MAX_ATTEMPTS, activa el lockout progresivo.
   */
  async recordFailure(email: string, context?: { ip?: string; userAgent?: string }): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    const lockout = await this.prisma.identityLockout.upsert({
      where: { identityKey: normalizedEmail },
      create: { identityKey: normalizedEmail, fails: 1, lastFailureAt: new Date() },
      update: {
        fails: { increment: 1 },
        lastFailureAt: new Date(),
        lockedUntil: null,
      },
      select: { fails: true, level: true, lockedUntil: true },
    });

    if (lockout.fails >= env.AUTH_LOCKOUT_MAX_ATTEMPTS) {
      const currentLevel = lockout.level;
      const duration = this.durations[Math.min(currentLevel, this.durations.length - 1)] ?? 60;

      await this.prisma.identityLockout.update({
        where: { identityKey: normalizedEmail },
        data: {
          level: currentLevel + 1,
          lockedUntil: new Date(Date.now() + duration * 1000),
          fails: 0,
        },
      });

      logSecurityEvent({
        type: 'ACCOUNT_LOCKED',
        email: normalizedEmail,
        ip: context?.ip,
        userAgent: context?.userAgent,
        detail: `cuenta bloqueada tras ${lockout.fails} intentos fallidos`,
        metadata: { lockoutLevel: currentLevel, durationSeconds: duration },
      });

      console.warn(
        `[LockoutService] Cuenta bloqueada: ${normalizedEmail} | nivel: ${currentLevel} | duración: ${duration}s`,
      );
    }
  }

  /**
   * Limpia todos los contadores de lockout para la identidad.
   * Llamar al login exitoso.
   */
  async clearFailures(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    await this.prisma.identityLockout.deleteMany({
      where: { identityKey: normalizedEmail },
    });
  }
}