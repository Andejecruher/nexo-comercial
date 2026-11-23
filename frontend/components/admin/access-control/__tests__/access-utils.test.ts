import {
  filterPermissions,
  filterRoles,
  getPermissionDiff,
  groupPermissionsByModule,
  permissionModuleLabel,
  roleInitials,
} from '@/components/admin/access-control/access-utils';
import type { PermissionDto, RoleDto } from '@/lib/roles-permissions-api';
import { describe, expect, it } from 'vitest';

const permissions: PermissionDto[] = [
  {
    id: '1',
    name: 'Ver usuarios',
    slug: 'users.view',
    module: 'users',
    description: 'Listar usuarios',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isActive: true,
    isSystem: true,
    roleCount: 2,
  },
  {
    id: '2',
    name: 'Crear roles',
    slug: 'roles.create',
    module: 'roles',
    description: 'Crear roles',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isActive: true,
    isSystem: true,
    roleCount: 1,
  },
  {
    id: '3',
    name: 'Ver roles',
    slug: 'roles.view',
    module: 'roles',
    description: 'Consultar roles',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    isActive: false,
    isSystem: false,
    roleCount: 0,
  },
];

const roles: RoleDto[] = [
  {
    id: 'r1',
    name: 'SUPER_ADMIN',
    slug: 'super-admin',
    description: 'Acceso total',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    permissions: [],
  },
  {
    id: 'r2',
    name: 'COORDINADOR',
    slug: 'coordinador',
    description: 'Solo lectura',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    permissions: [],
  },
];

describe('access-control utils', () => {
  it('filtra roles por nombre, slug o descripción', () => {
    expect(filterRoles(roles, 'total')).toHaveLength(1);
    expect(filterRoles(roles, 'coordinador')[0]?.slug).toBe('coordinador');
  });

  it('traduce claves de módulo a etiquetas legibles', () => {
    expect(permissionModuleLabel('ai')).toBe('Canales e IA');
    expect(permissionModuleLabel('catalogo_electoral')).toBe('Catálogo Electoral');
    expect(permissionModuleLabel('lideres')).toBe('Líderes');
    expect(permissionModuleLabel('modulo_nuevo')).toBe('Modulo Nuevo');
  });

  it('deriva iniciales de rol para los avatares', () => {
    expect(roleInitials('SUPER_ADMIN')).toBe('SA');
    expect(roleInitials('Lider')).toBe('LI');
  });

  it('filtra permisos por búsqueda y módulo explícito', () => {
    expect(filterPermissions(permissions, 'roles', 'roles')).toHaveLength(2);
    expect(filterPermissions(permissions, 'usuarios', 'roles')).toHaveLength(0);
  });

  it('agrupa permisos por módulo sin heurísticas de slug', () => {
    const groups = groupPermissionsByModule(permissions);
    expect(groups.map((group) => group.module)).toEqual(['roles', 'users']);
    expect(groups[0]?.permissions.map((permission) => permission.slug)).toEqual([
      'roles.create',
      'roles.view',
    ]);
  });

  it('calcula permisos agregados y retirados entre estado original y actual', () => {
    const diff = getPermissionDiff(new Set(['1', '2']), new Set(['2', '3']), permissions);
    expect(diff.added.map((permission) => permission.slug)).toEqual(['roles.view']);
    expect(diff.removed.map((permission) => permission.slug)).toEqual(['users.view']);
  });
});
