import { describe, expect, it, jest } from '@jest/globals';
import {
  NotificationProjector,
  ProjectedNotification,
  deriveNotification,
} from '../../../services/notifications/notification-projector.service';
import {
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';

function buildDurableEvent(overrides: Partial<RealtimeDurableEvent>): RealtimeDurableEvent {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-projector',
    schemaVersion: 1,
    eventType: CriticalEventType.MessageCreated,
    socketEventName: SocketEventName.ConversationMessageNew,
    occurredAt: '2026-10-09T19:00:00.000Z',
    source: 'message.service',
    conversationId: '550e8400-e29b-41d4-a716-446655440001',
    ...overrides,
  };
}

function buildMessageInboundEvent(): RealtimeDurableEvent {
  return buildDurableEvent({
    messagePatch: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      body: 'Hola',
      direction: 'inbound',
      createdAt: '2026-10-09T18:59:59.000Z',
    },
    notificationPatch: {
      type: 'message.received',
      contactName: 'Juana',
      phone: '+5215500000000',
      messagePreview: 'Hola',
      channel: 'whatsapp',
      priority: 'HIGH',
      departmentSlug: 'soporte',
      assignedUserId: '550e8400-e29b-41d4-a716-446655440003',
    },
  });
}

describe('deriveNotification', () => {
  it('deriva message.received desde mensaje inbound', () => {
    const event = buildMessageInboundEvent();
    const notification = deriveNotification(event);

    expect(notification).not.toBeNull();
    expect(notification?.type).toBe('message.received');
    expect(notification?.eventId).toBe(event.eventId);
    expect(notification?.conversationId).toBe(event.conversationId);
    expect(notification?.occurredAt).toEqual(new Date(event.occurredAt));
    expect(notification?.contactName).toBe('Juana');
    expect(notification?.phone).toBe('+5215500000000');
    expect(notification?.departmentSlug).toBe('soporte');
  });

  it('no deriva nada desde mensaje outbound', () => {
    const event = buildDurableEvent({
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId: '550e8400-e29b-41d4-a716-446655440001',
        body: 'Respuesta',
        direction: 'outbound',
        createdAt: '2026-10-09T18:59:59.000Z',
      },
    });

    expect(deriveNotification(event)).toBeNull();
  });

  it('no deriva nada desde eventos que no generan admin.notification', () => {
    const event = buildDurableEvent({
      socketEventName: SocketEventName.ConversationUpdated,
    });

    expect(deriveNotification(event)).toBeNull();
  });

  it('deriva conversation.handover con fallback de departamento y usuario asignado', () => {
    const event = buildDurableEvent({
      eventType: CriticalEventType.ConversationHandover,
      socketEventName: SocketEventName.ConversationHandover,
      notificationPatch: {
        type: 'conversation.handover',
        contactName: 'Juana',
      },
      conversationPatch: {
        id: '550e8400-e29b-41d4-a716-446655440001',
        assignedDept: 'ventas',
        assignedUserId: null,
      },
      inboxPatch: {
        assignedUserId: null,
      },
    });

    const notification = deriveNotification(event);

    expect(notification?.type).toBe('conversation.handover');
    expect(notification?.departmentSlug).toBe('ventas');
    expect(notification?.assignedUserId).toBeUndefined();
  });
});

describe('NotificationProjector', () => {
  it('persiste con skipDuplicates (idempotente ante redelivery)', async () => {
    const createMany = jest
      .fn<(...args: unknown[]) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 });
    const projector = new NotificationProjector({ notification: { createMany } } as never);
    const event = buildMessageInboundEvent();

    await projector.project(event);

    expect(createMany).toHaveBeenCalledTimes(1);
    const call = createMany.mock.calls[0][0] as {
      data: ProjectedNotification[];
      skipDuplicates: boolean;
    };
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0].eventId).toBe(event.eventId);
    expect(call.data[0].type).toBe('message.received');
  });

  it('no toca la DB para eventos que no derivan notificación', async () => {
    const createMany = jest.fn();
    const projector = new NotificationProjector({ notification: { createMany } } as never);

    await projector.project(
      buildDurableEvent({ socketEventName: SocketEventName.ConversationUpdated }),
    );

    expect(createMany).not.toHaveBeenCalled();
  });
});
