/**
 * Cliente API — Conversaciones operativas (/api/v1/conversations)
 */

import { apiClient } from '@/lib/api-client';
import type { ConversationFlowState } from '@/lib/conversation-fsm';

// ─── Tipos (contratos JSON del backend) ───────────────────────────────────────

export type ConversationStatus = 'open' | 'closed';

export interface ConversationMetaDto {
  communicationLineId?: string;
  id: string;
  conversationId: string;
  flowState: ConversationFlowState;
  lockedByUserId?: string | null;
  lockedAt?: string | null;
  version: number;
  departmentSlug?: string | null;
  handoverAt?: string | null;
  handoffKind?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListItemDto {
  id: string;
  citizenId: string;
  status: ConversationStatus;
  channel: string;
  assignedDept?: string | null;
  assignedUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  meta: ConversationMetaDto | undefined;
  citizen: { id: string; phone: string; name: string };
}

export interface ConversationListResponse {
  items: ConversationListItemDto[];
  meta: { nextCursor: string | undefined; hasNextPage: boolean };
}

export interface ConversationDetailDto extends ConversationListItemDto {
  meta: ConversationMetaDto;
}

export interface ConversationDetailResponse {
  conversation: ConversationDetailDto;
}

export type MessageDirection = 'inbound' | 'outbound';

/** Remitente humano de un mensaje outbound — null para ciudadano o bot IA. */
export interface MessageSenderDto {
  id: string;
  fullName: string | null;
  email: string;
}

export interface MessageDto {
  mediaUrl?: string;
  mediaDownloadUrl?: string;
  mediaUrlExpiresAt?: string;
  mediaError?: 'MEDIA_URL_UNAVAILABLE';
  id: string;
  conversationId: string;
  body: string;
  direction: MessageDirection;
  messageType: string;
  externalMessageId?: string;
  attachmentId?: string;
  sendByUserId?: string | null;
  sender?: MessageSenderDto | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface MessageStatusDto {
  id: string;
  messageId: string;
  wamid: string;
  status: string;
  createdAt: string;
}

export interface AttachmentDto {
  processingState?: string;
  mediaUrl?: string;
  mediaDownloadUrl?: string;
  mediaUrlExpiresAt?: string;
  mediaError?: 'MEDIA_URL_UNAVAILABLE';
  id: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: string;
  originalFilename?: string;
  cdnUrl?: string;
  messageId?: string;
  citizenId?: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface MessageWithStatusesDto extends MessageDto {
  statuses: MessageStatusDto[];
  attachmentsViaMessageId: AttachmentDto[];
}

export interface MessagesListResponse {
  items: MessageWithStatusesDto[];
  meta: { nextCursor: string | undefined; hasNextPage: boolean };
}

export interface AssignPayload {
  userId?: string;
  departmentSlug?: string;
}

export interface TransferPayload {
  toUserId: string;
  departmentSlug?: string;
}

/**
 * Destino de transferencia de conversación (contrato POST /conversations/:id/transfer).
 * El control final lo decide la FSM del backend según el tipo:
 *  - agent      → HUMAN_FLOW
 *  - department → DEPARTMENT_ROUTING
 *  - ai         → BOT_FLOW
 */
export type TransferTarget =
  | { type: 'agent'; toUserId: string; departmentSlug?: string }
  | { type: 'department'; departmentSlug: string }
  | { type: 'ai' };

function createQueryString(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const conversationsApi = {
  async list(params?: { cursor?: string; limit?: number }) {
    const qs = createQueryString({
      cursor: params?.cursor,
      limit: params?.limit,
    });
    return apiClient.get<ConversationListResponse>(`/conversations${qs}`);
  },

  async getById(id: string) {
    return apiClient.get<ConversationDetailResponse>(`/conversations/${id}`);
  },

  async getMessages(conversationId: string, params?: { cursor?: string; limit?: number }) {
    const qs = createQueryString({
      cursor: params?.cursor,
      limit: params?.limit ?? 50,
    });
    return apiClient.get<MessagesListResponse>(`/conversations/${conversationId}/messages${qs}`);
  },

  async assign(conversationId: string, body: AssignPayload = {}) {
    return apiClient.post<{
      assigned: boolean;
      conversationId: string;
      agentId: string;
    }>(`/conversations/${conversationId}/assign`, body);
  },

  async transferChat(conversationId: string, target: TransferTarget) {
    return apiClient.post<{
      transferred: boolean;
      conversationId: string;
      flowState: ConversationFlowState;
    }>(`/conversations/${conversationId}/transfer`, target);
  },

  async handover(conversationId: string) {
    return apiClient.post<{
      handover: boolean;
      conversationId: string;
      agentId: string;
    }>(`/conversations/${conversationId}/handover`, {});
  },

  async close(conversationId: string) {
    return apiClient.post<{ closed: boolean; conversationId: string }>(
      `/conversations/${conversationId}/close`,
      {},
    );
  },

  async reopen(conversationId: string) {
    return apiClient.post<{ reopened: boolean; conversationId: string }>(
      `/conversations/${conversationId}/reopen`,
      {},
    );
  },

  async sendMessage(
    conversationId: string,
    body: string,
    idempotencyKey: string,
    messageType?: string,
  ) {
    return apiClient.post<{ message: MessageDto; idempotencyKey: string }>(
      `/conversations/${conversationId}/messages`,
      { body, ...(messageType ? { messageType } : {}) },
      {
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    );
  },

  async ensureOpen(citizenId: string, communicationLineId?: string) {
    return apiClient.post<ConversationDetailResponse>('/conversations', {
      citizenId,
      communicationLineId,
    });
  },
};
