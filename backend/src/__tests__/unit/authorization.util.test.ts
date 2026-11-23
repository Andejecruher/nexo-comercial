import { describe, expect, it } from '@jest/globals';
import {
  hasAllPermissions,
  hasAnyPermission,
  hasAnyRole,
  hasPermission,
  hasRole,
} from '../../utils/authorization.util';

describe('authorization utilities', () => {
  const permissions = ['users.view', 'roles.assign', 'reports.close'];

  it('validates a single permission case-insensitively', () => {
    expect(hasPermission(permissions, 'USERS.VIEW')).toBe(true);
    expect(hasPermission(permissions, 'users.delete')).toBe(false);
  });

  it('validates any permission', () => {
    expect(hasAnyPermission(permissions, ['users.delete', 'roles.assign'])).toBe(true);
    expect(hasAnyPermission(permissions, ['users.delete', 'roles.delete'])).toBe(false);
  });

  it('validates all permissions', () => {
    expect(hasAllPermissions(permissions, ['users.view', 'reports.close'])).toBe(true);
    expect(hasAllPermissions(permissions, ['users.view', 'users.delete'])).toBe(false);
  });

  it('validates roles by name or slug', () => {
    const roles = [
      { name: 'SUPER_ADMIN', slug: 'superadmin' },
      { name: 'OPERADOR_CHAT', slug: 'operador_chat' },
    ];
    expect(hasRole(roles, 'superadmin')).toBe(true);
    expect(hasAnyRole(roles, ['analista', 'operador_chat'])).toBe(true);
  });
});
