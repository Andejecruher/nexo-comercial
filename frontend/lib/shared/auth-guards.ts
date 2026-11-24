/**
 * Auth Guards — Nexo Comercial
 *
 * Guards reutilizables RBAC para controlar acceso a vistas y acciones.
 * Basados en los roles del backend: SUPER_ADMIN | COORDINADOR | CAPTURISTA | OPERADOR_CHAT | LIDER
 *
 * Los permisos se resuelven contra el array de permisos provisto por el
 * servidor (slugs `{module}.{action}`) — no contra una matriz hardcodeada.
 *
 * Uso:
 *   const guards = createGuards(user.roles, user.permissions);
 *   if (guards.canManageUsers()) { ... }
 */

import type { UserRole } from '@/lib/shared/auth-storage';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Permission = string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function hasPermission(permissions: readonly string[], permission: string): boolean {
  const target = permission.trim();
  if (!target) return false;
  return permissions.some((p) => p === target);
}

export function hasAnyRole(roles: UserRole[], required: UserRole[]): boolean {
  return required.some((r) => roles.includes(r));
}

// ─── Guards reutilizables (factory) ──────────────────────────────────────────

export function createGuards(roles: UserRole[], permissions: string[]) {
  const can = (permission: Permission) => hasPermission(permissions, permission);

  return {
    /** Puede ver el panel de control / resumen (indicadores de atención) */
    canView: () => can('indicadores_atencion.view'),
    /** Puede ver la bandeja de entrada (chat/inbox) */
    canViewInbox: () => can('conversaciones.view'),
    /** Puede ver ciudadanos */
    canViewCitizens: () => can('ciudadanos.view'),
    /** Puede ver eventos */
    canViewEvents: () => can('eventos.view'),
    /** Puede gestionar usuarios admin */
    canManageUsers: () => can('users.view'),
    /** Puede gestionar configuración general */
    canManageSettings: () => can('configuracion.view'),
    /** Puede asignar/cambiar roles */
    canAssignRoles: () => can('roles.view'),
    /** Puede ver roles administrativos */
    canViewRoles: () => can('roles.view'),
    /** Puede crear roles administrativos */
    canCreateRoles: () => can('roles.create'),
    /** Puede editar roles administrativos */
    canUpdateRoles: () => can('roles.update'),
    /** Puede eliminar roles administrativos */
    canDeleteRoles: () => can('roles.delete'),
    /** Puede ver permisos administrativos */
    canViewPermissions: () => can('permissions.view'),
    /** Puede gestionar permisos de roles */
    canManagePermissions: () => can('permissions.view'),
    canCreatePermissions: () => can('permissions.create'),
    canUpdatePermissions: () => can('permissions.update'),
    canDeactivatePermissions: () => can('permissions.update'),
    /** Es super admin */
    isSuperAdmin: () => roles.includes('SUPER_ADMIN'),
    /** Es coordinador; conserva el comportamiento supervisor de tickets y bandeja. */
    isCoordinator: () => roles.includes('COORDINADOR'),
    /** Es líder; el rol se conserva para flujos operativos compartidos. */
    isLeader: () => roles.includes('LIDER'),
    /** Verificación genérica de permiso */
    check: can,
  };
}

export type Guards = ReturnType<typeof createGuards>;
