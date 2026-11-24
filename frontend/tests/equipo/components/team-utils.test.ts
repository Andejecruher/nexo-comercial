import { describe, expect, it } from 'vitest';
import {
  filterTeamUsers,
  getAccessStatus,
  isProtectedPanelUser,
} from '@/components/equipo/team-utils';
import type { PanelUserDto } from '@/lib/shared/admin-users-api';

const users: PanelUserDto[] = [
  {
    id: '1',
    email: 'ana@example.com',
    fullName: 'Ana Pérez',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    roles: [{ id: 'r1', name: 'SUPER_ADMIN', slug: 'super-admin' }],
  },
  {
    id: '2',
    email: 'luis@example.com',
    fullName: 'Luis López',
    isActive: false,
    createdAt: '2026-01-02T00:00:00.000Z',
    roles: [{ id: 'r2', name: 'COORDINADOR', slug: 'coordinador' }],
  },
];

describe('team-utils', () => {
  it('filtra por búsqueda, rol y estado', () => {
    expect(filterTeamUsers(users, 'ana', 'all', 'all')).toHaveLength(1);
    expect(filterTeamUsers(users, '', 'r2', 'inactive')).toEqual([users[1]]);
  });

  it('deriva el estado real desde isActive', () => {
    expect(getAccessStatus(users[0])).toBe('active');
    expect(getAccessStatus(users[1])).toBe('inactive');
  });

  it('detecta usuarios protegidos por rol SUPER_ADMIN', () => {
    expect(isProtectedPanelUser(users[0])).toBe(true);
    expect(isProtectedPanelUser(users[1])).toBe(false);
  });
});
