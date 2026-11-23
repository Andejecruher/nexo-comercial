import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RealtimeOutboxStatus } from '@prisma/client';
import {
  CriticalEventType,
  EphemeralEventType,
  RealtimeDurableEvent,
  RealtimeEphemeralEvent,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';
import { RealtimeNotifier } from '../../../services/realtime/realtime-notifier.service';
import { RealtimeMetrics } from '../../../services/realtime/realtime-observability.service';
import type { RealtimeTransport } from '../../../services/realtime/realtime-transport.contracts';

function buildDurableEvent(): RealtimeDurableEvent {
  return {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-notifier',
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

describe('RealtimeNotifier', () => {
  const publishMock = jest.fn(async () => {
    // no-op
  });

  const createMock = jest.fn(async (args: { data: Record<string, unknown> }) => ({
    id: args.data.id as string,
  }));
  const incrementCounterMock = jest.fn();

  function createTransport(): RealtimeTransport {
    return {
      publish: publishMock,
      dispose: jest.fn(),
    } as unknown as RealtimeTransport;
  }

  function createTx(): { realtimeOutboxEvent: { create: typeof createMock } } {
    return {
      realtimeOutboxEvent: {
        create: createMock,
      },
    };
  }

  beforeEach(() => {
    publishMock.mockClear();
    createMock.mockClear();
    incrementCounterMock.mockClear();
  });

  it('writes a critical event to the outbox inside the transaction with status pending', async () => {
    const transport = createTransport();
    const metrics: RealtimeMetrics = {
      incrementCounter: incrementCounterMock,
      setGauge: jest.fn(),
      observeHistogram: jest.fn(),
    };
    const notifier = new RealtimeNotifier(transport, true, { metrics });
    const tx = createTx();
    const event = buildDurableEvent();

    await notifier.notifyCritical(
      tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
      event,
    );

    expect(createMock).toHaveBeenCalledTimes(1);
    const data = createMock.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.id).toBe(event.eventId);
    expect(data.eventType).toBe(event.eventType);
    expect(data.socketEventName).toBe(event.socketEventName);
    expect(data.status).toBe(RealtimeOutboxStatus.pending);
    expect(data.attempts).toBe(0);
    expect(data.payload).toEqual(event);
    expect(publishMock).not.toHaveBeenCalled();
    expect(incrementCounterMock).toHaveBeenCalledWith('outbox_written', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      source: event.source,
      status: 'pending',
    });
  });

  it('does not schedule realtime delivery before the surrounding transaction commits', async () => {
    const setImmediateSpy = jest.spyOn(global, 'setImmediate');
    const notifier = new RealtimeNotifier(createTransport(), true);

    try {
      await notifier.notifyCritical(
        createTx() as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        buildDurableEvent(),
      );
      expect(setImmediateSpy).not.toHaveBeenCalled();
    } finally {
      setImmediateSpy.mockRestore();
    }
  });

  it('throws when notifyCritical is called without a transaction client', async () => {
    const transport = createTransport();
    const notifier = new RealtimeNotifier(transport, true);
    const event = buildDurableEvent();

    await expect(
      notifier.notifyCritical(
        undefined as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        event,
      ),
    ).rejects.toThrow('RealtimeNotifier.notifyCritical requires a transaction client');
  });

  it('skips the outbox write when the durable flag is disabled', async () => {
    const transport = createTransport();
    const notifier = new RealtimeNotifier(transport, false);
    const tx = createTx();
    const event = buildDurableEvent();

    await notifier.notifyCritical(
      tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
      event,
    );

    expect(createMock).not.toHaveBeenCalled();
  });

  it('does not publish ephemeral events through the outbox', async () => {
    const transport = createTransport();
    const notifier = new RealtimeNotifier(transport, true);
    const tx = createTx();
    const event = buildEphemeralEvent();

    await notifier.notifyEphemeral(event);

    expect(createMock).not.toHaveBeenCalled();
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(event);
  });

  it('skips ephemeral publish when transport is not configured', async () => {
    const notifier = new RealtimeNotifier(undefined, true);
    const event = buildEphemeralEvent();

    await notifier.notifyEphemeral(event);

    expect(publishMock).not.toHaveBeenCalled();
  });

  it('rolls back the outbox write when the transaction aborts', async () => {
    const transport = createTransport();
    const notifier = new RealtimeNotifier(transport, true);
    const failingCreate = jest.fn(async () => {
      throw new Error('DB deadlock');
    });
    const tx = {
      realtimeOutboxEvent: {
        create: failingCreate,
      },
    };
    const event = buildDurableEvent();

    await expect(
      notifier.notifyCritical(
        tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        event,
      ),
    ).rejects.toThrow('DB deadlock');
    expect(failingCreate).toHaveBeenCalledTimes(1);
    expect(publishMock).not.toHaveBeenCalled();
  });
});
