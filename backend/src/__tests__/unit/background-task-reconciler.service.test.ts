import { describe, expect, it, jest } from '@jest/globals';
import { reconcilePendingBackgroundTasks } from '../../services/tasks/background-task-reconciler.service';

type FindManyArgs = { cursor?: { id: string }; take: number; orderBy: { id: string } };

function pagedFindMany(ids: string[]) {
  return jest.fn(async (args: FindManyArgs) => {
    const start = args.cursor ? ids.indexOf(args.cursor.id) + 1 : 0;
    return ids.slice(start, start + args.take).map((id) => ({ id }));
  });
}

describe('background task reconciliation', () => {
  it('uses ordered cursor pages and reports when the per-type cap is reached', async () => {
    const inboxFindMany = pagedFindMany(['event-1', 'event-2', 'event-3', 'event-4', 'event-5']);
    const emptyFindMany = jest.fn(async () => []);
    const prisma = {
      $queryRaw: jest.fn(async () => []),
      inboxEvent: { findMany: inboxFindMany },
      outboxEvent: { findMany: emptyFindMany },
      realtimeOutboxEvent: { findMany: emptyFindMany },
    };
    const dispatchInboxEvent = jest.fn(async (_id: string) => undefined);
    const dispatcher = {
      dispatchExportJob: jest.fn(async (_id: string) => undefined),
      dispatchInboxEvent,
      dispatchBatchEvent: jest.fn(async () => undefined),
      dispatchOutboxEvent: jest.fn(async (_id: string) => undefined),
      dispatchRealtimeEvent: jest.fn(async (_id: string) => undefined),
    };

    const result = await reconcilePendingBackgroundTasks(prisma as never, dispatcher, {
      maxPerType: 4,
      pageSize: 2,
    });

    expect(result).toEqual({ attempted: 4, failed: 0, capped: true });
    expect(dispatchInboxEvent.mock.calls.map(([id]) => id)).toEqual([
      'event-1',
      'event-2',
      'event-3',
      'event-4',
    ]);
    expect(inboxFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: 'event-2' },
        skip: 1,
        orderBy: { id: 'asc' },
      }),
    );
  });

  it('dispatches expired batch windows whose current generation has no completed claim', async () => {
    const now = new Date();
    const queryRaw = jest.fn(async () => [
      { phone: '521999888777', generation: 1, ready_at: new Date(now.getTime() - 1000) },
      { phone: '521999888776', generation: 2, ready_at: new Date(now.getTime() - 500) },
    ]);
    const emptyFindMany = jest.fn(async () => []);
    const prisma = {
      $queryRaw: queryRaw,
      inboxEvent: { findMany: emptyFindMany },
      outboxEvent: { findMany: emptyFindMany },
      realtimeOutboxEvent: { findMany: emptyFindMany },
    };
    const dispatchBatchEvent = jest.fn(async () => undefined);
    const dispatcher = {
      dispatchExportJob: jest.fn(async () => undefined),
      dispatchInboxEvent: jest.fn(async () => undefined),
      dispatchOutboxEvent: jest.fn(async () => undefined),
      dispatchRealtimeEvent: jest.fn(async () => undefined),
      dispatchBatchEvent,
    };

    const result = await reconcilePendingBackgroundTasks(prisma as never, dispatcher, {
      maxPerType: 10,
      pageSize: 5,
    });

    expect(result).toEqual({ attempted: 2, failed: 0, capped: false });
    expect(dispatchBatchEvent).toHaveBeenCalledTimes(2);
    expect(dispatchBatchEvent).toHaveBeenNthCalledWith(
      1,
      '521999888777',
      1,
      expect.objectContaining({ seconds: expect.any(Number), nanos: expect.any(Number) }),
    );
    expect(dispatchBatchEvent).toHaveBeenNthCalledWith(
      2,
      '521999888776',
      2,
      expect.objectContaining({ seconds: expect.any(Number), nanos: expect.any(Number) }),
    );
  });

  it('fetches only due retries and excludes terminal work from retained queues', async () => {
    const inboxFindMany = jest.fn(async (_args: unknown) => []);
    const outboxFindMany = jest.fn(async (_args: unknown) => []);
    const realtimeFindMany = jest.fn(async (_args: unknown) => []);
    const prisma = {
      $queryRaw: jest.fn(async () => []),
      inboxEvent: { findMany: inboxFindMany },
      outboxEvent: { findMany: outboxFindMany },
      realtimeOutboxEvent: { findMany: realtimeFindMany },
    };
    const dispatcher = {
      dispatchExportJob: jest.fn(async (_id: string) => undefined),
      dispatchInboxEvent: jest.fn(async (_id: string) => undefined),
      dispatchBatchEvent: jest.fn(async () => undefined),
      dispatchOutboxEvent: jest.fn(async (_id: string) => undefined),
      dispatchRealtimeEvent: jest.fn(async (_id: string) => undefined),
    };

    await reconcilePendingBackgroundTasks(prisma as never, dispatcher, {
      maxPerType: 4,
      pageSize: 2,
    });

    expect(inboxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            { status: 'pending' },
            expect.objectContaining({
              status: 'failed',
              retryCount: 1,
              lastErrorAt: { lte: expect.any(Date) },
            }),
          ]),
        },
      }),
    );
    for (const findMany of [outboxFindMany, realtimeFindMany]) {
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: expect.arrayContaining([
              { status: 'pending' },
              {
                status: 'failed',
                OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: expect.any(Date) } }],
              },
            ]),
          },
        }),
      );
    }
  });
});
