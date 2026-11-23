import type { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { env } from '../config/env.config';
import type { UserRepository } from '../repositories/user.repository';
import { hashPassword } from '../utils/password.util';
import {
  buildActivationUrl,
  generateInvitationToken,
  hashInvitationToken,
} from './invitations/invitation-token';

export type PreparedPendingUser = {
  email: string;
  fullName: string;
  roleId: string;
  hashedPassword: string;
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
};

export type PendingUserResult = {
  userId: string;
  invitation: { id: string; status: string; expiresAt: Date };
  rawToken: string;
  expiresAt: Date;
};

/**
 * Resuelve rol, token e hash de password placeholder fuera de la transacción.
 * bcrypt y el lookup de rol no deben correr con una tx interactiva abierta.
 */
export async function preparePendingUserInvitation(
  userRepo: UserRepository,
  input: {
    email: string;
    fullName: string;
    roleName: 'COORDINADOR' | 'LIDER';
  },
): Promise<PreparedPendingUser> {
  const email = input.email.toLowerCase().trim();
  const roles = await userRepo.findRolesByNames([input.roleName]);
  if (roles.length === 0) {
    throw new Error(`Rol ${input.roleName} no encontrado`);
  }

  const rawToken = generateInvitationToken();
  const expiresAt = new Date(Date.now() + env.INVITATION_EXPIRATION_MINUTES * 60_000);

  return {
    email,
    fullName: input.fullName,
    roleId: roles[0].id,
    hashedPassword: await hashPassword(crypto.randomBytes(24).toString('base64url')),
    rawToken,
    tokenHash: hashInvitationToken(rawToken),
    expiresAt,
  };
}

/**
 * Persiste usuario, rol e invitación dentro de una transacción ya abierta.
 * El llamador envía el correo después del commit.
 */
export async function persistPendingUserWithInvitation(
  tx: Prisma.TransactionClient,
  prepared: PreparedPendingUser,
  context?: { actorId?: string },
): Promise<PendingUserResult> {
  const user = await tx.user.create({
    data: {
      email: prepared.email,
      hashedPassword: prepared.hashedPassword,
      fullName: prepared.fullName,
      isActive: false,
    },
    select: { id: true },
  });

  await tx.userRole.create({
    data: { userId: user.id, roleId: prepared.roleId },
  });

  const invitation = await tx.userInvitation.create({
    data: {
      userId: user.id,
      tokenHash: prepared.tokenHash,
      expiresAt: prepared.expiresAt,
      createdById: context?.actorId,
    },
    select: { id: true, status: true, expiresAt: true },
  });

  return {
    userId: user.id,
    invitation,
    rawToken: prepared.rawToken,
    expiresAt: prepared.expiresAt,
  };
}

/**
 * Construye la URL de activación para una invitación.
 */
export function buildActivationUrlFromToken(rawToken: string): string {
  return buildActivationUrl(env.FRONTEND_URL, rawToken);
}
