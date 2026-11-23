import type { PermissionDto, RoleDto } from '@/lib/roles-permissions-api';

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** Mirrors the module labels declared in backend/prisma/seed/core/permissions.seed.ts. */
const MODULE_LABELS: Record<string, string> = {
  indicadores_atencion: 'Indicadores de Atención',
  conversaciones: 'Conversaciones',
  tickets: 'Tickets',
  ciudadanos: 'Ciudadanos',
  campanas_whatsapp: 'Campañas de WhatsApp',
  mensajes_masivos: 'Mensajes Masivos',
  plantillas: 'Plantillas',
  eventos: 'Eventos',
  configuracion: 'Configuración',
  users: 'Usuarios',
  departamentos: 'Departamentos',
  barrios: 'Barrios',
  etiquetas: 'Etiquetas',
  ai: 'Canales e IA',
  analytics: 'Analítica',
  roles: 'Roles',
  permissions: 'Permisos',
  'email-diagnostics': 'Email Diagnostics',
};

export function permissionModuleLabel(module: string): string {
  return (
    MODULE_LABELS[module] ??
    module.replace(/[_-]+/g, ' ').replace(/\b\p{Ll}/gu, (letter) => letter.toUpperCase())
  );
}

export function roleInitials(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function filterRoles(roles: RoleDto[], search: string): RoleDto[] {
  const q = search.trim().toLowerCase();
  if (!q) return roles;
  return roles.filter((role) =>
    [role.name, role.slug, role.description ?? ''].some((value) => value.toLowerCase().includes(q)),
  );
}

export function filterPermissions(
  permissions: PermissionDto[],
  search: string,
  module: string,
): PermissionDto[] {
  const q = search.trim().toLowerCase();
  return permissions.filter((permission) => {
    const moduleMatches = module === 'all' || permission.module === module;
    const searchMatches =
      !q ||
      [permission.name, permission.slug, permission.module, permission.description ?? ''].some(
        (value) => value.toLowerCase().includes(q),
      );
    return moduleMatches && searchMatches;
  });
}

export function groupPermissionsByModule(
  permissions: PermissionDto[],
): Array<{ module: string; permissions: PermissionDto[] }> {
  const groups = new Map<string, PermissionDto[]>();
  for (const permission of permissions) {
    const current = groups.get(permission.module) ?? [];
    current.push(permission);
    groups.set(permission.module, current);
  }
  return Array.from(groups.entries())
    .map(([module, items]) => ({
      module,
      permissions: items.sort((a, b) => a.slug.localeCompare(b.slug)),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

export function getPermissionDiff(
  originalIds: Set<string>,
  selectedIds: Set<string>,
  permissions: PermissionDto[],
) {
  const byId = new Map(permissions.map((permission) => [permission.id, permission]));
  const added = Array.from(selectedIds)
    .filter((id) => !originalIds.has(id))
    .map((id) => byId.get(id))
    .filter((permission): permission is PermissionDto => permission !== undefined);
  const removed = Array.from(originalIds)
    .filter((id) => !selectedIds.has(id))
    .map((id) => byId.get(id))
    .filter((permission): permission is PermissionDto => permission !== undefined);
  return { added, removed };
}
