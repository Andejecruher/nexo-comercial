import { describe, expect, it, jest } from '@jest/globals';
import { AuthService } from '../../../services/auth.service';
import { AppError } from '../../../utils/app-error';

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

function createMocks() {
  const users = {
    findByEmailWithRoles: jest.fn<AsyncMock<[string], unknown>>(),
    findByIdWithRoles: jest.fn<AsyncMock<[string], unknown>>(),
  };
  const prisma = {
    refreshSession: {
      deleteMany: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({ count: 0 }),
      count: jest.fn<AsyncMock<[unknown], number>>().mockResolvedValue(0),
      findMany: jest.fn<AsyncMock<[unknown], unknown[]>>().mockResolvedValue([]),
      findUnique: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue(null),
      create: jest.fn<AsyncMock<[unknown], unknown>>().mockResolvedValue({}),
    },
  };
  const lockout = {
    checkLockout: jest.fn<AsyncMock<[string], void>>().mockResolvedValue(undefined),
    clearFailures: jest.fn<AsyncMock<[string], void>>().mockResolvedValue(undefined),
    recordFailure: jest.fn<AsyncMock<[string], void>>().mockResolvedValue(undefined),
  };
  const authorization = {
    getAuthenticatedUserProfile: jest.fn<AsyncMock<[string], unknown>>().mockResolvedValue(null),
  };
  const scopeService = {
    resolveScope: jest.fn<AsyncMock<[string], unknown>>().mockResolvedValue({ kind: 'admin' }),
  };
  return { users, prisma, lockout, authorization, scopeService };
}

function createService(overrides: Partial<ReturnType<typeof createMocks>> = {}) {
  const mocks = createMocks();
  const { users, prisma, lockout, authorization, scopeService } = { ...mocks, ...overrides };
  const service = new AuthService(
    users as never,
    prisma as never,
    lockout as never,
    authorization as never,
    undefined,
    undefined,
    scopeService as never,
  );
  return { service, ...mocks };
}

describe('AuthService.login scope', () => {
  it('includes resolved scope in the login response', async () => {
    const { service, users, lockout, scopeService } = createService();
    const user = {
      id: 'user-1',
      email: 'admin@example.com',
      fullName: 'Admin',
      isActive: true,
      hashedPassword: '$2b$10$hashed',
      userRoles: [{ role: { name: 'SUPER_ADMIN', slug: 'super-admin' } }],
    };
    users.findByEmailWithRoles.mockResolvedValue(user);
    lockout.checkLockout.mockResolvedValue(undefined);
    jest.spyOn(await import('../../../utils/password.util'), 'comparePassword').mockResolvedValue(true);
    scopeService.resolveScope.mockResolvedValue({ kind: 'admin' });

    const result = await service.login('admin@example.com', 'Password123!', 'device-1');

    expect(result.user.scope).toEqual({ kind: 'admin' });
    expect(scopeService.resolveScope).toHaveBeenCalledWith('user-1');
  });
});

describe('AuthService.me scope', () => {
  it('includes resolved scope in the profile', async () => {
    const { service, authorization, scopeService } = createService();
    authorization.getAuthenticatedUserProfile.mockResolvedValue({
      id: 'user-1',
      email: 'lider@example.com',
      fullName: 'Líder',
      isActive: true,
      roles: [{ id: 'role-1', name: 'LIDER', slug: 'lider' }],
      permissions: [],
      permissionsByModule: {},
    });
    scopeService.resolveScope.mockResolvedValue({ kind: 'none' });

    const result = await service.me('user-1');

    expect(result.scope).toEqual({ kind: 'none' });
  });

  it('throws unauthorized when authorization profile is missing', async () => {
    const { service, authorization } = createService();
    authorization.getAuthenticatedUserProfile.mockResolvedValue(null);

    await expect(service.me('missing')).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });
});
