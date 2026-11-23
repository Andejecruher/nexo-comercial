import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { PrismaService } from '../prisma.service';
import { GcsMediaStorage } from './gcs-media-storage';
import { GoogleConfigurationError, GoogleProviderError } from '../ine/google-auth';
import type { WhatsAppProvider } from '../whatsapp/whatsapp.provider';
import { MEDIA_POLICY, safeFilename } from '../whatsapp/media-policy';
import { PrivateMediaStore } from '../whatsapp/private-media.store';
import { startExclusiveInterval } from '../../utils/exclusive-interval';
import { eventBus } from '../events/event-bus.service';
import { CriticalEventType, SocketEventName } from '../realtime/realtime-event.contracts';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import { withRealtimeTransaction } from '../realtime/realtime-transaction';

export const MEDIA_RECONCILE_BATCH_SIZE = 5;
export const MEDIA_CRON_RECONCILE_BATCH_SIZE = 30;

/** Attachment itself is the durable work item, independent of AI/inbox success. */
export class MessageMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: WhatsAppProvider,
    private readonly notifier?: RealtimeNotifier,
    private readonly storage = new GcsMediaStorage(),
    private readonly cache: Pick<PrivateMediaStore, 'delete'> = new PrivateMediaStore(),
  ) {}

  start(): () => void {
    const timer = startExclusiveInterval(
      () => this.reconcile(),
      MEDIA_POLICY.pollMs,
      () => console.error('[MessageMedia] Reconciliation failed'),
    );
    timer.unref();
    return () => clearInterval(timer);
  }

  async reconcile(batchSize = MEDIA_RECONCILE_BATCH_SIZE): Promise<void> {
    await this.prisma.attachment.updateMany({
      where: {
        processingState: { in: ['pending', 'processing'] },
        attempts: { gte: MEDIA_POLICY.maxAttempts },
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - MEDIA_POLICY.leaseMs) } }],
      },
      data: {
        processingState: 'failed',
        lockedAt: null,
        lastErrorCode: 'MEDIA_ATTEMPTS_EXHAUSTED',
      },
    });
    await this.prisma.attachment.updateMany({
      where: {
        processingState: 'processing',
        lockedAt: { lt: new Date(Date.now() - MEDIA_POLICY.leaseMs) },
      },
      data: { processingState: 'pending', lockedAt: null },
    });
    const rows = await this.prisma.attachment.findMany({
      where: {
        processingState: 'pending',
        nextAttemptAt: { lte: new Date() },
        attempts: { lt: MEDIA_POLICY.maxAttempts },
        messageId: { not: null },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: batchSize,
      include: { message: { include: { conversation: { include: { meta: true } } } } },
    });
    for (const row of rows) {
      const lockedAt = new Date();
      const claimed = await this.prisma.attachment.updateMany({
        where: { id: row.id, processingState: 'pending', attempts: row.attempts },
        data: { processingState: 'processing', lockedAt, attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      const lease = { id: row.id, processingState: 'processing', lockedAt };
      const finish = async (data: Prisma.AttachmentUpdateManyMutationInput): Promise<void> => {
        await withRealtimeTransaction(this.prisma, this.notifier, async (tx) => {
          const updated = await tx.attachment.updateMany({
            where: lease,
            data: {
              ...data,
              processingState: 'stored',
              lockedAt: null,
              storedAt: new Date(),
              lastErrorCode: null,
            },
          });
          if (updated.count && this.notifier?.isEnabled())
            await this.notifier.notifyCritical(tx, {
              eventId: randomUUID(),
              correlationId: row.id,
              schemaVersion: 1,
              eventType: CriticalEventType.ConversationUpdated,
              socketEventName: SocketEventName.ConversationUpdated,
              conversationId: row.message!.conversationId,
              occurredAt: new Date().toISOString(),
              source: 'message-media.service',
            });
        });
        if (!this.notifier?.isEnabled())
          eventBus.emit('conversation.updated', {
            conversationId: row.message!.conversationId,
            action: 'message',
            occurredAt: new Date().toISOString(),
            triggeredBy: 'system',
          });
      };
      try {
        const message = row.message;
        if (!message || !row.providerMediaId) throw new Error('MEDIA_REFERENCE_MISSING');
        const lineId = row.communicationLineId ?? message.conversation.meta?.communicationLineId;
        if (!lineId) throw new Error('MEDIA_LINE_MISSING');
        const key = this.storage.key(
          lineId,
          message.conversationId,
          row.id,
          row.originalFilename ?? message.messageType,
        );
        // Deterministic object names recover a completed upload even if the DB commit
        // failed and the original Meta download URL has since expired.
        const recovered = await this.storage.recover(key, row.id);
        if (recovered) {
          await finish(recovered);
          await this.evictCache(row.providerMediaId, lineId);
          continue;
        }
        const stream = await this.provider.downloadMediaStream(
          row.providerMediaId,
          row.providerPhoneNumberId
            ? { lineExternalIdentifier: row.providerPhoneNumberId, allowDefault: false }
            : { lineId: lineId!, allowDefault: false },
        );
        const stored = await this.storage.put({
          key,
          attachmentId: row.id,
          stream,
          mimeType: row.mimeType,
          kind: message.messageType,
          expectedHash: (message.meta as { media?: { sha256?: string } }).media?.sha256,
        });
        await finish({
          ...stored,
          originalFilename: safeFilename(row.originalFilename ?? message.messageType),
        });
        await this.evictCache(row.providerMediaId, lineId);
      } catch (error) {
        const code =
          error instanceof GoogleProviderError || error instanceof GoogleConfigurationError
            ? error.code
            : /^MEDIA_[A-Z_0-9]+$/.test((error as Error).message)
              ? (error as Error).message
              : 'MEDIA_PROCESSING_FAILED';
        const permanent =
          error instanceof GoogleConfigurationError ||
          (error instanceof GoogleProviderError &&
            !error.retryable &&
            !error.code.endsWith('_FAILED')) ||
          (error as { statusCode?: number }).statusCode === 400 ||
          /MEDIA_HTTP_(400|401|403|404)|REJECTED|REFERENCE_MISSING|LINE_MISSING|SIZE_EXCEEDED|HASH_MISMATCH/.test(
            code,
          );
        await this.prisma.attachment.updateMany({
          where: lease,
          data: {
            processingState:
              permanent || row.attempts + 1 >= MEDIA_POLICY.maxAttempts ? 'failed' : 'pending',
            lockedAt: null,
            lastErrorCode: code,
            nextAttemptAt: new Date(
              Date.now() +
                Math.min(600000, 1000 * 2 ** (row.attempts + 1)) +
                Math.floor(Math.random() * 1000),
            ),
          },
        });
      }
    }
  }

  /**
   * GCS now holds the durable bytes, so the local copy is pure duplication.
   * Best-effort: the TTL/size sweep retries whatever this misses.
   */
  private async evictCache(providerMediaId: string, lineId: string): Promise<void> {
    try {
      await this.cache.delete(providerMediaId, lineId);
    } catch {
      // Never fail an archive because the cache entry could not be removed.
    }
  }
}
