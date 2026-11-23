/**
 * Auth Guards — Voz Ciudadana
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

import type { UserRole } from '@/lib/auth-storage';

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
    /** Puede ver el módulo de coordinadores (catálogo + gestión) */
    canViewCoordinators: () => can('coordinadores.view'),
    /** Puede crear coordinadores */
    canCreateCoordinators: () => can('coordinadores.create'),
    /** Puede editar coordinadores */
    canUpdateCoordinators: () => can('coordinadores.update'),
    /** Puede eliminar coordinadores */
    canDeleteCoordinators: () => can('coordinadores.delete'),
    /** Puede ver el módulo de líderes (gestión de campaña) */
    canViewLeaders: () => can('lideres.view'),
    canCreateLeaders: () => can('lideres.create'),
    canUpdateLeaders: () => can('lideres.update'),
    canDeleteLeaders: () => can('lideres.delete'),
    /** Es super admin */
    isSuperAdmin: () => roles.includes('SUPER_ADMIN'),
    /** Es coordinador (alcance cargo-only: sus líderes y los promovidos de ellos) */
    isCoordinator: () => roles.includes('COORDINADOR'),
    /** Es líder (alcance: sus propios promovidos) */
    isLeader: () => roles.includes('LIDER'),
    /** Puede ver promovidos de forma global (sin filtro de alcance) */
    canViewGlobalPromovidos: () => can('promovidos.view'),
    /** Verificación genérica de permiso */
    check: can,
  };
}

export type Guards = ReturnType<typeof createGuards>;
