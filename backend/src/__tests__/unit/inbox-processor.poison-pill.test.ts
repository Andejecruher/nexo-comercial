import { describe, expect, it, jest } from '@jest/globals';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { env } from '../../config/env.config';
import { InboxProcessorService } from '../../services/events/inbox-processor.service';
import { withEnvConfig } from '../helpers/with-env';

const INBOX_ID = '550e8400-e29b-41d4-a716-446655440000';
const PHONE = '521999888777';

const payload = {
  wamid: 'wamid-1',
  phone: PHONE,
  timestamp: '1700000000',
  phoneNumberId: '123456',
  message: {
    id: 'wamid-1',
    type: 'text',
    from: PHONE,
    timestamp: '1700000000',
    text: { body: 'hola' },
  },
};

function rawError(sqlState: string): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError(
    'Raw query failed. Code: `23514`. Message: `ERROR: Conversation line cannot be reassigned`',
    { code: 'P2010', clientVersion: 'test', meta: { code: sqlState } },
  );
}

/** Handles both tagged-template calls and Prisma.sql objects. */
function sqlText(query: unknown): string {
  const strings = (query as { strings?: string[] }).strings ?? (query as string[]);
  return Array.isArray(strings) ? strings.join('?') : '';
}

type UpdateArgs = {
  where: Record<string, unknown>;
  data: Record<string, unknown>;
};

function buildProcessor() {
  const updateMany = jest.fn(async (_args: UpdateArgs) => ({ count: 1 }));
  const prisma = {
    inboxEvent: {
      findUnique: jest.fn(async () => ({
        id: INBOX_ID,
        status: 'pending',
        payload,
        retryCount: 0,
        correlationId: 'corr-1',
        idempotencyKey: null,
      })),
      updateMany,
    },
  };
  const processor = new InboxProcessorService(
    prisma as never,
    { send: jest.fn(), markAsRead: jest.fn() } as never,
    { enqueue: jest.fn() } as never,
    undefined,
    undefined,
    undefined,
    { acquire: jest.fn(), release: jest.fn() } as never,
    { pollIntervalMs: 100 },
  );
  return { processor, prisma, updateMany };
}

function stubOrchestrator(
  processor: InboxProcessorService,
  handleInboundMessage: () => Promise<void>,
) {
  return jest
    .spyOn(
      processor as unknown as { buildOrchestrator: () => Promise<unknown> },
      'buildOrchestrator',
    )
    .mockImplementation(async () => ({ handleInboundMessage }) as never);
}

function failureUpdate(updateMany: { mock: { calls: unknown[][] } }) {
  return updateMany.mock.calls
    .map((call) => call[0] as UpdateArgs)
    .find((args) => args.data.lastError !== undefined);
}

describe('InboxProcessorService poison-pill handling', () => {
  it('dead-letters a deterministic P2010 constraint error instead of retrying', async () => {
    const restore = withEnvConfig(env, { BATCHING_WINDOW_MS: 0 });
    try {
      const { processor, updateMany } = buildProcessor();
      stubOrchestrator(processor, async () => {
        throw rawError('23514');
      });

      await expect(processor.processEventById(INBOX_ID)).resolves.toBe('processed');

      const failed = failureUpdate(updateMany);
      expect(failed?.data).toEqual(
        expect.objectContaining({
          status: 'dead_lettered',
          lockedAt: null,
          lockedBy: null,
        }),
      );
      expect(failed?.data.retryCount).toBeUndefined();
      expect(String(failed?.data.lastError)).toContain('[P2010/23514]');
    } finally {
      restore();
    }
  });

  it('keeps retryable P2010 SQLSTATEs on the retry path', async () => {
    const restore = withEnvConfig(env, { BATCHING_WINDOW_MS: 0 });
    try {
      const { processor, updateMany } = buildProcessor();
      stubOrchestrator(processor, async () => {
        throw rawError('40001');
      });

      await expect(processor.processEventById(INBOX_ID)).rejects.toBeInstanceOf(
        PrismaClientKnownRequestError,
      );

      const failed = failureUpdate(updateMany);
      expect(failed?.data).toEqual(
        expect.objectContaining({
          status: 'failed',
          retryCount: { increment: 1 },
        }),
      );
    } finally {
      restore();
    }
  });

  it('dead-letters the poisoned batch and completes the claim so recovery stops', async () => {
    const queryRaw = jest.fn(async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes('clock_timestamp() AS now')) return [{ now: new Date() }];
      if (text.includes('SELECT batch_generation, batch_ready_at FROM batch_windows')) {
        return [{ batch_generation: 3, batch_ready_at: new Date(Date.now() - 1_000) }];
      }
      if (text.includes('FROM updated')) {
        return [
          {
            id: INBOX_ID,
            payload,
            retry_count: 0,
            created_at: new Date(),
          },
        ];
      }
      return [];
    });
    const executeRaw = jest.fn(async (..._args: unknown[]) => 1);

    const tx = {
      $executeRaw: jest.fn(async () => 1),
      $queryRaw: queryRaw,
      batchWindow: { findUnique: jest.fn(async () => null), updateMany: jest.fn(async () => ({})) },
      batchWindowClaim: {
        findUnique: jest.fn(async () => null),
        findFirst: jest.fn(async () => null),
        upsert: jest.fn(async () => ({})),
      },
      inboxEvent: { count: jest.fn(async () => 0), updateMany: jest.fn(async () => ({})) },
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      inboxEvent: { updateMany: jest.fn(async () => ({ count: 1 })) },
      batchWindowClaim: { updateMany: jest.fn(async () => ({ count: 1 })) },
    };

    const processor = new InboxProcessorService(
      prisma as never,
      { send: jest.fn(), markAsRead: jest.fn() } as never,
      { enqueue: jest.fn() } as never,
      undefined,
      undefined,
      undefined,
      { acquire: jest.fn(), release: jest.fn() } as never,
      { pollIntervalMs: 100 },
    );
    jest
      .spyOn(
        processor as unknown as { buildOrchestrator: () => Promise<unknown> },
        'buildOrchestrator',
      )
      .mockImplementation(
        async () =>
          ({
            handleInboundBatch: jest.fn(async () => {
              throw rawError('23514');
            }),
          }) as never,
      );

    await expect(processor.processBatch(PHONE, 3)).resolves.toBe('processed');

    const sql = executeRaw.mock.calls.map((call) => sqlText(call[0])).join('\n');
    expect(sql).toContain('dead_lettered');
    // completeBatchClaim cierra la ventana: recoverBatchWindows deja de reclamarla.
    const completed = queryRaw.mock.calls.map((call) => sqlText(call[0])).join('\n');
    expect(completed).toContain('UPDATE batch_window_claims');
    expect(completed).toContain('completed_at = now()');
    // No se libera la lease para reintento: sería volver al ciclo infinito.
    expect(prisma.batchWindowClaim.updateMany).not.toHaveBeenCalled();
  });
});
