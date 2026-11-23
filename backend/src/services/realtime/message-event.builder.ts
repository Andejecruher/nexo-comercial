import { presentationMeta } from '../message-content';
import { Message, MessageDirection } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ConversationFlowState } from '../../types/whatsapp.types';
import { buildInboxMessagePreview } from './inbox-preview.util';
import {
  ConversationRealtimeAction,
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from './realtime-event.contracts';

export function buildTicketCreatedEvent(
  conversationId: string,
  correlationId: string,
  occurredAt: string,
  context: {
    contactName?: string;
    phone?: string;
    flowState?: ConversationFlowState;
    channel?: string;
    departmentSlug?: string;
    /** UUID interno de la línea receptora (communication_lines.id). */
    communicationLineId?: string;
  },
  ticketInfo?: {
    id?: string;
    status?: string;
    priority?: string;
    assignedUserId?: string | null;
    departmentSlug?: string | null;
    updatedAt?: string;
  },
): RealtimeDurableEvent {
  const ticketPatch =
    ticketInfo?.id && ticketInfo.status
      ? {
          id: ticketInfo.id,
          status: ticketInfo.status as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
          ...(ticketInfo.priority
            ? { priority: ticketInfo.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' }
            : {}),
          ...(ticketInfo.assignedUserId ? { assignedUserId: ticketInfo.assignedUserId } : {}),
          ...(ticketInfo.departmentSlug ? { departmentSlug: ticketInfo.departmentSlug } : {}),
          updatedAt: ticketInfo.updatedAt ?? occurredAt,
        }
      : undefined;

  return {
    eventId: randomUUID(),
    correlationId,
    schemaVersion: 1,
    eventType: CriticalEventType.TicketCreated,
    socketEventName: SocketEventName.ConversationUpdated,
    occurredAt,
    source: 'message-orchestrator.service',
    conversationId,
    conversationPatch: {
      id: conversationId,
      status: 'open',
      flowState: context.flowState ?? 'BOT_FLOW',
      updatedAt: occurredAt,
    },
    ...(ticketPatch ? { ticketPatch } : {}),
    inboxPatch: {
      inboxStatus: 'active',
      status: 'open',
      flowState: context.flowState ?? 'BOT_FLOW',
    },
    notificationPatch: {
      type: 'ticket.created',
      conversationId,
      ...(ticketPatch ? { ticketId: ticketPatch.id } : {}),
      ...(context.contactName !== undefined ? { contactName: context.contactName } : {}),
      ...(context.phone !== undefined ? { phone: context.phone } : {}),
      ...(context.flowState !== undefined ? { flowState: context.flowState } : {}),
      ...(context.channel !== undefined ? { channel: context.channel } : {}),
      ...(context.departmentSlug !== undefined ? { departmentSlug: context.departmentSlug } : {}),
      ...(context.communicationLineId !== undefined
        ? { communicationLineId: context.communicationLineId }
        : {}),
    },
  };
}

function truncateMessagePreview(text: string, maxLength = 120): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export function buildMessageCreatedEvent(
  message: Message,
  conversationId: string,
  correlationId: string,
  occurredAt: string,
  context: {
    contactName?: string;
    phone?: string;
    flowState?: ConversationFlowState;
    channel?: string;
    departmentSlug?: string;
    assignedUserId?: string;
    /** UUID interno de la línea receptora (communication_lines.id). */
    communicationLineId?: string;
  } = {},
): RealtimeDurableEvent {
  const direction = message.direction === MessageDirection.inbound ? 'inbound' : 'outbound';
  const notificationPatch = {
    type: 'message.received',
    conversationId,
    ...(context.contactName !== undefined ? { contactName: context.contactName } : {}),
    ...(context.phone !== undefined ? { phone: context.phone } : {}),
    messagePreview: truncateMessagePreview(message.body),
    ...(context.flowState !== undefined ? { flowState: context.flowState } : {}),
    ...(context.channel !== undefined ? { channel: context.channel } : {}),
    ...(context.departmentSlug !== undefined ? { departmentSlug: context.departmentSlug } : {}),
    ...(context.assignedUserId !== undefined ? { assignedUserId: context.assignedUserId } : {}),
    ...(context.communicationLineId !== undefined
      ? { communicationLineId: context.communicationLineId }
      : {}),
  };

  return {
    eventId: message.id,
    correlationId,
    schemaVersion: 1,
    eventType: CriticalEventType.MessageCreated,
    socketEventName: SocketEventName.ConversationMessageNew,
    occurredAt,
    source: 'message-orchestrator.service',
    conversationId,
    action: ConversationRealtimeAction.Message,
    messagePatch: {
      id: message.id,
      conversationId,
      ...(message.ticketId ? { ticketId: message.ticketId } : {}),
      body: message.body,
      direction,
      messageType: message.messageType,
      meta: presentationMeta(message),
      externalMessageId: message.externalMessageId ?? undefined,
      createdAt: message.createdAt.toISOString(),
    },
    notificationPatch,
    inboxPatch: {
      lastMessagePreview: buildInboxMessagePreview(message.body, message.messageType),
      lastMessageAt: occurredAt,
      lastMessageDirection: direction,
      unreadDelta: 0,
      ...(context.flowState ? { flowState: context.flowState } : {}),
      ...(context.assignedUserId !== undefined ? { assignedUserId: context.assignedUserId } : {}),
      ...(context.departmentSlug !== undefined ? { assignedDept: context.departmentSlug } : {}),
      ...(context.contactName ? { citizenName: context.contactName } : {}),
      ...(context.phone ? { citizenPhone: context.phone } : {}),
    },
  };
}

/**
 * Evento durable para una MUTACIÓN de un mensaje ya existente (p. ej. una
 * reacción). Reutiliza el socket `conversation.message.new` porque el cliente
 * hace upsert por `id`: si el mensaje ya está en la lista se actualiza en sitio
 * y nunca se agrega una burbuja nueva.
 *
 * No lleva `notificationPatch` ni `inboxPatch`: reaccionar no debe alterar el
 * preview del inbox, el conteo de no leídos ni disparar notificaciones.
 */
export function buildMessageReactionEvent(
  message: Message,
  correlationId: string,
  occurredAt: string,
): RealtimeDurableEvent {
  const direction = message.direction === MessageDirection.inbound ? 'inbound' : 'outbound';
  return {
    eventId: randomUUID(),
    correlationId,
    schemaVersion: 1,
    eventType: CriticalEventType.MessageUpdated,
    socketEventName: SocketEventName.ConversationMessageNew,
    occurredAt,
    source: 'webhook.controller',
    conversationId: message.conversationId,
    action: ConversationRealtimeAction.Message,
    messagePatch: {
      id: message.id,
      conversationId: message.conversationId,
      ...(message.ticketId ? { ticketId: message.ticketId } : {}),
      body: message.body,
      direction,
      messageType: message.messageType,
      meta: presentationMeta(message),
      externalMessageId: message.externalMessageId ?? undefined,
      sendByUserId: message.sendByUserId ?? undefined,
      createdAt: message.createdAt.toISOString(),
    },
  };
}

export function buildConversationUpdatedEvent(
  conversationId: string,
  correlationId: string,
  occurredAt: string,
  flowState: ConversationFlowState,
  message: Message,
  context: {
    assignedUserId?: string;
    departmentSlug?: string;
    contactName?: string;
    phone?: string;
  } = {},
): RealtimeDurableEvent {
  const direction = message.direction === MessageDirection.inbound ? 'inbound' : 'outbound';
  return {
    eventId: randomUUID(),
    correlationId,
    schemaVersion: 1,
    eventType: CriticalEventType.ConversationUpdated,
    socketEventName: SocketEventName.ConversationUpdated,
    occurredAt,
    source: 'message-orchestrator.service',
    conversationId,
    action: ConversationRealtimeAction.Message,
    conversationPatch: {
      id: conversationId,
      flowState,
      updatedAt: occurredAt,
    },
    inboxPatch: {
      lastMessagePreview: buildInboxMessagePreview(message.body, message.messageType),
      lastMessageAt: occurredAt,
      lastMessageDirection: direction,
      unreadDelta: direction === 'inbound' ? 1 : 0,
      flowState,
      ...(context.assignedUserId !== undefined ? { assignedUserId: context.assignedUserId } : {}),
      ...(context.departmentSlug !== undefined ? { assignedDept: context.departmentSlug } : {}),
      ...(context.contactName ? { citizenName: context.contactName } : {}),
      ...(context.phone ? { citizenPhone: context.phone } : {}),
    },
  };
}
