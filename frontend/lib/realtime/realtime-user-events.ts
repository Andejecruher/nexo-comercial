import {
  isAdminNotificationPayload,
  isDurableEventPayload,
  SocketEventName,
  type AdminNotificationPayload,
  type RealtimeDurableEventPayload,
} from './types';

/**
 * Application-level (semantic) realtime events.
 *
 * The backend transports domain actions through a small set of socket event
 * names; ticket semantics travel INSIDE the payload (action, ticketPatch,
 * eventType). Components must not inspect raw payloads to detect "a ticket
 * was closed" — they subscribe to these semantic ids, and this catalog owns
 * every derivation rule in ONE place.
 *
 * Extending: add an entry here and the subscription hooks, the sound layer
 * and the preferences store pick it up automatically.
 */
export const RealtimeUserEvent = {
  NUEVO_MENSAJE: 'NUEVO_MENSAJE',
  NUEVO_TICKET: 'NUEVO_TICKET',
  CIERRE_TICKET: 'CIERRE_TICKET',
  TRANSFERENCIA_TICKET: 'TRANSFERENCIA_TICKET',
} as const;

export type RealtimeUserEventId = (typeof RealtimeUserEvent)[keyof typeof RealtimeUserEvent];

export type RealtimeUserEventPayload = RealtimeDurableEventPayload | AdminNotificationPayload;

export interface RealtimeUserEventDefinition {
  id: RealtimeUserEventId;
  /** UI label for the preferences panel. */
  label: string;
  /** Raw socket events this semantic event can be derived from. */
  sourceEvents: string[];
  /** Detects the semantic event inside a raw socket payload. */
  matches: (event: string, payload: RealtimeUserEventPayload) => boolean;
}

const isNewMessage = (payload: AdminNotificationPayload): boolean =>
  payload.type === 'message.received';

const isTicketClosed = (p: RealtimeDurableEventPayload): boolean =>
  p.eventType === 'ticket.closed' ||
  p.action === 'close' ||
  p.ticketPatch?.status === 'CLOSED' ||
  p.conversationPatch?.status === 'closed';

const isTicketTransferred = (p: RealtimeDurableEventPayload): boolean =>
  p.action === 'transfer' ||
  p.eventType === 'conversation.handover' ||
  p.socketEventName === 'conversation.handover';

export const REALTIME_USER_EVENT_CATALOG: Record<RealtimeUserEventId, RealtimeUserEventDefinition> =
  {
    [RealtimeUserEvent.NUEVO_MENSAJE]: {
      id: RealtimeUserEvent.NUEVO_MENSAJE,
      label: 'Nuevo mensaje',
      sourceEvents: [SocketEventName.AdminNotification],
      matches: (_event, payload) => isAdminNotificationPayload(payload) && isNewMessage(payload),
    },
    [RealtimeUserEvent.NUEVO_TICKET]: {
      id: RealtimeUserEvent.NUEVO_TICKET,
      label: 'Nuevo ticket',
      // New conversation cycle (first contact or re-contact after close): the
      // orchestrator emits a durable ticket.created event riding the
      // conversation.updated carrier. The provisional message.received
      // derivation is retired with the per-cycle ticket lifecycle.
      sourceEvents: [SocketEventName.ConversationUpdated],
      matches: (_event, payload) =>
        isDurableEventPayload(payload) && payload.eventType === 'ticket.created',
    },
    [RealtimeUserEvent.CIERRE_TICKET]: {
      id: RealtimeUserEvent.CIERRE_TICKET,
      label: 'Cierre de ticket',
      sourceEvents: [SocketEventName.ConversationUpdated, SocketEventName.ConversationHandover],
      matches: (_event, payload) => isDurableEventPayload(payload) && isTicketClosed(payload),
    },
    [RealtimeUserEvent.TRANSFERENCIA_TICKET]: {
      id: RealtimeUserEvent.TRANSFERENCIA_TICKET,
      label: 'Transferencia de ticket',
      sourceEvents: [SocketEventName.ConversationHandover, SocketEventName.ConversationUpdated],
      matches: (_event, payload) => isDurableEventPayload(payload) && isTicketTransferred(payload),
    },
  };

/**
 * Derives semantic user events from a raw socket event. Pure, total, and
 * exception-safe: a failing matcher must never break the realtime pipeline.
 */
export function deriveUserEvents(event: string, payload: unknown): RealtimeUserEventId[] {
  const ids: RealtimeUserEventId[] = [];
  for (const definition of Object.values(REALTIME_USER_EVENT_CATALOG)) {
    if (!definition.sourceEvents.includes(event)) continue;
    try {
      if (definition.matches(event, payload as RealtimeUserEventPayload)) {
        ids.push(definition.id);
      }
    } catch {
      // Swallow matcher errors — derivation is best-effort.
    }
  }
  return ids;
}

export const REALTIME_USER_EVENT_IDS = Object.keys(
  REALTIME_USER_EVENT_CATALOG,
) as RealtimeUserEventId[];
