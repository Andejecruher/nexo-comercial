import { apiClient } from '@/lib/shared/api-client';

export type CitizenLeadStatus = 'new' | 'contacted' | 'engaged' | 'converted' | 'unsubscribed';

export interface CitizenListQueryParams {
  search?: string;
  phone?: string;
  consentGiven?: boolean;
  hasPhone?: boolean;
  leadStatus?: CitizenLeadStatus;
  neighborhoodId?: string;
  tagIds?: string[];
  cursor?: string;
  limit?: number;
}

export interface Citizen {
  id: string;
  phone?: string;
  name?: string;
  lastName?: string;
  email?: string;
  sourceChannel: string;
  leadStatus: string;
  consentGiven: boolean;
  consentAt?: string;
  neighborhood?: string;
  neighborhoodId?: string;
  interests: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CitizenTagInfo {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: string;
}

export interface CitizenConversationSummary {
  totalConversations: number;
  openConversations: number;
  lastConversation: {
    id: string;
    status: string;
    channel: string;
    updatedAt: string;
    lastMessage?: string;
  } | null;
}

export interface CitizenParticipationHistoryItem {
  registrationId: string;
  eventId: string;
  eventTitle: string;
  eventStartsAt: string;
  registrationStatus: string;
  attendanceStatus: string;
  sourceChannel: string;
  checkedInAt?: string;
}

export interface CitizenProfileResponse {
  citizen: Citizen;
  tags: CitizenTagInfo[];
  conversationSummary: CitizenConversationSummary;
  participationHistory: CitizenParticipationHistoryItem[];
}

export type CitizenRecentTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface CitizenRecentTicket {
  id: string;
  conversationId: string;
  status: CitizenRecentTicketStatus;
  title: string | null;
  departmentSlug: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCitizenPayload {
  phone?: string;
  name?: string | null;
  lastName?: string | null;
  email?: string | null;
  consentGiven?: boolean;
  interests?: string[];
}

export interface PaginationMeta {
  nextCursor?: string;
  hasNextPage: boolean;
  count: number;
}

export interface CitizenListResponse {
  citizens: Citizen[];
  meta: PaginationMeta;
}

export interface CitizenBulkTagPayload {
  citizenIds: string[];
  tagIds: string[];
  operation?: 'assign' | 'remove';
}

export interface CitizenBulkTagResponse {
  operation: 'assign' | 'remove';
  processed: number;
  updated: number;
  skipped: number;
  errors: Array<{
    citizenId: string;
    tagId: string;
    code: string;
    message: string;
  }>;
}

function createQueryString(params?: CitizenListQueryParams) {
  const query = new URLSearchParams();
  if (!params) return '';

  if (params.search) query.set('search', params.search);
  if (params.phone) query.set('phone', params.phone);
  if (params.consentGiven !== undefined) query.set('consentGiven', String(params.consentGiven));
  if (params.hasPhone !== undefined) query.set('hasPhone', String(params.hasPhone));
  if (params.leadStatus) query.set('leadStatus', params.leadStatus);
  if (params.neighborhoodId) query.set('neighborhoodId', params.neighborhoodId);
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));

  if (params.tagIds && params.tagIds.length > 0) {
    params.tagIds.forEach((tagId) => query.append('tagIds', tagId));
  }

  return query.toString();
}

export interface CreateCitizenPayload {
  phone: string;
  name?: string;
  lastName?: string;
  sourceChannel?: string;
}

export const citizensApi = {
  async list(params?: CitizenListQueryParams, signal?: AbortSignal) {
    const query = createQueryString(params);
    const path = `/citizens${query ? `?${query}` : ''}`;
    return apiClient.get<CitizenListResponse>(path, { signal });
  },

  async create(payload: CreateCitizenPayload) {
    return apiClient.post<{ citizen: Citizen }>('/citizens', payload);
  },

  async getProfile(id: string) {
    return apiClient.get<CitizenProfileResponse>(`/citizens/${id}/profile`);
  },

  async get(id: string) {
    return apiClient.get<{ citizen: Citizen }>(`/citizens/${id}`);
  },

  async update(id: string, payload: UpdateCitizenPayload) {
    return apiClient.patch<{ citizen: Citizen }>(`/citizens/${id}`, payload);
  },

  async remove(id: string) {
    return apiClient.delete<{ citizen: Citizen }>(`/citizens/${id}`);
  },

  async getRecentTickets(id: string) {
    return apiClient.get<{ tickets: CitizenRecentTicket[] }>(`/citizens/${id}/tickets`);
  },

  async assignTag(citizenId: string, tagId: string) {
    return apiClient.post<{ assigned: { id: string } }>(`/citizens/${citizenId}/tags/${tagId}`);
  },

  async removeTag(citizenId: string, tagId: string) {
    return apiClient.delete<{ removed: { id: string } }>(`/citizens/${citizenId}/tags/${tagId}`);
  },

  async bulkTagAssignment(payload: CitizenBulkTagPayload) {
    return apiClient.post<CitizenBulkTagResponse>('/citizens/tags/bulk', payload);
  },
};
