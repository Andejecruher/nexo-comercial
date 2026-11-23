import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RealtimeApiSubscriber } from '../../../services/realtime/realtime-api-subscriber.service';
import {
  CriticalEventType,
  EphemeralEventType,
  RealtimeDurableEvent,
  RealtimeEphemeralEvent,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';
import { RealtimeMetrics } from '../../../services/realtime/realtime-observability.service';
import type { WebsocketGatewayService } from '../../../services/realtime/websocket-gateway.service';

function buildDurableEvent(eventId?: string): RealtimeDurableEvent {
  return {
    eventId: eventId ?? '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-subscriber',
    schemaVersion: 1,
    eventType: CriticalEventType.MessageCreated,
    socketEventName: SocketEventName.ConversationMessageNew,
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

describe('RealtimeApiSubscriber', () => {
  const emitRealtimeEventMock = jest.fn();
  const incrementCounterMock = jest.fn();

  function createGateway(): WebsocketGatewayService {
    return {
      emitRealtimeEvent: emitRealtimeEventMock,
    } as unknown as WebsocketGatewayService;
  }

  function createMetrics(): RealtimeMetrics {
    return {
      incrementCounter: incrementCounterMock,
      setGauge: jest.fn(),
      observeHistogram: jest.fn(),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emite eventos durable válidos por el gateway y deduplica dentro de la ventana', async () => {
    const subscriber = new RealtimeApiSubscriber(createGateway(), true, createMetrics());

    const event = buildDurableEvent();
    await subscriber.handleEvent(event as never);
    await subscriber.handleEvent(event as never);

    expect(emitRealtimeEventMock).toHaveBeenCalledTimes(1);
    expect(emitRealtimeEventMock).toHaveBeenCalledWith(event);
    expect(incrementCounterMock).toHaveBeenCalledWith('subscriber_received', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'received',
    });
    expect(incrementCounterMock).toHaveBeenCalledWith('subscriber_emitted', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'emitted',
    });
    expect(incrementCounterMock).toHaveBeenCalledWith('subscriber_deduped', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'deduped',
    });
  });

  it('no deduplica eventos durable con distintos ids', async () => {
    const subscriber = new RealtimeApiSubscriber(createGateway(), true, createMetrics());

    await subscriber.handleEvent(buildDurableEvent('event-1') as never);
    await subscriber.handleEvent(buildDurableEvent('event-2') as never);

    expect(emitRealtimeEventMock).toHaveBeenCalledTimes(2);
  });

  it('emite eventos ephemeral sin deduplicación', async () => {
    const subscriber = new RealtimeApiSubscriber(createGateway(), true, createMetrics());

    const event = buildEphemeralEvent();
    await subscriber.handleEvent(event as never);
    await subscriber.handleEvent(event as never);

    expect(emitRealtimeEventMock).toHaveBeenCalledTimes(2);
    expect(emitRealtimeEventMock).toHaveBeenCalledWith(event);
    expect(incrementCounterMock.mock.calls.some((call) => call[0] === 'subscriber_deduped')).toBe(
      false,
    );
  });

  it('descarta payloads inválidos y no emite', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {
      // silenced in tests
    });
    const subscriber = new RealtimeApiSubscriber(createGateway(), true, createMetrics());

    await subscriber.handleEvent({ notAnEvent: true } as never);

    expect(emitRealtimeEventMock).not.toHaveBeenCalled();
    expect(incrementCounterMock).toHaveBeenCalledWith('subscriber_discarded', {
      status: 'dropped_invalid_payload',
    });
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('no hace nada cuando está deshabilitado', async () => {
    const subscriber = new RealtimeApiSubscriber(createGateway(), false, createMetrics());

    await subscriber.handleEvent(buildDurableEvent() as never);

    expect(emitRealtimeEventMock).not.toHaveBeenCalled();
  });

  it('reintenta proyección fallida sin confirmar ni deduplicar una entrega incompleta', async () => {
    const projectMock = jest
      .fn<(event: RealtimeDurableEvent) => Promise<void>>()
      .mockRejectedValue(new Error('db down'));
    const subscriber = new RealtimeApiSubscriber(createGateway(), true, createMetrics(), {
      project: projectMock,
    });

    const event = buildDurableEvent();
    await expect(subscriber.handleEvent(event as never)).rejects.toThrow('db down');
    expect(emitRealtimeEventMock).not.toHaveBeenCalled();
    projectMock.mockResolvedValue(undefined);
    await subscriber.handleEvent(event as never);

    expect(projectMock).toHaveBeenCalledTimes(2);
    expect(projectMock).toHaveBeenCalledWith(event);
    expect(emitRealtimeEventMock).toHaveBeenCalledTimes(1);
  });

  it('no proyecta en entregas duplicadas (dedupe absorbe el redelivery)', async () => {
    const projectMock = jest
      .fn<(event: RealtimeDurableEvent) => Promise<void>>()
      .mockResolvedValue(undefined);
    const subscriber = new RealtimeApiSubscriber(createGateway(), true, createMetrics(), {
      project: projectMock,
    });

    const event = buildDurableEvent();
    await subscriber.handleEvent(event as never);
    await subscriber.handleEvent(event as never);

    expect(projectMock).toHaveBeenCalledTimes(1);
    expect(emitRealtimeEventMock).toHaveBeenCalledTimes(1);
  });

  it('start y dispose son seguros (push model)', async () => {
    const subscriber = new RealtimeApiSubscriber(createGateway(), true, createMetrics());

    await expect(subscriber.start()).resolves.toBeUndefined();
    await expect(subscriber.dispose()).resolves.toBeUndefined();
  });
});
