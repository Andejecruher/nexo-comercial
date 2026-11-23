/**
 * Tipos y enums del módulo de tickets.
 *
 * Un Ticket representa un caso de atención ciudadana dentro de una Conversation.
 * Una conversación puede tener múltiples tickets históricos pero solo 1 activo (OPEN | IN_PROGRESS).
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum TicketStatus {
  /** Ticket creado, sin atención iniciada */
  OPEN = 'OPEN',
  /** Un agente está atendiendo activamente */
  IN_PROGRESS = 'IN_PROGRESS',
  /** El caso fue resuelto, pendiente de cierre formal */
  RESOLVED = 'RESOLVED',
  /** Cerrado definitivamente */
  CLOSED = 'CLOSED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TicketSource {
  WHATSAPP = 'WHATSAPP',
  WEB = 'WEB',
  OTHER = 'OTHER',
}

export enum TicketActorType {
  CITIZEN = 'CITIZEN',
  AGENT = 'AGENT',
  BOT = 'BOT',
  SYSTEM = 'SYSTEM',
}

// ─── Transiciones válidas de estado ───────────────────────────────────────────

/**
 * Mapa de transiciones válidas para la FSM del ticket.
 * Solo se permiten avances lineales; no hay regresiones.
 */
export const VALID_TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

// ─── Tipos de inputs ──────────────────────────────────────────────────────────

export interface CreateTicketInput {
  conversationId: string;
  citizenId: string;
  title?: string;
  description?: string;
  priority?: TicketPriority;
  source?: TicketSource;
  departmentSlug?: string;
}

export interface AssignTicketInput {
  userId?: string;
  departmentSlug?: string;
}

// ─── Tipos de output (shaped como los modelos Prisma) ─────────────────────────

export interface Ticket {
  id: string;
  conversationId: string;
  citizenId: string;
  folio: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  title?: string;
  description?: string;
  departmentSlug?: string;
  assignedUserId?: string;
  closeReason?: string;
  closeSummary?: string;
  escalationReason?: string;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Opciones de cierre de ticket con trazabilidad. */
export interface CloseTicketOptions {
  /** Motivo de cierre, p. ej. REGISTRATION_COMPLETED, resolved, user_request. */
  reason?: string;
  /** Resumen breve del caso al cerrar. */
  summary?: string;
}

/** Referencia para resolver el ticket a cerrar: por id de ticket o de conversación. */
export interface CloseTicketRef {
  ticketId?: string;
  conversationId?: string;
}

/** Resultado del cierre de un ticket, con el folio para confirmación. */
export interface CloseTicketResult {
  ticketId: string;
  conversationId: string;
  folio: string;
  closedAt: Date;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  messageId: string;
  actorType: TicketActorType;
  createdAt: Date;
}

/** Resumen de un ticket para la vista "Detalles del Ticket" (historial por ticket). */
export interface ConversationTicketSummary {
  id: string;
  folio: string;
  title?: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  closeReason?: string;
  messageCount: number;
}

/** Filtros de listado global de tickets (inbox CRM real). */
export interface ListTicketFilters {
  cursor?: string;
  limit: number;
  citizenId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  departmentSlug?: string;
  assignedUserId?: string;
  search?: string;
}

/**
 * Filtros del listado paginado por offset (dashboard admin).
 *
 * `page` es 1-based y `limit` se clampa en el servicio; nunca confiar en que
 * el controller ya lo validó.
 */
export interface PageTicketFilters extends Omit<ListTicketFilters, 'cursor' | 'limit'> {
  page: number;
  limit: number;
  sortBy?: 'updatedAt' | 'createdAt' | 'priority';
  sort?: 'asc' | 'desc';
}
