import { randomUUID } from 'crypto';
import { Prisma, RealtimeOutboxStatus } from '@prisma/client';
import { QUEUE_CONFIG } from '../../config/messaging.constants';
import { PrismaService } from '../prisma.service';
import { BackgroundTaskResult } from '../tasks/cloud-tasks-dispatcher.service';
import { RealtimeDurableEvent, RealtimeDurableEventSchema } from './realtime-event.contracts';
import {
  logRealtimeBoundary,
  noopRealtimeMetrics,
  RealtimeMetrics,
} from './realtime-observability.service';
import { RealtimeTransport } from './realtime-transport.contracts';

export type RealtimeOutboxPrismaClient = Pick<PrismaService, '$queryRaw' | 'realtimeOutboxEvent'>;

type ClaimedOutboxRow = {
  id: string;
  payload: unknown;
  attempts: number;
  lockedBy: string;
};

type OutboxBacklogRow = {
  pendingCount: number;
  oldestPendingAgeSeconds: number;
};

export class RealtimeOutboxRelay {
  constructor(
    private readonly prisma: RealtimeOutboxPrismaClient,
    private readonly transport: RealtimeTransport,
    private readonly options: {
      batchSize?: number;
      maxRetries?: number;
      retryDelaysSeconds?: number[];
      instanceId?: string;
      stalePublishingTimeoutSeconds?: number;
      metrics?: RealtimeMetrics;
    } = {},
  ) {}

  async runCycle(): Promise<void> {
    const rows = await this.claimBatch();
    if (rows.length === 0) {
      await this.updateBacklogGauges();
      return;
    }

    logRealtimeBoundary('debug', 'RealtimeOutboxRelay', 'relay.claim', {
      status: 'claimed',
      claimedCount: rows.length,
    });

    // Limit concurrent RPCs and drain claimed rows before the 30s recovery lease.
    for (let offset = 0; offset < rows.length; offset += 4) {
      await Promise.all(rows.slice(offset, offset + 4).map((row) => this.processRow(row)));
    }

    await this.updateBacklogGauges();
  }

  async processEventById(id: string): Promise<BackgroundTaskResult> {
    const event = await this.prisma.realtimeOutboxEvent.findUnique({
      where: { id },
      select: { id: true, payload: true, attempts: true, status: true, lockedAt: true },
    });
    if (!event) return 'not_found';
    if (['published', 'dead_lettered'].includes(event.status)) return 'noop';

    const staleBefore = new Date(
      Date.now() - (this.options.stalePublishingTimeoutSeconds ?? 30) * 1000,
    );
    if (event.status === 'publishing' && event.lockedAt && event.lockedAt > staleBefore) {
      return 'noop';
    }

    const lockedBy = randomUUID();
    const claimed = await this.prisma.realtimeOutboxEvent.updateMany({
      where: {
        id,
        OR: [
          {
            status: { in: ['pending', 'failed'] },
            OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
          },
          {
            status: 'publishing',
            OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
          },
        ],
      },
      data: {
        status: RealtimeOutboxStatus.publishing,
        lockedAt: new Date(),
        lockedBy,
      },
    });
    if (claimed.count !== 1) return 'noop';

    await this.processRow({ id, payload: event.payload, attempts: event.attempts, lockedBy }, true);
    return 'processed';
  }

  private async claimBatch(): Promise<ClaimedOutboxRow[]> {
    const size = this.options.batchSize ?? QUEUE_CONFIG.OUTBOX_BATCH_SIZE;
    const instanceId = randomUUID();
    const stalePublishingTimeoutSeconds = this.options.stalePublishingTimeoutSeconds ?? 30;

    return this.prisma.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
      WITH eligible AS (
        SELECT r.id, r.payload, r.attempts
        FROM realtime_outbox_events r
        WHERE (
            (
              r.status IN ('pending', 'failed')
              AND (r.next_retry_at IS NULL OR r.next_retry_at <= now())
            )
            OR (
              r.status = 'publishing'
              AND r.locked_at IS NOT NULL
              AND r.locked_at <= now() - make_interval(secs => ${stalePublishingTimeoutSeconds})
            )
          )
        ORDER BY r.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${size}
      )
      UPDATE realtime_outbox_events r
      SET
        status = 'publishing',
        locked_at = now(),
        locked_by = ${instanceId}
      FROM eligible
      WHERE r.id = eligible.id
      RETURNING r.id, r.payload, r.attempts, r.locked_by AS "lockedBy"
    `);
  }

  private async processRow(row: ClaimedOutboxRow, propagateFailure = false): Promise<void> {
    const startedAt = Date.now();
    const parsed = this.parsePayload(row.payload);
    if (!parsed) {
      await this.markInvalid(row.id, row.attempts, row.lockedBy);
      return;
    }

    try {
      await this.transport.publish(parsed);
      const completed = await this.markPublished(row.id, row.lockedBy);
      if (!completed) return;
      const latencyMs = Date.now() - startedAt;
      this.logOutcome(parsed, 'published', undefined, {
        attempts: row.attempts,
        latencyMs,
      });
      const metrics = this.options.metrics ?? noopRealtimeMetrics;
      metrics.incrementCounter('relay_published', {
        eventType: parsed.eventType,
        socketEventName: parsed.socketEventName,
        status: 'published',
      });
      metrics.observeHistogram('relay_latency_ms', latencyMs, {
        eventType: parsed.eventType,
        socketEventName: parsed.socketEventName,
        status: 'published',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = await this.markFailed(row.id, row.attempts, message, row.lockedBy);
      if (!failure.updated) return;
      const latencyMs = Date.now() - startedAt;
      this.logOutcome(parsed, failure.deadLettered ? 'dead_lettered' : 'failed', message, {
        attempts: failure.newAttempts,
        latencyMs,
      });

      const metrics = this.options.metrics ?? noopRealtimeMetrics;
      if (failure.deadLettered) {
        metrics.incrementCounter('relay_dead_lettered', {
          eventType: parsed.eventType,
          socketEventName: parsed.socketEventName,
          status: 'dead_lettered',
          attempts: String(failure.newAttempts),
        });
      } else {
        metrics.incrementCounter('relay_failed', {
          eventType: parsed.eventType,
          socketEventName: parsed.socketEventName,
          status: 'failed',
          attempts: String(failure.newAttempts),
        });
      }

      metrics.observeHistogram('relay_latency_ms', latencyMs, {
        eventType: parsed.eventType,
        socketEventName: parsed.socketEventName,
        status: failure.deadLettered ? 'dead_lettered' : 'failed',
      });
      if (propagateFailure && !failure.deadLettered) throw error;
    }
  }

  private parsePayload(payload: unknown): RealtimeDurableEvent | null {
    const result = RealtimeDurableEventSchema.safeParse(payload);
    return result.success ? result.data : null;
  }

  private async markPublished(id: string, lockedBy: string): Promise<boolean> {
    const result = await this.prisma.realtimeOutboxEvent.updateMany({
      where: { id: { in: [id] }, status: RealtimeOutboxStatus.publishing, lockedBy },
      data: {
        status: RealtimeOutboxStatus.published,
        publishedAt: new Date(),
        nextRetryAt: null,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
    return result.count === 1;
  }

  private async markFailed(
    id: string,
    attempts: number,
    lastError: string,
    lockedBy: string,
  ): Promise<{ deadLettered: boolean; newAttempts: number; updated: boolean }> {
    const maxRetries = this.options.maxRetries ?? QUEUE_CONFIG.MAX_RETRIES;
    const retryDelaysSeconds = this.options.retryDelaysSeconds ?? QUEUE_CONFIG.RETRY_DELAYS_SECONDS;
    const newAttempts = attempts + 1;
    const deadLettered = newAttempts > maxRetries;

    const nextRetryAt = deadLettered
      ? null
      : new Date(Date.now() + (retryDelaysSeconds[attempts] ?? 600) * 1000);

    const result = await this.prisma.realtimeOutboxEvent.updateMany({
      where: { id: { in: [id] }, status: RealtimeOutboxStatus.publishing, lockedBy },
      data: {
        status: deadLettered ? RealtimeOutboxStatus.dead_lettered : RealtimeOutboxStatus.failed,
        attempts: newAttempts,
        nextRetryAt,
        lastError,
        lockedAt: null,
        lockedBy: null,
      },
    });

    return { deadLettered, newAttempts, updated: result.count === 1 };
  }

  private async markInvalid(id: unknown, attempts: number, lockedBy: string): Promise<void> {
    await this.prisma.realtimeOutboxEvent.updateMany({
      where: { id: { in: [String(id)] }, status: RealtimeOutboxStatus.publishing, lockedBy },
      data: {
        status: RealtimeOutboxStatus.dead_lettered,
        attempts: { increment: 1 },
        nextRetryAt: null,
        lastError: 'Invalid durable realtime payload schema',
        lockedAt: null,
        lockedBy: null,
      },
    });

    (this.options.metrics ?? noopRealtimeMetrics).incrementCounter('relay_dead_lettered', {
      status: 'invalid_payload',
      attempts: String(attempts + 1),
    });

    logRealtimeBoundary('warn', 'RealtimeOutboxRelay', 'relay.publish', {
      status: 'invalid_payload',
      eventId: String(id),
    });
  }

  private logOutcome(
    event: RealtimeDurableEvent,
    outcome: 'published' | 'failed' | 'dead_lettered',
    error?: string,
    options?: { attempts?: number; latencyMs?: number },
  ): void {
    const entry: Record<string, unknown> = {
      status: outcome,
      eventId: event.eventId,
      correlationId: event.correlationId,
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      conversationId: event.conversationId,
      attempts: options?.attempts,
      latencyMs: options?.latencyMs,
    };

    if (error) {
      entry.error = error;
    }

    logRealtimeBoundary(
      outcome === 'published' ? 'info' : 'warn',
      'RealtimeOutboxRelay',
      'relay.publish',
      entry,
    );
  }

  private async updateBacklogGauges(): Promise<void> {
    const rows = await this.prisma.$queryRaw<OutboxBacklogRow[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS "pendingCount",
        COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at))), 0)::int AS "oldestPendingAgeSeconds"
      FROM realtime_outbox_events
      WHERE status IN ('pending', 'failed')
    `);

    const backlog = rows[0] ?? { pendingCount: 0, oldestPendingAgeSeconds: 0 };
    const metrics = this.options.metrics ?? noopRealtimeMetrics;

    metrics.setGauge('outbox_pending_count', backlog.pendingCount, {
      status: 'pending_or_failed',
    });
    metrics.setGauge('outbox_oldest_pending_age_seconds', backlog.oldestPendingAgeSeconds, {
      status: 'pending_or_failed',
    });
  }
}
