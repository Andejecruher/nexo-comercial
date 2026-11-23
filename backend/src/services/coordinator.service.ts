import type { Coordinator, Prisma } from '@prisma/client';
import { env } from '../config/env.config';
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../database/transaction-options';
import type {
  CoordinatorRepository,
  CoordinatorWithRelations,
} from '../repositories/coordinator.repository';
import type { UserRepository } from '../repositories/user.repository';
import { AppError } from '../utils/app-error';
import { normalizePhoneForStorage } from '../utils/phone-normalizer';
import type { AuthorizationService } from './authorization.service';
import type { EmailService } from './email/email.service';
import { formatExpiration } from './email/format';
import {
  buildActivationUrlFromToken,
  persistPendingUserWithInvitation,
  preparePendingUserInvitation,
} from './entity-provisioning.service';
import {
  buildActivationUrl,
  generateInvitationToken,
  hashInvitationToken,
} from './invitations/invitation-token';
import type { PrismaService } from './prisma.service';
import type { CreateCoordinatorInput, UpdateCoordinatorInput } from './coordinator.schemas';

export type { CreateCoordinatorInput, UpdateCoordinatorInput } from './coordinator.schemas';

export class CoordinatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinatorRepo: CoordinatorRepository,
    private readonly userRepo: UserRepository,
    private readonly authService: AuthorizationService,
    private readonly emailService?: EmailService,
  ) {}

  async create(
    input: CreateCoordinatorInput,
    context?: { actorId?: string; actorName?: string },
  ): Promise<{
    coordinator: { id: string; userId: string | null };
    invitation: { id: string; status: string; expiresAt: Date };
    warning?: { code: string; message: string };
  }> {
    const normalizedEmail = input.email.toLowerCase().trim();

    this.authService.assertRequiredEmail(normalizedEmail, 'coordinator');
    await this.authService.assertUserEntityOwnership(normalizedEmail);
    await this.assertAssignableStructure(input.structureId);

    const prepared = await preparePendingUserInvitation(this.userRepo, {
      email: normalizedEmail,
      fullName: input.fullName,
      roleName: 'COORDINADOR',
    });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const { userId, invitation, rawToken, expiresAt } = await persistPendingUserWithInvitation(
          tx,
          prepared,
          { actorId: context?.actorId },
        );

        const coordinator = await tx.coordinator.create({
          data: {
            sectionId: input.sectionId,
            structureId: input.structureId ?? null,
            fullName: input.fullName,
            phone: input.phone ? normalizePhoneForStorage(input.phone) : null,
            email: normalizedEmail,
            userId,
          },
          select: { id: true },
        });

        return { coordinator, userId, invitation, rawToken, expiresAt };
      }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS);

      if (!this.emailService) {
        return {
          coordinator: { id: result.coordinator.id, userId: result.userId },
          invitation: result.invitation,
        };
      }

      const delivery = await this.emailService.send({
        to: { email: normalizedEmail, name: input.fullName },
        template: 'user-invitation',
        props: {
          recipientName: input.fullName,
          platformName: env.MAIL_PLATFORM_NAME,
          activationUrl: buildActivationUrlFromToken(result.rawToken),
          ...formatExpiration(result.expiresAt),
          supportEmail: env.MAIL_SUPPORT_EMAIL,
          invitedByName: context?.actorName,
        },
      });

      const invitation = await this.userRepo.updateInvitationDelivery(result.invitation.id, {
        success: delivery.success,
        provider: delivery.provider,
        messageId: delivery.messageId,
        errorCode: delivery.errorCode,
      });

      return {
        coordinator: { id: result.coordinator.id, userId: result.userId },
        invitation,
        ...(delivery.success
          ? {}
          : {
              warning: {
                code: 'INVITATION_EMAIL_FAILED',
                message: 'El coordinador se creó, pero la invitación no se pudo enviar.',
              },
            }),
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw AppError.conflict('El email ya está registrado');
      }
      throw error;
    }
  }

  async list(
    params: { sectionId?: string; structureId?: string; includeInactive?: boolean } = {},
  ): Promise<CoordinatorWithRelations[]> {
    return this.coordinatorRepo.list({
      ...(params.sectionId ? { sectionId: params.sectionId } : {}),
      ...(params.structureId ? { structureId: params.structureId } : {}),
      includeInactive: params.includeInactive ?? false,
    });
  }

  async getById(id: string): Promise<CoordinatorWithRelations> {
    const coordinator = await this.coordinatorRepo.findById(id);
    if (!coordinator) throw AppError.notFound('Coordinador no encontrado');
    return coordinator;
  }

  async update(id: string, input: UpdateCoordinatorInput): Promise<Coordinator> {
    const existing = await this.getById(id);
    if (input.structureId !== undefined) {
      await this.assertAssignableStructure(input.structureId, existing.structureId);
    }
    const data: Prisma.CoordinatorUncheckedUpdateInput = {
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.phone !== undefined
        ? { phone: input.phone ? normalizePhoneForStorage(input.phone) : null }
        : {}),
      ...(input.email !== undefined ? { email: input.email.toLowerCase().trim() } : {}),
      ...(input.structureId !== undefined ? { structureId: input.structureId } : {}),
    };
    return this.coordinatorRepo.update(id, data);
  }

  async delete(id: string): Promise<Coordinator> {
    await this.getById(id);
    return this.coordinatorRepo.softDelete(id);
  }

  async reinvite(
    id: string,
    context?: { actorId?: string; actorName?: string },
  ): Promise<{ invitation: { id: string; status: string; expiresAt: Date } }> {
    const coordinator = await this.getById(id);
    if (!coordinator.userId) {
      throw AppError.badRequest('El coordinador no tiene un usuario vinculado');
    }

    const user = await this.userRepo.findByIdWithRoles(coordinator.userId);
    if (!user) throw AppError.notFound('Usuario no encontrado');
    if (user.isActive) throw AppError.badRequest('El usuario ya está activo');

    const latest = await this.userRepo.findLatestInvitation(user.id);
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
    const invitation = await this.userRepo.createInvitationForExistingUser({
      userId: user.id,
      tokenHash: hashInvitationToken(rawToken),
      expiresAt,
      createdById: context?.actorId,
    });

    if (!this.emailService) {
      return { invitation };
    }

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

    const updated = await this.userRepo.updateInvitationDelivery(invitation.id, {
      success: delivery.success,
      provider: delivery.provider,
      messageId: delivery.messageId,
      errorCode: delivery.errorCode,
    });

    return { invitation: updated };
  }

  private async assertAssignableStructure(
    structureId: string | null | undefined,
    currentStructureId?: string | null,
  ): Promise<void> {
    if (!structureId) return;
    const structure = await this.prisma.organizationalStructure.findUnique({
      where: { id: structureId },
      select: { id: true, isActive: true },
    });
    if (!structure) throw AppError.notFound('Estructura no encontrada');
    const keepingAssignedInactive = currentStructureId === structureId && !structure.isActive;
    if (!structure.isActive && !keepingAssignedInactive) {
      throw AppError.badRequest('La estructura no está activa');
    }
  }
}
