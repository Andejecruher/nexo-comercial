'use client';

import {
  getApiErrorMessage,
  isSystemRole,
  rolesPermissionsApi,
  type CreateRolePayload,
  type PermissionDto,
  type PermissionFilters,
  type PermissionModuleFacet,
  type PermissionPayload,
  type RoleDto,
  type UpdateRolePayload,
} from '@/lib/roles-permissions-api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error?: string;
}

const EMPTY_ROLES: RoleDto[] = [];
const EMPTY_PERMISSIONS: PermissionDto[] = [];
const EMPTY_FACETS: PermissionModuleFacet[] = [];

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function hasPagination(value: unknown): value is { pagination: PaginationState } {
  if (!value || typeof value !== 'object' || !('pagination' in value)) return false;
  const pagination = value.pagination;
  return (
    !!pagination &&
    typeof pagination === 'object' &&
    'page' in pagination &&
    typeof pagination.page === 'number' &&
    'limit' in pagination &&
    typeof pagination.limit === 'number' &&
    'total' in pagination &&
    typeof pagination.total === 'number' &&
    'totalPages' in pagination &&
    typeof pagination.totalPages === 'number'
  );
}

function hasModuleFacets(value: unknown): value is { modules: PermissionModuleFacet[] } {
  if (!value || typeof value !== 'object' || !('modules' in value)) return false;
  const modules = value.modules;
  return (
    Array.isArray(modules) &&
    modules.every(
      (facet) =>
        !!facet &&
        typeof facet === 'object' &&
        typeof (facet as PermissionModuleFacet).module === 'string' &&
        typeof (facet as PermissionModuleFacet).count === 'number',
    )
  );
}

export function useRolesCatalog() {
  const [state, setState] = useState<AsyncState<RoleDto[]>>({ data: EMPTY_ROLES, loading: true });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    const result = await rolesPermissionsApi.listRoles();
    if (result.ok) {
      setState({ data: result.data.roles, loading: false });
      return;
    }
    setState({
      data: EMPTY_ROLES,
      loading: false,
      error: getApiErrorMessage(result.status, result.message),
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createRole = useCallback(
    async (
      payload: CreateRolePayload,
    ): Promise<{ success: boolean; role?: RoleDto; error?: string }> => {
      const result = await rolesPermissionsApi.createRole(payload);
      if (!result.ok) {
        const error = getApiErrorMessage(result.status, result.message);
        toast.error(error);
        return { success: false, error };
      }
      toast.success('Rol creado correctamente');
      await refresh();
      return { success: true, role: result.data.role };
    },
    [refresh],
  );

  const updateRole = useCallback(
    async (
      id: string,
      payload: UpdateRolePayload,
    ): Promise<{ success: boolean; role?: RoleDto; error?: string }> => {
      const result = await rolesPermissionsApi.updateRole(id, payload);
      if (!result.ok) {
        const error = getApiErrorMessage(result.status, result.message);
        toast.error(error);
        return { success: false, error };
      }
      toast.success('Rol actualizado correctamente');
      await refresh();
      return { success: true, role: result.data.role };
    },
    [refresh],
  );

  const deleteRole = useCallback(
    async (role: RoleDto): Promise<{ success: boolean; error?: string }> => {
      if (isSystemRole(role)) {
        const error = 'Este rol es interno y no puede eliminarse.';
        toast.error(error);
        return { success: false, error };
      }
      const result = await rolesPermissionsApi.deleteRole(role.id);
      if (!result.ok) {
        const error = getApiErrorMessage(result.status, result.message);
        toast.error(error);
        return { success: false, error };
      }
      toast.success('Rol eliminado correctamente');
      await refresh();
      return { success: true };
    },
    [refresh],
  );

  return {
    roles: state.data,
    loading: state.loading,
    error: state.error,
    refresh,
    createRole,
    updateRole,
    deleteRole,
  };
}

export function usePermissionsCatalog(filters: PermissionFilters = {}, assignableOnly = false) {
  const [state, setState] = useState<AsyncState<PermissionDto[]>>({
    data: EMPTY_PERMISSIONS,
    loading: true,
  });

  const filterKey = JSON.stringify(filters);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [moduleFacets, setModuleFacets] = useState<PermissionModuleFacet[]>(EMPTY_FACETS);
  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    const result = assignableOnly
      ? await rolesPermissionsApi.listAssignablePermissions()
      : await rolesPermissionsApi.listPermissions(filters);
    if (result.ok) {
      setState({ data: result.data.permissions, loading: false });
      if (hasPagination(result.data)) setPagination(result.data.pagination);
      if (hasModuleFacets(result.data)) setModuleFacets(result.data.modules);
      return;
    }
    setState({
      data: EMPTY_PERMISSIONS,
      loading: false,
      error: getApiErrorMessage(result.status, result.message),
    });
    // filterKey intentionally stabilizes plain filter objects supplied by views.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignableOnly, filterKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Facets cover the whole catalog; the current page only covers what is on screen.
  const modules = useMemo(
    () =>
      moduleFacets.length > 0
        ? moduleFacets.map((facet) => facet.module)
        : Array.from(new Set(state.data.map((p) => p.module))).sort(),
    [moduleFacets, state.data],
  );
  const createPermission = useCallback(
    async (payload: PermissionPayload) => {
      const result = await rolesPermissionsApi.createPermission(payload);
      if (!result.ok)
        return { success: false, error: getApiErrorMessage(result.status, result.message) };
      toast.success('Permiso creado correctamente');
      await refresh();
      return { success: true, permission: result.data.permission };
    },
    [refresh],
  );
  const updatePermission = useCallback(
    async (id: string, payload: Partial<PermissionPayload>) => {
      const result = await rolesPermissionsApi.updatePermission(id, payload);
      if (!result.ok)
        return { success: false, error: getApiErrorMessage(result.status, result.message) };
      toast.success('Permiso actualizado correctamente');
      await refresh();
      return { success: true, permission: result.data.permission };
    },
    [refresh],
  );
  const setPermissionStatus = useCallback(
    async (permission: PermissionDto, isActive: boolean) => {
      const result = await rolesPermissionsApi.setPermissionStatus(permission.id, isActive);
      if (!result.ok)
        return { success: false, error: getApiErrorMessage(result.status, result.message) };
      toast.success(`Permiso ${isActive ? 'activado' : 'desactivado'} correctamente`);
      await refresh();
      return { success: true };
    },
    [refresh],
  );
  return {
    permissions: state.data,
    modules,
    moduleFacets,
    pagination,
    loading: state.loading,
    error: state.error,
    refresh,
    createPermission,
    updatePermission,
    setPermissionStatus,
  };
}

export function useRoleDetail(roleId: string) {
  const [state, setState] = useState<AsyncState<RoleDto | undefined>>({
    data: undefined,
    loading: true,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    const result = await rolesPermissionsApi.getRole(roleId);
    if (result.ok) {
      setState({ data: result.data.role, loading: false });
      return;
    }
    setState({
      data: undefined,
      loading: false,
      error: getApiErrorMessage(result.status, result.message),
    });
  }, [roleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const replacePermissions = useCallback(
    async (
      permissionIds: string[],
    ): Promise<{ success: boolean; role?: RoleDto; error?: string }> => {
      const result = await rolesPermissionsApi.replaceRolePermissions(roleId, permissionIds);
      if (!result.ok) {
        const error = getApiErrorMessage(result.status, result.message);
        toast.error(error);
        return { success: false, error };
      }
      setState({ data: result.data.role, loading: false });
      toast.success('Permisos del rol actualizados correctamente');
      return { success: true, role: result.data.role };
    },
    [roleId],
  );

  return {
    role: state.data,
    loading: state.loading,
    error: state.error,
    refresh,
    replacePermissions,
  };
}
