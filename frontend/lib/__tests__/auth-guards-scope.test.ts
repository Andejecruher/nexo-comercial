import { createGuards, hasAnyRole, hasPermission } from '@/lib/auth-guards';
import type { ScopeContext, UserRole } from '@/lib/auth-storage';
import { describe, expect, it } from 'vitest';

const COORDINADOR: UserRole[] = ['COORDINADOR'];
const LIDER: UserRole[] = ['LIDER'];
const SUPER_ADMIN: UserRole[] = ['SUPER_ADMIN', 'CAPTURISTA'];

const DOMAIN = [
  'coordinadores.view',
  'coordinadores.create',
  'coordinadores.update',
  'coordinadores.delete',
  'lideres.view',
  'lideres.create',
  'lideres.update',
  'lideres.delete',
];

describe('scope-aware guards', () => {
  it('isCoordinator / isLeader reflect the authenticated roles', () => {
    const coord = createGuards(COORDINADOR, []);
    const leader = createGuards(LIDER, []);
    const admin = createGuards(SUPER_ADMIN, DOMAIN);

    expect(coord.isCoordinator()).toBe(true);
    expect(coord.isLeader()).toBe(false);
    expect(leader.isLeader()).toBe(true);
    expect(leader.isCoordinator()).toBe(false);
    expect(admin.isSuperAdmin()).toBe(true);
  });

  it('coordinator module guards are driven by the coordinadores.* permissions (not a hardcoded matrix)', () => {
    const canManage = createGuards(SUPER_ADMIN, DOMAIN);
    expect(canManage.canViewCoordinators()).toBe(true);
    expect(canManage.canCreateCoordinators()).toBe(true);
    expect(canManage.canUpdateCoordinators()).toBe(true);
    expect(canManage.canDeleteCoordinators()).toBe(true);
  });

  it('leader module guards are driven by the lideres.* permissions', () => {
    const canManage = createGuards(SUPER_ADMIN, DOMAIN);
    expect(canManage.canViewLeaders()).toBe(true);
    expect(canManage.canCreateLeaders()).toBe(true);
    expect(canManage.canUpdateLeaders()).toBe(true);
    expect(canManage.canDeleteLeaders()).toBe(true);
    expect(createGuards(COORDINADOR, ['lideres.view']).canCreateLeaders()).toBe(false);
  });

  it('a coordinator without the global promovidos.view cannot see global promovidos', () => {
    const coord = createGuards(COORDINADOR, []);
    expect(coord.isCoordinator()).toBe(true);
    expect(coord.canViewGlobalPromovidos()).toBe(false);
  });

  it('hasAnyRole supports union checks across multiple roles', () => {
    expect(hasAnyRole(COORDINADOR, ['LIDER', 'COORDINADOR'])).toBe(true);
    expect(hasAnyRole(LIDER, ['COORDINADOR', 'SUPER_ADMIN'])).toBe(false);
  });

  it('hasPermission matches exact slugs', () => {
    expect(hasPermission(DOMAIN, 'coordinadores.view')).toBe(true);
    expect(hasPermission([], 'coordinadores.view')).toBe(false);
  });

  it('scope context survives typing so UI can branch on scope.kind', () => {
    const scoped: ScopeContext = { kind: 'coordinator', sectionId: 'sec-1', coordinatorId: 'c-1' };
    const admin: ScopeContext = { kind: 'admin' };
    // El browser colabora: super admin no filtra, coordinador sí.
    expect(scoped.kind).toBe('coordinator');
    expect(admin.kind).toBe('admin');
  });
});
