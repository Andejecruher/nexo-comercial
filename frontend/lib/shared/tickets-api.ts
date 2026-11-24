/**
 * Tickets API — Nexo Comercial
 *
 * El módulo de Tickets opera sobre el modelo de tickets real del backend:
 *   - GET  /tickets                    → listado paginado de casos (tickets)
 *   - GET  /tickets/:ticketId          → detalle del ticket (folio + conversación)
 *   - GET  /tickets/:ticketId/messages → mensajes aislados al ticket
 *   - POST /conversations/:id/{assign,transfer,close,reopen,handover,messages}
 *
 * Un ticket (`id`) pertenece a una conversación (`conversationId`). Las acciones
 * operativas (asignar/transferir/cerrar/reabrir/handover/enviar) siguen siendo
 * a nivel conversación, por lo que el DTO expone ambos identificadores.
 */

import { apiClient } from '@/lib/shared/api-client';
import type { ConversationFlowState } from '@/lib/shared/conversation-fsm';
import type {
  AssignPayload,
  ConversationDetailDto,
  ConversationListItemDto,
  MessageWithStatusesDto,
  MessagesListResponse,
  TransferPayload,
} from '@/lib/shared/conversations-api';

// ─── Re-exports de tipos base ─────────────────────────────────────────────────

export type { ConversationDetailDto, ConversationListItemDto, MessageWithStatusesDto };

// ─── Payloads de actualización ────────────────────────────────────────────────
export type { AssignPayload, TransferPayload } from '@/lib/shared/conversations-api';

// ─── Tipos propios del módulo Tickets ─────────────────────────────────────────

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TicketSource = 'WHATSAPP' | 'WEB' | 'OTHER';

export const TICKET_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

/** DTO de ticket (contrato JSON de GET /tickets y GET /tickets/:ticketId). */
export interface TicketDto {
  /** Id real del ticket (no de la conversación). */
  id: string;
  folio: string;
  conversationId: string;
  citizenId: string;
  citizenName: string;
  citizenPhone: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  departmentSlug: string | undefined;
  assignedUserId: string | undefined;
  flowState: ConversationFlowState;
  conversationStatus: 'open' | 'closed';
  channel: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | undefined;
}

/** Detalle de ticket: incluye la conversación subyacente para parches realtime. */
export interface TicketDetailDto extends TicketDto {
  _rawDetail: ConversationDetailDto;
}

interface TicketApiDto {
  id: string;
  folio: string;
  conversationId: string;
  citizenId: string;
  citizenName: string | null;
  citizenPhone: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  departmentSlug: string | null;
  assignedUserId: string | null;
  flowState: string;
  conversationStatus: string;
  channel: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

interface TicketDetailApiDto extends TicketApiDto {
  conversation: ConversationDetailDto | null;
}

// ─── Mappers (respuesta de API → DTO de UI) ───────────────────────────────────

function toFlowState(value: string): ConversationFlowState {
  return value as ConversationFlowState;
}

function buildFallbackConversation(dto: TicketApiDto): ConversationDetailDto {
  return {
    id: dto.conversationId,
    citizenId: dto.citizenId,
    status: dto.conversationStatus === 'closed' ? 'closed' : 'open',
    channel: dto.channel,
    assignedDept: dto.departmentSlug ?? undefined,
    assignedUserId: dto.assignedUserId ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    meta: {
      id: `${dto.conversationId}-meta`,
      conversationId: dto.conversationId,
      flowState: toFlowState(dto.flowState),
      departmentSlug: dto.departmentSlug,
      version: 0,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
    },
    citizen: {
      id: dto.citizenId,
      phone: dto.citizenPhone ?? '',
      name: dto.citizenName ?? 'Ciudadano',
    },
  };
}

export function ticketFromApi(dto: TicketApiDto): TicketDto {
  return {
    id: dto.id,
    folio: dto.folio,
    conversationId: dto.conversationId,
    citizenId: dto.citizenId,
    citizenName: dto.citizenName ?? 'Ciudadano',
    citizenPhone: dto.citizenPhone ?? '',
    status: dto.status,
    priority: dto.priority,
    source: dto.source,
    departmentSlug: dto.departmentSlug ?? undefined,
    assignedUserId: dto.assignedUserId ?? undefined,
    flowState: toFlowState(dto.flowState),
    conversationStatus: dto.conversationStatus === 'closed' ? 'closed' : 'open',
    channel: dto.channel,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    closedAt: dto.closedAt ?? undefined,
  };
}

export function ticketDetailFromApi(dto: TicketDetailApiDto): TicketDetailDto {
  const base = ticketFromApi(dto);
  return {
    ...base,
    _rawDetail: dto.conversation ?? buildFallbackConversation(dto),
  };
}

/**
 * Reconstruye el ticket de detalle tras aplicar un parche de conversación,
 * preservando la identidad del ticket (id, folio) y sus campos propios
 * (status/priority/source/closedAt) que no provienen de la conversación.
 */
export function rebaseTicketDetail(
  prev: TicketDetailDto,
  conversation: ConversationDetailDto,
): TicketDetailDto {
  return {
    ...prev,
    flowState: conversation.meta?.flowState ?? prev.flowState,
    conversationStatus: conversation.status,
    departmentSlug:
      conversation.meta?.departmentSlug ?? conversation.assignedDept ?? prev.departmentSlug,
    assignedUserId: conversation.assignedUserId ?? undefined,
    channel: conversation.channel,
    citizenName: conversation.citizen?.name ?? prev.citizenName,
    citizenPhone: conversation.citizen?.phone ?? prev.citizenPhone,
    updatedAt: conversation.updatedAt,
    _rawDetail: conversation,
  };
}

// ─── Métricas ─────────────────────────────────────────────────────────────────

/** Cuenta los tickets por estado, dejando en 0 los estados sin ocurrencias. */
export function countTicketsByStatus(tickets: TicketDto[]): Record<TicketStatus, number> {
  const counts = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0])) as Record<
    TicketStatus,
    number
  >;

  tickets.forEach((ticket) => {
    counts[ticket.status] += 1;
  });

  return counts;
}

// ─── Filtrado client-side ─────────────────────────────────────────────────────

export type TicketStatusFilter = TicketStatus | 'all';
export type TicketPriorityFilter = TicketPriority | 'all';

export interface TicketFilters {
  status: TicketStatusFilter;
  priority: TicketPriorityFilter;
  departmentSlug?: string;
  assignedUserId?: string;
  search: string;
}

export function matchesTicketFilters(ticket: TicketDto, filters: TicketFilters): boolean {
  if (filters.status !== 'all' && ticket.status !== filters.status) return false;
  if (filters.priority !== 'all' && ticket.priority !== filters.priority) return false;
  if (filters.departmentSlug && ticket.departmentSlug !== filters.departmentSlug) return false;
  if (filters.assignedUserId && ticket.assignedUserId !== filters.assignedUserId) return false;

  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const matchName = ticket.citizenName.toLowerCase().includes(q);
    const matchPhone = ticket.citizenPhone.toLowerCase().includes(q);
    const matchId = ticket.id.toLowerCase().includes(q);
    const matchFolio = ticket.folio.toLowerCase().includes(q);
    if (!matchName && !matchPhone && !matchId && !matchFolio) return false;
  }

  return true;
}

// ─── API thin wrapper ─────────────────────────────────────────────────────────

/** Metadata de paginación offset devuelta por GET /tickets. */
export interface PaginationMeta {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface TicketListParams {
  page: number;
  limit: number;
  sortBy?: 'updatedAt' | 'createdAt' | 'priority';
  sort?: 'asc' | 'desc';
  citizenId?: string;
  status?: string;
  priority?: string;
  departmentSlug?: string;
  assignedUserId?: string;
  search?: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const ticketsApi = {
  /** Lista tickets (casos) reales, paginados y filtrables server-side. */
  async list(params: TicketListParams) {
    const q = qs({
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sort: params.sort,
      citizenId: params.citizenId,
      status: params.status,
      priority: params.priority,
      departmentSlug: params.departmentSlug,
      assignedUserId: params.assignedUserId,
      search: params.search,
    });
    return apiClient.get<{
      data: TicketApiDto[];
      pagination: PaginationMeta;
    }>(`/tickets${q}`);
  },

  async getById(ticketId: string) {
    return apiClient.get<{ ticket: TicketDetailApiDto }>(`/tickets/${ticketId}`);
  },

  async getMessages(ticketId: string, params?: { cursor?: string; limit?: number }) {
    const q = qs({ cursor: params?.cursor, limit: params?.limit ?? 100 });
    return apiClient.get<MessagesListResponse>(`/tickets/${ticketId}/messages${q}`);
  },

  async assign(conversationId: string, body: AssignPayload = {}) {
    return apiClient.post<{ assigned: boolean; conversationId: string; agentId: string }>(
      `/conversations/${conversationId}/assign`,
      body,
    );
  },

  async transfer(conversationId: string, body: TransferPayload) {
    return apiClient.post<{ transferred: boolean; conversationId: string; toUserId: string }>(
      `/conversations/${conversationId}/transfer`,
      body,
    );
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

  async handover(conversationId: string) {
    return apiClient.post<{ handover: boolean; conversationId: string; agentId: string }>(
      `/conversations/${conversationId}/handover`,
      {},
    );
  },

  async sendMessage(conversationId: string, body: string, idempotencyKey: string) {
    return apiClient.post<{ message: MessageWithStatusesDto; idempotencyKey: string }>(
      `/conversations/${conversationId}/messages`,
      { body },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  },
};
