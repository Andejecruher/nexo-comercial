import { describe, expect, it, jest } from '@jest/globals';
import type { InboxProcessorService } from '../../services/events/inbox-processor.service';
import type { BackgroundTaskDispatcher } from '../../services/tasks/cloud-tasks-dispatcher.service';

const BATCHING_WINDOW_MS = 2500;
const BATCHING_MAX_WAIT_MS = 5000;

function makePrisma(queries: Record<string, unknown[]> = {}) {
  const queryRaw = jest.fn(async (query: { strings: TemplateStringsArray; values: unknown[] }) => {
    const key = (query.strings ?? (query as unknown as TemplateStringsArray)).join('?');
    if (key.includes('clock_timestamp() AS now')) return [{ now: new Date() }];
    for (const [pattern, rows] of Object.entries(queries)) {
      if (key.includes(pattern)) return rows;
    }
    return [];
  });
  const findUnique = jest.fn(async () => null);
  const updateMany = jest.fn(async () => ({ count: 0 }));
  // El claim se toma dentro de una transacción interactiva; el cliente de la
  // transacción delega en el mismo queryRaw para que el matching por substring
  // siga funcionando igual que antes.
  const $transaction = jest.fn(
    async (fn: (tx: { $queryRaw: typeof queryRaw }) => Promise<unknown>) =>
      fn({
        $queryRaw: queryRaw,
        $executeRaw: jest.fn(async () => 1),
        batchWindow: { findUnique: jest.fn(async () => null) },
        inboxEvent: { updateMany },
      } as never),
  );

  return {
    $queryRaw: queryRaw,
    $transaction: $transaction,
    inboxEvent: {
      findUnique,
      updateMany,
    },
  };
}

function makeDispatcher() {
  const dispatchExportJob = jest.fn(async () => undefined);
  const dispatchInboxEvent = jest.fn(async () => undefined);
  const dispatchBatchEvent = jest.fn(async () => undefined);
  const dispatchOutboxEvent = jest.fn(async () => undefined);
  const dispatchRealtimeEvent = jest.fn(async () => undefined);
  return {
    dispatchExportJob,
    dispatchInboxEvent,
    dispatchBatchEvent,
    dispatchOutboxEvent,
    dispatchRealtimeEvent,
  };
}

async function makeProcessor(params: {
  prisma?: ReturnType<typeof makePrisma>;
  dispatcher?: BackgroundTaskDispatcher;
  batchingWindowMs?: number;
  batchingMaxWaitMs?: number;
  fsmLock?: { acquire: jest.Mock; release: jest.Mock };
  envOverrides?: Record<string, unknown>;
}) {
  jest.resetModules();
  jest.doMock('../../config/env.config', () => ({
    env: {
      BATCHING_WINDOW_MS: params.batchingWindowMs ?? BATCHING_WINDOW_MS,
      BATCHING_MAX_WAIT_MS: params.batchingMaxWaitMs ?? BATCHING_MAX_WAIT_MS,
      REALTIME_DURABLE_ENABLED: false,
      INBOX_POLL_INTERVAL_MS: 100,
      ...params.envOverrides,
    },
  }));

  const { InboxProcessorService: Service } =
    await import('../../services/events/inbox-processor.service');
  const prisma = params.prisma ?? makePrisma();
  const dispatcher = params.dispatcher ?? makeDispatcher();
  const fsmLock = params.fsmLock ?? {
    acquire: jest.fn(async () => 'lease-token-1'),
    release: jest.fn(async () => true),
  };

  const processor = new Service(
    prisma as never,
    { markAsRead: jest.fn() } as never,
    { enqueue: jest.fn() } as never,
    undefined,
    dispatcher,
    undefined,
    fsmLock as never,
    { pollIntervalMs: 100 },
  );

  return { processor: processor as InboxProcessorService, prisma, dispatcher, fsmLock };
}

describe('InboxProcessorService batching dispatch', () => {
  it('schedules the task at the durable DB deadline, including the maximum-wait cap', async () => {
    const readyAt = new Date('2026-10-13T16:00:02.125Z');
    const prisma = makePrisma({
      'INSERT INTO batch_windows': [{ batch_generation: 7, batch_ready_at: readyAt }],
    });
    const dispatcher = makeDispatcher();
    const { processor } = await makeProcessor({ prisma, dispatcher });
    await processor.enqueue(
      {
        wamid: 'wamid-1',
        phone: '521999888777',
        timestamp: '1700000000',
        phoneNumberId: '123456',
        message: {
          id: 'wamid-1',
          type: 'text',
          from: '521999888777',
          timestamp: '1700000000',
          text: { body: 'hola' },
        },
      },
      'inbox-1',
    );
    expect(dispatcher.dispatchBatchEvent).toHaveBeenCalledWith('521999888777', 7, {
      seconds: Math.floor(readyAt.getTime() / 1000),
      nanos: 125000000,
    });
    expect(dispatcher.dispatchInboxEvent).not.toHaveBeenCalled();
  });

  it('dispatches an immediate inbox task when batching is disabled', async () => {
    const prisma = makePrisma();
    const dispatcher = makeDispatcher();
    const { processor } = await makeProcessor({ prisma, dispatcher, batchingWindowMs: 0 });
    await processor.enqueue(
      {
        wamid: 'wamid-1',
        phone: '521999888777',
        timestamp: '1700000000',
        phoneNumberId: '123456',
        message: {
          id: 'wamid-1',
          type: 'text',
          from: '521999888777',
          timestamp: '1700000000',
          text: { body: 'hola' },
        },
      },
      'inbox-1',
    );
    expect(dispatcher.dispatchInboxEvent).toHaveBeenCalledWith('inbox-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
