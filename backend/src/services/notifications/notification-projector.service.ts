import type { PrismaService } from '../prisma.service';
import { RealtimeDurableEvent, SocketEventName } from '../realtime/realtime-event.contracts';

export type NotificationPrismaClient = Pick<PrismaService, 'notification'>;

export interface ProjectedNotification {
  communicationLineId?: string;
  eventId: string;
  ticketId?: string;
  type: string;
  conversationId: string;
  occurredAt: Date;
  contactName?: string;
  phone?: string;
  messagePreview?: string;
  flowState?: string;
  channel?: string;
  priority?: string;
  departmentSlug?: string;
  assignedUserId?: string;
}

/**
 * Derives the notification-center entry a durable event would produce.
 * Mirrors the `emitAdminNotification` calls inside
 * `WebsocketGatewayService.emitDurableEvent` so the persisted projection
 * matches exactly what connected clients see live.
 */
export function deriveNotification(event: RealtimeDurableEvent): ProjectedNotification | null {
  const base = {
    ...(event.communicationLineId ? { communicationLineId: event.communicationLineId } : {}),
    eventId: event.eventId,
    ticketId: event.notificationPatch?.ticketId ?? event.ticketPatch?.id,
    conversationId: event.conversationId,
    occurredAt: new Date(event.occurredAt),
  };

  if (
    event.socketEventName === SocketEventName.ConversationMessageNew &&
    event.messagePatch?.direction === 'inbound'
  ) {
    return {
      ...base,
      type: 'message.received',
      contactName: event.notificationPatch?.contactName,
      phone: event.notificationPatch?.phone,
      messagePreview: event.notificationPatch?.messagePreview,
      flowState: event.notificationPatch?.flowState,
      channel: event.notificationPatch?.channel,
      priority: event.notificationPatch?.priority,
      departmentSlug: event.notificationPatch?.departmentSlug,
      assignedUserId: event.notificationPatch?.assignedUserId,
    };
  }

  if (event.socketEventName === SocketEventName.ConversationHandover) {
    return {
      ...base,
      type: 'conversation.handover',
      contactName: event.notificationPatch?.contactName,
      phone: event.notificationPatch?.phone,
      departmentSlug:
        event.notificationPatch?.departmentSlug ??
        event.conversationPatch?.assignedDept ??
        undefined,
      assignedUserId:
        event.inboxPatch?.assignedUserId ??
        event.conversationPatch?.assignedUserId ??
        event.notificationPatch?.assignedUserId ??
        undefined,
    };
  }

  if (
    ['ticket.created', 'ticket.closed', 'ticket.reopened', 'ticket.assigned'].includes(
      event.eventType,
    )
  ) {
    return {
      ...base,
      type: event.eventType,
      contactName: event.notificationPatch?.contactName,
      phone: event.notificationPatch?.phone,
      departmentSlug: event.notificationPatch?.departmentSlug,
      assignedUserId: event.notificationPatch?.assignedUserId,
    };
  }
  return null;
}

/**
 * Persists notification-center entries derived from durable realtime events.
 * `createMany({ skipDuplicates: true })` keyed by the unique `event_id` makes
 * the projection idempotent under Pub/Sub redelivery — the same at-least-once
 * contract the realtime delivery itself relies on.
 */
export class NotificationProjector {
  constructor(private readonly prisma: NotificationPrismaClient) {}

  async project(event: RealtimeDurableEvent): Promise<void> {
    const notification = deriveNotification(event);
    if (!notification) return;

    await this.prisma.notification.createMany({
      data: [notification],
      skipDuplicates: true,
    });
  }
}
