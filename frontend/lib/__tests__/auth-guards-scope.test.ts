import { createGuards, hasAnyRole, hasPermission } from '@/lib/auth-guards';
import type { ScopeContext, UserRole } from '@/lib/auth-storage';
import { describe, expect, it } from 'vitest';

const COORDINADOR: UserRole[] = ['COORDINADOR'];
const LIDER: UserRole[] = ['LIDER'];
const SUPER_ADMIN: UserRole[] = ['SUPER_ADMIN', 'CAPTURISTA'];

const RETAINED_PERMISSIONS = ['tickets.view', 'conversaciones.view'];

describe('scope-aware guards', () => {
  it('isCoordinator / isLeader reflect the authenticated roles', () => {
    const coord = createGuards(COORDINADOR, []);
    const leader = createGuards(LIDER, []);
    const admin = createGuards(SUPER_ADMIN, RETAINED_PERMISSIONS);

    expect(coord.isCoordinator()).toBe(true);
    expect(coord.isLeader()).toBe(false);
    expect(leader.isLeader()).toBe(true);
    expect(leader.isCoordinator()).toBe(false);
    expect(admin.isSuperAdmin()).toBe(true);
  });

  it('hasAnyRole supports union checks across multiple roles', () => {
    expect(hasAnyRole(COORDINADOR, ['LIDER', 'COORDINADOR'])).toBe(true);
    expect(hasAnyRole(LIDER, ['COORDINADOR', 'SUPER_ADMIN'])).toBe(false);
  });

  it('hasPermission matches exact slugs', () => {
    expect(hasPermission(RETAINED_PERMISSIONS, 'tickets.view')).toBe(true);
    expect(hasPermission([], 'tickets.view')).toBe(false);
  });

  it('scope context mirrors the retained backend scope kinds', () => {
    const admin: ScopeContext = { kind: 'admin' };
    const none: ScopeContext = { kind: 'none' };
    expect(admin.kind).toBe('admin');
    expect(none.kind).toBe('none');
  });
});
