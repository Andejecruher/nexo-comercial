/**
 * Catalog API Client — Neighborhoods, Tags, Departments
 *
 * Wrapper sobre apiClient para endpoints de catálogos maestros.
 * Tipado estricto para request/response payloads.
 */

import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Neighborhood {
  id: string;
  name: string;
  zone?: string;
  postalCode?: string;
  municipality?: string;
  state: string;
  stateCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
}

export type DepartmentDayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type DepartmentScheduleExceptionType =
  | 'PARTIALLY_OPEN'
  | 'PARTIALLY_CLOSED'
  | 'FULLY_CLOSED';

export type DepartmentExceptionRecurrenceType = 'NONE' | 'YEARLY' | 'WEEKLY' | 'SPECIFIC_WEEKDAYS';

export interface DepartmentTimeInterval {
  startTime: string;
  endTime: string;
}

export interface DepartmentScheduleDay {
  dayOfWeek: DepartmentDayOfWeek;
  isOpen: boolean;
  intervals: DepartmentTimeInterval[];
}

export interface DepartmentScheduleException {
  type: DepartmentScheduleExceptionType;
  recurrenceType?: DepartmentExceptionRecurrenceType;
  startDate?: string;
  endDate?: string;
  recurrenceStartsOn?: string;
  recurrenceEndsOn?: string | null;
  yearlyStartMonth?: number;
  yearlyStartDay?: number;
  yearlyEndMonth?: number;
  yearlyEndDay?: number;
  weeklyAnchorDate?: string;
  weekdays?: DepartmentDayOfWeek[];
  reason?: string;
  intervals: DepartmentTimeInterval[];
}

export interface Department {
  id: string;
  slug: string;
  name: string;
  description?: string;
  isActive: boolean;
  keywords: string[];
  schedule: DepartmentScheduleDay[];
  scheduleExceptions: DepartmentScheduleException[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  nextCursor?: string;
  hasNextPage: boolean;
  count: number;
}

// ─── Query Params ────────────────────────────────────────────────────────────

export interface NeighborhoodQueryParams {
  search?: string;
  zone?: string;
  cursor?: string;
  limit?: number;
  municipality?: string;
  postalCode?: string;
}

export interface TagQueryParams {
  search?: string;
  color?: string;
  cursor?: string;
  limit?: number;
}

export interface DepartmentQueryParams {
  search?: string;
  isActive?: boolean;
  cursor?: string;
  limit?: number;
}

// ─── Request Payloads ────────────────────────────────────────────────────────

export interface CreateNeighborhoodPayload {
  name: string;
  zone?: string;
  postalCode?: string;
  municipality?: string;
}

export interface UpdateNeighborhoodPayload {
  name?: string;
  zone?: string;
  postalCode?: string;
  municipality?: string;
}

export interface CreateTagPayload {
  name: string;
  description?: string;
  color?: string;
}

export interface UpdateTagPayload {
  name?: string;
  description?: string;
  color?: string;
}

export interface CreateDepartmentPayload {
  slug: string;
  name: string;
  description?: string;
  isActive?: boolean;
  keywords?: string[];
  schedule?: DepartmentScheduleDay[];
  scheduleExceptions?: DepartmentScheduleException[];
}

/**
 * `slug` es identificador estable en backend (referenciado sin FK por tickets,
 * conversaciones, meta y outbox realtime). No se puede modificar tras el alta.
 */
export interface UpdateDepartmentPayload {
  name?: string;
  description?: string;
  isActive?: boolean;
  keywords?: string[];
  schedule?: DepartmentScheduleDay[];
  scheduleExceptions?: DepartmentScheduleException[];
}

// ─── Response Wrappers ───────────────────────────────────────────────────────

interface NeighborhoodListResponse {
  neighborhoods: Neighborhood[];
  meta: PaginationMeta;
}

interface NeighborhoodResponse {
  neighborhood: Neighborhood;
}

interface TagListResponse {
  tags: Tag[];
  meta: PaginationMeta;
}

interface TagResponse {
  tag: Tag;
}

interface DepartmentListResponse {
  departments: Department[];
  meta: PaginationMeta;
}

interface DepartmentResponse {
  department: Department;
}

// ─── Neighborhoods API ───────────────────────────────────────────────────────

export const neighborhoodsApi = {
  async list(params?: NeighborhoodQueryParams) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.zone) query.set('zone', params.zone);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.municipality) query.set('municipality', params.municipality);
    if (params?.postalCode) query.set('postalCode', params.postalCode);

    const path = `/admin/neighborhoods${query.toString() ? `?${query.toString()}` : ''}`;
    return apiClient.get<NeighborhoodListResponse>(path);
  },

  async create(payload: CreateNeighborhoodPayload) {
    return apiClient.post<NeighborhoodResponse>('/admin/neighborhoods', payload);
  },

  async update(id: string, payload: UpdateNeighborhoodPayload) {
    return apiClient.patch<NeighborhoodResponse>(`/admin/neighborhoods/${id}`, payload);
  },

  async delete(id: string) {
    return apiClient.delete(`/admin/neighborhoods/${id}`);
  },
};

// ─── Tags API ────────────────────────────────────────────────────────────────

export const tagsApi = {
  async list(params?: TagQueryParams) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.color) query.set('color', params.color);
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());

    const path = `/admin/tags${query.toString() ? `?${query.toString()}` : ''}`;
    return apiClient.get<TagListResponse>(path);
  },

  async create(payload: CreateTagPayload) {
    return apiClient.post<TagResponse>('/admin/tags', payload);
  },

  async update(id: string, payload: UpdateTagPayload) {
    return apiClient.patch<TagResponse>(`/admin/tags/${id}`, payload);
  },

  async delete(id: string) {
    return apiClient.delete(`/admin/tags/${id}`);
  },
};

// ─── Departments API ─────────────────────────────────────────────────────────

export const departmentsApi = {
  async list(params?: DepartmentQueryParams) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.isActive !== undefined) query.set('isActive', params.isActive.toString());
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', params.limit.toString());

    const path = `/admin/departments${query.toString() ? `?${query.toString()}` : ''}`;
    return apiClient.get<DepartmentListResponse>(path);
  },

  async create(payload: CreateDepartmentPayload) {
    return apiClient.post<DepartmentResponse>('/admin/departments', payload);
  },

  async update(id: string, payload: UpdateDepartmentPayload) {
    return apiClient.patch<DepartmentResponse>(`/admin/departments/${id}`, payload);
  },

  async delete(id: string) {
    // Soft delete — desactiva el departamento
    return apiClient.delete(`/admin/departments/${id}`);
  },
};
