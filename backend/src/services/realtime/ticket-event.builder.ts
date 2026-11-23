import { randomUUID } from 'crypto';
import {
  ConversationRealtimeAction,
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from './realtime-event.contracts';

/**
 * Snapshot mínimo de ticket suficiente para construir un evento `ticket.closed`.
 * Se admite desde el servicio de tickets (Ticket completo) o desde consultas
 * acotadas en transacciones (closeActiveTicketsInTransaction).
 */
export interface TicketClosedSnapshot {
  id: string;
  conversationId: string;
  assignedUserId?: string | null;
  departmentSlug?: string | null;
  closedAt?: Date | string | null;
}

/**
 * Evento durable `ticket.closed` transportado sobre `conversation.updated`
 * (compat hacia atrás con el derivador de la UI). Incluye ticketPatch +
 * conversationPatch + inboxPatch para aplicación idempotente en frontend.
 */
export function buildTicketClosedEvent(
  ticket: TicketClosedSnapshot,
  correlationId: string,
  occurredAt: string,
  source: string,
): RealtimeDurableEvent {
  const closedAtIso =
    ticket.closedAt instanceof Date
      ? ticket.closedAt.toISOString()
      : (ticket.closedAt ?? occurredAt);

  return {
    eventId: randomUUID(),
    correlationId,
    schemaVersion: 1,
    eventType: CriticalEventType.TicketClosed,
    socketEventName: SocketEventName.ConversationUpdated,
    occurredAt,
    source,
    conversationId: ticket.conversationId,
    action: ConversationRealtimeAction.Close,
    conversationPatch: {
      id: ticket.conversationId,
      status: 'closed',
      updatedAt: occurredAt,
    },
    ticketPatch: {
      id: ticket.id,
      status: 'CLOSED',
      ...(ticket.assignedUserId ? { assignedUserId: ticket.assignedUserId } : {}),
      ...(ticket.departmentSlug ? { departmentSlug: ticket.departmentSlug } : {}),
      updatedAt: closedAtIso,
    },
    inboxPatch: {
      inboxStatus: 'inactive',
      status: 'closed',
    },
    notificationPatch: {
      type: 'ticket.closed',
      conversationId: ticket.conversationId,
      ticketId: ticket.id,
      ...(ticket.departmentSlug ? { departmentSlug: ticket.departmentSlug } : {}),
    },
  };
}
