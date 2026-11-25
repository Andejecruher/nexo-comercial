import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PasswordResetService } from '../../services/password-reset.service';
import { hashPasswordResetToken } from '../../services/auth/password-reset-token';
import { comparePassword } from '../../utils/password.util';

jest.mock('../../config/env.config', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:5173',
    MAIL_PLATFORM_NAME: 'Nexo Comercial',
    MAIL_SUPPORT_EMAIL: 'soporte@example.test',
    MAIL_TIME_ZONE: 'America/Mexico_City',
    PASSWORD_RESET_EXPIRATION_MINUTES: 60,
    PASSWORD_RESET_COOLDOWN_SECONDS: 60,
  },
}));

const activeUser = {
  id: 'user-1',
  email: 'ana@example.test',
  fullName: 'Ana',
  isActive: true,
};

type CreateResetArgs = { userId: string; tokenHash: string; expiresAt: Date };
type ConsumeResetArgs = { id: string; userId: string; hashedPassword: string };
type SentEmail = { template: string; props: Record<string, string> };

function setup(
  overrides: {
    user?: typeof activeUser | null;
    latestReset?: { createdAt: Date } | null;
    reset?: Record<string, unknown> | null;
  } = {},
) {
  const users = {
    findByEmail: jest.fn(async (_email: string) =>
      'user' in overrides ? overrides.user : activeUser,
    ),
    findLatestPasswordReset: jest.fn(async (_userId: string) => overrides.latestReset ?? null),
    createPasswordReset: jest.fn(async (_input: CreateResetArgs) => ({
      id: 'reset-1',
      expiresAt: new Date(Date.now() + 3_600_000),
      createdAt: new Date(),
    })),
    findPasswordResetByTokenHash: jest.fn(async (_hash: string) => overrides.reset ?? null),
    consumePasswordReset: jest.fn(async (_input: ConsumeResetArgs) => undefined),
  };
  const emailService = {
    send: jest.fn(async (_input: SentEmail) => ({
      success: true,
      provider: 'fake',
      durationMs: 1,
    })),
  };

  return {
    users,
    emailService,
    service: new PasswordResetService(users as never, emailService as never),
  };
}

const validReset = (overrides: Record<string, unknown> = {}) => ({
  id: 'reset-1',
  userId: 'user-1',
  expiresAt: new Date(Date.now() + 3_600_000),
  usedAt: null,
  invalidatedAt: null,
  user: activeUser,
  ...overrides,
});

describe('PasswordResetService.requestReset', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emite token y envía el correo para una cuenta activa', async () => {
    const { service, users, emailService } = setup();

    await expect(service.requestReset('Ana@Example.test')).resolves.toEqual({ requested: true });

    expect(users.findByEmail).toHaveBeenCalledWith('ana@example.test');
    expect(users.createPasswordReset).toHaveBeenCalledTimes(1);
    expect(emailService.send).toHaveBeenCalledTimes(1);

    const call = emailService.send.mock.calls[0]?.[0] as SentEmail;
    expect(call.template).toBe('password-reset');
    expect(call.props.resetUrl).toContain('/reset-password?token=');
  });

  it('no revela cuentas inexistentes ni envía correo', async () => {
    const { service, users, emailService } = setup({ user: null });

    await expect(service.requestReset('desconocida@example.test')).resolves.toEqual({
      requested: true,
    });
    expect(users.createPasswordReset).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('no envía correo a cuentas sin activar', async () => {
    const { service, emailService } = setup({ user: { ...activeUser, isActive: false } });

    await expect(service.requestReset('ana@example.test')).resolves.toEqual({ requested: true });
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('respeta el cooldown sin cambiar la respuesta', async () => {
    const { service, users, emailService } = setup({ latestReset: { createdAt: new Date() } });

    await expect(service.requestReset('ana@example.test')).resolves.toEqual({ requested: true });
    expect(users.createPasswordReset).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('nunca filtra el token en claro al almacenarlo', async () => {
    const { service, users, emailService } = setup();
    await service.requestReset('ana@example.test');

    const stored = users.createPasswordReset.mock.calls[0]?.[0] as CreateResetArgs;
    const sent = emailService.send.mock.calls[0]?.[0] as SentEmail;
    const rawToken = new URL(sent.props.resetUrl).searchParams.get('token') ?? '';

    expect(rawToken.length).toBeGreaterThan(20);
    expect(stored.tokenHash).not.toContain(rawToken);
    expect(stored.tokenHash).toBe(hashPasswordResetToken(rawToken));
  });
});

describe('PasswordResetService.validateToken', () => {
  it.each([
    ['inexistente', null, 'invalid'],
    ['usado', validReset({ usedAt: new Date() }), 'used'],
    ['invalidado', validReset({ invalidatedAt: new Date() }), 'invalid'],
    ['expirado', validReset({ expiresAt: new Date(Date.now() - 1) }), 'expired'],
    ['usuario inactivo', validReset({ user: { ...activeUser, isActive: false } }), 'invalid'],
  ])('clasifica un token %s', async (_label, reset, reason) => {
    const { service } = setup({ reset: reset as Record<string, unknown> | null });
    await expect(service.validateToken('token')).resolves.toEqual({ valid: false, reason });
  });

  it('acepta un token vigente y expone solo datos seguros', async () => {
    const { service } = setup({ reset: validReset() });
    const result = await service.validateToken('token');

    expect(result).toMatchObject({ valid: true, email: 'ana@example.test' });
    expect(JSON.stringify(result)).not.toContain('tokenHash');
    expect(JSON.stringify(result)).not.toContain('user-1');
  });
});

describe('PasswordResetService.resetPassword', () => {
  it('consume el token y guarda la contraseña hasheada', async () => {
    const { service, users } = setup({ reset: validReset() });

    await expect(service.resetPassword('token', 'ClaveNueva123')).resolves.toEqual({
      userId: 'user-1',
      email: 'ana@example.test',
    });

    const call = users.consumePasswordReset.mock.calls[0]?.[0] as ConsumeResetArgs;
    expect(call.hashedPassword).not.toBe('ClaveNueva123');
    await expect(comparePassword('ClaveNueva123', call.hashedPassword)).resolves.toBe(true);
  });

  it.each([
    ['inexistente', null, 400, 'PASSWORD_RESET_INVALID'],
    ['usado', validReset({ usedAt: new Date() }), 409, 'PASSWORD_RESET_USED'],
    [
      'expirado',
      validReset({ expiresAt: new Date(Date.now() - 1) }),
      410,
      'PASSWORD_RESET_EXPIRED',
    ],
  ])('rechaza un token %s', async (_label, reset, statusCode, code) => {
    const { service, users } = setup({ reset: reset as Record<string, unknown> | null });

    await expect(service.resetPassword('token', 'ClaveNueva123')).rejects.toMatchObject({
      statusCode,
      code,
    });
    expect(users.consumePasswordReset).not.toHaveBeenCalled();
  });
});
