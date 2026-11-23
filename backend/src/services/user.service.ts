import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from '../config/env.config';
import type { UserRepository, UserWithRoles } from '../repositories';
import { AppError } from '../utils/app-error';
import { hashPassword } from '../utils/password.util';
import type { EmailService } from './email/email.service';
import { formatExpiration } from './email/format';
import {
  buildActivationUrl,
  generateInvitationToken,
  hashInvitationToken,
} from './invitations/invitation-token';

export const CreateUserSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).optional(),
  fullName: z.string().trim().min(2),
  isActive: z.boolean().optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

export const UpdateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).optional(),
    password: z.string().min(8).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.fullName !== undefined || data.password !== undefined || data.isActive !== undefined,
    {
      message: 'Al menos un campo debe ser enviado',
    },
  );

export const UpdateProfileSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(255)
    .optional(),
  correo: z
    .string()
    .trim()
    .email('El correo electrónico no es válido')
    .max(255)
    .transform((value) => value.toLowerCase())
    .optional(),
  telefono: z
    .string()
    .trim()
    .max(30)
    .refine(
      (value) =>
        value === '' ||
        (/^\+?[0-9 ()-]+$/.test(value) &&
          value.replace(/\D/g, '').length >= 7 &&
          value.replace(/\D/g, '').length <= 15),
      'Ingresá un teléfono válido de 7 a 15 dígitos',
    )
    .nullable()
    .optional(),
});

export interface UserProfileResponse {
  id: string;
  nombre: string | null;
  correo: string;
  telefono: string | null;
  roles: Array<{ id: string; name: string; slug: string }>;
  fechaRegistro: Date;
}

export const PASSWORD_MIN_LENGTH = 8;

export const ActivateAccountSchema = z
  .object({
    token: z.string().trim().min(20),
    password: z.string().min(PASSWORD_MIN_LENGTH),
    passwordConfirmation: z.string().min(1),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['passwordConfirmation'],
  });

export const ValidateInvitationQuerySchema = z.object({
  token: z.string().trim().min(20),
});

export type InvitationValidation =
  | {
      valid: true;
      email: string;
      name: string | null;
      teamName: string;
      invitedBy: string | null;
      expiresAt: Date;
    }
  | { valid: false; reason: 'invalid' | 'expired' | 'used' };

export const UserIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const UserRoleParamSchema = z.object({
  id: z.string().uuid(),
  roleId: z.string().uuid(),
});

export type UserResponse = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: Date;
  roles: Array<{ id: string; name: string; slug: string }>;
  invitation:
    | {
        id: string;
        status: string;
        expiresAt: Date;
        lastErrorCode?: string | null;
      }
    | undefined
    | null;
};

type CreateUserInput = z.infer<typeof CreateUserSchema>;
type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly emailService?: EmailService,
  ) {}

  async getProfile(id: string): Promise<UserProfileResponse> {
    const user = await this.users.findProfile(id);
    if (!user || !user.isActive) throw AppError.unauthorized('La cuenta no está disponible');
    return this.toProfileResponse(user);
  }

  async updateProfile(id: string, payload: unknown): Promise<UserProfileResponse> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw AppError.badRequest('El cuerpo debe ser un objeto');
    }
    const parsed = UpdateProfileSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError(
        'Revisá el nombre, correo y teléfono del perfil',
        422,
        'VALIDATION_ERROR',
        parsed.error.issues,
      );
    }
    const input = parsed.data;
    if (Object.keys(input).length === 0)
      throw AppError.badRequest('Enviá al menos un campo editable');
    await this.getProfile(id);
    if (input.correo && (await this.users.findOtherProfileByEmail(input.correo, id))) {
      throw AppError.conflict('El correo electrónico ya está en uso por otra cuenta');
    }
    try {
      const updated = await this.users.updateProfile(id, {
        ...(input.nombre !== undefined ? { fullName: input.nombre } : {}),
        ...(input.correo !== undefined ? { email: input.correo } : {}),
        ...(input.telefono !== undefined ? { phone: input.telefono || null } : {}),
      });
      return this.toProfileResponse(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict('El correo electrónico ya está en uso por otra cuenta');
      }
      throw error;
    }
  }

  private toProfileResponse(user: NonNullable<Awaited<ReturnType<UserRepository['findProfile']>>>) {
    return {
      id: user.id,
      nombre: user.fullName,
      correo: user.email,
      telefono: user.phone,
      roles: user.userRoles.map(({ role }) => ({ id: role.id, name: role.name, slug: role.slug })),
      fechaRegistro: user.createdAt,
    };
  }

  async createUser(
    input: CreateUserInput,
    context?: { actorId?: string; actorName?: string },
  ): Promise<
    UserResponse & {
      invitation?: { id: string; status: string; expiresAt: Date; lastErrorCode?: string | null };
    }
  > {
    const normalizedEmail = input.email.toLowerCase().trim();

    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) {
      throw AppError.conflict(`El email ${normalizedEmail} ya está registrado`);
    }

    const roleIds = input.roleIds ?? [];
    if (roleIds.length > 0) {
      const rolesCount = await this.users.countRolesByIds(roleIds);
      if (rolesCount !== new Set(roleIds).size) {
        throw AppError.badRequest('Uno o más roleIds no existen');
      }
    }

    if (!this.emailService) {
      const hashedPassword = await hashPassword(
        input.password ?? crypto.randomBytes(18).toString('base64url'),
      );
      const created = await this.users.createWithRoleIds({
        email: normalizedEmail,
        hashedPassword,
        fullName: input.fullName,
        isActive: input.isActive ?? true,
        roleIds,
      });
      return { ...this.toResponse(created), invitation: undefined };
    }

    const rawToken = generateInvitationToken();
    const expiresAt = new Date(Date.now() + env.INVITATION_EXPIRATION_MINUTES * 60_000);
    const hashedPassword = await hashPassword(
      input.password ?? crypto.randomBytes(24).toString('base64url'),
    );

    const created = await this.users.createPendingWithInvitation({
      email: normalizedEmail,
      hashedPassword,
      fullName: input.fullName,
      isActive: false,
      roleIds,
      tokenHash: hashInvitationToken(rawToken),
      expiresAt,
      createdById: context?.actorId,
    });

    const delivery = await this.emailService.send({
      to: { email: normalizedEmail, name: input.fullName },
      template: 'user-invitation',
      props: {
        recipientName: input.fullName,
        platformName: env.MAIL_PLATFORM_NAME,
        activationUrl: buildActivationUrl(env.FRONTEND_URL, rawToken),
        ...formatExpiration(expiresAt),
        supportEmail: env.MAIL_SUPPORT_EMAIL,
        invitedByName: context?.actorName,
      },
    });

    const invitation = await this.users.updateInvitationDelivery(created.invitation.id, {
      success: delivery.success,
      provider: delivery.provider,
      messageId: delivery.messageId,
      errorCode: delivery.errorCode,
    });

    return { ...this.toResponse(created.user), invitation };
  }

  async resendInvitation(
    userId: string,
    context?: { actorId?: string; actorName?: string },
  ): Promise<{
    invitation: { id: string; status: string; expiresAt: Date; lastErrorCode?: string | null };
    retryAfter?: number;
  }> {
    if (!this.emailService) {
      throw AppError.badRequest('El servicio de correo no está configurado');
    }

    const user = await this.users.findByIdWithRoles(userId);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    if (user.isActive) throw AppError.badRequest('El usuario ya está activo');

    const latest = await this.users.findLatestInvitation(userId);
    if (latest?.createdAt) {
      const ageSeconds = Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
      if (ageSeconds < env.INVITATION_RESEND_COOLDOWN_SECONDS) {
        throw AppError.tooManyRequests('Debés esperar antes de reenviar la invitación', {
          retryAfter: env.INVITATION_RESEND_COOLDOWN_SECONDS - ageSeconds,
        });
      }
    }

    const rawToken = generateInvitationToken();
    const expiresAt = new Date(Date.now() + env.INVITATION_EXPIRATION_MINUTES * 60_000);
    const invitation = await this.users.createInvitationForExistingUser({
      userId,
      tokenHash: hashInvitationToken(rawToken),
      expiresAt,
      createdById: context?.actorId,
    });

    const delivery = await this.emailService.send({
      to: { email: user.email, name: user.fullName ?? undefined },
      template: 'user-invitation',
      props: {
        recipientName: user.fullName ?? 'integrante del equipo',
        platformName: env.MAIL_PLATFORM_NAME,
        activationUrl: buildActivationUrl(env.FRONTEND_URL, rawToken),
        ...formatExpiration(expiresAt),
        supportEmail: env.MAIL_SUPPORT_EMAIL,
        invitedByName: context?.actorName,
        isResend: true,
      },
      category: 'user-invitation-resend',
    });

    const updated = await this.users.updateInvitationDelivery(invitation.id, {
      success: delivery.success,
      provider: delivery.provider,
      messageId: delivery.messageId,
      errorCode: delivery.errorCode,
    });

    return { invitation: updated, retryAfter: delivery.retryAfterSeconds };
  }

  async activateInvitation(token: string, password: string): Promise<UserResponse> {
    const invitation = await this.getActivatableInvitation(token);
    const hashedPassword = await hashPassword(password);
    const user = await this.users.acceptInvitation(
      invitation.id,
      invitation.userId,
      hashedPassword,
    );
    await this.emailService?.send({
      to: { email: user.email, name: user.fullName ?? undefined },
      template: 'account-activated',
      props: {
        recipientName: user.fullName ?? 'integrante del equipo',
        platformName: env.MAIL_PLATFORM_NAME,
        loginUrl: env.FRONTEND_URL,
      },
    });
    return this.toResponse(user);
  }

  async validateInvitation(token: string): Promise<InvitationValidation> {
    const invitation = await this.users.findInvitationByTokenHash(hashInvitationToken(token));
    if (!invitation) return { valid: false, reason: 'invalid' };
    if (invitation.status === 'accepted' || invitation.user.isActive) {
      return { valid: false, reason: 'used' };
    }
    if (invitation.expiresAt.getTime() <= Date.now() || invitation.status === 'expired') {
      return { valid: false, reason: 'expired' };
    }
    if (!['pending', 'sent', 'failed'].includes(invitation.status)) {
      return { valid: false, reason: 'invalid' };
    }

    const inviter = invitation.createdById
      ? await this.users.findInvitationCreator(invitation.createdById)
      : null;
    return {
      valid: true,
      email: invitation.user.email,
      name: invitation.user.fullName,
      teamName: env.MAIL_PLATFORM_NAME,
      invitedBy: inviter?.fullName ?? inviter?.email ?? null,
      expiresAt: invitation.expiresAt,
    };
  }

  private async getActivatableInvitation(token: string) {
    const invitation = await this.users.findInvitationByTokenHash(hashInvitationToken(token));
    if (!invitation) {
      throw new AppError('La invitación no es válida', 400, 'INVITATION_INVALID');
    }
    if (invitation.status === 'accepted' || invitation.user.isActive) {
      throw new AppError('La invitación ya fue utilizada', 409, 'INVITATION_USED');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new AppError('La invitación expiró', 410, 'INVITATION_EXPIRED');
    }
    if (!['pending', 'sent', 'failed'].includes(invitation.status)) {
      throw new AppError('La invitación no es válida', 400, 'INVITATION_INVALID');
    }
    return invitation;
  }

  async listUsers(): Promise<UserResponse[]> {
    const users = await this.users.listWithRoles();
    // Agregar estado

    return users.map((user) => this.toResponse(user));
  }

  async getUserById(id: string): Promise<UserResponse> {
    const user = await this.users.findByIdWithRoles(id);

    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }

    return this.toResponse(user);
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<UserResponse> {
    const existing = await this.users.findById(id);
    if (!existing) {
      throw AppError.notFound('Usuario no encontrado');
    }

    const hashedPassword = input.password ? await hashPassword(input.password) : undefined;

    const updated = await this.users.updateFields(id, {
      fullName: input.fullName,
      isActive: input.isActive,
      hashedPassword,
    });

    return this.toResponse(updated);
  }

  async deleteUserById(id: string): Promise<void> {
    await this.ensureUserExists(id);
    await this.users.deleteById(id);
  }

  async assignRole(userId: string, roleId: string): Promise<UserResponse> {
    await this.ensureUserExists(userId);
    await this.ensureRoleExists(roleId);

    try {
      await this.users.assignRole(userId, roleId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppError.conflict('El rol ya está asignado al usuario');
      }
      throw error;
    }

    return this.getUserById(userId);
  }

  async removeRole(userId: string, roleId: string): Promise<UserResponse> {
    await this.ensureUserExists(userId);

    const existingAssignment = await this.users.findRoleAssignment(userId, roleId);

    if (!existingAssignment) {
      throw AppError.notFound('El rol no está asignado al usuario');
    }

    await this.users.removeRoleAssignmentById(existingAssignment.id);

    return this.getUserById(userId);
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw AppError.notFound('Usuario no encontrado');
    }
  }

  private async ensureRoleExists(roleId: string): Promise<void> {
    const role = await this.users.findRoleById(roleId);
    if (!role) {
      throw AppError.notFound('Rol no encontrado');
    }
  }

  private toResponse(user: UserWithRoles): UserResponse {
    const latestInvitation = user.invitations?.[0];
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      createdAt: user.createdAt,
      roles: user.userRoles.map((userRole) => ({
        id: userRole.role.id,
        name: userRole.role.name,
        slug: userRole.role.slug,
      })),
      invitation: latestInvitation
        ? {
            id: latestInvitation.id,
            status: latestInvitation.status,
            expiresAt: latestInvitation.expiresAt,
            lastErrorCode: latestInvitation.lastErrorCode,
          }
        : null,
    };
  }
}
