/**
 * Rate limit por IP para rutas públicas (registro web, listados de lectura).
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env.config';
import type { PostgresRateLimiter } from '../services/postgres-rate-limiter.service';
import { AppError } from '../utils/app-error';

function resolveIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return forwarded
    ? ((Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0])?.trim() ?? 'unknown')
    : (req.socket?.remoteAddress ?? 'unknown');
}

export function createPublicRegistroRateLimitMiddleware(
  rateLimiter: PostgresRateLimiter,
): RequestHandler {
  return createIpWindowRateLimitMiddleware(rateLimiter, {
    scope: 'public_registro',
    windowSeconds: env.PUBLIC_REGISTRO_RATE_LIMIT_WINDOW_SECONDS,
    max: env.PUBLIC_REGISTRO_RATE_LIMIT_MAX,
  });
}

export function createPublicBarriosRateLimitMiddleware(
  rateLimiter: PostgresRateLimiter,
): RequestHandler {
  return createIpWindowRateLimitMiddleware(rateLimiter, {
    scope: 'public_barrios',
    windowSeconds: env.PUBLIC_BARRIOS_RATE_LIMIT_WINDOW_SECONDS,
    max: env.PUBLIC_BARRIOS_RATE_LIMIT_MAX,
  });
}

export function createPublicNewsletterRateLimitMiddleware(
  rateLimiter: PostgresRateLimiter,
): RequestHandler {
  return createIpWindowRateLimitMiddleware(rateLimiter, {
    scope: 'public_newsletter',
    windowSeconds: env.PUBLIC_NEWSLETTER_RATE_LIMIT_WINDOW_SECONDS,
    max: env.PUBLIC_NEWSLETTER_RATE_LIMIT_MAX,
  });
}

/** Protege el flujo de recuperación de contraseña sin bloquear la cuenta objetivo. */
export function createPasswordResetRateLimitMiddleware(
  rateLimiter: PostgresRateLimiter,
): RequestHandler {
  return createIpWindowRateLimitMiddleware(rateLimiter, {
    scope: 'password_reset',
    windowSeconds: env.PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS,
    max: env.PASSWORD_RESET_RATE_LIMIT_MAX,
  });
}

export function createPublicEventosSemanaRateLimitMiddleware(
  rateLimiter: PostgresRateLimiter,
): RequestHandler {
  return createIpWindowRateLimitMiddleware(rateLimiter, {
    scope: 'public_eventos_semana',
    windowSeconds: env.PUBLIC_EVENTOS_SEMANA_RATE_LIMIT_WINDOW_SECONDS,
    max: env.PUBLIC_EVENTOS_SEMANA_RATE_LIMIT_MAX,
  });
}

export function createPublicEventosAsistenciaRateLimitMiddleware(
  rateLimiter: PostgresRateLimiter,
): RequestHandler {
  return createIpWindowRateLimitMiddleware(rateLimiter, {
    scope: 'public_eventos_asistencia',
    windowSeconds: env.PUBLIC_EVENTOS_ASISTENCIA_RATE_LIMIT_WINDOW_SECONDS,
    max: env.PUBLIC_EVENTOS_ASISTENCIA_RATE_LIMIT_MAX,
  });
}

function createIpWindowRateLimitMiddleware(
  rateLimiter: PostgresRateLimiter,
  options: { scope: string; windowSeconds: number; max: number },
): RequestHandler {
  async function ipWindowRateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const ip = resolveIp(req);
      const count = await rateLimiter.increment(options.scope, ip, options.windowSeconds);
      if (count > options.max) {
        const ttl = rateLimiter.remainingSeconds(options.scope, ip, options.windowSeconds);
        throw new AppError(
          `Demasiadas solicitudes. Intentá nuevamente en ${Math.max(1, Math.ceil(ttl / 60))} minutos.`,
          429,
          'RATE_LIMITED',
        );
      }
      next();
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({
          error: err.message,
          ...(err.code ? { code: err.code } : {}),
        });
        return;
      }
      next(err);
    }
  }
  return ipWindowRateLimitMiddleware as RequestHandler;
}