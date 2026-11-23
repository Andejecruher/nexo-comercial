/**
 * InboxProcessorService — consumidor de eventos inbound (mensajes WhatsApp).
 *
 * Request-driven: `enqueue` persiste el inbox_event (hecho en webhook.routes) y
 * despacha vía Cloud Tasks si el backend es `cloud_tasks`. La clase reclama el
 * evento por id (`processEventById`, usado por las rutas HTTP del worker) y en
 * modo `polling` local reclama lotes directo de `inbox_events` (sin colas
 * Redis). No hay dedupe ni re-enqueue en Redis: la deduplicación de webhook por
 * wamid ya vive en la tabla y el retry lo orquesta el reconciler.
 */
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { env } from '../../config/env.config';
import { QUEUE_CONFIG } from '../../config/messaging.constants';
import { startExclusiveInterval } from '../../utils/exclusive-interval';
import { prismaLogFields } from '../../utils/prisma-errors';
import { isNonRetryableError, persistenceErrorReason } from '../../utils/retry-policy';
import { createStructuredLogger } from '../../utils/structured-logger';
import { ParsedWebhookMessage } from '../../utils/wa-message-parser';
import { ConversationLeaseLock } from '../fsm-lock.service';
import { AiRuntimeFactory } from '../orchestrator/ai-runtime.factory';
import { MessageOrchestratorService } from '../orchestrator/message-orchestrator.service';
import { PrismaService } from '../prisma.service';
import { AIStreamPubSubPublisher } from '../realtime/ai-stream-pubsub.service';
import { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import {
  BackgroundTaskDispatcher,
  BackgroundTaskResult,
} from '../tasks/cloud-tasks-dispatcher.service';
import { WhatsAppProvider } from '../whatsapp/whatsapp.provider';
import { OutboxProcessorService } from './outbox-processor.service';

const BATCH_WINDOW_LEASE_MS = 5 * 60_000;

const log = createStructuredLogger('InboxProcessor');
const QUEUE_LEASE_MS = 5 * 60_000;

interface InboxWorkItem {
  inboxEventId: string;
  parsedMessage: ParsedWebhookMessage;
  retryCount: number;
  correlationId: string;
}

type InboxClaimRow = {
  id: string;
  payload: Prisma.JsonValue;
  retryCount: number;
  idempotencyKey: string | null;
};

export class InboxProcessorService {
  private readonly aiStreamPublisher: AIStreamPubSubPublisher;
  private readonly aiRuntimeFactory: AiRuntimeFactory;
  private readonly pollIntervalMs: number;
  private isRunning = false;
  private processIntervalHandle: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    whatsappProvider: WhatsAppProvider,
    outboxProcessor: OutboxProcessorService,
    realtimeNotifier?: RealtimeNotifier,
    private readonly taskDispatcher?: BackgroundTaskDispatcher,
    aiStreamPublisher?: AIStreamPubSubPublisher,
    fsmLock?: ConversationLeaseLock,
    options: { pollIntervalMs?: number } = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? env.INBOX_POLL_INTERVAL_MS;
    this.aiStreamPublisher =
      aiStreamPublisher ??
      new AIStreamPubSubPublisher(undefined, { enabled: env.REALTIME_DURABLE_ENABLED });
    this.aiRuntimeFactory = new AiRuntimeFactory({
      prisma,
      fsmLock: fsmLock ?? new ConversationLeaseLock(prisma),
      whatsappProvider,
      outboxProcessor,
      aiStreamPublisher: this.aiStreamPublisher,
      realtimeNotifier,
    });
  }

  async enqueue(parsedMessage: ParsedWebhookMessage, inboxEventId: string): Promise<void> {
    if (env.BATCHING_WINDOW_MS > 0) {
      const window = await this.upsertBatchWindow(parsedMessage.phone, inboxEventId);
      await this.taskDispatcher?.dispatchBatchEvent(
        parsedMessage.phone,
        window.batch_generation,
        this.batchScheduleTime(window.batch_ready_at),
      );
      return;
    }
    await this.taskDispatcher?.dispatchInboxEvent(inboxEventId);
  }

  async processEventById(inboxEventId: string): Promise<BackgroundTaskResult> {
    const event = await this.prisma.inboxEvent.findUnique({ where: { id: inboxEventId } });
    if (!event) return 'not_found';
    if (['processed', 'dead_lettered'].includes(event.status)) return 'noop';
    if (
      event.status === 'processing' &&
      event.lockedAt &&
      event.lockedAt.getTime() > Date.now() - QUEUE_LEASE_MS
    ) {
      throw new Error('Inbox event is still being processed');
    }

    const parsedMessage = event.payload as unknown as ParsedWebhookMessage;
    if (!isParsedWebhookMessage(parsedMessage)) {
      await this.prisma.inboxEvent.updateMany({
        where: { id: inboxEventId, status: { in: ['pending', 'failed', 'processing'] } },
        data: {
          status: 'dead_lettered',
          lastError: 'Invalid persisted inbox payload',
          lockedAt: null,
          lockedBy: null,
        },
      });
      return 'processed';
    }

    // En modo batching positivo redirigimos al agregador por conversación en lugar de procesar un turno único.
    if (env.BATCHING_WINDOW_MS > 0) {
      if (event.batchGeneration !== null && event.batchGeneration !== undefined) {
        await this.taskDispatcher?.dispatchBatchEvent(parsedMessage.phone, event.batchGeneration);
      } else {
        const window = await this.upsertBatchWindow(parsedMessage.phone, inboxEventId);
        await this.taskDispatcher?.dispatchBatchEvent(
          parsedMessage.phone,
          window.batch_generation,
          this.batchScheduleTime(window.batch_ready_at),
        );
      }
      return 'processed';
    }

    const claimed = await this.claimInboxEvent(inboxEventId, event.retryCount);
    if (!claimed) return 'noop';

    await this.processItem(
      {
        inboxEventId,
        parsedMessage,
        retryCount: event.retryCount,
        correlationId: event.correlationId ?? event.idempotencyKey ?? inboxEventId,
      },
      true,
    );
    return 'processed';
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.processIntervalHandle = startExclusiveInterval(
      () => this.processNextBatch(),
      this.pollIntervalMs,
      (err: unknown) => {
        log('error', 'inbox.batch_failed', undefined, prismaLogFields(err));
      },
    );
    log('debug', 'inbox.worker_started');
  }

  stop(): void {
    if (this.processIntervalHandle) {
      clearInterval(this.processIntervalHandle);
      this.processIntervalHandle = undefined;
    }
    this.isRunning = false;
    log('debug', 'inbox.worker_stopped');
  }

  private async processNextBatch(): Promise<void> {
    if (env.BATCHING_WINDOW_MS > 0) {
      await this.recoverBatchWindows();
      return;
    }
    const items = await this.claimDbBatch();
    for (const item of items) {
      // Aislamiento por ítem: un fallo (incluso uno al persistir el estado de
      // error) nunca debe abortar el resto del lote ya reclamado.
      try {
        await this.processItem(item);
      } catch (err: unknown) {
        log('error', 'inbox.batch_item_failed', item.correlationId, {
          inboxEventId: item.inboxEventId,
          ...prismaLogFields(err),
        });
      }
    }
  }

  private async processItem(item: InboxWorkItem, propagateFailure = false): Promise<void> {
    const { parsedMessage, inboxEventId } = item;
    const correlationId = item.correlationId;

    try {
      const orchestrator = await this.buildOrchestrator(correlationId);
      await orchestrator.handleInboundMessage(
        parsedMessage.phone,
        parsedMessage.message,
        parsedMessage.profileName,
        parsedMessage.phoneNumberId,
      );

      await this.prisma.inboxEvent.updateMany({
        where: { id: inboxEventId, status: 'processing' },
        data: {
          status: 'processed',
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
    } catch (err: unknown) {
      const terminal = isNonRetryableError(err);
      const exhausted = item.retryCount >= QUEUE_CONFIG.MAX_RETRIES;
      const status = terminal || exhausted ? 'dead_lettered' : 'failed';

      log('error', terminal ? 'inbox.item_dead_lettered' : 'inbox.item_failed', correlationId, {
        inboxEventId,
        retryCount: item.retryCount,
        exhausted,
        ...prismaLogFields(err),
      });

      await this.prisma.inboxEvent.updateMany({
        where: { id: inboxEventId, status: 'processing' },
        data: {
          // En DLQ no se consume presupuesto de reintentos: el problema no es
          // transitorio, ya está descartado y es observable/reprocesable.
          ...(terminal ? {} : { retryCount: { increment: 1 } }),
          lastError: persistenceErrorReason(err),
          lastErrorAt: new Date(),
          status,
          lockedAt: null,
          lockedBy: null,
        },
      });

      // propagateFailure existe para que Cloud Tasks reintente fallos
      // transitorios. Un evento ya dead-lettered no debe volver a encolarse.
      if (propagateFailure && status !== 'dead_lettered') throw err;
    }
  }

  private async claimDbBatch(): Promise<InboxWorkItem[]> {
    const rows = await this.prisma.$queryRaw<InboxClaimRow[]>(Prisma.sql`
      WITH eligible AS (
        SELECT ie.id
        FROM inbox_events ie
        WHERE ie.status = 'pending'
          OR (
            ie.status = 'failed'
            AND ie.retry_count <= ${QUEUE_CONFIG.MAX_RETRIES}
            AND ie.last_error_at IS NOT NULL
            AND now() >= ie.last_error_at + (
              (ARRAY[${Prisma.join(QUEUE_CONFIG.RETRY_DELAYS_SECONDS)}])[LEAST(ie.retry_count, ${QUEUE_CONFIG.RETRY_DELAYS_SECONDS.length - 1})] * INTERVAL '1 second'
            )
          )
          OR (
            ie.status = 'processing'
            AND (
              ie.locked_at IS NULL
              OR ie.locked_at <= now() - make_interval(secs => ${QUEUE_LEASE_MS / 1000})
            )
          )
        ORDER BY ie.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${QUEUE_CONFIG.INBOX_BATCH_SIZE}
      )
      UPDATE inbox_events ie
      SET status = 'processing', locked_at = now(), locked_by = 'inbox-poller'
      FROM eligible
      WHERE ie.id = eligible.id
      RETURNING
        ie.id,
        ie.payload,
        ie.retry_count AS "retryCount",
        ie.idempotency_key AS "idempotencyKey"
    `);

    return rows.map((row) => ({
      inboxEventId: row.id,
      parsedMessage: row.payload as unknown as ParsedWebhookMessage,
      retryCount: row.retryCount,
      correlationId: row.idempotencyKey ?? row.id,
    }));
  }

  private async claimInboxEvent(inboxEventId: string, retryCount: number): Promise<boolean> {
    const staleBefore = new Date(Date.now() - QUEUE_LEASE_MS);
    const claimResult = await this.prisma.inboxEvent.updateMany({
      where: {
        id: inboxEventId,
        retryCount,
        OR: [
          { status: { in: ['pending', 'failed'] } },
          {
            status: 'processing',
            OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
          },
        ],
      },
      data: {
        status: 'processing',
        lockedAt: new Date(),
        lockedBy: `worker-${process.pid}`,
      },
    });

    return claimResult.count === 1;
  }

  async processBatch(phone: string, generation: number): Promise<BackgroundTaskResult> {
    const claimToken = randomUUID();
    const claimRows = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'inbound:' + phone}, 0))`;
        const prior = await tx.batchWindowClaim.findUnique({
          where: { phone_batchGeneration: { phone, batchGeneration: generation } },
        });
        if (prior?.completedAt) return null;
        const unfinishedPredecessor = await tx.batchWindowClaim.findFirst({
          where: { phone, batchGeneration: { lt: generation }, completedAt: null },
        });
        if (unfinishedPredecessor) throw new Error('An earlier batch has not finished');
        const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
        // A sealed window has no worker token. Clock rounding must not look like a live lease.
        if (prior?.claimToken && prior.claimLeaseUntil && prior.claimLeaseUntil > now)
          throw new Error('Batch claim is still active');
        const windows = await tx.$queryRaw<
          { batch_generation: number; batch_ready_at: Date | null }[]
        >`
        SELECT batch_generation, batch_ready_at FROM batch_windows WHERE phone = ${phone} FOR UPDATE`;
        const window = windows[0];
        if (!prior && (!window || window.batch_generation !== generation)) return null;
        if (!prior && window!.batch_ready_at && window!.batch_ready_at > now)
          throw new Error('Batch window is not ready');
        if (!prior && !window!.batch_ready_at) return null;
        const boundary = prior?.drainBoundary ?? window!.batch_ready_at ?? now;
        await tx.batchWindowClaim.upsert({
          where: { phone_batchGeneration: { phone, batchGeneration: generation } },
          create: {
            phone,
            batchGeneration: generation,
            claimToken,
            claimLeaseUntil: new Date(now.getTime() + BATCH_WINDOW_LEASE_MS),
            drainBoundary: boundary,
          },
          update: { claimToken, claimLeaseUntil: new Date(now.getTime() + BATCH_WINDOW_LEASE_MS) },
        });
        // A retry retains its original membership. Only legacy claims without markers adopt rows.
        const hasMembership = prior
          ? await tx.inboxEvent.count({ where: { phone, batchGeneration: generation } })
          : 0;
        if (!prior || hasMembership === 0)
          await tx.inboxEvent.updateMany({
            where: {
              phone,
              batchGeneration: null,
              status: { in: ['pending', 'failed'] },
              createdAt: { lte: boundary },
            },
            data: { batchGeneration: generation },
          });
        if (!prior || window?.batch_generation === generation)
          await tx.batchWindow.updateMany({
            where: { phone, batchGeneration: generation },
            data: { batchReadyAt: null, windowOpenedAt: null },
          });
        return { drainBoundary: boundary };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    if (!claimRows) return 'noop';

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          payload: Prisma.JsonValue;
          retry_count: number;
          created_at: Date;
        }>
      >(
        Prisma.sql`
          WITH eligible AS (
            SELECT ie.id
            FROM inbox_events ie
            WHERE ie.phone = ${phone}
              AND ie.batch_generation = ${generation}
              AND ie.status IN ('pending', 'failed', 'processing')
            ORDER BY ie.created_at ASC, ie.id ASC
            FOR UPDATE SKIP LOCKED
          ),
          updated AS (
            UPDATE inbox_events ie
            SET status = 'processing', locked_at = now(), locked_by = ${claimToken}
            FROM eligible
            WHERE ie.id = eligible.id
            RETURNING ie.id, ie.payload, ie.retry_count, ie.created_at
          )
          SELECT id, payload, retry_count, created_at
          FROM updated
          ORDER BY created_at ASC, id ASC
        `,
      );

      if (rows.length === 0) {
        await this.completeBatchClaim(phone, generation, claimToken);
        return 'processed';
      }

      const orchestrator = await this.buildOrchestrator(`batch:${phone}:${generation}`);
      const fragments = rows.map((row) => ({
        ...(row.payload as unknown as ParsedWebhookMessage),
        inboxEventId: row.id,
        createdAt: row.created_at,
      }));

      await orchestrator.handleInboundBatch(phone, fragments, generation);

      await this.prisma.inboxEvent.updateMany({
        where: { id: { in: fragments.map((f) => f.inboxEventId) }, lockedBy: claimToken },
        data: {
          status: 'processed',
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });

      await this.completeBatchClaim(phone, generation, claimToken);
      return 'processed';
    } catch (err: unknown) {
      const terminal = isNonRetryableError(err);
      const reason = persistenceErrorReason(err);

      if (terminal) {
        // El lote agregado es un solo turno: si un fragmento viola una regla
        // determinista (p. ej. SQLSTATE 23514 al reasignar línea), reintentar
        // el mismo lote fallará siempre. Se descarta a DLQ y se libera la
        // ventana para que el worker siga con el siguiente lote.
        const deadLettered = await this.prisma.$executeRaw`
          UPDATE inbox_events
          SET status = 'dead_lettered'::inbox_event_status,
              last_error = ${reason}, last_error_at = clock_timestamp(),
              locked_at = NULL, locked_by = NULL
          WHERE phone = ${phone} AND batch_generation = ${generation}
            AND status = 'processing' AND locked_by = ${claimToken}
        `;
        await this.completeBatchClaim(phone, generation, claimToken);
        log('error', 'inbox.batch_dead_lettered', `batch:${phone}:${generation}`, {
          phone,
          generation,
          deadLettered,
          ...prismaLogFields(err),
        });
        return 'processed';
      }

      // Fallo transitorio: se reprograma el lote y Cloud Tasks/reconciler
      // deciden el siguiente intento.
      await this.prisma.$executeRaw`
        UPDATE inbox_events
        SET status = CASE WHEN retry_count >= ${QUEUE_CONFIG.MAX_RETRIES} THEN 'dead_lettered' ELSE 'failed' END::inbox_event_status,
            retry_count = retry_count + 1,
            last_error = ${reason}, last_error_at = clock_timestamp(),
            locked_at = NULL, locked_by = NULL
        WHERE phone = ${phone} AND batch_generation = ${generation}
          AND status = 'processing' AND locked_by = ${claimToken}
      `;
      await this.prisma.batchWindowClaim.updateMany({
        where: { phone, batchGeneration: generation, claimToken },
        data: { claimLeaseUntil: new Date() },
      });
      throw err;
    }
  }

  async recoverBatchWindows(): Promise<void> {
    const now = new Date();
    const rows = await this.prisma.$queryRaw<
      Array<{ phone: string; batch_generation: number; batch_ready_at: Date }>
    >(
      Prisma.sql`
        SELECT phone, batch_generation, batch_ready_at
        FROM batch_windows
        WHERE batch_ready_at <= ${now}
        UNION ALL
        SELECT phone, batch_generation, claim_lease_until AS batch_ready_at
        FROM batch_window_claims
        WHERE completed_at IS NULL
          AND claim_lease_until <= ${now}
      `,
    );

    for (const row of rows) {
      // Una ventana envenenada no debe impedir reconciliar las demás.
      try {
        await this.processBatch(row.phone, row.batch_generation);
      } catch (err: unknown) {
        log('error', 'inbox.batch_recovery_failed', `${row.phone}:${row.batch_generation}`, {
          phone: row.phone,
          generation: row.batch_generation,
          ...prismaLogFields(err),
        });
      }
    }
  }

  private async upsertBatchWindow(
    phone: string,
    inboxEventId?: string,
  ): Promise<{ batch_generation: number; batch_ready_at: Date }> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'inbound:' + phone}, 0))`;
      const window = await tx.batchWindow.findUnique({ where: { phone } });
      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
      if (window?.batchReadyAt && window.batchReadyAt <= now) {
        // Seal an expired idle/capped window even if its worker has not started.
        await tx.batchWindowClaim.upsert({
          where: { phone_batchGeneration: { phone, batchGeneration: window.batchGeneration } },
          create: {
            phone,
            batchGeneration: window.batchGeneration,
            drainBoundary: window.batchReadyAt,
            // Already expired, so the reconciler can adopt a window whose worker never started.
            claimLeaseUntil: new Date(now.getTime() - 1),
          },
          update: {},
        });
        await tx.inboxEvent.updateMany({
          where: {
            phone,
            batchGeneration: null,
            createdAt: { lte: window.batchReadyAt },
            status: { in: ['pending', 'failed'] },
          },
          data: { batchGeneration: window.batchGeneration },
        });
        await tx.batchWindow.update({
          where: { phone },
          data: { windowOpenedAt: null, batchReadyAt: null },
        });
      }
      const updated = await tx.$queryRaw<
        { batch_generation: number; batch_ready_at: Date }[]
      >(Prisma.sql`
      INSERT INTO batch_windows AS bw (phone, batch_generation, batch_ready_at, window_opened_at, updated_at)
      VALUES (${phone}, 1, clock_timestamp() + ${Math.min(env.BATCHING_WINDOW_MS, env.BATCHING_MAX_WAIT_MS)} * INTERVAL '1 millisecond', clock_timestamp(), clock_timestamp())
      ON CONFLICT (phone) DO UPDATE SET
        batch_generation = bw.batch_generation + CASE WHEN bw.window_opened_at IS NULL THEN 1 ELSE 0 END,
        window_opened_at = COALESCE(bw.window_opened_at, clock_timestamp()),
        batch_ready_at = LEAST(
          COALESCE(bw.window_opened_at, clock_timestamp()) + ${env.BATCHING_MAX_WAIT_MS} * INTERVAL '1 millisecond',
          clock_timestamp() + ${env.BATCHING_WINDOW_MS} * INTERVAL '1 millisecond'
        ),
        updated_at = clock_timestamp()
      RETURNING batch_generation, batch_ready_at
    `);
      if (inboxEventId)
        await tx.inboxEvent.updateMany({
          where: { id: inboxEventId, batchGeneration: null, status: { in: ['pending', 'failed'] } },
          data: { batchGeneration: updated[0].batch_generation },
        });
      return updated;
    });
    if (!rows[0]) throw new Error('Batch window was not persisted');
    return rows[0];
  }

  private batchScheduleTime(readyAt: Date): { seconds: number; nanos: number } {
    const target = readyAt.getTime();
    return { seconds: Math.floor(target / 1000), nanos: (target % 1000) * 1_000_000 };
  }

  private async completeBatchClaim(
    phone: string,
    generation: number,
    claimToken: string,
  ): Promise<void> {
    await this.prisma.$queryRaw(
      Prisma.sql`
        UPDATE batch_window_claims
        SET completed_at = now()
        WHERE phone = ${phone}
          AND batch_generation = ${generation}
          AND claim_token = ${claimToken}
      `,
    );
  }

  private async buildOrchestrator(correlationId: string): Promise<MessageOrchestratorService> {
    return this.aiRuntimeFactory.buildOrchestrator(correlationId);
  }
}

function isParsedWebhookMessage(value: unknown): value is ParsedWebhookMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ParsedWebhookMessage>;
  return (
    typeof message.wamid === 'string' &&
    typeof message.phone === 'string' &&
    typeof message.timestamp === 'string' &&
    typeof message.phoneNumberId === 'string' &&
    Boolean(message.message) &&
    typeof message.message === 'object'
  );
}
