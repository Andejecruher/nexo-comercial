/**
 * Organizational structures API — /api/v1/structures
 *
 * Catálogo 1:N para clasificar coordinadores. Lectura con coordinadores.view;
 * alta/edición/baja con coordinadores.create/update/delete.
 */

import { apiClient } from '@/lib/api-client';

export interface OrganizationalStructureDto {
  id: string;
  slug: string;
  name: string;
  color: string;
  managerFirstName?: string | null;
  managerLastName?: string | null;
  managerPhone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StructuresResponse {
  structures: OrganizationalStructureDto[];
}

export interface StructureResponse {
  structure: OrganizationalStructureDto;
}

export interface CreateStructurePayload {
  name: string;
  color: string;
  slug?: string;
  isActive?: boolean;
  managerFirstName?: string | null;
  managerLastName?: string | null;
  managerPhone?: string | null;
}

export interface UpdateStructurePayload {
  name?: string;
  color?: string;
  isActive?: boolean;
  managerFirstName?: string | null;
  managerLastName?: string | null;
  managerPhone?: string | null;
}

export const structuresApi = {
  list(params?: { includeInactive?: boolean }) {
    const query = new URLSearchParams();
    if (params?.includeInactive) query.set('includeInactive', 'true');
    const path = `/structures${query.toString() ? `?${query.toString()}` : ''}`;
    return apiClient.get<StructuresResponse>(path);
  },

  get(id: string) {
    return apiClient.get<StructureResponse>(`/structures/${id}`);
  },

  create(payload: CreateStructurePayload) {
    return apiClient.post<StructureResponse>('/structures', payload);
  },

  update(id: string, payload: UpdateStructurePayload) {
    return apiClient.patch<StructureResponse>(`/structures/${id}`, payload);
  },

  remove(id: string) {
    return apiClient.delete<StructureResponse>(`/structures/${id}`);
  },
};

export function getStructureApiErrorMessage(status: number, fallback: string): string {
  if (status === 0) return 'No se pudo conectar con el servidor.';
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.';
  if (status === 403) return 'No tenés permisos para gestionar estructuras.';
  if (status === 404) return 'La estructura solicitada no existe o ya no está disponible.';
  if (status === 409) {
    return fallback || 'No se puede completar la operación por un conflicto de datos.';
  }
  if (status === 400 || status === 422) return fallback || 'Los datos enviados no son válidos.';
  if (status >= 500) return 'Ocurrió un error en el servidor. Intentá nuevamente.';
  return fallback;
}
