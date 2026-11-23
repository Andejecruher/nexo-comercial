/**
 * Controlador de autenticación.
 * Rutas: POST /auth/login, POST /auth/refresh, GET /auth/me, POST /auth/logout
 *
 * Device binding:
 *   El `deviceId` se resuelve en el middleware `loginRateLimitMiddleware`
 *   (inyectado como `req.resolvedDeviceId`) para /login.
 *   Para /refresh y /logout se extrae del header `x-device-id` o body.
 */
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AuditService } from '../services/audit.service';
import { extractIp, extractUserAgent } from '../services/audit.service';
import { LoginSchema, RegisterAdminSchema } from '../services/auth.schemas';
import {
  ForgotPasswordSchema,
  ResetPasswordSchema,
  ValidateResetTokenQuerySchema,
} from '../services/password-reset.service';
import { ActivateAccountSchema, ValidateInvitationQuerySchema } from '../services/user.service';
import type { AuthService } from '../services/auth.service';
import { AppError } from '../utils/app-error';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  /**
   * POST /auth/login
   * Body: { email: string, password: string, deviceId?: string }
   * Header opcional: x-device-id
   *
   * El deviceId final lo determina el middleware loginRateLimitMiddleware
   * y se expone en req.resolvedDeviceId.
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = LoginSchema.parse(req.body);

      // deviceId resuelto por el middleware (x-device-id > body.deviceId > UUID random)
      const deviceId = req.resolvedDeviceId ?? crypto.randomUUID();

      const result = await this.authService.login(email, password, deviceId);

      await this.audit.logFromRequest(req, {
        actorId: result.user.id,
        action: 'auth.login',
        targetType: 'User',
        targetId: result.user.id,
        metadata: { deviceId },
      });

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  };

  activateAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = ActivateAccountSchema.parse(req.body);
      const user = await this.authService.activateInvitation(body.token, body.password);

      await this.audit.logFromRequest(req, {
        actorId: user.id,
        action: 'auth.invitation.activate',
        targetType: 'User',
        targetId: user.id,
        metadata: { email: user.email },
      });

      res.json({ user });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  validateActivation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = ValidateInvitationQuerySchema.parse(req.query);
      const result = await this.authService.validateInvitation(token);
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ valid: false, reason: 'invalid' });
        return;
      }
      next(err);
    }
  };

  /**
   * POST /auth/forgot-password
   * Body: { email: string }
   *
   * Siempre responde 202 con el mismo cuerpo, exista o no la cuenta.
   */
  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = ForgotPasswordSchema.parse(req.body);
      await this.authService.requestPasswordReset(email, { ip: extractIp(req) });

      res.status(202).json({
        message:
          'Si el correo está registrado, enviaremos un enlace para restablecer la contraseña.',
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Ingresá un email válido', code: 'VALIDATION_ERROR' });
        return;
      }
      next(err);
    }
  };

  /** GET /auth/reset-password/validate?token= */
  validatePasswordReset = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { token } = ValidateResetTokenQuerySchema.parse(req.query);
      const result = await this.authService.validatePasswordReset(token);
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ valid: false, reason: 'invalid' });
        return;
      }
      next(err);
    }
  };

  /**
   * POST /auth/reset-password
   * Body: { token, password, passwordConfirmation }
   */
  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = ResetPasswordSchema.parse(req.body);
      const result = await this.authService.resetPassword(body.token, body.password);

      await this.audit.logFromRequest(req, {
        actorId: result.userId,
        action: 'auth.password.reset',
        targetType: 'User',
        targetId: result.userId,
        metadata: { email: result.email },
      });

      res.json({ message: 'Tu contraseña fue actualizada. Ya podés iniciar sesión.' });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: err.issues[0]?.message ?? 'Datos inválidos',
          code: 'VALIDATION_ERROR',
          details: err.issues,
        });
        return;
      }
      next(err);
    }
  };

  /**
   * POST /auth/refresh
   * Body: { refreshToken: string, deviceId?: string }
   * Header opcional: x-device-id
   */
  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken, deviceId: bodyDeviceId } = req.body as {
        refreshToken?: string;
        deviceId?: string;
      };

      if (!refreshToken || typeof refreshToken !== 'string') {
        throw AppError.badRequest('refreshToken es requerido');
      }

      // deviceId para validar la sesión — el payload del token tiene prioridad
      const deviceIdHeader = req.headers['x-device-id'];
      const deviceId =
        (typeof deviceIdHeader === 'string' ? deviceIdHeader.trim() : undefined) ??
        (typeof bodyDeviceId === 'string' ? bodyDeviceId.trim() : undefined) ??
        'unknown';

      const tokens = await this.authService.refresh(refreshToken, deviceId, {
        ip: extractIp(req) ?? undefined,
        userAgent: extractUserAgent(req) ?? undefined,
      });
      res.json(tokens);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /auth/me
   * Requiere: authMiddleware
   */
  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }

      const user = await this.authService.me(req.user.id);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /auth/logout
   * Body opcional: { refreshToken?: string, logoutAll?: boolean }
   * Requiere: authMiddleware
   *
   * - Sin `logoutAll`: invalida solo la sesión actual (identificada por el refreshToken).
   * - Con `logoutAll: true`: invalida TODAS las sesiones del usuario.
   */
  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }

      const { refreshToken, logoutAll } = req.body as {
        refreshToken?: string;
        logoutAll?: boolean;
      };

      if (logoutAll) {
        await this.authService.logoutAll(req.user.id);
        await this.audit.logFromRequest(req, {
          actorId: req.user.id,
          action: 'auth.logout_all',
          targetType: 'User',
          targetId: req.user.id,
        });
        res.json({ message: 'Todas las sesiones cerradas correctamente' });
        return;
      }

      await this.authService.logout(req.user.id, refreshToken);
      await this.audit.logFromRequest(req, {
        actorId: req.user.id,
        action: 'auth.logout',
        targetType: 'User',
        targetId: req.user.id,
      });
      res.json({ message: 'Sesión cerrada correctamente' });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /auth/register (solo SUPER_ADMIN)
   * Requiere: authMiddleware + checkRole(['SUPER_ADMIN'])
   */
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw AppError.unauthorized();
      }

      const data = RegisterAdminSchema.parse(req.body);
      const newUser = await this.authService.registerAdmin(data, req.user);

      await this.audit.logFromRequest(req, {
        actorId: req.user.id,
        action: 'user.create',
        targetType: 'User',
        targetId: newUser.id,
        metadata: { roles: data.roles },
      });

      res.status(201).json({ user: newUser });
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          AppError.badRequest(`Datos inválidos: ${err.issues[0]?.message ?? 'payload inválido'}`),
        );
      } else {
        next(err);
      }
    }
  };
}
