/**
 * Coordinators API Client — /api/v1/coordinators
 *
 * Coordinator de sección: entidad de liderazgo separada (D1) que nunca posee
 * promovidos (D2). El alta crea entity + User + UserRole[COORDINADOR] +
 * invitación en UNA transacción; el correo se envía tras el commit (D3).
 * Contratos alineados al CoordinatorController / CoordinatorService del backend.
 */

import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CoordinatorInvitationStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'accepted'
  | 'expired'
  | 'revoked';

export interface CoordinatorSectionRef {
  id: string;
  sectionCode: string;
}

export interface CoordinatorUserRef {
  id: string;
  email: string;
  isActive: boolean;
}

export interface CoordinatorStructureRef {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface CoordinatorDto {
  id: string;
  fullName: string;
  phone?: string | null;
  email: string;
  sectionId: string;
  structureId?: string | null;
  userId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  section?: CoordinatorSectionRef | null;
  structure?: CoordinatorStructureRef | null;
  user?: Pick<CoordinatorUserRef, 'id' | 'email' | 'isActive'> | null;
}

export interface CoordinatorInvitationDto {
  id: string;
  status: CoordinatorInvitationStatus;
  expiresAt: string;
}

export interface CoordinatorsResponse {
  coordinators: CoordinatorDto[];
}

export interface CoordinatorResponse {
  coordinator: CoordinatorDto;
}

export interface CoordinatorCreateResponse {
  coordinator: { id: string; userId: string | null };
  invitation?: CoordinatorInvitationDto;
  warning?: { code: string; message: string };
}

export interface CoordinatorReinviteResponse {
  invitation: CoordinatorInvitationDto;
  warning?: { code: string; message: string };
}

export interface CreateCoordinatorPayload {
  sectionId: string;
  fullName: string;
  phone?: string | null;
  email: string;
  structureId?: string | null;
}

export interface UpdateCoordinatorPayload {
  fullName?: string;
  phone?: string | null;
  email?: string;
  structureId?: string | null;
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const coordinatorsApi = {
  list(params?: { sectionId?: string; structureId?: string }) {
    const query = new URLSearchParams();
    if (params?.sectionId) query.set('sectionId', params.sectionId);
    if (params?.structureId) query.set('structureId', params.structureId);
    const path = `/coordinators${query.toString() ? `?${query.toString()}` : ''}`;
    return apiClient.get<CoordinatorsResponse>(path);
  },

  get(id: string) {
    return apiClient.get<CoordinatorResponse>(`/coordinators/${id}`);
  },

  create(payload: CreateCoordinatorPayload) {
    return apiClient.post<CoordinatorCreateResponse>('/coordinators', payload);
  },

  update(id: string, payload: UpdateCoordinatorPayload) {
    return apiClient.patch<CoordinatorResponse>(`/coordinators/${id}`, payload);
  },

  remove(id: string) {
    return apiClient.delete<CoordinatorResponse>(`/coordinators/${id}`);
  },

  reinvite(id: string) {
    return apiClient.post<CoordinatorReinviteResponse>(`/coordinators/${id}/reinvite`);
  },
};

export function getCoordinatorApiErrorMessage(status: number, fallback: string): string {
  if (status === 0) return 'No se pudo conectar con el servidor.';
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.';
  if (status === 403) return 'No tenés permisos para gestionar coordinadores.';
  if (status === 404) return 'El coordinador solicitado no existe o ya no está disponible.';
  if (status === 409) return 'Ya existe un usuario registrado con este correo electrónico.';
  if (status === 429) return 'Se alcanzó el límite de reenvíos. Intentá nuevamente más tarde.';
  if (status === 400 || status === 422) return fallback || 'Los datos enviados no son válidos.';
  if (status >= 500) return 'Ocurrió un error en el servidor. Intentá nuevamente.';
  return fallback;
}
