import { z } from 'zod';
import { env } from '../config/env.config';
import type { UserRepository } from '../repositories';
import { AppError } from '../utils/app-error';
import { hashPassword } from '../utils/password.util';
import {
  buildPasswordResetUrl,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from './auth/password-reset-token';
import type { EmailService } from './email/email.service';
import { formatExpiration } from './email/format';
import { PASSWORD_MIN_LENGTH } from './user.service';

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const ValidateResetTokenQuerySchema = z.object({
  token: z.string().trim().min(20),
});

export const ResetPasswordSchema = z
  .object({
    token: z.string().trim().min(1),
    password: z.string().min(PASSWORD_MIN_LENGTH),
    passwordConfirmation: z.string().min(PASSWORD_MIN_LENGTH),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  });

export type PasswordResetFailureReason = 'invalid' | 'expired' | 'used';

export type PasswordResetValidation =
  | { valid: true; email: string; expiresAt: Date }
  | { valid: false; reason: PasswordResetFailureReason };

/**
 * Flujo de recuperación de contraseña.
 *
 * Las respuestas de `requestReset` son deliberadamente uniformes: cualquier
 * diferencia observable (status, latencia semántica o mensaje) permitiría
 * enumerar qué correos están registrados.
 */
export class PasswordResetService {
  constructor(
    private readonly users: UserRepository,
    private readonly emailService?: EmailService,
  ) {}

  async requestReset(
    email: string,
    context?: { ip?: string | null },
  ): Promise<{ requested: true }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.users.findByEmail(normalizedEmail);

    // Cuentas inexistentes o aún no activadas (invitación pendiente) no reciben
    // correo, pero la respuesta es idéntica.
    if (!user || !user.isActive || !this.emailService) {
      return { requested: true };
    }

    const latest = await this.users.findLatestPasswordReset(user.id);
    if (latest?.createdAt) {
      const ageSeconds = Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
      if (ageSeconds < env.PASSWORD_RESET_COOLDOWN_SECONDS) {
        return { requested: true };
      }
    }

    const rawToken = generatePasswordResetToken();
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_EXPIRATION_MINUTES * 60_000);

    await this.users.createPasswordReset({
      userId: user.id,
      tokenHash: hashPasswordResetToken(rawToken),
      expiresAt,
      requestedIp: context?.ip ?? null,
    });

    const delivery = await this.emailService.send({
      to: { email: user.email, name: user.fullName ?? undefined },
      template: 'password-reset',
      props: {
        recipientName: user.fullName ?? 'integrante del equipo',
        platformName: env.MAIL_PLATFORM_NAME,
        resetUrl: buildPasswordResetUrl(env.FRONTEND_URL, rawToken),
        ...formatExpiration(expiresAt),
        supportEmail: env.MAIL_SUPPORT_EMAIL,
      },
    });

    if (!delivery.success) {
      console.error('[PasswordReset] No se pudo enviar el correo de restablecimiento', {
        userId: user.id,
        errorCode: delivery.errorCode,
        provider: delivery.provider,
      });
    }

    return { requested: true };
  }

  async validateToken(token: string): Promise<PasswordResetValidation> {
    const reset = await this.users.findPasswordResetByTokenHash(hashPasswordResetToken(token));
    if (!reset || !reset.user.isActive) return { valid: false, reason: 'invalid' };
    if (reset.usedAt) return { valid: false, reason: 'used' };
    if (reset.invalidatedAt) return { valid: false, reason: 'invalid' };
    if (reset.expiresAt.getTime() <= Date.now()) return { valid: false, reason: 'expired' };

    return { valid: true, email: reset.user.email, expiresAt: reset.expiresAt };
  }

  /** Consume el token, actualiza la contraseña y devuelve el usuario afectado. */
  async resetPassword(token: string, password: string): Promise<{ userId: string; email: string }> {
    const reset = await this.users.findPasswordResetByTokenHash(hashPasswordResetToken(token));

    if (!reset || !reset.user.isActive || reset.invalidatedAt) {
      throw new AppError('El enlace no es válido', 400, 'PASSWORD_RESET_INVALID');
    }
    if (reset.usedAt) {
      throw new AppError('El enlace ya fue utilizado', 409, 'PASSWORD_RESET_USED');
    }
    if (reset.expiresAt.getTime() <= Date.now()) {
      throw new AppError('El enlace expiró', 410, 'PASSWORD_RESET_EXPIRED');
    }

    await this.users.consumePasswordReset({
      id: reset.id,
      userId: reset.userId,
      hashedPassword: await hashPassword(password),
    });

    return { userId: reset.userId, email: reset.user.email };
  }
}
