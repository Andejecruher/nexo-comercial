import { apiClient } from '@/lib/api-client';

export interface RolePreviewDto {
  id: string;
  name: string;
  slug: string;
}

export interface PermissionDto {
  id: string;
  name: string;
  slug: string;
  module: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isSystem: boolean;
  roleCount: number;
  /** First few roles using this permission; absent on the assignable endpoint. */
  rolesPreview?: RolePreviewDto[];
}

export interface PermissionModuleFacet {
  module: string;
  count: number;
}

export interface RoleDto {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  permissions: PermissionDto[];
}

export interface CreateRolePayload {
  name: string;
  slug: string;
  description?: string | null;
}

export type UpdateRolePayload = Partial<CreateRolePayload>;

interface RolesResponse {
  roles: RoleDto[];
}

interface RoleResponse {
  role: RoleDto;
}

interface PermissionsResponse {
  permissions: PermissionDto[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  modules?: PermissionModuleFacet[];
}

export interface PermissionFilters {
  search?: string;
  module?: string;
  status?: 'active' | 'inactive';
  isSystem?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'slug' | 'module' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}
export interface PermissionPayload {
  name: string;
  slug: string;
  module: string;
  description?: string | null;
  isActive?: boolean;
}

export const rolesPermissionsApi = {
  listRoles() {
    return apiClient.get<RolesResponse>('/admin/roles');
  },
  getRole(id: string) {
    return apiClient.get<RoleResponse>(`/admin/roles/${id}`);
  },
  createRole(payload: CreateRolePayload) {
    return apiClient.post<RoleResponse>('/admin/roles', payload);
  },
  updateRole(id: string, payload: UpdateRolePayload) {
    return apiClient.patch<RoleResponse>(`/admin/roles/${id}`, payload);
  },
  deleteRole(id: string) {
    return apiClient.delete<void>(`/admin/roles/${id}`);
  },
  listPermissions(filters: PermissionFilters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const query = params.toString();
    return apiClient.get<PermissionsResponse>(`/admin/permissions${query ? `?${query}` : ''}`);
  },
  listAssignablePermissions() {
    return apiClient.get<{ permissions: PermissionDto[] }>('/admin/permissions/assignable');
  },
  createPermission(payload: PermissionPayload) {
    return apiClient.post<{ permission: PermissionDto }>('/admin/permissions', payload);
  },
  updatePermission(id: string, payload: Partial<PermissionPayload>) {
    return apiClient.patch<{ permission: PermissionDto }>(`/admin/permissions/${id}`, payload);
  },
  setPermissionStatus(id: string, isActive: boolean) {
    return apiClient.patch<{ permission: PermissionDto & { affectedRoles: number } }>(
      `/admin/permissions/${id}/status`,
      { isActive },
    );
  },
  listPermissionRoles(id: string) {
    return apiClient.get<{ roles: Pick<RoleDto, 'id' | 'name' | 'slug' | 'description'>[] }>(
      `/admin/permissions/${id}/roles`,
    );
  },
  replaceRolePermissions(roleId: string, permissionIds: string[]) {
    return apiClient.put<RoleResponse>(`/admin/roles/${roleId}/permissions`, { permissionIds });
  },
};

export function isSystemRole(role: Pick<RoleDto, 'name' | 'slug'>): boolean {
  return role.name.toUpperCase() === 'SUPER_ADMIN' || role.slug === 'super-admin';
}

export function getApiErrorMessage(status: number, fallback: string): string {
  if (status === 0) return 'No se pudo conectar con el servidor.';
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.';
  if (status === 403) return 'No tenés permisos para realizar esta acción.';
  if (status === 404) return 'El recurso solicitado no existe o ya no está disponible.';
  if (status === 409) return 'Ya existe un registro con ese nombre o clave.';
  if (status === 422 || status === 400) return fallback || 'Los datos enviados no son válidos.';
  if (status >= 500) return 'Ocurrió un error en el servidor. Intentá nuevamente.';
  return fallback;
}
