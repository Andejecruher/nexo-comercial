import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Socket, Server as SocketIOServer } from 'socket.io';
import { eventBus } from '../../../services/events/event-bus.service';
import {
  CriticalEventType,
  EphemeralEventType,
  RealtimeDurableEvent,
  RealtimeEphemeralEvent,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';

jest.mock('../../../utils/token.util', () => ({
  verifyAccessToken: jest.fn(() => ({
    sub: '550e8400-e29b-41d4-a716-446655440010',
    email: 'admin@example.test',
    roles: ['admin'],
    type: 'access',
  })),
}));

import { WebsocketGatewayService } from '../../../services/realtime/websocket-gateway.service';

function buildDurableEvent(
  socketEventName: SocketEventName = SocketEventName.ConversationMessageNew,
): RealtimeDurableEvent {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-gateway',
    schemaVersion: 1,
    eventType: CriticalEventType.MessageCreated,
    socketEventName,
    occurredAt: new Date().toISOString(),
    source: 'message.service',
    conversationId: '550e8400-e29b-41d4-a716-446655440001',
    messagePatch: {
      id: '550e8400-e29b-41d4-a716-446655440002',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      body: 'Hello',
      direction: 'inbound',
      createdAt: new Date().toISOString(),
    },
  };
}

function buildEphemeralEvent(): RealtimeEphemeralEvent {
  return {
    eventType: EphemeralEventType.ConversationTyping,
    socketEventName: SocketEventName.ConversationTyping,
    payload: {
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      typing: true,
      ttlMs: 3000,
    },
  };
}

describe('WebsocketGatewayService emitRealtimeEvent', () => {
  const roomEmitMock = jest.fn();
  const namespaceEmitMock = jest.fn();
  const toMock = jest.fn(() => ({ emit: roomEmitMock }));
  const namespaceUseMock = jest.fn();
  const namespaceOnMock = jest.fn();

  function createIoMock(): SocketIOServer {
    const namespaceMock = {
      emit: namespaceEmitMock,
      to: toMock,
      use: namespaceUseMock,
      on: namespaceOnMock,
    };

    return {
      of: jest.fn(() => namespaceMock),
    } as unknown as SocketIOServer;
  }

  beforeEach(() => {
    roomEmitMock.mockClear();
    namespaceEmitMock.mockClear();
    toMock.mockClear();
    namespaceUseMock.mockClear();
    namespaceOnMock.mockClear();
  });

  it('emits conversation.message.new to the conversation room and admin.notification for inbound messages', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const event: RealtimeDurableEvent = {
      ...buildDurableEvent(SocketEventName.ConversationMessageNew),
      notificationPatch: {
        type: 'message.received',
        contactName: 'Ana García',
        phone: '+521999888777',
        messagePreview: 'Hola, necesito ayuda',
        flowState: 'HUMAN_FLOW',
        channel: 'whatsapp',
        departmentSlug: 'atencion-ciudadana',
      },
    };

    gateway.emitRealtimeEvent(event);

    expect(toMock).toHaveBeenCalledWith('conversation:550e8400-e29b-41d4-a716-446655440001');
    expect(roomEmitMock).toHaveBeenCalledTimes(1);
    expect(roomEmitMock).toHaveBeenCalledWith(SocketEventName.ConversationMessageNew, event);
    // admin.notification broadcast so the notification bell fires for all admins
    expect(namespaceEmitMock).toHaveBeenCalledTimes(1);
    expect(namespaceEmitMock).toHaveBeenCalledWith(SocketEventName.AdminNotification, {
      type: 'message.received',
      eventId: event.eventId,
      ticketId: undefined,
      conversationId: event.conversationId,
      occurredAt: event.occurredAt,
      contactName: 'Ana García',
      phone: '+521999888777',
      messagePreview: 'Hola, necesito ayuda',
      flowState: 'HUMAN_FLOW',
      channel: 'whatsapp',
      departmentSlug: 'atencion-ciudadana',
      priority: undefined,
      assignedUserId: undefined,
    });
  });

  it('emits admin.notification with minimal payload when notificationPatch is absent', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const event = buildDurableEvent(SocketEventName.ConversationMessageNew);

    gateway.emitRealtimeEvent(event);

    expect(namespaceEmitMock).toHaveBeenCalledTimes(1);
    const [, payload] = namespaceEmitMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.type).toBe('message.received');
    expect(payload.conversationId).toBe(event.conversationId);
    expect(payload.contactName).toBeUndefined();
    expect(payload.messagePreview).toBeUndefined();
  });

  it('forwards notificationPatch.communicationLineId into admin.notification', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const communicationLineId = '550e8400-e29b-41d4-a716-4466554400aa';
    const event: RealtimeDurableEvent = {
      ...buildDurableEvent(SocketEventName.ConversationMessageNew),
      notificationPatch: {
        type: 'message.received',
        communicationLineId,
      },
    };

    gateway.emitRealtimeEvent(event);

    const [, payload] = namespaceEmitMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.communicationLineId).toBe(communicationLineId);
  });

  it('does not emit admin.notification for outbound conversation.message.new events', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const event: RealtimeDurableEvent = {
      ...buildDurableEvent(SocketEventName.ConversationMessageNew),
      messagePatch: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        conversationId: '550e8400-e29b-41d4-a716-446655440001',
        body: 'Agent reply',
        direction: 'outbound',
        createdAt: new Date().toISOString(),
      },
    };

    gateway.emitRealtimeEvent(event);

    expect(roomEmitMock).toHaveBeenCalledTimes(1);
    expect(roomEmitMock).toHaveBeenCalledWith(SocketEventName.ConversationMessageNew, event);
    expect(namespaceEmitMock).not.toHaveBeenCalled();
  });

  it('emits conversation.updated to the admin namespace', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const event = buildDurableEvent(SocketEventName.ConversationUpdated);

    gateway.emitRealtimeEvent(event);

    expect(namespaceEmitMock).toHaveBeenCalledTimes(1);
    expect(namespaceEmitMock).toHaveBeenCalledWith(SocketEventName.ConversationUpdated, event);
    expect(toMock).not.toHaveBeenCalled();
  });

  it('emits conversation.handover to namespace and admin.notification', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const event = buildDurableEvent(SocketEventName.ConversationHandover);

    gateway.emitRealtimeEvent(event);

    expect(namespaceEmitMock).toHaveBeenCalledTimes(2);
    const calls = namespaceEmitMock.mock.calls as Array<[string, unknown]>;
    const eventNames = calls.map((call) => call[0]);
    expect(eventNames).toContain(SocketEventName.ConversationHandover);
    expect(eventNames).toContain(SocketEventName.AdminNotification);
  });

  it('emits admin.notification to the admin namespace', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const event = buildDurableEvent(SocketEventName.AdminNotification);

    gateway.emitRealtimeEvent(event);

    expect(namespaceEmitMock).toHaveBeenCalledTimes(1);
    expect(namespaceEmitMock).toHaveBeenCalledWith(SocketEventName.AdminNotification, event);
  });

  it('emits ephemeral typing events to the conversation room', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const event = buildEphemeralEvent();

    gateway.emitRealtimeEvent(event);

    expect(toMock).toHaveBeenCalledWith('conversation:550e8400-e29b-41d4-a716-446655440001');
    expect(roomEmitMock).toHaveBeenCalledTimes(1);
    expect(roomEmitMock).toHaveBeenCalledWith(SocketEventName.ConversationTyping, event.payload);
  });

  it('preserves existing EventBus listener behavior for message.created', () => {
    const io = createIoMock();
    const beforeCount = eventBus.listenerCount('message.created');
    const gateway = new WebsocketGatewayService(io, {
      legacyCriticalEventBusBridgeEnabled: true,
    });

    const connectionHandler = namespaceOnMock.mock.calls.find(
      (call) => call[0] === 'connection',
    )?.[1] as ((socket: Socket) => void) | undefined;
    expect(connectionHandler).toBeDefined();

    expect(eventBus.listenerCount('message.created')).toBe(beforeCount + 1);
    gateway.dispose();
  });

  it('routes legacy eventBus message.status.changed to the conversation room', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io, {
      legacyCriticalEventBusBridgeEnabled: true,
    });
    const event: RealtimeDurableEvent = {
      ...buildDurableEvent(SocketEventName.MessageStatusChanged),
      eventType: CriticalEventType.MessageStatusChanged,
      messageStatusPatch: {
        messageId: '550e8400-e29b-41d4-a716-446655440002',
        providerMessageId: 'wamid.HBgL123',
        status: 'delivered',
        timestamp: new Date().toISOString(),
      },
    };

    eventBus.emit('message.status.changed', event);

    expect(toMock).toHaveBeenCalledWith('conversation:550e8400-e29b-41d4-a716-446655440001');
    expect(roomEmitMock).toHaveBeenCalledWith(SocketEventName.MessageStatusChanged, event);
    gateway.dispose();
  });

  it('emits conversation.updated to the admin namespace and the assigned user room', () => {
    const io = createIoMock();
    const gateway = new WebsocketGatewayService(io);
    const event = {
      ...buildDurableEvent(SocketEventName.ConversationUpdated),
      inboxPatch: { assignedUserId: '550e8400-e29b-41d4-a716-446655440010' },
    };

    gateway.emitRealtimeEvent(event);

    expect(namespaceEmitMock).toHaveBeenCalledWith(SocketEventName.ConversationUpdated, event);
    expect(toMock).toHaveBeenCalledWith('user:550e8400-e29b-41d4-a716-446655440010');
  });

  it('denies unauthorized conversation.subscribe attempts', async () => {
    const io = createIoMock();
    const authorizeSubscribe = jest.fn(async () => false);
    const incrementCounter = jest.fn();
    const gateway = new WebsocketGatewayService(io, {
      authorizeSubscribe,
      metrics: {
        incrementCounter,
        setGauge: jest.fn(),
        observeHistogram: jest.fn(),
      },
    });
    const connectionHandler = namespaceOnMock.mock.calls.find(
      (call) => call[0] === 'connection',
    )?.[1] as ((socket: Socket) => void) | undefined;
    expect(connectionHandler).toBeDefined();

    const socketOn = jest.fn();
    const socketEmit = jest.fn();
    const socketJoin = jest.fn();
    connectionHandler!({
      data: {
        user: { userId: '550e8400-e29b-41d4-a716-446655440010', email: 'a@test', roles: [] },
      },
      join: socketJoin,
      on: socketOn,
      emit: socketEmit,
      disconnect: jest.fn(),
    } as unknown as Socket);

    const subscribeHandler = socketOn.mock.calls.find(
      (call) => call[0] === 'conversation.subscribe',
    )?.[1] as ((id: string) => Promise<void>) | undefined;
    await subscribeHandler?.('550e8400-e29b-41d4-a716-446655440001');

    expect(authorizeSubscribe).toHaveBeenCalled();
    expect(socketEmit).toHaveBeenCalledWith('conversation.subscribe.denied', {
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(socketJoin).not.toHaveBeenCalledWith(
      'conversation:550e8400-e29b-41d4-a716-446655440001',
    );
    expect(incrementCounter).toHaveBeenCalledWith('socket_subscribe_denied', { status: 'denied' });
    expect(incrementCounter).toHaveBeenCalledWith('gateway_discarded', {
      socketEventName: 'conversation.subscribe',
      status: 'denied',
    });
    gateway.dispose();
  });

  it('records emit latency and counters labeled by eventType and socketEventName', () => {
    const io = createIoMock();
    const incrementCounter = jest.fn();
    const observeHistogram = jest.fn();
    const gateway = new WebsocketGatewayService(io, {
      metrics: {
        incrementCounter,
        setGauge: jest.fn(),
        observeHistogram,
      },
    });
    const event = buildDurableEvent(SocketEventName.ConversationUpdated);

    gateway.emitRealtimeEvent(event);

    expect(incrementCounter).toHaveBeenCalledWith('gateway_emit', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'emitted',
    });
    expect(observeHistogram).toHaveBeenCalledWith('gateway_emit_latency_ms', expect.any(Number), {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
    });
    gateway.dispose();
  });
});
