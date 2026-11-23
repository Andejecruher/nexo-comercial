import { AppError } from '../../utils/app-error';
import { normalizePhoneForStorage } from '../../utils/phone-normalizer';
import { randomUUID } from 'crypto';
import { MetaApiError } from '../../utils/meta-error-parser';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import { CriticalEventType, SocketEventName } from '../realtime/realtime-event.contracts';
import { withRealtimeTransaction } from '../realtime/realtime-transaction';
import { eventBus } from './event-bus.service';
/**
 * OutboxProcessorService — consuming de eventos outbound (envíos a Meta).
 *
 * Request-driven: `enqueue` persiste el evento y (si hay Cloud Tasks) lo
 * despacha para que el worker lo procese vía `processEventById`. En modo
 * `polling` local, `start()` reclama lotes directamente de la tabla
 * `outbox_events` (sin colas Redis). Los reintentos los orquesta
 * `next_retry_at` + el reconciler: no hay re-enqueue interno.
 */
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.config';
import { QUEUE_CONFIG } from '../../config/messaging.constants';
import { MessageRepository } from '../../repositories/message.repository';
import { WaOutboundMessage, WaSendMessageResponse } from '../../types/whatsapp.types';
import { startExclusiveInterval } from '../../utils/exclusive-interval';
import { prismaLogFields } from '../../utils/prisma-errors';
import { createStructuredLogger } from '../../utils/structured-logger';
import { PrismaService } from '../prisma.service';
import {
  BackgroundTaskDispatcher,
  BackgroundTaskResult,
} from '../tasks/cloud-tasks-dispatcher.service';
import { WhatsAppLineContext } from '../whatsapp/whatsapp-line-config.resolver';
import { WhatsAppProvider } from '../whatsapp/whatsapp.provider';
import { OutboxLineContext, parseOutboxPayload, serializeOutboxPayload } from './outbox-payload';

const log = createStructuredLogger('OutboxProcessor');
const QUEUE_LEASE_MS = 5 * 60_000;

const MISSING_WAMID_ERROR = 'Provider returned success without message id';

interface OutboxWorkItem {
  outboxEventId: string;
  phone: string;
  waPayload: WaOutboundMessage;
  lineContext?: OutboxLineContext;
  retryCount: number;
  correlationId: string;
  wamid?: string;
}

type OutboxClaimRow = {
  id: string;
  phone: string;
  payload: Prisma.JsonValue;
  retryCount: number;
  idempotencyKey: string | null;
  wamid: string | null;
};

function extractProviderMessageId(response: WaSendMessageResponse): string | undefined {
  const id = response.messages?.[0]?.id;
  if (typeof id !== 'string') return undefined;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class OutboxProcessorService {
  private isRunning = false;
  private processIntervalHandle: ReturnType<typeof setInterval> | undefined;
  private readonly pollIntervalMs: number;
  private readonly messageRepo: MessageRepository;
  private readonly realtimeNotifier?: RealtimeNotifier;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappProvider: WhatsAppProvider,
    private readonly taskDispatcher?: BackgroundTaskDispatcher,
    options: { pollIntervalMs?: number; realtimeNotifier?: RealtimeNotifier } = {},
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? env.OUTBOX_POLL_INTERVAL_MS;
    this.realtimeNotifier = options.realtimeNotifier;
    this.messageRepo = new MessageRepository(prisma);
  }

  async enqueue(
    phone: string,
    waPayload: WaOutboundMessage,
    idempotencyKey: string,
    conversationId?: string,
    lineContext?: OutboxLineContext,
  ): Promise<void> {
    const existing = await this.prisma.outboxEvent.findUnique({ where: { idempotencyKey } });
    if (existing) {
      log('debug', 'outbox.duplicate_ignored', idempotencyKey, {
        outboxEventId: existing.id,
      });

      if (this.taskDispatcher) {
        await this.taskDispatcher.dispatchOutboxEvent(existing.id);
      }
      return;
    }

    const outboxEvent = await this.prisma.outboxEvent.create({
      data: {
        phone,
        payload: serializeOutboxPayload(waPayload, lineContext) as object,
        idempotencyKey,
        conversationId,
      },
    });

    if (this.taskDispatcher) {
      await this.taskDispatcher.dispatchOutboxEvent(outboxEvent.id);
      return;
    }

    log('debug', 'outbox.enqueued', idempotencyKey, {
      outboxEventId: outboxEvent.id,
      dispatched: false,
    });
  }

  async processEventById(outboxEventId: string): Promise<BackgroundTaskResult> {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id: outboxEventId } });
    if (!event) return 'not_found';
    if (['sent', 'dead_lettered'].includes(event.status)) return 'noop';
    if (
      event.status === 'sending' &&
      event.lockedAt &&
      event.lockedAt.getTime() > Date.now() - QUEUE_LEASE_MS
    ) {
      throw new Error('Outbox event is still being sent');
    }

    const payload = parseOutboxPayload(event.payload);
    if (!payload) {
      await this.prisma.outboxEvent.updateMany({
        where: { id: outboxEventId, status: { in: ['pending', 'failed', 'sending'] } },
        data: {
          status: 'dead_lettered',
          lastError: 'Invalid persisted outbox payload',
          lockedAt: null,
          lockedBy: null,
        },
      });
      return 'processed';
    }

    const claimed = await this.claimOutboxEvent(outboxEventId, event.retryCount);
    if (!claimed) return 'noop';

    await this.processItem(
      {
        outboxEventId,
        phone: event.phone,
        waPayload: payload.waPayload,
        ...(payload.lineContext ? { lineContext: payload.lineContext } : {}),
        retryCount: event.retryCount,
        correlationId: event.idempotencyKey,
        ...(typeof event.wamid === 'string' && event.wamid.trim().length > 0
          ? { wamid: event.wamid.trim() }
          : {}),
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
        log('error', 'outbox.batch_failed', undefined, prismaLogFields(err));
      },
    );
    log('debug', 'outbox.worker_started');
  }

  stop(): void {
    if (this.processIntervalHandle) {
      clearInterval(this.processIntervalHandle);
      this.processIntervalHandle = undefined;
    }
    this.isRunning = false;
    log('debug', 'outbox.worker_stopped');
  }

  private async processNextBatch(): Promise<void> {
    const items = await this.claimDbBatch();
    await Promise.allSettled(items.map((item) => this.processItem(item)));
  }

  private async processItem(item: OutboxWorkItem, propagateFailure = false): Promise<void> {
    const { outboxEventId, waPayload } = item;

    try {
      const checkpointedWamid = item.wamid?.trim() || undefined;
      const wamid = checkpointedWamid ?? (await this.sendAndCheckpoint(item, waPayload));

      if (!wamid) {
        log('error', 'outbox.missing_wamid', item.correlationId, { outboxEventId });
        await this.prisma.outboxEvent.updateMany({
          where: { id: outboxEventId, status: 'sending' },
          data: {
            status: 'dead_lettered',
            lastError: MISSING_WAMID_ERROR,
            nextRetryAt: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await this.messageRepo.bindProviderMessageId(tx, {
          idempotencyKey: item.correlationId,
          wamid,
        });

        await tx.outboxEvent.updateMany({
          where: { id: outboxEventId, status: 'sending' },
          data: {
            status: 'sent',
            sentAt: new Date(),
            wamid,
            nextRetryAt: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
      });
    } catch (err: unknown) {
      if (err instanceof AppError && err.code === 'WHATSAPP_WINDOW_CLOSED') {
        await this.prisma.outboxEvent.updateMany({
          where: { id: outboxEventId, status: 'sending' },
          data: { status: 'dead_lettered', lastError: err.code, lockedAt: null, lockedBy: null },
        });
        const message = await this.prisma.message.findUnique({
          where: { idempotencyKey: item.correlationId },
        });
        if (message)
          await this.prisma.messageStatus.create({
            data: {
              messageId: message.id,
              wamid: message.externalMessageId ?? item.correlationId,
              status: 'failed',
              timestamp: new Date(),
              errorTitle: err.message,
            },
          });
        return;
      }
      const errorMsg =
        err instanceof MetaApiError
          ? `META_${err.code}`
          : err instanceof Error
            ? err.name
            : 'OUTBOX_SEND_FAILED';
      log('error', 'outbox.item_failed', item.correlationId, {
        outboxEventId,
        retryCount: item.retryCount,
        errorType: err instanceof Error ? err.name : 'UnknownError',
      });

      const retryCount = item.retryCount + 1;
      const delaySeconds = QUEUE_CONFIG.RETRY_DELAYS_SECONDS[item.retryCount] ?? 600;
      const uncertain =
        err instanceof Error && ['AbortError', 'TimeoutError', 'TypeError'].includes(err.name);
      const terminal =
        uncertain ||
        retryCount > QUEUE_CONFIG.MAX_RETRIES ||
        (err instanceof MetaApiError && !err.retryable);
      const nextRetryAt = terminal
        ? null
        : new Date(Date.now() + delaySeconds * 1000 + Math.floor(Math.random() * 1000));

      const failureUpdate = {
        where: { id: outboxEventId, status: 'sending' as const },
        data: {
          retryCount: { increment: 1 },
          lastError: errorMsg,
          status: terminal ? ('dead_lettered' as const) : ('failed' as const),
          nextRetryAt,
          lockedAt: null,
          lockedBy: null,
        },
      };

      if (terminal && this.realtimeNotifier) {
        let legacyConversationId: string | undefined;
        const deliveryState = uncertain ? 'uncertain' : 'failed';
        await withRealtimeTransaction(this.prisma, this.realtimeNotifier, async (tx) => {
          await tx.outboxEvent.updateMany(failureUpdate);
          const rows = await tx.$queryRaw<Array<{ conversationId: string }>>`
            UPDATE messages SET meta = jsonb_set(jsonb_set(meta, '{deliveryState}', to_jsonb(${deliveryState}::text)), '{deliveryErrorCode}', to_jsonb(${errorMsg}::text))
            WHERE idempotency_key = ${item.correlationId} RETURNING conversation_id AS "conversationId"`;
          const conversationId = rows[0]?.conversationId;
          if (!conversationId) return;
          if (this.realtimeNotifier?.isEnabled())
            await this.realtimeNotifier.notifyCritical(tx, {
              eventId: randomUUID(),
              correlationId: item.correlationId,
              schemaVersion: 1,
              eventType: CriticalEventType.ConversationUpdated,
              socketEventName: SocketEventName.ConversationUpdated,
              occurredAt: new Date().toISOString(),
              source: 'outbox-processor.service',
              conversationId,
            });
          else legacyConversationId = conversationId;
        });
        if (legacyConversationId)
          eventBus.emit('conversation.updated', {
            conversationId: legacyConversationId,
            action: 'message',
            occurredAt: new Date().toISOString(),
            triggeredBy: 'system',
          });
      } else await this.prisma.outboxEvent.updateMany(failureUpdate);
      if (propagateFailure) throw err;
    }
  }

  private async sendAndCheckpoint(
    item: OutboxWorkItem,
    waPayload: WaOutboundMessage,
  ): Promise<string | undefined> {
    const resolvedLineContext = await this.resolveLineContext(item);
    if (waPayload.type !== 'template') {
      const event = await this.prisma.outboxEvent.findUnique({
        where: { id: item.outboxEventId },
        select: { conversationId: true },
      });
      const conversation = event?.conversationId
        ? { id: event.conversationId }
        : await this.prisma.conversation.findFirst({
            where: {
              isCanonical: true,
              communicationLineId: resolvedLineContext?.lineId ?? null,
              citizen: { phone: normalizePhoneForStorage(item.phone) },
            },
            select: { id: true },
          });
      if (!conversation || !(await this.messageRepo.customerWindow(conversation.id)).isOpen)
        throw new AppError('La ventana de atención ha expirado', 409, 'WHATSAPP_WINDOW_CLOSED');
    }
    const response = await this.whatsappProvider.send(waPayload, resolvedLineContext);
    const wamid = extractProviderMessageId(response);
    if (!wamid) return undefined;

    await this.prisma.outboxEvent.updateMany({
      where: { id: item.outboxEventId, status: 'sending' },
      data: { wamid },
    });

    return wamid;
  }

  private async claimDbBatch(): Promise<OutboxWorkItem[]> {
    const rows = await this.prisma.$queryRaw<OutboxClaimRow[]>(Prisma.sql`
      WITH eligible AS (
        SELECT oe.id
        FROM outbox_events oe
        WHERE oe.status = 'pending'
          OR (
            oe.status = 'failed'
            AND oe.retry_count <= ${QUEUE_CONFIG.MAX_RETRIES}
            AND (oe.next_retry_at IS NULL OR oe.next_retry_at <= now())
          )
          OR (
            oe.status = 'sending'
            AND (
              oe.locked_at IS NULL
              OR oe.locked_at <= now() - make_interval(secs => ${QUEUE_LEASE_MS / 1000})
            )
          )
        ORDER BY oe.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT ${QUEUE_CONFIG.OUTBOX_BATCH_SIZE}
      )
      UPDATE outbox_events oe
      SET status = 'sending', locked_at = now(), locked_by = 'outbox-poller'
      FROM eligible
      WHERE oe.id = eligible.id
      RETURNING
        oe.id,
        oe.phone,
        oe.payload,
        oe.retry_count AS "retryCount",
        oe.idempotency_key AS "idempotencyKey",
        oe.wamid
    `);

    return rows.map((row) => {
      const parsed = parseOutboxPayload(row.payload);
      return {
        outboxEventId: row.id,
        phone: row.phone,
        waPayload: parsed?.waPayload ?? (row.payload as unknown as WaOutboundMessage),
        ...(parsed?.lineContext ? { lineContext: parsed.lineContext } : {}),
        retryCount: row.retryCount,
        correlationId: row.idempotencyKey ?? row.id,
        ...(typeof row.wamid === 'string' && row.wamid.trim().length > 0
          ? { wamid: row.wamid.trim() }
          : {}),
      };
    });
  }

  private async claimOutboxEvent(outboxEventId: string, retryCount: number): Promise<boolean> {
    const staleBefore = new Date(Date.now() - QUEUE_LEASE_MS);
    const claimResult = await this.prisma.outboxEvent.updateMany({
      where: {
        id: outboxEventId,
        retryCount,
        OR: [
          { status: { in: ['pending', 'failed'] } },
          {
            status: 'sending',
            OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
          },
        ],
      },
      data: {
        status: 'sending',
        lockedAt: new Date(),
        lockedBy: `worker-${process.pid}`,
      },
    });

    return claimResult.count === 1;
  }

  private async resolveLineContext(item: OutboxWorkItem): Promise<WhatsAppLineContext> {
    let lineId = item.lineContext?.lineId;
    let lineExternalIdentifier = item.lineContext?.lineExternalIdentifier;

    if (!lineId || !lineExternalIdentifier) {
      const outboxEvent = await this.prisma.outboxEvent.findUnique({
        where: { id: item.outboxEventId },
        select: { conversationId: true },
      });

      const conversationId = outboxEvent?.conversationId;

      if (conversationId) {
        type ConversationLineRow = {
          communicationLineId: string | null;
          externalIdentifier: string | null;
        };

        const rows = await this.prisma.$queryRaw<ConversationLineRow[]>(Prisma.sql`
          SELECT
            cm.communication_line_id AS "communicationLineId",
            cl.external_identifier AS "externalIdentifier"
          FROM conversation_meta cm
          LEFT JOIN communication_lines cl ON cl.id = cm.communication_line_id
          WHERE cm.conversation_id = ${conversationId}::uuid
          LIMIT 1
        `);

        const conversationLine = rows[0];

        if (!lineId && typeof conversationLine?.communicationLineId === 'string') {
          lineId = conversationLine.communicationLineId;
        }

        if (!lineExternalIdentifier && typeof conversationLine?.externalIdentifier === 'string') {
          lineExternalIdentifier = conversationLine.externalIdentifier;
        }
      }
    }

    return {
      ...(lineId ? { lineId } : {}),
      ...(lineExternalIdentifier ? { lineExternalIdentifier } : {}),
      allowDefault: true,
    };
  }
}
