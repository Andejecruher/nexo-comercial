import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RealtimeOutboxStatus } from '@prisma/client';
import { QUEUE_CONFIG } from '../../../config/messaging.constants';
import {
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from '../../../services/realtime/realtime-event.contracts';
import {
  RealtimeOutboxPrismaClient,
  RealtimeOutboxRelay,
} from '../../../services/realtime/realtime-outbox-relay.service';
import { RealtimeMetrics } from '../../../services/realtime/realtime-observability.service';
import type { RealtimeTransport } from '../../../services/realtime/realtime-transport.contracts';

function buildDurableEvent(eventId?: string): RealtimeDurableEvent {
  return {
    eventId: eventId ?? '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-relay',
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

type ClaimedRow = {
  id: string;
  payload: Record<string, unknown>;
  attempts: number;
};

type UpdateManyArgs = {
  where: { id: { in: string[] } };
  data: Record<string, unknown>;
};

describe('RealtimeOutboxRelay', () => {
  const queryRawMock = jest.fn(async (_query: unknown): Promise<Record<string, unknown>[]> => []);
  const updateManyMock = jest.fn(
    async (_args: UpdateManyArgs): Promise<{ count: number }> => ({ count: 1 }),
  );
  const publishMock = jest.fn(async (_event: unknown): Promise<void> => {
    // no-op
  });
  const incrementCounterMock = jest.fn();
  const setGaugeMock = jest.fn();
  const observeHistogramMock = jest.fn();

  function createPrisma() {
    return {
      $queryRaw: queryRawMock,
      realtimeOutboxEvent: {
        updateMany: updateManyMock,
      },
    } as unknown as RealtimeOutboxPrismaClient;
  }

  function createTransport(): RealtimeTransport {
    return {
      publish: publishMock,
      dispose: jest.fn(),
    } as unknown as RealtimeTransport;
  }

  function getUpdateArgs(index = 0): UpdateManyArgs {
    return (updateManyMock.mock.calls[index] as [UpdateManyArgs])[0];
  }

  beforeEach(() => {
    queryRawMock.mockReset();
    queryRawMock.mockResolvedValue([]);
    updateManyMock.mockReset();
    updateManyMock.mockResolvedValue({ count: 1 });
    publishMock.mockReset();
    publishMock.mockResolvedValue(undefined);
    incrementCounterMock.mockReset();
    setGaugeMock.mockReset();
    observeHistogramMock.mockReset();
  });

  function createMetrics(): RealtimeMetrics {
    return {
      incrementCounter: incrementCounterMock,
      setGauge: setGaugeMock,
      observeHistogram: observeHistogramMock,
    };
  }

  it('claims pending events, publishes them, and marks them published', async () => {
    const event = buildDurableEvent();
    const row: ClaimedRow = {
      id: event.eventId,
      payload: event as unknown as Record<string, unknown>,
      attempts: 0,
    };
    queryRawMock.mockResolvedValueOnce([row]);

    const relay = new RealtimeOutboxRelay(createPrisma(), createTransport(), {
      instanceId: 'relay-test-1',
      metrics: createMetrics(),
    });
    await relay.runCycle();

    expect(queryRawMock).toHaveBeenCalledTimes(2);
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(event);
    expect(updateManyMock).toHaveBeenCalledTimes(1);
    const updateArgs = getUpdateArgs(0);
    expect(updateArgs.where.id.in).toEqual([event.eventId]);
    expect(updateArgs.data.status).toBe(RealtimeOutboxStatus.published);
    expect(updateArgs.data.publishedAt).toBeInstanceOf(Date);
    expect(updateArgs.data.nextRetryAt).toBeNull();
    expect(updateArgs.data.lockedAt).toBeNull();
    expect(updateArgs.data.lockedBy).toBeNull();
    expect(updateArgs.data.lastError).toBeNull();
    expect(incrementCounterMock).toHaveBeenCalledWith('relay_published', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'published',
    });
    expect(observeHistogramMock).toHaveBeenCalledWith(
      'relay_latency_ms',
      expect.any(Number),
      expect.objectContaining({ status: 'published' }),
    );
  });

  it('increments attempts and schedules nextRetryAt on publish failure', async () => {
    const event = buildDurableEvent();
    const row: ClaimedRow = {
      id: event.eventId,
      payload: event as unknown as Record<string, unknown>,
      attempts: 0,
    };
    queryRawMock.mockResolvedValueOnce([row]);
    publishMock.mockRejectedValueOnce(new Error('Redis unavailable'));

    const relay = new RealtimeOutboxRelay(createPrisma(), createTransport(), {
      instanceId: 'relay-test-1',
      metrics: createMetrics(),
    });
    await relay.runCycle();

    expect(updateManyMock).toHaveBeenCalledTimes(1);
    const updateArgs = getUpdateArgs(0);
    expect(updateArgs.where.id.in).toEqual([event.eventId]);
    expect(updateArgs.data.status).toBe(RealtimeOutboxStatus.failed);
    expect(updateArgs.data.attempts).toBe(1);
    expect(updateArgs.data.nextRetryAt).toBeInstanceOf(Date);
    expect(updateArgs.data.lastError).toBe('Redis unavailable');
    expect(incrementCounterMock).toHaveBeenCalledWith('relay_failed', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'failed',
      attempts: '1',
    });
  });

  it('marks event dead-lettered after max retries are exceeded', async () => {
    const event = buildDurableEvent();
    const row: ClaimedRow = {
      id: event.eventId,
      payload: event as unknown as Record<string, unknown>,
      attempts: QUEUE_CONFIG.MAX_RETRIES,
    };
    queryRawMock.mockResolvedValueOnce([row]);
    publishMock.mockRejectedValueOnce(new Error('Redis unavailable'));

    const relay = new RealtimeOutboxRelay(createPrisma(), createTransport(), {
      instanceId: 'relay-test-1',
      metrics: createMetrics(),
    });
    await relay.runCycle();

    expect(updateManyMock).toHaveBeenCalledTimes(1);
    const updateArgs = getUpdateArgs(0);
    expect(updateArgs.data.status).toBe(RealtimeOutboxStatus.dead_lettered);
    expect(updateArgs.data.attempts).toBe(QUEUE_CONFIG.MAX_RETRIES + 1);
    expect(updateArgs.data.nextRetryAt).toBeNull();
    expect(updateArgs.data.lastError).toBe('Redis unavailable');
    expect(incrementCounterMock).toHaveBeenCalledWith('relay_dead_lettered', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      status: 'dead_lettered',
      attempts: String(QUEUE_CONFIG.MAX_RETRIES + 1),
    });
  });

  it('dead-letters an invalid persisted payload without scheduling another retry', async () => {
    queryRawMock.mockResolvedValueOnce([
      {
        id: '550e8400-e29b-41d4-a716-446655440030',
        payload: { invalid: true },
        attempts: 2,
      },
    ]);
    const relay = new RealtimeOutboxRelay(createPrisma(), createTransport(), {
      metrics: createMetrics(),
    });

    await relay.runCycle();

    const updateArgs = getUpdateArgs(0);
    expect(updateArgs.data).toMatchObject({
      status: RealtimeOutboxStatus.dead_lettered,
      attempts: { increment: 1 },
      nextRetryAt: null,
      lastError: 'Invalid durable realtime payload schema',
      lockedAt: null,
      lockedBy: null,
    });
    expect(publishMock).not.toHaveBeenCalled();
    expect(incrementCounterMock).toHaveBeenCalledWith('relay_dead_lettered', {
      status: 'invalid_payload',
      attempts: '3',
    });
  });

  it('uses retry delays from QUEUE_CONFIG bounded by the last delay', async () => {
    const event = buildDurableEvent();
    const row: ClaimedRow = {
      id: event.eventId,
      payload: event as unknown as Record<string, unknown>,
      attempts: QUEUE_CONFIG.MAX_RETRIES - 1,
    };
    queryRawMock.mockResolvedValueOnce([row]);
    publishMock.mockRejectedValueOnce(new Error('Redis unavailable'));

    const relay = new RealtimeOutboxRelay(createPrisma(), createTransport(), {
      instanceId: 'relay-test-1',
    });
    await relay.runCycle();

    const updateArgs = getUpdateArgs(0);
    const expectedDelayMs = QUEUE_CONFIG.RETRY_DELAYS_SECONDS[QUEUE_CONFIG.MAX_RETRIES - 1] * 1000;
    const actualDelayMs = (updateArgs.data.nextRetryAt as Date).getTime() - Date.now();
    expect(actualDelayMs).toBeGreaterThanOrEqual(expectedDelayMs - 50);
    expect(actualDelayMs).toBeLessThanOrEqual(expectedDelayMs + 50);
  });

  it('does nothing when no eligible events are found', async () => {
    queryRawMock.mockResolvedValueOnce([]);

    const relay = new RealtimeOutboxRelay(createPrisma(), createTransport(), {
      instanceId: 'relay-test-1',
    });
    await relay.runCycle();

    expect(publishMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('processes multiple claimed events independently', async () => {
    const eventA = buildDurableEvent('550e8400-e29b-41d4-a716-446655440010');
    const eventB = buildDurableEvent('550e8400-e29b-41d4-a716-446655440020');
    queryRawMock.mockResolvedValueOnce([
      { id: eventA.eventId, payload: eventA as unknown as Record<string, unknown>, attempts: 0 },
      { id: eventB.eventId, payload: eventB as unknown as Record<string, unknown>, attempts: 0 },
    ]);
    publishMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));

    const relay = new RealtimeOutboxRelay(createPrisma(), createTransport(), {
      instanceId: 'relay-test-1',
    });
    await relay.runCycle();

    expect(publishMock).toHaveBeenCalledTimes(2);
    expect(updateManyMock).toHaveBeenCalledTimes(2);
    const statuses = updateManyMock.mock.calls.map((call) => {
      const args = (call as [UpdateManyArgs])[0];
      return args.data.status;
    });
    expect(statuses).toContain(RealtimeOutboxStatus.published);
    expect(statuses).toContain(RealtimeOutboxStatus.failed);
  });

  it('updates backlog gauges after each cycle', async () => {
    queryRawMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pendingCount: 7, oldestPendingAgeSeconds: 42 }]);

    const relay = new RealtimeOutboxRelay(createPrisma(), createTransport(), {
      instanceId: 'relay-test-1',
      metrics: createMetrics(),
    });
    await relay.runCycle();

    expect(setGaugeMock).toHaveBeenCalledWith('outbox_pending_count', 7, {
      status: 'pending_or_failed',
    });
    expect(setGaugeMock).toHaveBeenCalledWith('outbox_oldest_pending_age_seconds', 42, {
      status: 'pending_or_failed',
    });
  });
});
