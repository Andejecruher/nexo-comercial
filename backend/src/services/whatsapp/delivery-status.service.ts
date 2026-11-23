import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../prisma.service';
import { MessageRepository } from '../../repositories/message.repository';
import type { ParsedWebhookStatus } from '../../utils/wa-message-parser';
import { withRealtimeTransaction } from '../realtime/realtime-transaction';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import {
  CriticalEventType,
  SocketEventName,
  type RealtimeDurableEvent,
} from '../realtime/realtime-event.contracts';
import { eventBus } from '../events/event-bus.service';
import { startExclusiveInterval } from '../../utils/exclusive-interval';

export const DELIVERY_STATUS_RECONCILE_BATCH_SIZE = 50;
export const DELIVERY_STATUS_CRON_RECONCILE_BATCH_SIZE = 200;

/** Early statuses remain durable even before the outbound wamid is bound to a Message. */
export class DeliveryStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: MessageRepository,
    private readonly notifier?: RealtimeNotifier,
  ) {}
  async apply(statuses: ParsedWebhookStatus[]): Promise<boolean> {
    let complete = true;
    for (const status of statuses) {
      try {
        let legacy: RealtimeDurableEvent | undefined;
        await withRealtimeTransaction(this.prisma, this.notifier, async (tx) => {
          const outcome = await this.repository.upsertStatusInTransaction(tx, {
            wamid: status.wamid,
            status: status.status,
            timestamp: new Date(Number(status.timestamp) * 1000),
            errorCode: status.errorCode,
            errorTitle: status.errorTitle,
          });
          if (!outcome) {
            complete = false;
            return;
          }
          if (!outcome.created) return;
          const event: RealtimeDurableEvent = {
            eventId: randomUUID(),
            correlationId: status.wamid,
            schemaVersion: 1,
            eventType: CriticalEventType.MessageStatusChanged,
            socketEventName: SocketEventName.MessageStatusChanged,
            occurredAt: new Date().toISOString(),
            source: 'webhook.controller',
            conversationId: outcome.conversationId,
            messageStatusPatch: {
              messageId: outcome.messageId,
              providerMessageId: outcome.wamid,
              status: outcome.status,
              timestamp: outcome.timestamp.toISOString(),
            },
          };
          if (this.notifier?.isEnabled()) await this.notifier.notifyCritical(tx, event);
          else legacy = event;
        });
        if (legacy) eventBus.emit('message.status.changed', legacy);
      } catch {
        complete = false;
      }
    }
    return complete;
  }
  start(): () => void {
    const timer = startExclusiveInterval(
      () => this.reconcile(),
      5000,
      () => console.error('[DeliveryStatus] Reconciliation failed'),
    );
    timer.unref();
    return () => clearInterval(timer);
  }
  async reconcile(batchSize = DELIVERY_STATUS_RECONCILE_BATCH_SIZE): Promise<void> {
    const logs = await this.prisma.webhookEventLog.findMany({
      where: {
        processedOk: false,
        errorMessage: null,
        rawPayload: { path: ['kind'], equals: 'delivery-receipts-v1' },
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    for (const log of logs) {
      const payload = log.rawPayload as unknown as {
        statuses: ParsedWebhookStatus[];
        attempts: number;
        nextAttemptAt?: number;
      };
      if (payload.nextAttemptAt && payload.nextAttemptAt > Date.now()) continue;
      const complete = await this.apply(payload.statuses);
      const attempts = payload.attempts + 1;
      await this.prisma.webhookEventLog.updateMany({
        where: {
          id: log.id,
          processedOk: false,
          rawPayload: { equals: log.rawPayload as Prisma.InputJsonValue },
        },
        data: complete
          ? { processedOk: true }
          : attempts >= 10
            ? { errorMessage: 'DELIVERY_RECONCILIATION_EXHAUSTED' }
            : {
                rawPayload: {
                  ...payload,
                  attempts,
                  nextAttemptAt: Date.now() + Math.min(600000, 1000 * 2 ** attempts),
                } as unknown as Prisma.InputJsonValue,
              },
      });
    }
  }
}
