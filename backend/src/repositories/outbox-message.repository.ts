import { RealtimeNotifier } from '../services/realtime/realtime-notifier.service';
import { withRealtimeTransaction } from '../services/realtime/realtime-transaction';
import {
  buildMessageCreatedEvent,
  buildConversationUpdatedEvent,
} from '../services/realtime/message-event.builder';
import { type Message, MessageDirection, MessageType, Prisma } from '@prisma/client';
import type { WaTextOutbound } from '../types/whatsapp.types';
import { PrismaService } from '../services/prisma.service';

export class OutboxMessageRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier?: RealtimeNotifier,
  ) {}

  async createOutboundTextWithOutbox(params: {
    conversationId: string;
    phone: string;
    body: string;
    idempotencyKey: string;
    waPayload: WaTextOutbound;
    ticketId?: string;
  }): Promise<{ messageId: string; isReplay: boolean }> {
    return withRealtimeTransaction(this.prisma, this.notifier, async (tx) => {
      const existingOutbox = await tx.outboxEvent.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });

      if (existingOutbox) {
        const existingMessage = await this.findCorrelatedMessage(tx, params);

        if (existingMessage) {
          return { messageId: existingMessage.id, isReplay: true };
        }

        const repairedMessage = await tx.message.create({
          data: {
            conversationId: params.conversationId,
            ...(params.ticketId ? { ticketId: params.ticketId } : {}),
            body: params.body,
            direction: MessageDirection.outbound,
            messageType: MessageType.text,
            idempotencyKey: params.idempotencyKey,
            meta: { source: 'ai-tool', idempotencyKey: params.idempotencyKey, replayRepair: true },
          },
        });

        await this.notifyCreated(tx, repairedMessage, params);
        return { messageId: repairedMessage.id, isReplay: true };
      }

      await tx.outboxEvent.create({
        data: {
          phone: params.phone,
          payload: params.waPayload as object,
          idempotencyKey: params.idempotencyKey,
          conversationId: params.conversationId,
        },
      });

      const message = await tx.message.create({
        data: {
          conversationId: params.conversationId,
          ...(params.ticketId ? { ticketId: params.ticketId } : {}),
          body: params.body,
          direction: MessageDirection.outbound,
          messageType: MessageType.text,
          idempotencyKey: params.idempotencyKey,
          meta: { source: 'ai-tool', idempotencyKey: params.idempotencyKey },
        },
      });

      await this.notifyCreated(tx, message, params);
      return { messageId: message.id, isReplay: false };
    });
  }

  private async notifyCreated(
    tx: Prisma.TransactionClient,
    message: Message,
    params: { conversationId: string; idempotencyKey: string; ticketId?: string },
  ): Promise<void> {
    if (!this.notifier?.isEnabled()) return;
    if (params.ticketId)
      await tx.ticketMessage.upsert({
        where: { ticketId_messageId: { ticketId: params.ticketId, messageId: message.id } },
        create: { ticketId: params.ticketId, messageId: message.id, actorType: 'BOT' },
        update: {},
      });
    const context = await tx.conversation.findUniqueOrThrow({
      where: { id: params.conversationId },
      include: { meta: true },
    });
    await this.notifier.notifyCritical(
      tx,
      buildMessageCreatedEvent(
        message,
        params.conversationId,
        params.idempotencyKey,
        message.createdAt.toISOString(),
        { communicationLineId: context.meta?.communicationLineId ?? undefined },
      ),
    );
    await this.notifier.notifyCritical(
      tx,
      buildConversationUpdatedEvent(
        params.conversationId,
        params.idempotencyKey,
        message.createdAt.toISOString(),
        context.meta?.flowState ?? 'BOT_FLOW',
        message,
      ),
    );
  }

  private async findCorrelatedMessage(
    tx: Prisma.TransactionClient,
    params: { conversationId: string; idempotencyKey: string },
  ): Promise<{ id: string } | null> {
    const byKey = await tx.message.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
      select: { id: true },
    });
    if (byKey) return byKey;

    return tx.message.findFirst({
      where: {
        conversationId: params.conversationId,
        direction: MessageDirection.outbound,
        externalMessageId: params.idempotencyKey,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  }
}
