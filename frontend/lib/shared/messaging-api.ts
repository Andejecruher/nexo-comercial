/**
 * Cliente API — capa messaging (conversaciones + mensajes + adjuntos metadata).
 * Contratos alineados con backend Express / Prisma.
 */

import { apiClient } from '@/lib/shared/api-client';

// ─── Tipos API (respuestas JSON) ─────────────────────────────────────────────

export type ConversationStatusApi = 'open' | 'closed' | 'in_progress' | 'resolved';

export type InboxStatusApi = 'active' | 'inactive';

export type ConversationFlowStateApi =
  | 'BOT_FLOW'
  | 'REGISTERING'
  | 'DEPARTMENT_ROUTING'
  | 'HUMAN_FLOW'
  | 'ESCALATED'
  | 'CLOSED';

export interface ConversationMetaApi {
  id: string;
  conversationId: string;
  flowState: ConversationFlowStateApi;
  lockedByUserId?: string;
  lockedAt?: string;
  version: number;
  departmentSlug?: string;
  communicationLineId?: string;
  handoverAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationListCitizenApi {
  id: string;
  phone: string;
  name?: string;
  lastName?: string;
  email?: string;
  neighborhood?: string;
  neighborhoodId?: string;
  createdAt?: string;
}

export interface ConversationAssignedUserApi {
  id: string;
  fullName?: string | null;
  email?: string;
}

/** Agente IA activo que atiende la conversación (derivado línea→agente en backend). */
export interface BotAgentSummaryApi {
  id: string;
  name: string;
}

export interface ConversationListItemApi {
  id: string;
  citizenId: string;
  status: ConversationStatusApi;
  channel: string;
  assignedDept?: string | null;
  assignedUserId?: string | null;
  createdAt: string;
  updatedAt: string;
  meta: ConversationMetaApi | null;
  citizen: ConversationListCitizenApi;
  assignedUser?: ConversationAssignedUserApi | null;
  inboxStatus?: InboxStatusApi;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  lastMessageDirection?: MessageDirectionApi;
  unreadCount?: number;
  botAgent?: BotAgentSummaryApi | null;
}

export interface AiAgentLineSummaryApi {
  id: string;
  name: string;
}

export interface AiAgentSummaryApi {
  id: string;
  name: string;
  lines: AiAgentLineSummaryApi[];
}

/** Respuesta envuelta de GET /ai-agents (convención de la API, como admin-ai). */
export interface AiAgentsListResponse {
  agents: AiAgentSummaryApi[];
}

export interface ConversationListResponse {
  items: ConversationListItemApi[];
  meta: {
    nextCursor?: string;
    hasNextPage: boolean;
  };
}

export type MessageDirectionApi = 'inbound' | 'outbound';

export type MessageStatusValueApi = 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageStatusApi {
  id: string;
  messageId: string;
  wamid: string;
  status: MessageStatusValueApi;
  errorCode?: number;
  errorTitle?: string;
  timestamp: string;
  createdAt: string;
}

/** fileSizeBytes puede llegar como string (recomendado) o BigInt serializado */
export interface AttachmentApi {
  mediaUrl?: string;
  mediaDownloadUrl?: string;
  mediaUrlExpiresAt?: string;
  mediaError?: 'MEDIA_URL_UNAVAILABLE';
  id: string;
  storageKey: string;
  processingState?: string;
  mimeType: string;
  fileSizeBytes: string | number;
  originalFilename?: string;
  cdnUrl?: string;
  messageId?: string;
  citizenId?: string;
  uploadedBy?: string;
  createdAt: string;
}

export interface MessageApi {
  mediaUrl?: string;
  mediaDownloadUrl?: string;
  mediaUrlExpiresAt?: string;
  mediaError?: 'MEDIA_URL_UNAVAILABLE';
  id: string;
  conversationId: string;
  body: string;
  direction: MessageDirectionApi;
  messageType: string;
  externalMessageId?: string;
  attachmentId?: string;
  sendByUserId?: string | null;
  sender?: ConversationAssignedUserApi | null;
  meta: Record<string, unknown>;
  /** Reacción de WhatsApp sobre este mensaje, si existe. */
  reaction?: MessageReactionApi | null;
  createdAt: string;
  statuses: MessageStatusApi[];
  attachmentsViaMessageId: AttachmentApi[];
}

/**
 * Reacción de WhatsApp sobre un mensaje. `emoji: null` indica que el ciudadano
 * retiró su reacción (el badge debe desaparecer).
 */
export interface MessageReactionApi {
  emoji: string | null;
  from: string;
  /** Timestamp del evento en segundos Unix, tal como llega de Meta. */
  updated_at: string;
}

export interface MessageListResponse {
  items: MessageApi[];
  meta: {
    nextCursor?: string;
    hasNextPage: boolean;
  };
}

export type ConversationTicketStatusApi = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type ConversationTicketPriorityApi = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/** Resumen de un ticket para la vista "Detalles del Ticket". */
export interface ConversationTicketApi {
  id: string;
  title?: string;
  status: ConversationTicketStatusApi;
  priority: ConversationTicketPriorityApi;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closeReason?: string;
  messageCount: number;
}

export interface ConversationTicketsResponse {
  items: ConversationTicketApi[];
}

export interface SendMessageResponse {
  message: MessageApi;
  idempotencyKey: string;
}

export interface AddAttachmentResponse {
  attachment: AttachmentApi;
}

export interface SendMessageBody {
  body: string;
  messageType?: string;
}

export interface AddAttachmentBody {
  storageKey: string;
  mimeType: string;
  /** Entero positivo como string (contrato backend) */
  fileSizeBytes: string;
  originalFilename?: string;
  cdnUrl?: string;
}

// ─── Mapeo UI ────────────────────────────────────────────────────────────────

export type InboxStatus = InboxStatusApi;
export type InboxAttendantKind = 'agent' | 'department' | 'bot';

export interface InboxCitizen {
  id: string;
  name: string;
  phone: string;
  colonia: string;
  interests: string[];
  registeredAt: string;
  lastName?: string;
  email?: string;
}

export interface InboxAttendant {
  kind: InboxAttendantKind;
  label: string;
}

/** Vista unificada para lista + perfil + ventana */
export interface InboxConversation {
  id: string;
  citizen: InboxCitizen;
  inboxStatus: InboxStatus;
  conversationStatus: ConversationStatusApi;
  lastMessage: string;
  lastTime: string;
  unread: number;
  updatedAt: string;
  communicationLineId?: string;
  departmentSlug?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  botAgent?: BotAgentSummaryApi | null;
  canClose: boolean;
}

export function citizenDisplayName(citizen: {
  name?: string | null;
  lastName?: string | null;
}): string {
  const full = [citizen.name, citizen.lastName].filter(Boolean).join(' ').trim();
  return full || 'Sin nombre';
}

export function resolveInboxAttendant(
  chat: Pick<InboxConversation, 'assignedUserName' | 'departmentSlug'>,
  departmentName?: string,
): InboxAttendant {
  const agent = chat.assignedUserName?.trim();
  if (agent) return { kind: 'agent', label: agent };
  const dept = departmentName?.trim() || chat.departmentSlug?.trim();
  if (dept) return { kind: 'department', label: dept };
  return { kind: 'bot', label: 'Bot' };
}

export function mapConversationToInboxUi(row: ConversationListItemApi): InboxConversation {
  const displayName = citizenDisplayName(row.citizen);
  const inboxStatus = row.inboxStatus ?? 'inactive';
  const lastMessageAt = row.lastMessageAt ?? row.updatedAt;
  const assignedUserName =
    row.assignedUser?.fullName?.trim() ||
    (row.assignedUser?.email ? row.assignedUser.email : undefined);
  const departmentSlug = row.assignedDept ?? row.meta?.departmentSlug ?? undefined;
  const conversationClosed = row.status === 'closed' || row.meta?.flowState === 'CLOSED';

  return {
    id: row.id,
    citizen: {
      id: row.citizen.id,
      name: displayName,
      phone: row.citizen.phone,
      colonia: row.citizen.neighborhood?.trim() || '—',
      interests: [],
      registeredAt: row.citizen.createdAt ?? row.createdAt,
      lastName: row.citizen.lastName,
      email: row.citizen.email,
    },
    inboxStatus,
    conversationStatus: row.status,
    lastMessage: row.lastMessagePreview?.trim() || '—',
    lastTime: formatRelativeShort(lastMessageAt),
    unread: Math.max(0, row.unreadCount ?? 0),
    updatedAt: row.updatedAt,
    communicationLineId: row.meta?.communicationLineId,
    departmentSlug,
    assignedUserId: row.assignedUserId ?? row.assignedUser?.id,
    assignedUserName,
    botAgent: row.botAgent ?? null,
    canClose: !conversationClosed,
  };
}

export function formatRelativeShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const dayMs = 86400000;
  const diff = now.getTime() - d.getTime();
  if (diff < dayMs && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 2 * dayMs) return 'Ayer';
  return d.toLocaleDateString('es-MX', { weekday: 'short' });
}

function buildQuery(params: Record<string, string | number | string[] | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((item) => q.append(key, item));
      return;
    }
    q.set(key, String(value));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface ListConversationsParams {
  cursor?: string;
  limit?: number;
  citizenId?: string;
  status?: InboxStatus;
  departmentIds?: string[];
  communicationLineId?: string;
  search?: string;
  /**
   * IDs de agentes IA activos para filtrar conversaciones atendidas por bots.
   * `null` representa "todos los bots" (se envía como `bot_ids=all`).
   * Coexiste con departmentIds: la combinación se evalúa con OR en el backend.
   */
  botIds?: (string | null)[];
}

export const messagingApi = {
  async listConversations(params: ListConversationsParams = {}) {
    const path = `/conversations${buildQuery({
      cursor: params.cursor,
      limit: params.limit,
      citizenId: params.citizenId,
      status: params.status,
      department_id: params.departmentIds,
      phone_line_id: params.communicationLineId,
      search: params.search,
      bot_ids: params.botIds?.map((id) => id ?? 'all'),
    })}`;
    return apiClient.get<ConversationListResponse>(path);
  },

  /**
   * Contexto de una conversación puntual (`GET /conversations/:id`).
   *
   * El backend responde `{ conversation }` con el contexto de la conversación
   * (ciudadano, meta y línea). Se tipa como `ConversationListItemApi` porque el
   * mapeo a la UI comparte esa forma; los campos derivados de la lista
   * (`inboxStatus`, `unreadCount`, `lastMessagePreview`, `botAgent`) viajan
   * ausentes y el mapeo los resuelve con sus valores por defecto.
   */
  async getConversation(conversationId: string) {
    return apiClient.get<{ conversation: ConversationListItemApi }>(
      `/conversations/${conversationId}`,
    );
  },

  /** Agentes IA activos (opcionalmente filtrados por línea). Lee body.agents. */
  async getAiAgents(lineId?: string) {
    const path = `/ai-agents${buildQuery({ lineId })}`;
    return apiClient.get<AiAgentsListResponse>(path);
  },

  async listMessages(conversationId: string, params: { cursor?: string; limit?: number } = {}) {
    const path = `/conversations/${conversationId}/messages${buildQuery(params)}`;
    return apiClient.get<MessageListResponse>(path);
  },

  async sendMessage(conversationId: string, body: SendMessageBody, idempotencyKey: string) {
    return apiClient.post<SendMessageResponse>(`/conversations/${conversationId}/messages`, body, {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
  },

  async sendMedia(conversationId: string, file: File, caption: string, idempotencyKey: string) {
    const kind = file.type.startsWith('image/')
      ? file.type === 'image/webp'
        ? 'sticker'
        : 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'document';
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('kind', kind);
    form.append('caption', caption);
    return apiClient.post<SendMessageResponse>(
      `/conversations/${conversationId}/messages/media`,
      form,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  },
  async sendContact(conversationId: string, citizenId: string, idempotencyKey: string) {
    return apiClient.post<SendMessageResponse>(
      `/conversations/${conversationId}/messages/contacts`,
      { citizenId },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  },
  async sendTemplate(
    conversationId: string,
    templateId: string,
    variables: Record<string, string>,
    idempotencyKey: string,
  ) {
    return apiClient.post<SendMessageResponse>(
      `/conversations/${conversationId}/messages/template`,
      { templateId, variables },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  },
  async sendAudio(
    conversationId: string,
    file: File,
    durationSeconds: number,
    idempotencyKey: string,
  ) {
    const form = new FormData();
    form.append('audio', file, file.name);
    form.append('durationSeconds', String(Math.max(1, Math.round(durationSeconds))));
    return apiClient.post<SendMessageResponse>(
      `/conversations/${conversationId}/messages/audio`,
      form,
      {
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    );
  },

  async addAttachment(messageId: string, body: AddAttachmentBody) {
    return apiClient.post<AddAttachmentResponse>(`/messages/${messageId}/attachments`, body);
  },

  async ensureOpen(citizenId: string, communicationLineId?: string) {
    return apiClient.post<{ conversation: ConversationListItemApi }>('/conversations', {
      citizenId,
      communicationLineId,
    });
  },

  async closeConversation(conversationId: string) {
    return apiClient.post<{ closed: boolean; conversationId: string }>(
      `/conversations/${conversationId}/close`,
      {},
    );
  },

  async markConversationRead(conversationId: string) {
    return apiClient.post<{ read: boolean; conversationId: string }>(
      `/conversations/${conversationId}/read`,
      {},
    );
  },

  async listConversationTickets(conversationId: string) {
    return apiClient.get<ConversationTicketsResponse>(`/conversations/${conversationId}/tickets`);
  },

  async listTicketMessages(ticketId: string, params: { cursor?: string; limit?: number } = {}) {
    const path = `/tickets/${ticketId}/messages${buildQuery(params)}`;
    return apiClient.get<MessageListResponse>(path);
  },
};
