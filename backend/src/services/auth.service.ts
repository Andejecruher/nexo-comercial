/**
 * Servicio de autenticación y gestión de sesiones admin.
 *
 * Estrategia de refresh token multi-sesión por dispositivo (storage PostgreSQL):
 * - Cada sesión se identifica por {userId}:{deviceId}:{jti} (una fila en
 *   `refresh_sessions`; `@@unique([userId, deviceId, jti])`).
 * - `deviceId` proviene del header `x-device-id` o del body, o se genera un fallback
 *   estable por request (documentado en AuthController).
 * - Se almacena SHA-256(refreshToken) en `token_hash` con `expires_at = refresh expiry`.
 * - Al superar AUTH_MAX_SESSIONS_PER_USER se invalida la sesión más antigua (FIFO
 *   por createdAt).
 * - Al rotar, se elimina la fila anterior y se inserta la nueva (single-use); un
 *   hash que no coincide indica replay y revoca la sesión.
 * - Logout individual invalida solo la sesión identificada por jti+deviceId.
 * - logoutAll invalida todas las sesiones del usuario.
 */
import { z } from 'zod';
import { env } from '../config/env.config';
import type { AuthenticatedUser, PanelRole, ScopeContext } from '../types/auth.types';
import { AppError } from '../utils/app-error';
import { hasPermission } from '../utils/authorization.util';
import { comparePassword, hashPassword } from '../utils/password.util';
import { logSecurityEvent } from '../utils/security-logger';
import {
  hashToken,
  parseExpiresInSeconds,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/token.util';
import { AuthorizationService } from './authorization.service';
import type { LockoutService } from './lockout.service';
import type { PasswordResetService, PasswordResetValidation } from './password-reset.service';
import type { PrismaService } from './prisma.service';
import type { UserRepository } from '../repositories';
import type { ScopeService } from './scope.service';
import type { UserService } from './user.service';

// ── Esquemas de validación ────────────────────────────────────────────────────

import { RegisterAdminSchema } from './auth.schemas';
export { LoginSchema, RegisterAdminSchema } from './auth.schemas';

// ── Tipos de respuesta ────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  user: AuthenticatedUser;
}

// ── Helpers internos ─────────────────────────────────────────────────────────

/** Normaliza roles del usuario a PanelRole[] */
function extractRoles(userRoles: Array<{ role: { name: string } }>): PanelRole[] {
  return userRoles.map((ur) => ur.role.name as PanelRole);
}

// ── Servicio ──────────────────────────────────────────────────────────────────

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly prisma: PrismaService,
    private readonly lockout: LockoutService,
    private readonly authorization?: AuthorizationService,
    private readonly userService?: UserService,
    private readonly passwordResets?: PasswordResetService,
    private readonly scopeService?: ScopeService,
  ) {}

  /**
   * Login de usuario admin.
   * Valida credenciales, usuario activo, aplica rate-limit/lockout y emite tokens.
   *
   * @param email    Email del usuario
   * @param password Contraseña en texto plano
   * @param deviceId Identificador de dispositivo. Si no se provee, se genera un UUID
   *                 random (sesión anónima que no persiste entre requests).
   *                 Para multi-sesión real el cliente DEBE enviar x-device-id o deviceId.
   */
  async login(email: string, password: string, deviceId: string): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase().trim();

    // Lockout check (antes de consultar DB — evita timing attacks de enumeración)
    await this.lockout.checkLockout(normalizedEmail);

    const user = await this.users.findByEmailWithRoles(normalizedEmail);

    if (!user) {
      await this.lockout.recordFailure(normalizedEmail);
      throw AppError.unauthorized('Credenciales inválidas');
    }

    if (!user.isActive) {
      // No registrar como fallo — usuario deshabilitado no es un intento de adivinar contraseña
      throw AppError.unauthorized('Usuario inactivo');
    }

    const passwordValid = await comparePassword(password, user.hashedPassword);
    if (!passwordValid) {
      await this.lockout.recordFailure(normalizedEmail);
      throw AppError.unauthorized('Credenciales inválidas');
    }

    // Login exitoso — limpiar contadores
    await this.lockout.clearFailures(normalizedEmail);

    const roles = extractRoles(user.userRoles);

    let permissions: string[] | undefined;
    let permissionsByModule: Record<string, string[]> | undefined;
    if (this.authorization) {
      const profile = await this.authorization.getAuthenticatedUserProfile(user.id);
      if (profile) {
        permissions = profile.permissions;
        permissionsByModule = profile.permissionsByModule;
      }
    }

    const scope: ScopeContext | undefined = this.scopeService
      ? await this.scopeService.resolveScope(user.id)
      : undefined;

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
      roles,
      permissions,
      permissionsByModule,
      scope,
    };

    const tokens = await this._issueTokens(authUser, deviceId);

    return { ...tokens, user: authUser };
  }

  async activateInvitation(
    token: string,
    password: string,
  ): Promise<import('./user.service').UserResponse> {
    if (!this.userService) {
      throw AppError.badRequest('El flujo de invitaciones no está configurado');
    }
    return this.userService.activateInvitation(token, password);
  }

  async validateInvitation(token: string): Promise<import('./user.service').InvitationValidation> {
    if (!this.userService) {
      throw AppError.badRequest('El flujo de invitaciones no está configurado');
    }
    return this.userService.validateInvitation(token);
  }

  /**
   * Solicita un enlace de restablecimiento. Responde igual exista o no la cuenta
   * para no revelar qué correos están registrados.
   */
  async requestPasswordReset(email: string, context?: { ip?: string | null }): Promise<void> {
    if (!this.passwordResets) return;
    await this.passwordResets.requestReset(email, context);
  }

  async validatePasswordReset(token: string): Promise<PasswordResetValidation> {
    if (!this.passwordResets) return { valid: false, reason: 'invalid' };
    return this.passwordResets.validateToken(token);
  }

  /**
   * Aplica la nueva contraseña y cierra todas las sesiones activas: quien haya
   * pedido el reset asume que la cuenta pudo estar comprometida.
   */
  async resetPassword(token: string, password: string): Promise<{ userId: string; email: string }> {
    if (!this.passwordResets) {
      throw AppError.badRequest('El flujo de restablecimiento no está configurado');
    }
    const result = await this.passwordResets.resetPassword(token, password);
    await this.logoutAll(result.userId);
    return result;
  }

  /**
   * Renovación de access token mediante refresh token.
   * Rotación: invalida el anterior, emite uno nuevo.
   *
   * @param refreshToken Token de refresco
   * @param deviceId     ID del dispositivo (fallback si no está en payload)
   * @param context      Contexto del request para logs de seguridad
   */
  async refresh(
    refreshToken: string,
    deviceId: string,
    context?: { ip?: string; userAgent?: string },
  ): Promise<AuthTokens> {
    // 1. Verificar firma y expiración
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized('Refresh token inválido o expirado');
    }

    if (payload.type !== 'refresh') {
      throw AppError.unauthorized('Token inválido');
    }

    const userId = payload.sub ?? '';
    const jti = payload.jti ?? '';
    // El deviceId del payload tiene prioridad — si se proveyó en el request se usa como fallback
    const tokenDeviceId = payload.deviceId ?? deviceId;

    // 2. Validar sesión en DB
    const session = await this.prisma.refreshSession.findUnique({
      where: { userId_deviceId_jti: { userId, deviceId: tokenDeviceId, jti } },
    });

    if (!session) {
      logSecurityEvent({
        type: 'SESSION_EXPIRED',
        userId,
        deviceId: tokenDeviceId,
        ip: context?.ip,
        userAgent: context?.userAgent,
        detail: 'refresh token no encontrado en DB — sesión expirada o ya invalidada',
      });
      throw AppError.unauthorized('Sesión expirada, iniciá sesión nuevamente');
    }

    if (session.revokedAt) {
      logSecurityEvent({
        type: 'SESSION_EXPIRED',
        userId,
        deviceId: tokenDeviceId,
        ip: context?.ip,
        userAgent: context?.userAgent,
        detail: 'sesión revocada — acceso con refresh token ya invalidado por el usuario',
        metadata: { jti },
      });
      throw AppError.unauthorized('Sesión expirada, iniciá sesión nuevamente');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshSession.delete({ where: { id: session.id } });
      logSecurityEvent({
        type: 'SESSION_EXPIRED',
        userId,
        deviceId: tokenDeviceId,
        ip: context?.ip,
        userAgent: context?.userAgent,
        detail: 'sesión expirada por TTL',
        metadata: { jti },
      });
      throw AppError.unauthorized('Sesión expirada, iniciá sesión nuevamente');
    }

    const incomingHash = hashToken(refreshToken);
    if (session.tokenHash !== incomingHash) {
      // Posible replay attack — invalidar esta sesión
      await this.prisma.refreshSession.delete({ where: { id: session.id } });
      logSecurityEvent({
        type: 'REFRESH_REPLAY_DETECTED',
        userId,
        deviceId: tokenDeviceId,
        ip: context?.ip,
        userAgent: context?.userAgent,
        detail: 'hash de refresh token no coincide — posible replay attack',
        metadata: { jti },
      });
      throw AppError.unauthorized('Refresh token ya utilizado');
    }

    // 3. Detectar mismatch de deviceId (si el request tiene device-id header diferente al payload)
    if (deviceId !== 'unknown' && payload.deviceId && deviceId !== payload.deviceId) {
      logSecurityEvent({
        type: 'DEVICE_MISMATCH',
        userId,
        deviceId: tokenDeviceId,
        ip: context?.ip,
        userAgent: context?.userAgent,
        detail: 'deviceId del request no coincide con el del token',
        metadata: { tokenDeviceId: payload.deviceId, requestDeviceId: deviceId },
      });
      // No bloquear — continuar con el deviceId del token (más confiable)
      // pero registrar la anomalía para análisis
    }

    // 4. Obtener usuario actualizado
    const user = await this.users.findByIdWithRoles(userId);

    if (!user || !user.isActive) {
      await this.prisma.refreshSession.delete({ where: { id: session.id } });
      throw AppError.unauthorized('Usuario no disponible');
    }

    // 5. Rotar tokens — consumir sesión anterior (single-use), emitir nueva
    await this.prisma.refreshSession.delete({ where: { id: session.id } });

    const roles = extractRoles(user.userRoles);
    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
      roles,
    };

    return this._issueTokens(authUser, tokenDeviceId);
  }

  /**
   * Devuelve el perfil del usuario autenticado.
   */
  async me(userId: string): Promise<AuthenticatedUser> {
    if (this.authorization) {
      const profile = await this.authorization.getAuthenticatedUserProfile(userId);
      if (!profile) {
        throw AppError.unauthorized('Usuario no disponible');
      }

      const scope: ScopeContext | undefined = this.scopeService
        ? await this.scopeService.resolveScope(profile.id)
        : undefined;

      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        roles: profile.roles.map((role) => role.name as PanelRole),
        isActive: profile.isActive,
        permissions: profile.permissions,
        permissionsByModule: profile.permissionsByModule,
        scope,
      };
    }

    const user = await this.users.findByIdWithRoles(userId);

    if (!user || !user.isActive) {
      throw AppError.unauthorized('Usuario no disponible');
    }

    const scope: ScopeContext | undefined = this.scopeService
      ? await this.scopeService.resolveScope(user.id)
      : undefined;

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName ?? null,
      roles: extractRoles(user.userRoles),
      scope,
    };
  }

  /**
   * Logout de la sesión actual (por jti + deviceId del payload).
   * Si el refreshToken no se provee, no hace nada (sesión ya inválida).
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (!refreshToken) return;

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      // Token inválido/expirado → no hay sesión que invalidar
      return;
    }

    const jti = payload.jti ?? '';
    const deviceId = payload.deviceId ?? 'unknown';

    await this.prisma.refreshSession.deleteMany({ where: { userId, deviceId, jti } });
  }

  /**
   * Logout global: invalida TODAS las sesiones del usuario (todos los dispositivos).
   */
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshSession.deleteMany({ where: { userId } });
  }

  /**
   * Registra un nuevo usuario admin.
   * SOLO puede ser llamado por un SUPERADMIN (validación defensiva adicional aquí).
   */
  async registerAdmin(
    data: z.infer<typeof RegisterAdminSchema>,
    requestingUser: { roles: PanelRole[]; permissions?: string[] },
  ): Promise<AuthenticatedUser> {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check defensivo — la capa de middleware ya debería haber bloqueado
    if (!hasPermission(requestingUser.permissions ?? [], 'users.create')) {
      throw AppError.forbidden(
        'Se requiere el permiso users.create para registrar administradores',
      );
    }

    // Verificar que no exista
    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) {
      throw AppError.conflict(`El email ${normalizedEmail} ya está registrado`);
    }

    // Verificar que los roles sean válidos
    const roles = await this.users.findRolesByNames(data.roles);
    if (roles.length !== data.roles.length) {
      throw AppError.badRequest('Uno o más roles no existen');
    }

    const hashedPassword = await hashPassword(data.password);

    const newUser = await this.users.createWithRoleIds({
      email: normalizedEmail,
      hashedPassword,
      fullName: data.fullName,
      isActive: true,
      roleIds: roles.map((r) => r.id),
    });

    return {
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.fullName ?? null,
      roles: extractRoles(newUser.userRoles),
    };
  }

  // ── Privados ────────────────────────────────────────────────────────────────

  /**
   * Emite un nuevo par de tokens y persiste la sesión en PostgreSQL.
   * Si se supera AUTH_MAX_SESSIONS_PER_USER, invalida la sesión más antigua (FIFO).
   */
  private async _issueTokens(user: AuthenticatedUser, deviceId: string): Promise<AuthTokens> {
    const { token: refreshToken, jti } = signRefreshToken(user.id, deviceId);
    const accessToken = signAccessToken(user);

    const ttl = parseExpiresInSeconds(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    // Prune: sesiones expiradas (hard-delete) para mantener la tabla acotada.
    await this.prisma.refreshSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    // Gestión del catálogo de sesiones activas
    const activeCount = await this.prisma.refreshSession.count({
      where: { userId: user.id, revokedAt: null },
    });

    // Evicción FIFO de la(s) sesión(es) más antigua(s) si se supera el límite
    if (activeCount >= env.AUTH_MAX_SESSIONS_PER_USER) {
      const stale = await this.prisma.refreshSession.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        take: activeCount - env.AUTH_MAX_SESSIONS_PER_USER + 1,
      });
      if (stale.length > 0) {
        await this.prisma.refreshSession.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
      }
    }

    await this.prisma.refreshSession.create({
      data: { userId: user.id, deviceId, jti, tokenHash: hashToken(refreshToken), expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
