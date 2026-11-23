import { describe, expect, it, jest } from '@jest/globals';
import {
  CreatePermissionSchema,
  normalizePermissionKey,
  RolesPermissionsService,
} from '../../services/roles-permissions.service';

function repository(overrides: Record<string, jest.Mock> = {}) {
  return {
    createPermission: jest.fn(async (data: any) => ({ id: 'permission-id', ...data })),
    updatePermission: jest.fn(async (id: string, data: any) => ({ id, ...data })),
    getPermission: jest.fn(async () => ({
      id: 'permission-id',
      name: 'Ver',
      slug: 'users.view',
      module: 'users',
      description: null,
      isActive: true,
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { rolePermissions: 2 },
    })),
    findPermissions: jest.fn(async () => [[], 0, []]),
    listPermissionRoles: jest.fn(async () => []),
    isUniqueError: jest.fn(() => false),
    ...overrides,
  };
}

describe('permission management', () => {
  it('normalizes accents, spaces and separators', () => {
    expect(normalizePermissionKey(' Miémbros / Crear ')).toBe('miembros.crear');
  });

  it('rejects invalid payloads', () => {
    expect(() => CreatePermissionSchema.parse({ name: '', slug: '', module: '' })).toThrow();
  });

  it('creates a normalized permission', async () => {
    const repo = repository();
    const service = new RolesPermissionsService(repo as never);
    await service.createPermission({
      name: 'Crear miembros',
      slug: 'Miembros Crear',
      module: 'Miembros',
      description: null,
      isActive: true,
    });
    expect(repo.createPermission).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'miembros.crear', module: 'miembros' }),
    );
  });

  it('exposes role previews and module facets when listing', async () => {
    const repo = repository({
      findPermissions: jest.fn(async () => [
        [
          {
            id: 'permission-id',
            name: 'Ver canales e IA',
            slug: 'ai.view',
            module: 'ai',
            _count: { rolePermissions: 4 },
            rolePermissions: [
              { role: { id: 'r1', name: 'ADMIN', slug: 'admin' } },
              { role: { id: 'r2', name: 'LIDER', slug: 'lider' } },
            ],
          },
        ],
        1,
        [
          { module: 'ai', _count: { _all: 4 } },
          { module: 'barrios', _count: { _all: 5 } },
        ],
      ]),
    });
    const service = new RolesPermissionsService(repo as never);
    const result = await service.listPermissions({
      page: 1,
      limit: 15,
      sortBy: 'module',
      sortOrder: 'asc',
      module: 'ai',
    } as never);

    expect(result.permissions[0]).toMatchObject({
      slug: 'ai.view',
      roleCount: 4,
      rolesPreview: [
        { id: 'r1', name: 'ADMIN', slug: 'admin' },
        { id: 'r2', name: 'LIDER', slug: 'lider' },
      ],
    });
    expect(result.modules).toEqual([
      { module: 'ai', count: 4 },
      { module: 'barrios', count: 5 },
    ]);
  });

  it('keeps module facets unfiltered by the selected module', async () => {
    const repo = repository();
    const service = new RolesPermissionsService(repo as never);
    await service.listPermissions({
      page: 1,
      limit: 15,
      sortBy: 'module',
      sortOrder: 'asc',
      module: 'ai',
      status: 'active',
    } as never);

    const calls = repo.findPermissions.mock.calls as unknown as Array<
      [{ where: Record<string, unknown>; facetWhere: Record<string, unknown> }]
    >;
    const args = calls[0][0];
    expect(args.where).toMatchObject({ module: 'ai', isActive: true });
    expect(args.facetWhere).toMatchObject({ isActive: true });
    expect(args.facetWhere).not.toHaveProperty('module');
  });

  it('protects the key of system permissions', async () => {
    const repo = repository({
      getPermission: jest.fn(async () => ({
        id: 'permission-id',
        name: 'Ver',
        slug: 'users.view',
        module: 'users',
        description: null,
        isActive: true,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { rolePermissions: 1 },
      })),
    });
    const service = new RolesPermissionsService(repo as never);
    await expect(
      service.updatePermission('permission-id', { slug: 'users.list' }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('preserves role relations and reports affected roles when disabling', async () => {
    const repo = repository();
    const service = new RolesPermissionsService(repo as never);
    await expect(service.setPermissionStatus('permission-id', false)).resolves.toMatchObject({
      isActive: false,
      affectedRoles: 2,
    });
    expect(repo.updatePermission).toHaveBeenCalledWith('permission-id', { isActive: false });
  });

  it('prevents disabling critical permissions', async () => {
    const repo = repository({
      getPermission: jest.fn(async () => ({
        id: 'permission-id',
        slug: 'permissions.view',
        isSystem: true,
        _count: { rolePermissions: 3 },
      })),
    });
    const service = new RolesPermissionsService(repo as never);
    await expect(service.setPermissionStatus('permission-id', false)).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
