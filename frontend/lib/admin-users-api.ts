/**
 * Usuarios del panel — contratos reales del backend /api/v1/admin/users.
 * El frontend consume endpoints propios del backend; no conoce credenciales ni endpoints de Mailtrap.
 */

import { apiClient } from '@/lib/api-client';

export interface PanelUserRoleDto {
  id: string;
  name: string;
  slug?: string;
}

export type PanelInvitationStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'accepted'
  | 'expired'
  | 'revoked';

export interface PanelInvitationDto {
  id: string;
  status: PanelInvitationStatus;
  expiresAt: string;
  lastErrorCode?: string | null;
}

/** Alineado a UserResponse del backend (JSON) */
export interface PanelUserDto {
  id: string;
  email: string;
  fullName: string | null | undefined;
  isActive: boolean;
  createdAt: string;
  roles: PanelUserRoleDto[];
  invitation?: PanelInvitationDto | null;
}

export interface PanelUsersResponse {
  users: PanelUserDto[];
}

export interface PanelUserResponse {
  user: PanelUserDto;
  invitation?: PanelInvitationDto;
  warning?: { code: string; message: string };
}

export interface CreatePanelUserPayload {
  email: string;
  fullName: string;
  password?: string;
  isActive?: boolean;
  roleIds?: string[];
}

export interface UpdatePanelUserPayload {
  fullName?: string;
  password?: string;
  isActive?: boolean;
}

export const adminUsersApi = {
  list() {
    return apiClient.get<PanelUsersResponse>('/admin/users');
  },
  get(id: string) {
    return apiClient.get<PanelUserResponse>(`/admin/users/${id}`);
  },
  create(payload: CreatePanelUserPayload) {
    return apiClient.post<PanelUserResponse>('/admin/users', payload);
  },
  update(id: string, payload: UpdatePanelUserPayload) {
    return apiClient.patch<PanelUserResponse>(`/admin/users/${id}`, payload);
  },
  deactivate(id: string) {
    return apiClient.delete<PanelUserResponse>(`/admin/users/${id}`);
  },
  delete(id: string) {
    return apiClient.delete<PanelUserResponse>(`/admin/users/${id}/delete`);
  },
  assignRole(userId: string, roleId: string) {
    return apiClient.post<PanelUserResponse>(`/admin/users/${userId}/roles/${roleId}`);
  },
  removeRole(userId: string, roleId: string) {
    return apiClient.delete<PanelUserResponse>(`/admin/users/${userId}/roles/${roleId}`);
  },
  resendInvitation(userId: string) {
    return apiClient.post<PanelUserResponse>(`/admin/users/${userId}/invitations/resend`);
  },
};

export function getAdminUserApiErrorMessage(status: number, fallback: string): string {
  if (status === 0) return 'No se pudo conectar con el servidor.';
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.';
  if (status === 403) return 'No tenés permisos para realizar esta acción.';
  if (status === 404) return 'El usuario solicitado no existe o ya no está disponible.';
  if (status === 409) return 'Ya existe un usuario registrado con este correo electrónico.';
  if (status === 429) return 'Se alcanzó el límite de reenvíos. Intentá nuevamente más tarde.';
  if (status === 400 || status === 422) return fallback || 'Los datos enviados no son válidos.';
  if (status >= 500) return 'Ocurrió un error en el servidor. Intentá nuevamente.';
  return fallback;
}
