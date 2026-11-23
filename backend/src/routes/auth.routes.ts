/**
 * Rutas de autenticación del panel administrativo.
 * Base: /api/v1/auth
 */
import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  createLoginRateLimitMiddleware,
  createRefreshRateLimitMiddleware,
} from '../middlewares/rate-limit.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { createPasswordResetRateLimitMiddleware } from '../middlewares/public-ip-rate-limit.middleware';
import type { AuditService } from '../services/audit.service';
import type { AuthService } from '../services/auth.service';
import type { LockoutService } from '../services/lockout.service';
import type { PrismaService } from '../services/prisma.service';
import type { PostgresRateLimiter } from '../services/postgres-rate-limiter.service';

export function createAuthRouter(
  authService: AuthService,
  auditService: AuditService,
  lockoutService: LockoutService,
  prisma: PrismaService,
  rateLimiter: PostgresRateLimiter,
): Router {
  const router = Router();
  const ctrl = new AuthController(authService, auditService);
  const loginRateLimit = createLoginRateLimitMiddleware(lockoutService);
  const refreshRateLimit = createRefreshRateLimitMiddleware(lockoutService);
  const passwordResetRateLimit = createPasswordResetRateLimitMiddleware(rateLimiter);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  /**
   * POST /auth/login
   * Middleware: loginRateLimit (rate-limit por IP + lockout por identidad)
   */
  router.post('/login', loginRateLimit, ctrl.login);
  router.get('/activate-account/validate', ctrl.validateActivation);
  router.post('/activate-account', ctrl.activateAccount);

  /**
   * Recuperación de contraseña — públicas.
   * Rate limit por IP, sin lockout por identidad: el atacante no debe poder
   * bloquear la cuenta de un tercero pidiendo resets.
   */
  router.post('/forgot-password', passwordResetRateLimit, ctrl.forgotPassword);
  router.get('/reset-password/validate', passwordResetRateLimit, ctrl.validatePasswordReset);
  router.post('/reset-password', passwordResetRateLimit, ctrl.resetPassword);

  /**
   * POST /auth/refresh
   * Middleware: refreshRateLimit (rate-limit por IP — 60 req / 5 min)
   */
  router.post('/refresh', refreshRateLimit, ctrl.refresh);

  /** GET /auth/me — requiere token válido */
  router.get('/me', authMiddleware, ctrl.me);

  /**
   * POST /auth/logout — requiere token válido
   * Body opcional: { refreshToken?: string, logoutAll?: boolean }
   */
  router.post('/logout', authMiddleware, ctrl.logout);

  /**
   * POST /auth/register — solo SUPERADMIN
   * Alternativa a /admin/users para registrar admins desde la pantalla de auth.
   */
  router.post(
    '/register',
    authMiddleware,
    requirePermissions(prisma, 'users.create'),
    ctrl.register,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
