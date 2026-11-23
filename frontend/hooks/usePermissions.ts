'use client';

/**
 * usePermissions — Voz Ciudadana
 *
 * Hook RBAC. Expone los guards del usuario autenticado.
 * Consume los roles del user almacenado en auth-storage.
 */

import { createGuards, hasPermission, type Guards, type Permission } from '@/lib/auth-guards';
import { authStorage } from '@/lib/auth-storage';
import { useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';

export interface UsePermissionsReturn {
  guards: Guards;
  can: (permission: Permission) => boolean;
  roles: string[];
}

export function usePermissions(): UsePermissionsReturn {
  const { user } = useAuth();

  const roles = useMemo(() => {
    return user?.roles ?? authStorage.getUser()?.roles ?? [];
  }, [user]);

  const permissions = useMemo(
    () => user?.permissions ?? authStorage.getUser()?.permissions ?? [],
    [user],
  );

  const guards = useMemo(() => createGuards(roles, permissions), [roles, permissions]);

  const can = useCallback(
    (permission: Permission) => hasPermission(permissions, permission),
    [permissions],
  );

  return { guards, can, roles };
}

export { createGuards, hasPermission };
export type { Guards, Permission };
