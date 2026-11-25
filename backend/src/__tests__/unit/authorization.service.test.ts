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
});
