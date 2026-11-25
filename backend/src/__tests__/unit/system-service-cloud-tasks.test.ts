import { describe, expect, it, jest } from '@jest/globals';
import { env } from '../../config/env.config';
import { SystemRepository } from '../../repositories/system.repository';
import { SystemService } from '../../services/system.service';
import { withEnvConfig } from '../helpers/with-env';

const now = new Date('2026-08-19T12:00:00.000Z');

function createDispatcher() {
  return {
    dispatchExportJob: jest.fn(async () => undefined),
    dispatchInboxEvent: jest.fn(async () => undefined),
    dispatchBatchEvent: jest.fn(async () => undefined),
    dispatchOutboxEvent: jest.fn(async () => undefined),
    dispatchRealtimeEvent: jest.fn(async () => undefined),
  };
}

describe('SystemService Cloud Tasks retries', () => {
  it('dispatches a fresh task after resetting a failed outbox event', async () => {
    const outboxEvent = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      conversationId: null,
      phone: '5215550000000',
      payload: { type: 'text', text: { body: 'hello' } },
      status: 'failed',
      retryCount: 2,
      nextRetryAt: now,
      lastError: 'failed',
      wamid: null,
      idempotencyKey: 'outbox-key',
      createdAt: now,
      sentAt: null,
    };
    const prisma = {
      outboxEvent: {
        findUnique: jest.fn(async () => outboxEvent),
        update: jest.fn(async () => ({
          ...outboxEvent,
          status: 'pending',
          retryCount: 0,
          nextRetryAt: null,
          lastError: null,
        })),
      },
    };
    const dispatcher = createDispatcher();
    const service = new SystemService(new SystemRepository(prisma as never), dispatcher);

    await service.retryOutboxEvent(outboxEvent.id);

    expect(dispatcher.dispatchOutboxEvent).toHaveBeenCalledWith(outboxEvent.id);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'pending', lockedAt: null, lockedBy: null }),
      }),
    );
  });

  it('dispatches a fresh task after resetting a dead-lettered inbox event', async () => {
    const inboxEvent = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      wamid: 'wamid-1',
      phone: '5215550000000',
      payload: { wamid: 'wamid-1' },
      status: 'dead_lettered',
      retryCount: 5,
      lastError: 'failed',
      lastErrorAt: now,
      idempotencyKey: 'wamid-1',
      createdAt: now,
      processedAt: null,
    };
    const prisma = {
      inboxEvent: {
        findUnique: jest.fn(async () => inboxEvent),
        update: jest.fn(async () => ({
          ...inboxEvent,
          status: 'pending',
          retryCount: 0,
          lastError: null,
          lastErrorAt: null,
        })),
      },
    };
    const dispatcher = createDispatcher();
    const service = new SystemService(new SystemRepository(prisma as never), dispatcher);

    // Sin batching, reprocessInboxEvent debe despachar vía dispatchInboxEvent (no dispatchBatchEvent).
    const restore = withEnvConfig(env, { BATCHING_WINDOW_MS: 0 });
    try {
      await service.reprocessInboxEvent(inboxEvent.id);

      expect(dispatcher.dispatchInboxEvent).toHaveBeenCalledWith(inboxEvent.id);
      expect(prisma.inboxEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'pending', lockedAt: null, lockedBy: null }),
        }),
      );
    } finally {
      restore();
    }
  });

  it('redirects manual reprocess to batch dispatch when batching is enabled', async () => {
    jest.resetModules();
    jest.doMock('../../config/env.config', () => ({
      env: { BATCHING_WINDOW_MS: 2500, BATCHING_MAX_WAIT_MS: 5000 },
    }));
    const { SystemService: Service } = await import('../../services/system.service');
    const inboxEvent = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      wamid: 'wamid-2',
      phone: '5215550000001',
      payload: { wamid: 'wamid-2', phone: '5215550000001' },
      status: 'failed',
      retryCount: 2,
      lastError: 'failed',
      lastErrorAt: now,
      idempotencyKey: 'wamid-2',
      createdAt: now,
      processedAt: null,
    };
    const prisma = {
      inboxEvent: {
        findUnique: jest.fn(async () => inboxEvent),
        update: jest.fn(async () => ({
          ...inboxEvent,
          status: 'pending',
          retryCount: 0,
          lastError: null,
          lastErrorAt: null,
        })),
      },
    };
    const dispatcher = createDispatcher();
    const service = new Service(prisma as never, dispatcher);

    await service.reprocessInboxEvent(inboxEvent.id);

    expect(dispatcher.dispatchBatchEvent).toHaveBeenCalledWith(
      '5215550000001',
      expect.any(Number),
      expect.objectContaining({ seconds: expect.any(Number), nanos: expect.any(Number) }),
    );
    expect(dispatcher.dispatchInboxEvent).not.toHaveBeenCalled();
  });
});
