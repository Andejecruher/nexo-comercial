import { Prisma, RealtimeOutboxStatus } from '@prisma/client';
import { RealtimeDurableEvent, RealtimeEphemeralEvent } from './realtime-event.contracts';
import {
  logRealtimeBoundary,
  noopRealtimeMetrics,
  RealtimeMetrics,
} from './realtime-observability.service';
import { RealtimeTransport } from './realtime-transport.contracts';
import { recordRealtimeEvent } from './realtime-transaction';
import { RealtimeOutboxRelay } from './realtime-outbox-relay.service';
import { PrismaService } from '../prisma.service';
import { NotificationProjector } from '../notifications/notification-projector.service';

export type RealtimePrismaTransactionClient = {
  realtimeOutboxEvent: {
    create(args: {
      data: {
        id: string;
        eventType: string;
        socketEventName: string;
        payload: Prisma.InputJsonValue;
        status: RealtimeOutboxStatus;
        attempts: number;
      };
    }): Promise<unknown>;
  };
};

export class RealtimeNotifier {
  constructor(
    private readonly transport: RealtimeTransport | undefined,
    private readonly enabled: boolean = true,
    private readonly observability: {
      metrics?: RealtimeMetrics;
      prisma?: PrismaService;
      immediate?: boolean;
    } = {},
  ) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  async notifyCritical(
    tx: RealtimePrismaTransactionClient,
    event: RealtimeDurableEvent,
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!tx) {
      throw new Error('RealtimeNotifier.notifyCritical requires a transaction client');
    }

    const db = tx as unknown as import('@prisma/client').Prisma.TransactionClient;
    const version =
      'conversation' in tx
        ? await db.conversation.update({
            where: { id: event.conversationId },
            data: { realtimeVersion: { increment: 1 } },
            select: { realtimeVersion: true, meta: { select: { communicationLineId: true } } },
          })
        : undefined;
    const communicationLineId =
      event.communicationLineId ?? version?.meta?.communicationLineId ?? undefined;
    const envelope = {
      ...(communicationLineId ? { communicationLineId } : {}),
      ...event,
      ...(event.notificationPatch && communicationLineId
        ? { notificationPatch: { ...event.notificationPatch, communicationLineId } }
        : {}),
      ...(version?.realtimeVersion !== undefined
        ? { conversationVersion: version.realtimeVersion }
        : {}),
      ...('notification' in tx ? { notificationPersisted: true } : {}),
    };
    await tx.realtimeOutboxEvent.create({
      data: {
        id: event.eventId,
        eventType: event.eventType,
        socketEventName: event.socketEventName,
        payload: envelope,
        status: RealtimeOutboxStatus.pending,
        attempts: 0,
      },
    });
    recordRealtimeEvent(tx, event.eventId);
    if ('notification' in tx) await new NotificationProjector(db).project(envelope);

    const metrics = this.observability.metrics ?? noopRealtimeMetrics;
    metrics.incrementCounter('outbox_written', {
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      source: event.source,
      status: 'pending',
    });

    logRealtimeBoundary('info', 'RealtimeNotifier', 'outbox.write', {
      status: 'pending',
      eventId: event.eventId,
      correlationId: event.correlationId,
      eventType: event.eventType,
      socketEventName: event.socketEventName,
      source: event.source,
      conversationId: event.conversationId,
      attempts: 0,
    });
  }

  async notifyEphemeral(event: RealtimeEphemeralEvent): Promise<void> {
    if (!this.transport) {
      return;
    }
    await this.transport.publish(event);
  }

  async publishCommitted(eventIds: string[]): Promise<void> {
    if (
      !this.enabled ||
      !this.transport ||
      !this.observability.prisma ||
      this.observability.immediate === false
    )
      return;
    const relay = new RealtimeOutboxRelay(this.observability.prisma, this.transport, {
      metrics: this.observability.metrics,
      instanceId: 'post-commit',
    });
    for (const eventId of eventIds) {
      try {
        await relay.processEventById(eventId);
      } catch (error) {
        // The committed outbox and independent relay own recovery.
        logRealtimeBoundary('warn', 'RealtimeNotifier', 'post_commit.publish', {
          eventId,
          status: 'recoverable_failure',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
