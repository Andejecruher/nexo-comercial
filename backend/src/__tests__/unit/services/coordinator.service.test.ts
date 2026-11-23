import { describe, expect, it, jest } from '@jest/globals';
import { CoordinatorService } from '../../../services/coordinator.service';
import { AppError } from '../../../utils/app-error';

jest.mock('../../../config/env.config', () => ({
  env: {
    FRONTEND_URL: 'http://localhost:5173',
    MAIL_PLATFORM_NAME: 'Voz Ciudadana',
    INVITATION_EXPIRATION_MINUTES: 1440,
    INVITATION_RESEND_COOLDOWN_SECONDS: 300,
  },
}));

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

function createMocks() {
  const coordinatorRepo = {
    findById: jest.fn<AsyncMock<[string], unknown>>(),
    findByEmail: jest.fn<AsyncMock<[string], unknown>>(),
    findByUserId: jest.fn<AsyncMock<[string], unknown>>(),
    list: jest.fn<
      AsyncMock<[{ sectionId?: string; structureId?: string; includeInactive?: boolean }], unknown[]>
    >(),
    create: jest.fn<AsyncMock<[unknown], unknown>>(),
    update: jest.fn<AsyncMock<[string, unknown], unknown>>(),
    softDelete: jest.fn<AsyncMock<[string], unknown>>(),
  };

  const userRepo = {
    findByEmail: jest.fn<AsyncMock<[string], unknown>>(),
    findById: jest.fn<AsyncMock<[string], unknown>>(),
    findByIdWithRoles: jest.fn<AsyncMock<[string], unknown>>(),
    findLatestInvitation: jest.fn<AsyncMock<[string], unknown>>(),
    findRolesByNames: jest.fn<AsyncMock<[string[]], unknown>>(),
    createPendingWithInvitation: jest.fn<AsyncMock<[unknown], unknown>>(),
    createInvitationForExistingUser: jest.fn<AsyncMock<[unknown], unknown>>(),
    updateInvitationDelivery: jest.fn<AsyncMock<[string, unknown], unknown>>(),
  };

  const authService = {
    assertRequiredEmail: jest.fn<(email: string | undefined | null, entity: string) => void>(),
    assertUserEntityOwnership: jest.fn<AsyncMock<[string], void>>(),
  };

  const emailService = {
    send: jest.fn<AsyncMock<[unknown], { success: boolean; provider: string }>>(),
  };

  const prisma = {
    $transaction: jest.fn<AsyncMock<[(tx: unknown) => Promise<unknown>], unknown>>(),
    organizationalStructure: {
      findUnique: jest.fn<AsyncMock<[unknown], { id: string; isActive: boolean } | null>>(),
    },
  };

  return { coordinatorRepo, userRepo, authService, emailService, prisma };
}

function createService(overrides: Partial<ReturnType<typeof createMocks>> = {}) {
  const mocks = createMocks();
  const { coordinatorRepo, userRepo, authService, emailService, prisma } = {
    ...mocks,
    ...overrides,
  };
  const service = new CoordinatorService(
    prisma as never,
    coordinatorRepo as never,
    userRepo as never,
    authService as never,
    emailService as never,
  );
  return { service, ...mocks };
}

describe('CoordinatorService.create', () => {
  const validInput = {
    sectionId: 'section-1',
    fullName: 'María Coordinator',
    email: 'maria@ejemplo.test',
    phone: '9611234567',
  };

  it('creates coordinator, user, role and invitation in one transaction', async () => {
    const { service, prisma, coordinatorRepo, userRepo, authService, emailService } =
      createService();

    authService.assertUserEntityOwnership.mockResolvedValue(undefined);
    userRepo.findRolesByNames.mockResolvedValue([{ id: 'role-coord', name: 'COORDINADOR' }]);

    const coordinator = { id: 'coord-1', ...validInput, userId: 'user-1' };
    const user = { id: 'user-1', email: validInput.email, fullName: validInput.fullName };
    const invitation = { id: 'inv-1', status: 'pending', expiresAt: new Date() };

    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        coordinator: {
          create: jest
            .fn<AsyncMock<[unknown], typeof coordinator>>()
            .mockResolvedValue(coordinator),
          update: jest
            .fn<AsyncMock<[unknown], typeof coordinator>>()
            .mockResolvedValue(coordinator),
        },
        user: { create: jest.fn<AsyncMock<[unknown], typeof user>>().mockResolvedValue(user) },
        userRole: {
          create: jest.fn<AsyncMock<[unknown], { id: string }>>().mockResolvedValue({ id: 'ur-1' }),
        },
        userInvitation: {
          create: jest.fn<AsyncMock<[unknown], typeof invitation>>().mockResolvedValue(invitation),
        },
        role: {
          findUnique: jest
            .fn<AsyncMock<[unknown], { id: string; name: string }>>()
            .mockResolvedValue({ id: 'role-coord', name: 'COORDINADOR' }),
        },
      };
      return callback(tx as never);
    });

    emailService.send.mockResolvedValue({ success: true, provider: 'fake' });
    userRepo.updateInvitationDelivery.mockResolvedValue({ ...invitation, status: 'sent' });

    const result = await service.create(validInput);

    expect(result.coordinator).toMatchObject({ id: 'coord-1', userId: 'user-1' });
    expect(result.invitation).toMatchObject({ status: 'sent' });
    expect(authService.assertRequiredEmail).toHaveBeenCalledWith(validInput.email, 'coordinator');
    expect(authService.assertUserEntityOwnership).toHaveBeenCalledWith(validInput.email);
    expect(emailService.send).toHaveBeenCalled();
    expect(userRepo.updateInvitationDelivery).toHaveBeenCalledWith('inv-1', {
      success: true,
      provider: 'fake',
    });
  });

  it('returns pending invitation when email delivery fails', async () => {
    const { service, prisma, authService, userRepo, emailService } = createService();

    authService.assertUserEntityOwnership.mockResolvedValue(undefined);
    userRepo.findRolesByNames.mockResolvedValue([{ id: 'role-coord', name: 'COORDINADOR' }]);

    const coordinator = { id: 'coord-1', ...validInput, userId: 'user-1' };
    const user = { id: 'user-1', email: validInput.email, fullName: validInput.fullName };
    const invitation = { id: 'inv-1', status: 'pending', expiresAt: new Date() };

    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        coordinator: {
          create: jest
            .fn<AsyncMock<[unknown], typeof coordinator>>()
            .mockResolvedValue(coordinator),
          update: jest
            .fn<AsyncMock<[unknown], typeof coordinator>>()
            .mockResolvedValue(coordinator),
        },
        user: { create: jest.fn<AsyncMock<[unknown], typeof user>>().mockResolvedValue(user) },
        userRole: {
          create: jest.fn<AsyncMock<[unknown], { id: string }>>().mockResolvedValue({ id: 'ur-1' }),
        },
        userInvitation: {
          create: jest.fn<AsyncMock<[unknown], typeof invitation>>().mockResolvedValue(invitation),
        },
        role: {
          findUnique: jest
            .fn<AsyncMock<[unknown], { id: string; name: string }>>()
            .mockResolvedValue({ id: 'role-coord', name: 'COORDINADOR' }),
        },
      };
      return callback(tx as never);
    });

    emailService.send.mockResolvedValue({ success: false, provider: 'fake' });
    userRepo.updateInvitationDelivery.mockResolvedValue({ ...invitation, status: 'failed' });

    const result = await service.create(validInput);

    expect(result.invitation).toMatchObject({ status: 'failed' });
    expect(result.warning).toMatchObject({
      code: 'INVITATION_EMAIL_FAILED',
    });
  });

  it('rolls back the transaction when invitation creation fails', async () => {
    const { service, prisma, authService, userRepo } = createService();

    authService.assertUserEntityOwnership.mockResolvedValue(undefined);
    userRepo.findRolesByNames.mockResolvedValue([{ id: 'role-coord', name: 'COORDINADOR' }]);

    prisma.$transaction.mockRejectedValue(new Error('transaction failed'));

    await expect(service.create(validInput)).rejects.toThrow('transaction failed');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('throws 400 when email is missing', async () => {
    const { service, authService } = createService();

    authService.assertRequiredEmail.mockImplementation((email, entity) => {
      if (!email) throw AppError.badRequest(`El email es obligatorio para ${entity}`);
    });

    await expect(service.create({ ...validInput, email: '' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('throws 409 when email already owns another entity', async () => {
    const { service, authService } = createService();

    authService.assertUserEntityOwnership.mockImplementation(async () => {
      throw AppError.conflict('El email ya está vinculado a otra entidad');
    });

    await expect(service.create(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
  });

  it('throws when COORDINADOR role is missing', async () => {
    const { service, prisma, authService, userRepo } = createService();

    authService.assertUserEntityOwnership.mockResolvedValue(undefined);
    userRepo.findRolesByNames.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({}),
    );

    await expect(service.create(validInput)).rejects.toThrow('Rol COORDINADOR no encontrado');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws 409 when email is already registered as a plain user', async () => {
    const { service, prisma, authService, userRepo } = createService();

    authService.assertUserEntityOwnership.mockResolvedValue(undefined);
    userRepo.findRolesByNames.mockResolvedValue([{ id: 'role-coord', name: 'COORDINADOR' }]);
    prisma.$transaction.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'P2002' }));

    await expect(service.create(validInput)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
  });
});

describe('CoordinatorService CRUD', () => {
  it('lists active coordinators filtered by section', async () => {
    const { service, coordinatorRepo } = createService();
    coordinatorRepo.list.mockResolvedValue([{ id: 'coord-1', sectionId: 'section-1' }]);

    const result = await service.list({ sectionId: 'section-1' });

    expect(result).toHaveLength(1);
    expect(coordinatorRepo.list).toHaveBeenCalledWith({
      sectionId: 'section-1',
      includeInactive: false,
    });
  });

  it('lists coordinators filtered by structure', async () => {
    const { service, coordinatorRepo } = createService();
    coordinatorRepo.list.mockResolvedValue([{ id: 'coord-1', structureId: 'struct-1' }]);

    await service.list({ structureId: 'struct-1' });

    expect(coordinatorRepo.list).toHaveBeenCalledWith({
      structureId: 'struct-1',
      includeInactive: false,
    });
  });

  it('gets a coordinator by id', async () => {
    const { service, coordinatorRepo } = createService();
    coordinatorRepo.findById.mockResolvedValue({ id: 'coord-1', fullName: 'María' });

    const result = await service.getById('coord-1');

    expect(result).toMatchObject({ id: 'coord-1', fullName: 'María' });
  });

  it('throws 404 when coordinator is not found', async () => {
    const { service, coordinatorRepo } = createService();
    coordinatorRepo.findById.mockResolvedValue(null);

    await expect(service.getById('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('updates a coordinator', async () => {
    const { service, coordinatorRepo } = createService();
    coordinatorRepo.findById.mockResolvedValue({ id: 'coord-1', fullName: 'María' });
    coordinatorRepo.update.mockResolvedValue({ id: 'coord-1', fullName: 'María Updated' });

    const result = await service.update('coord-1', { fullName: 'María Updated' });

    expect(result).toMatchObject({ fullName: 'María Updated' });
  });

  it('rejects assigning a missing structure', async () => {
    const { service, coordinatorRepo, prisma } = createService();
    coordinatorRepo.findById.mockResolvedValue({
      id: 'coord-1',
      fullName: 'María',
      structureId: null,
    });
    prisma.organizationalStructure.findUnique.mockResolvedValue(null);

    await expect(service.update('coord-1', { structureId: 'struct-missing' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('rejects assigning an inactive structure unless it is already assigned', async () => {
    const { service, coordinatorRepo, prisma } = createService();
    coordinatorRepo.findById.mockResolvedValue({
      id: 'coord-1',
      fullName: 'María',
      structureId: 'struct-old',
    });
    prisma.organizationalStructure.findUnique.mockResolvedValue({
      id: 'struct-new',
      isActive: false,
    });

    await expect(service.update('coord-1', { structureId: 'struct-new' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });

  it('keeps an already assigned inactive structure', async () => {
    const { service, coordinatorRepo, prisma } = createService();
    coordinatorRepo.findById.mockResolvedValue({
      id: 'coord-1',
      fullName: 'María',
      structureId: 'struct-1',
    });
    prisma.organizationalStructure.findUnique.mockResolvedValue({
      id: 'struct-1',
      isActive: false,
    });
    coordinatorRepo.update.mockResolvedValue({ id: 'coord-1', structureId: 'struct-1' });

    const result = await service.update('coord-1', { structureId: 'struct-1' });

    expect(result).toMatchObject({ structureId: 'struct-1' });
    expect(coordinatorRepo.update).toHaveBeenCalledWith('coord-1', { structureId: 'struct-1' });
  });

  it('soft deletes a coordinator', async () => {
    const { service, coordinatorRepo } = createService();
    coordinatorRepo.findById.mockResolvedValue({ id: 'coord-1', isActive: true });
    coordinatorRepo.softDelete.mockResolvedValue({ id: 'coord-1', isActive: false });

    const result = await service.delete('coord-1');

    expect(result).toMatchObject({ isActive: false });
    expect(coordinatorRepo.softDelete).toHaveBeenCalledWith('coord-1');
  });
});

describe('CoordinatorService.reinvite', () => {
  it('resends invitation for an existing coordinator user', async () => {
    const { service, coordinatorRepo, userRepo, emailService } = createService();
    coordinatorRepo.findById.mockResolvedValue({
      id: 'coord-1',
      userId: 'user-1',
      email: 'maria@ejemplo.test',
    });
    userRepo.findByIdWithRoles.mockResolvedValue({
      id: 'user-1',
      email: 'maria@ejemplo.test',
      fullName: 'María',
      isActive: false,
      invitations: [],
      userRoles: [{ role: { id: 'r1', name: 'COORDINADOR', slug: 'coordinador' } }],
    });
    userRepo.findLatestInvitation.mockResolvedValue(null);
    userRepo.createInvitationForExistingUser.mockResolvedValue({
      id: 'inv-2',
      status: 'pending',
      expiresAt: new Date(),
    });
    emailService.send.mockResolvedValue({ success: true, provider: 'fake' });
    userRepo.updateInvitationDelivery.mockResolvedValue({
      id: 'inv-2',
      status: 'sent',
      expiresAt: new Date(),
    });

    const result = await service.reinvite('coord-1');

    expect(result.invitation.status).toBe('sent');
    expect(emailService.send).toHaveBeenCalled();
  });

  it('throws 400 when coordinator has no linked user', async () => {
    const { service, coordinatorRepo } = createService();
    coordinatorRepo.findById.mockResolvedValue({ id: 'coord-1', userId: null });

    await expect(service.reinvite('coord-1')).rejects.toMatchObject({
      statusCode: 400,
      code: 'BAD_REQUEST',
    });
  });
});
