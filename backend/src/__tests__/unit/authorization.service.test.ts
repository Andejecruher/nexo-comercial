import { describe, expect, it, jest } from '@jest/globals';
import { AuthorizationService } from '../../services/authorization.service';

describe('AuthorizationService', () => {
  it('returns unique effective permissions from multiple roles', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'u1',
          email: 'admin@example.com',
          fullName: 'Admin',
          isActive: true,
          userRoles: [
            {
              role: {
                id: 'r1',
                name: 'A',
                slug: 'a',
                rolePermissions: [
                  { permission: { slug: 'users.view', module: 'users' } },
                  { permission: { slug: 'roles.view', module: 'roles' } },
                ],
              },
            },
            {
              role: {
                id: 'r2',
                name: 'B',
                slug: 'b',
                rolePermissions: [
                  { permission: { slug: 'users.view', module: 'users' } },
                  { permission: { slug: 'users.create', module: 'users' } },
                ],
              },
            },
          ],
        } as never),
      },
    } as any;

    const service = new AuthorizationService(prisma);
    const profile = await service.getAuthenticatedUserProfile('u1');

    expect(profile?.permissions).toEqual(['roles.view', 'users.create', 'users.view']);
    expect(profile?.permissionsByModule).toEqual({ roles: ['view'], users: ['create', 'view'] });
    expect(JSON.stringify(profile)).not.toContain('hashedPassword');
  });

  describe('RN4 / RN7 entity ownership helpers', () => {
    it('assertRequiredEmail accepts a valid email', () => {
      const service = new AuthorizationService({} as never);
      expect(service.assertRequiredEmail('test@example.com', 'coordinator')).toBeUndefined();
    });

    it('assertRequiredEmail throws 400 when email is missing', () => {
      const service = new AuthorizationService({} as never);
      try {
        service.assertRequiredEmail('', 'coordinator');
        throw new Error('expected assertRequiredEmail to throw');
      } catch (error) {
        expect(error).toMatchObject({
          statusCode: 400,
          code: 'BAD_REQUEST',
        });
      }
    });

    it('assertUserEntityOwnership resolves when user has no entity links', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
            id: 'u1',
            coordinator: null,
            leader: null,
          } as never),
        },
      };
      const service = new AuthorizationService(prisma as never);
      await expect(service.assertUserEntityOwnership('test@example.com')).resolves.toBeUndefined();
    });

    it('assertUserEntityOwnership throws 409 when user owns a coordinator', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
            id: 'u1',
            coordinator: { id: 'coord-1' },
            leader: null,
          } as never),
        },
      };
      const service = new AuthorizationService(prisma as never);
      await expect(service.assertUserEntityOwnership('test@example.com')).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
      });
    });

    it('assertUserEntityOwnership throws 409 when user owns a leader', async () => {
      const prisma = {
        user: {
          findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
            id: 'u1',
            coordinator: null,
            leader: { id: 'leader-1' },
          } as never),
        },
      };
      const service = new AuthorizationService(prisma as never);
      await expect(service.assertUserEntityOwnership('test@example.com')).rejects.toMatchObject({
        statusCode: 409,
        code: 'CONFLICT',
      });
    });
  });
});
