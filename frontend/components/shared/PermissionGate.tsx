'use client';

/**
 * PermissionGate — Nexo Comercial
 *
 * Renderiza children solo si el usuario tiene el permiso o rol requerido.
 * Opcionalmente muestra un fallback si no tiene acceso.
 *
 * Uso:
 *   <PermissionGate permission="manage:users">
 *     <UserManagementPanel />
 *   </PermissionGate>
 *
 *   <PermissionGate roles={['SUPER_ADMIN']} fallback={<AccessDenied />}>
 *     <AdminOnlyFeature />
 *   </PermissionGate>
 */

import { usePermissions } from '@/hooks/shared/usePermissions';
import type { Permission } from '@/lib/shared/auth-guards';
import type { UserRole } from '@/lib/shared/auth-storage';

interface PermissionGateProps {
  children: React.ReactNode;
  /** Permiso granular requerido */
  permission?: Permission;
  /** Roles requeridos (OR — al menos uno) */
  roles?: UserRole[];
  /** Contenido a mostrar si no tiene acceso. Default: null */
  fallback?: React.ReactNode;
}

export function PermissionGate({
  children,
  permission,
  roles,
  fallback = null,
}: PermissionGateProps) {
  const { can, roles: userRoles } = usePermissions();

  let hasAccess = true;

  if (permission) {
    hasAccess = can(permission);
  }

  if (hasAccess && roles && roles.length > 0) {
    hasAccess = roles.some((r) => userRoles.includes(r));
  }

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}
