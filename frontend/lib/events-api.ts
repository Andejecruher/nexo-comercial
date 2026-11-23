/**
 * Cliente API — Eventos y asistencia (/api/v1/admin/events)
 * Contratos alineados con backend EventService / AttendanceService y Swagger.
 */

import { apiClient } from '@/lib/api-client';

// ─── Enums (Prisma / backend) ───────────────────────────────────────────────

export type EventStatus = 'draft' | 'published' | 'completed' | 'cancelled';

export type EventType = 'townhall' | 'community' | 'volunteer' | 'campaign' | 'rally';

export type EventVisibility = 'public' | 'private';

export type RegistrationStatus = 'invited' | 'registered' | 'confirmed' | 'cancelled' | 'waitlist';

export type AttendanceStatus = 'pending' | 'attended' | 'no_show';

// ─── DTOs ───────────────────────────────────────────────────────────────────

export interface EventRecord {
  id: string;
  title: string;
  slug: string;
  description?: string;
  eventType: EventType;
  status: EventStatus;
  visibility?: EventVisibility;
  startsAt: string;
  endsAt?: string;
  locationName?: string;
  neighborhood?: string;
  address?: string;
  latitude?: string;
  longitude?: string;
  capacity?: number;
  organizerUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  nextCursor?: string;
  hasNextPage: boolean;
  count: number;
}

export interface EventListQueryParams {
  cursor?: string;
  limit?: number;
  search?: string;
  status?: EventStatus;
  eventType?: EventType;
  visibility?: EventVisibility;
  organizerUserId?: string;
}

export interface EventListResponse {
  events: EventRecord[];
  meta: PaginationMeta;
}

export interface CreateEventPayload {
  title: string;
  description?: string;
  eventType?: EventType;
  status?: EventStatus;
  visibility?: EventVisibility;
  startsAt: string;
  endsAt?: string;
  locationName?: string;
  neighborhood?: string;
  address?: string;
  capacity?: number;
}

export interface UpdateEventPayload {
  title?: string;
  description?: string;
  eventType?: EventType;
  status?: EventStatus;
  visibility?: EventVisibility;
  startsAt?: string;
  endsAt?: string;
  locationName?: string;
  neighborhood?: string;
  address?: string;
  capacity?: number;
}

export interface EventDetailResponse {
  event: EventRecord;
}

export interface InviteEventPayload {
  message: string;
  tagIds?: string[];
  neighborhoodIds?: string[];
}

export interface InviteEventResponse {
  result: {
    queued: number;
    alreadyInvited: number;
  };
}

export interface RegistrationCitizen {
  id: string;
  name: string | null;
  phone: string | null;
}

export interface EventRegistrationRecord {
  id: string;
  eventId: string;
  citizenId: string;
  registrationStatus: RegistrationStatus;
  attendanceStatus: AttendanceStatus;
  checkedInAt?: string;
  sourceChannel: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  citizen: RegistrationCitizen;
}

export interface RegistrationsListQueryParams {
  cursor?: string;
  limit?: number;
  registrationStatus?: RegistrationStatus;
  attendanceStatus?: AttendanceStatus;
}

export interface RegistrationsListResponse {
  registrations: EventRegistrationRecord[];
  meta: PaginationMeta;
}

export interface AttendeesListResponse {
  attendees: EventRegistrationRecord[];
  meta: PaginationMeta;
}

export interface RegisterEventPayload {
  citizenId: string;
  notes?: string;
}

export interface RegisterEventResponse {
  registration: EventRegistrationRecord;
}

export interface CheckInEventPayload {
  notes?: string;
}

export interface RegistrationResponse {
  registration: EventRegistrationRecord;
}

// ─── Query helpers ───────────────────────────────────────────────────────────

function buildEventsQuery(params?: EventListQueryParams): string {
  const sp = new URLSearchParams();
  if (!params) return '';
  if (params.cursor) sp.set('cursor', params.cursor);
  if (params.limit !== undefined) sp.set('limit', String(params.limit));
  if (params.search?.trim()) sp.set('search', params.search.trim());
  if (params.status) sp.set('status', params.status);
  if (params.eventType) sp.set('eventType', params.eventType);
  if (params.visibility) sp.set('visibility', params.visibility);
  if (params.organizerUserId) sp.set('organizerUserId', params.organizerUserId);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function buildRegistrationsQuery(params?: RegistrationsListQueryParams): string {
  const sp = new URLSearchParams();
  if (!params) return '';
  if (params.cursor) sp.set('cursor', params.cursor);
  if (params.limit !== undefined) sp.set('limit', String(params.limit));
  if (params.registrationStatus) sp.set('registrationStatus', params.registrationStatus);
  if (params.attendanceStatus) sp.set('attendanceStatus', params.attendanceStatus);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const eventsApi = {
  async list(params?: EventListQueryParams) {
    return apiClient.get<EventListResponse>(`/admin/events${buildEventsQuery(params)}`);
  },

  async create(body: CreateEventPayload) {
    return apiClient.post<EventDetailResponse>('/admin/events', body);
  },

  async getById(id: string) {
    return apiClient.get<EventDetailResponse>(`/admin/events/${id}`);
  },

  async update(id: string, body: UpdateEventPayload) {
    return apiClient.patch<EventDetailResponse>(`/admin/events/${id}`, body);
  },

  async invite(id: string, body: InviteEventPayload) {
    return apiClient.post<InviteEventResponse>(`/admin/events/${id}/invite`, body);
  },

  async listRegistrations(eventId: string, params?: RegistrationsListQueryParams) {
    return apiClient.get<RegistrationsListResponse>(
      `/admin/events/${eventId}/registrations${buildRegistrationsQuery(params)}`,
    );
  },

  async register(eventId: string, body: RegisterEventPayload) {
    return apiClient.post<RegisterEventResponse>(`/admin/events/${eventId}/registrations`, body);
  },

  async confirm(eventId: string, registrationId: string) {
    return apiClient.patch<RegistrationResponse>(
      `/admin/events/${eventId}/registrations/${registrationId}/confirm`,
      {},
    );
  },

  async checkIn(eventId: string, registrationId: string, body?: CheckInEventPayload) {
    return apiClient.post<RegistrationResponse>(
      `/admin/events/${eventId}/registrations/${registrationId}/checkin`,
      body ?? {},
    );
  },

  async listAttendees(eventId: string, params?: { cursor?: string; limit?: number }) {
    const sp = new URLSearchParams();
    if (params?.cursor) sp.set('cursor', params.cursor);
    if (params?.limit !== undefined) sp.set('limit', String(params.limit));
    const qs = sp.toString();
    return apiClient.get<AttendeesListResponse>(
      `/admin/events/${eventId}/attendees${qs ? `?${qs}` : ''}`,
    );
  },
};
