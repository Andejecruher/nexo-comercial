import { Prisma } from '@prisma/client';
import { env } from '../../config/env.config';
import { QUEUE_CONFIG } from '../../config/messaging.constants';
import { PrismaService } from '../prisma.service';
import { BackgroundTaskDispatcher } from './cloud-tasks-dispatcher.service';

export type BackgroundTaskReconciliationResult = {
  attempted: number;
  failed: number;
  capped: boolean;
};

type IdRow = { id: string };
type PageFetcher = (cursor: string | undefined, take: number) => Promise<IdRow[]>;
type BatchWindowRow = { phone: string; generation: number; ready_at: Date };

export async function reconcilePendingBackgroundTasks(
  prisma: PrismaService,
  dispatcher: BackgroundTaskDispatcher | undefined,
  options: { maxPerType?: number; pageSize?: number } = {},
): Promise<BackgroundTaskReconciliationResult> {
  if (!dispatcher) return { attempted: 0, failed: 0, capped: false };

  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const now = new Date();
  const inboxFailedDue = QUEUE_CONFIG.RETRY_DELAYS_SECONDS.map((delaySeconds, index) => ({
    status: 'failed' as const,
    retryCount: index + 1,
    lastErrorAt: { lte: new Date(now.getTime() - delaySeconds * 1000) },
  }));
  const maxPerType = options.maxPerType ?? env.TASKS_RECONCILE_MAX_PER_TYPE;
  const pageSize = Math.min(options.pageSize ?? 50, maxPerType);

  const results = await Promise.all([
    ...(dispatcher.dispatchCampaign
      ? [
          reconcileType(
            (cursor, take) =>
              prisma.campaign.findMany({
                where: { status: { in: ['queued', 'running', 'needs_review'] } },
                select: { id: true },
                orderBy: { id: 'asc' },
                take,
                ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
              }),
            (id) => dispatcher.dispatchCampaign!(id),
            maxPerType,
            pageSize,
          ),
        ]
      : []),
    reconcileType(
      (cursor, take) =>
        prisma.inboxEvent.findMany({
          where: {
            OR: [
              { status: 'pending' },
              ...inboxFailedDue,
              {
                status: 'processing',
                OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
              },
            ],
          },
          select: { id: true },
          orderBy: { id: 'asc' },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      (id) => dispatcher.dispatchInboxEvent(id),
      maxPerType,
      pageSize,
    ),
    reconcileType(
      (cursor, take) =>
        prisma.outboxEvent.findMany({
          where: {
            OR: [
              { status: 'pending' },
              {
                status: 'failed',
                OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
              },
              {
                status: 'sending',
                OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
              },
            ],
          },
          select: { id: true },
          orderBy: { id: 'asc' },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      (id) => dispatcher.dispatchOutboxEvent(id),
      maxPerType,
      pageSize,
    ),
    reconcileType(
      (cursor, take) =>
        prisma.realtimeOutboxEvent.findMany({
          where: {
            OR: [
              { status: 'pending' },
              {
                status: 'failed',
                OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
              },
              {
                status: 'publishing',
                OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
              },
            ],
          },
          select: { id: true },
          orderBy: { id: 'asc' },
          take,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      (id) => dispatcher.dispatchRealtimeEvent(id),
      maxPerType,
      pageSize,
    ),
    reconcileBatchWindows(prisma, dispatcher, maxPerType, pageSize),
  ]);

  return results.reduce<BackgroundTaskReconciliationResult>(
    (total, result) => ({
      attempted: total.attempted + result.attempted,
      failed: total.failed + result.failed,
      capped: total.capped || result.capped,
    }),
    { attempted: 0, failed: 0, capped: false },
  );
}

async function reconcileBatchWindows(
  prisma: PrismaService,
  dispatcher: BackgroundTaskDispatcher,
  maxItems: number,
  pageSize: number,
): Promise<BackgroundTaskReconciliationResult> {
  let offset = 0;
  let attempted = 0;
  let failed = 0;

  while (attempted < maxItems) {
    const remaining = maxItems - attempted;
    const currentPageSize = Math.min(pageSize, remaining);
    const now = new Date();
    const rows = await prisma.$queryRaw<BatchWindowRow[]>(Prisma.sql`
      SELECT phone, batch_generation AS generation, batch_ready_at AS ready_at
      FROM batch_windows
      WHERE batch_ready_at <= ${now}
        AND NOT EXISTS (
          SELECT 1 FROM batch_window_claims
          WHERE batch_window_claims.phone = batch_windows.phone
            AND batch_window_claims.batch_generation = batch_windows.batch_generation
            AND batch_window_claims.completed_at IS NOT NULL
        )
      UNION ALL
      SELECT phone, batch_generation AS generation, claim_lease_until AS ready_at
      FROM batch_window_claims WHERE completed_at IS NULL AND claim_lease_until <= ${now}
      ORDER BY ready_at ASC, phone ASC
      LIMIT ${currentPageSize + 1}
      OFFSET ${offset}
    `);

    const page = rows.slice(0, currentPageSize);
    const dispatches = await Promise.allSettled(
      page.map(({ phone, generation, ready_at: readyAt }) => {
        const target = readyAt > now ? readyAt : now;
        const seconds = Math.floor(target.getTime() / 1000);
        const nanos = (target.getTime() % 1000) * 1_000_000;
        return dispatcher.dispatchBatchEvent(phone, generation, { seconds, nanos });
      }),
    );
    attempted += dispatches.length;
    failed += dispatches.filter((result) => result.status === 'rejected').length;

    if (rows.length <= currentPageSize) {
      return { attempted, failed, capped: false };
    }
    if (attempted >= maxItems) {
      return { attempted, failed, capped: true };
    }
    offset += page.length;
  }

  return { attempted, failed, capped: true };
}

async function reconcileType(
  fetchPage: PageFetcher,
  dispatch: (id: string) => Promise<void>,
  maxItems: number,
  pageSize: number,
): Promise<BackgroundTaskReconciliationResult> {
  let cursor: string | undefined;
  let attempted = 0;
  let failed = 0;

  while (attempted < maxItems) {
    const remaining = maxItems - attempted;
    const currentPageSize = Math.min(pageSize, remaining);
    const rows = await fetchPage(cursor, currentPageSize + 1);
    const page = rows.slice(0, currentPageSize);
    const dispatches = await Promise.allSettled(page.map(({ id }) => dispatch(id)));
    attempted += dispatches.length;
    failed += dispatches.filter((result) => result.status === 'rejected').length;

    if (rows.length <= currentPageSize) {
      return { attempted, failed, capped: false };
    }
    if (attempted >= maxItems) {
      return { attempted, failed, capped: true };
    }
    cursor = page[page.length - 1]?.id;
  }

  return { attempted, failed, capped: true };
}
