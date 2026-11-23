import { Prisma } from '@prisma/client';
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { PrismaService } from '../services/prisma.service';
import { AppError } from '../utils/app-error';

export const userWithRolesSelect = {
  id: true,
  email: true,
  fullName: true,
  hashedPassword: true,
  isActive: true,
  createdAt: true,
  invitations: {
    select: {
      id: true,
      status: true,
      lastErrorCode: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  userRoles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  },
} as const;

export const userProfileSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  createdAt: true,
  isActive: true,
  userRoles: userWithRolesSelect.userRoles,
} as const;

export type UserWithRoles = Prisma.UserGetPayload<{ select: typeof userWithRolesSelect }>;

export interface CreateUserWithRolesInput {
  email: string;
  hashedPassword: string;
  fullName: string;
  isActive?: boolean;
  roleIds?: string[];
}

export interface UpdateUserFieldsInput {
  fullName?: string;
  hashedPassword?: string;
  isActive?: boolean;
}

/**
 * Repository de usuarios y roles de panel.
 *
 * Nota: en este commit solo se incorpora como base para migración gradual.
 */
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfile(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: userProfileSelect });
  }

  findOtherProfileByEmail(email: string, id: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, id: { not: id } },
      select: { id: true },
    });
  }

  updateProfile(id: string, data: { fullName?: string; email?: string; phone?: string | null }) {
    return this.prisma.user.update({ where: { id }, data, select: userProfileSelect });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByEmailWithRoles(email: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: userWithRolesSelect,
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByIdWithRoles(id: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: userWithRolesSelect,
    });
  }

  async listWithRoles(): Promise<UserWithRoles[]> {
    return this.prisma.user.findMany({
      select: userWithRolesSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async countRolesByIds(roleIds: string[]): Promise<number> {
    return this.prisma.role.count({ where: { id: { in: roleIds } } });
  }

  async findRolesByNames(roleNames: string[]) {
    return this.prisma.role.findMany({
      where: { name: { in: roleNames } },
      select: { id: true, name: true },
    });
  }

  async findRoleById(roleId: string) {
    return this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
  }

  async createPendingWithInvitation(
    input: CreateUserWithRolesInput & { tokenHash: string; expiresAt: Date; createdById?: string },
  ): Promise<{ user: UserWithRoles; invitation: { id: string; status: string; expiresAt: Date } }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          hashedPassword: input.hashedPassword,
          fullName: input.fullName,
          isActive: false,
        },
        select: { id: true },
      });

      const roleIds = input.roleIds ?? [];
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: user.id, roleId })),
          skipDuplicates: true,
        });
      }

      const invitation = await tx.userInvitation.create({
        data: {
          userId: user.id,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdById: input.createdById,
        },
        select: { id: true, status: true, expiresAt: true },
      });

      const createdUser = await tx.user.findUnique({
        where: { id: user.id },
        select: userWithRolesSelect,
      });

      return { user: createdUser, invitation };
    });

    if (!result.user) {
      throw new Error('No se pudo crear el usuario');
    }

    return { user: result.user, invitation: result.invitation };
  }

  async createInvitationForExistingUser(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdById?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.userInvitation.updateMany({
        where: { userId: input.userId, status: { in: ['pending', 'sent', 'failed'] } },
        data: { status: 'revoked', revokedAt: new Date() },
      });
      return tx.userInvitation.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdById: input.createdById,
        },
        select: { id: true, status: true, expiresAt: true },
      });
    });
  }

  async updateInvitationDelivery(
    id: string,
    input: { success: boolean; provider: string; messageId?: string; errorCode?: string },
  ) {
    return this.prisma.userInvitation.update({
      where: { id },
      data: {
        status: input.success ? 'sent' : 'failed',
        sentAt: input.success ? new Date() : undefined,
        provider: input.provider,
        providerMessageId: input.messageId,
        lastErrorCode: input.errorCode,
        deliveryAttemptCount: { increment: 1 },
      },
      select: { id: true, status: true, expiresAt: true, lastErrorCode: true },
    });
  }

  async findLatestInvitation(userId: string) {
    return this.prisma.userInvitation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findInvitationByTokenHash(tokenHash: string) {
    return this.prisma.userInvitation.findUnique({
      where: { tokenHash },
      include: { user: { select: userWithRolesSelect } },
    });
  }

  async findInvitationCreator(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { email: true, fullName: true },
    });
  }

  async acceptInvitation(
    id: string,
    userId: string,
    hashedPassword: string,
  ): Promise<UserWithRoles> {
    const result = await this.prisma.$transaction(async (tx) => {
      const acceptedAt = new Date();
      const claimed = await tx.userInvitation.updateMany({
        where: {
          id,
          userId,
          status: { in: ['pending', 'sent', 'failed'] },
          expiresAt: { gt: acceptedAt },
          user: { isActive: false },
        },
        data: { status: 'accepted', acceptedAt },
      });
      if (claimed.count !== 1) {
        throw new AppError('La invitación ya no está disponible', 409, 'INVITATION_USED');
      }
      await tx.user.update({ where: { id: userId }, data: { hashedPassword, isActive: true } });
      return tx.user.findUnique({ where: { id: userId }, select: userWithRolesSelect });
    });
    if (!result) throw new Error('No se pudo activar el usuario');
    return result;
  }

  // ── Restablecimiento de contraseña ─────────────────────────────────────────

  /** Invalida los resets pendientes del usuario y emite uno nuevo. */
  async createPasswordReset(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    requestedIp?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.passwordReset.updateMany({
        where: { userId: input.userId, usedAt: null, invalidatedAt: null },
        data: { invalidatedAt: new Date() },
      });
      return tx.passwordReset.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          requestedIp: input.requestedIp ?? null,
        },
        select: { id: true, expiresAt: true, createdAt: true },
      });
    });
  }

  async findLatestPasswordReset(userId: string) {
    return this.prisma.passwordReset.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, usedAt: true, invalidatedAt: true, expiresAt: true },
    });
  }

  async findPasswordResetByTokenHash(tokenHash: string) {
    return this.prisma.passwordReset.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, fullName: true, isActive: true } } },
    });
  }

  /**
   * Consume el token y actualiza la contraseña en una sola transacción.
   * El `updateMany` condicionado evita que dos requests simultáneos lo usen dos veces.
   */
  async consumePasswordReset(input: {
    id: string;
    userId: string;
    hashedPassword: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const usedAt = new Date();
      const claimed = await tx.passwordReset.updateMany({
        where: {
          id: input.id,
          userId: input.userId,
          usedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: usedAt },
        },
        data: { usedAt },
      });
      if (claimed.count !== 1) {
        throw new AppError('El enlace ya no está disponible', 409, 'PASSWORD_RESET_USED');
      }
      await tx.user.update({
        where: { id: input.userId },
        data: { hashedPassword: input.hashedPassword },
      });
    });
  }

  async createWithRoleIds(input: CreateUserWithRolesInput): Promise<UserWithRoles> {
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          hashedPassword: input.hashedPassword,
          fullName: input.fullName,
          isActive: input.isActive ?? true,
        },
        select: { id: true },
      });

      const roleIds = input.roleIds ?? [];
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId: user.id, roleId })),
          skipDuplicates: true,
        });
      }

      return tx.user.findUnique({
        where: { id: user.id },
        select: userWithRolesSelect,
      });
    });

    if (!created) {
      throw new Error('No se pudo crear el usuario');
    }

    return created;
  }

  async updateFields(id: string, data: UpdateUserFieldsInput): Promise<UserWithRoles> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.hashedPassword !== undefined ? { hashedPassword: data.hashedPassword } : {}),
      },
      select: userWithRolesSelect,
    });
  }

  async assignRole(userId: string, roleId: string) {
    return this.prisma.userRole.create({
      data: { userId, roleId },
    });
  }

  async findRoleAssignment(userId: string, roleId: string) {
    return this.prisma.userRole.findFirst({
      where: { userId, roleId },
      select: { id: true },
    });
  }

  async removeRoleAssignmentById(assignmentId: string) {
    return this.prisma.userRole.delete({
      where: { id: assignmentId },
    });
  }

  async replaceRoles(userId: string, roleIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });

      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId, roleId })),
        });
      }
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
    await this.prisma.userRole.deleteMany({ where: { userId: id } });
    await this.prisma.userInvitation.deleteMany({ where: { userId: id } });
    await this.prisma.passwordReset.deleteMany({ where: { userId: id } });
    await this.prisma.userInvitation.deleteMany({ where: { userId: id } });
    await this.prisma.userInvitation.deleteMany({ where: { userId: id } });
  }
}
