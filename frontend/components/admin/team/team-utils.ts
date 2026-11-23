import type { PanelUserDto } from '@/lib/admin-users-api';

export function formatTeamDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
}

export function getAccessStatus(user: Pick<PanelUserDto, 'isActive'>): 'active' | 'inactive' {
  return user.isActive ? 'active' : 'inactive';
}

export function filterTeamUsers(
  users: PanelUserDto[],
  search: string,
  roleId: string,
  status: string,
) {
  const query = search.trim().toLowerCase();
  return users.filter((user) => {
    const matchesQuery =
      !query ||
      user.email.toLowerCase().includes(query) ||
      (user.fullName ?? '').toLowerCase().includes(query);
    const matchesRole = roleId === 'all' || user.roles.some((role) => role.id === roleId);
    const matchesStatus =
      status === 'all' || (status === 'active' ? user.isActive : !user.isActive);
    return matchesQuery && matchesRole && matchesStatus;
  });
}

export function isProtectedPanelUser(user: PanelUserDto): boolean {
  return user.roles.some(
    (role) => role.slug === 'super-admin' || role.name.toUpperCase() === 'SUPER_ADMIN',
  );
}
