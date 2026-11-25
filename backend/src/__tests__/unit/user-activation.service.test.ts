import { describe, expect, it, jest } from '@jest/globals';
import {
  ActivateAccountSchema,
  type InvitationValidation,
  UserService,
} from '../../services/user.service';
import { comparePassword } from '../../utils/password.util';

jest.mock('../../config/env.config', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:5173',
    MAIL_PLATFORM_NAME: 'Nexo Comercial',
    INVITATION_EXPIRATION_MINUTES: 1440,
    INVITATION_RESEND_COOLDOWN_SECONDS: 300,
  },
}));

const invitation = (overrides: Record<string, unknown> = {}) => {
  const expiresAt = new Date(Date.now() + 60_000);
  return {
    id: 'invitation-1',
    userId: 'user-1',
    tokenHash: 'hash',
    status: 'sent',
    expiresAt,
    createdById: 'creator-1',
    user: {
      id: 'user-1',
      email: 'invitada@example.test',
      fullName: 'Persona Invitada',
      isActive: false,
      hashedPassword: 'old-hash',
      createdAt: new Date(),
      userRoles: [{ role: { id: 'role-1', name: 'Operador', slug: 'operador' } }],
      invitations: [
        {
          id: 'invitation-1',
          status: 'sent',
          expiresAt,
          lastErrorCode: null,
        },
      ],
    },
    ...overrides,
  };
};

function setup(row: ReturnType<typeof invitation> | null = invitation()) {
  const users = {
    findInvitationByTokenHash: jest.fn().mockImplementation(async () => row),
    findInvitationCreator: jest.fn().mockImplementation(async () => ({
      fullName: 'Administradora',
      email: 'admin@example.test',
    })),
    acceptInvitation: jest.fn().mockImplementation(async (_id, _userId, hashedPassword) => {
      const pending = invitation();
      return {
        ...pending.user,
        hashedPassword,
        isActive: true,
        invitations: [
          {
            id: pending.id,
            status: 'accepted',
            expiresAt: pending.expiresAt,
            lastErrorCode: null,
          },
        ],
      };
    }),
  };
  const email = {
    send: jest.fn().mockImplementation(async () => ({ success: true })),
  };
  return {
    users,
    email,
    service: new UserService(users as never, email as never),
  };
}

describe('activación de invitaciones', () => {
  it('expone solamente datos seguros para un token válido', async () => {
    const { service } = setup();
    const result = (await service.validateInvitation('fresh-secret-token')) as Extract<
      InvitationValidation,
      { valid: true }
    >;
    expect(result).toMatchObject({
      valid: true,
      email: 'invitada@example.test',
      name: 'Persona Invitada',
      invitedBy: 'Administradora',
    });
    expect(JSON.stringify(result)).not.toContain('tokenHash');
    expect(JSON.stringify(result)).not.toContain('hashedPassword');
    expect(JSON.stringify(result)).not.toContain('user-1');
  });

  it.each([
    ['inexistente', null, 'invalid'],
    ['expirado', invitation({ expiresAt: new Date(Date.now() - 1) }), 'expired'],
    ['utilizado', invitation({ status: 'accepted' }), 'used'],
    ['usuario activo', invitation({ user: { ...invitation().user, isActive: true } }), 'used'],
    ['revocado', invitation({ status: 'revoked' }), 'invalid'],
  ])('clasifica un token %s', async (_label, row, reason) => {
    const { service } = setup(row as ReturnType<typeof invitation> | null);
    await expect(service.validateInvitation('fresh-secret-token')).resolves.toEqual({
      valid: false,
      reason,
    });
  });

  it('activa con hash nuevo y preserva los roles', async () => {
    const { service, users } = setup();
    const result = await service.activateInvitation('fresh-secret-token', 'ClaveNueva123');
    expect(result.isActive).toBe(true);
    expect(result.roles).toEqual([{ id: 'role-1', name: 'Operador', slug: 'operador' }]);
    expect(result.invitation?.status).toBe('accepted');
    const hash = users.acceptInvitation.mock.calls[0]?.[2] as string;
    await expect(comparePassword('ClaveNueva123', hash)).resolves.toBe(true);
  });

  it('rechaza activación repetida de forma controlada', async () => {
    const { service, users } = setup(invitation({ status: 'accepted' }));
    await expect(
      service.activateInvitation('fresh-secret-token', 'ClaveNueva123'),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVITATION_USED',
    });
    expect(users.acceptInvitation).not.toHaveBeenCalled();
  });

  it('valida contraseña y confirmación con el schema compartido del endpoint', () => {
    expect(() =>
      ActivateAccountSchema.parse({
        token: 'x'.repeat(32),
        password: '12345678',
        passwordConfirmation: '87654321',
      }),
    ).toThrow('Las contraseñas no coinciden');
    expect(() =>
      ActivateAccountSchema.parse({
        token: 'x'.repeat(32),
        password: 'corta',
        passwordConfirmation: 'corta',
      }),
    ).toThrow();
  });
});
