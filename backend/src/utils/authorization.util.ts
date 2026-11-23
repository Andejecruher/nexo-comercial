export type RoleLike = string | { name?: string | null; slug?: string | null };

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function hasPermission(userPermissions: readonly string[], permission: string): boolean {
  const target = normalize(permission);
  return userPermissions.some((item) => normalize(item) === target);
}

export function hasAnyPermission(
  userPermissions: readonly string[],
  permissions: readonly string[],
): boolean {
  return permissions.some((permission) => hasPermission(userPermissions, permission));
}

export function hasAllPermissions(
  userPermissions: readonly string[],
  permissions: readonly string[],
): boolean {
  return permissions.every((permission) => hasPermission(userPermissions, permission));
}

function roleMatches(role: RoleLike, expected: string): boolean {
  const target = normalize(expected);
  if (typeof role === 'string') return normalize(role) === target;
  return normalize(role.name ?? '') === target || normalize(role.slug ?? '') === target;
}

export function hasRole(userRoles: readonly RoleLike[], role: string): boolean {
  return userRoles.some((userRole) => roleMatches(userRole, role));
}

export function hasAnyRole(userRoles: readonly RoleLike[], roles: readonly string[]): boolean {
  return roles.some((role) => hasRole(userRoles, role));
}
