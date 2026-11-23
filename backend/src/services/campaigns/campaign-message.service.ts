import type { Prisma } from '@prisma/client';
import { env } from '../../config/env.config';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { TicketRepository } from '../../repositories/ticket.repository';
import { MessageRepository } from '../../repositories/message.repository';
import { PrismaService } from '../prisma.service';
import { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import {
  buildMessageCreatedEvent,
  buildConversationUpdatedEvent,
} from '../realtime/message-event.builder';
import { withRealtimeTransaction } from '../realtime/realtime-transaction';
import { TicketService } from '../tickets/ticket.service';
import { record, textValue } from '../message-content';

/** Projects provider-accepted campaign sends into the same immutable chat history. */
export class CampaignMessageService {
  constructor(private readonly prisma: PrismaService) {}
  async sync(recipientId: string): Promise<void> {
    const notifier = new RealtimeNotifier(undefined, env.REALTIME_DURABLE_ENABLED);
    await withRealtimeTransaction(this.prisma, notifier, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'campaign-message:' + recipientId}, 0))`;
      const row = await tx.campaignRecipient.findUnique({
        where: { id: recipientId },
        include: { campaign: true },
      });
      if (!row?.messageId) return;
      const idempotencyKey = `campaign:${row.id}`;
      const existing = await tx.message.findUnique({ where: { idempotencyKey } });
      const db = tx as unknown as PrismaService;
      const messages = new MessageRepository(db);
      let message = existing;
      if (!message) {
        const citizen = row.citizenId
          ? await tx.citizen.findUnique({ where: { id: row.citizenId } })
          : await new CitizenRepository(db).findOrCreate(row.phone);
        if (!citizen) return;
        const conversation = await new ConversationRepository(db).findOrCreateCanonical(
          citizen.id,
          { communicationLineId: row.campaign.lineId },
        );
        const context = await tx.conversationMeta.findUnique({
          where: { conversationId: conversation.id },
        });
        if (!context?.communicationLineId)
          await new ConversationRepository(db).bindCommunicationLine(
            conversation.id,
            row.campaign.lineId,
          );
        const ticket = (
          await new TicketService(new TicketRepository(db)).getOrCreateActiveTicket(
            conversation.id,
            citizen.id,
          )
        ).ticket;
        const snapshot = record(row.campaign.templateSnapshot);
        const components = Array.isArray(snapshot.components)
          ? snapshot.components.map(record)
          : [];
        const values = record(row.variables);
        const body = textValue(components.find((c) => c.type === 'BODY')?.text).replace(
          /\{\{([^{}]+)\}\}/g,
          (token, key: string) =>
            typeof values[`body.${key}`] === 'string' ? String(values[`body.${key}`]) : token,
        );
        message = await messages.createInTransaction(tx, {
          conversationId: conversation.id,
          ticketId: ticket.id,
          direction: 'outbound',
          messageType: 'template',
          body,
          createdAt: row.acceptedAt ?? row.sentAt ?? row.createdAt,
          externalMessageId: row.messageId,
          idempotencyKey,
          sendByUserId: row.campaign.createdBy,
          meta: {
            campaignId: row.campaignId,
            lineId: row.campaign.lineId,
            templateSnapshot: { ...snapshot, version: 1, values },
          },
        });
        const at = message.createdAt.toISOString();
        await notifier.notifyCritical(
          tx,
          buildMessageCreatedEvent(message, conversation.id, row.id, at),
        );
        await notifier.notifyCritical(
          tx,
          buildConversationUpdatedEvent(
            conversation.id,
            row.id,
            at,
            context?.flowState ?? 'BOT_FLOW',
            message,
          ),
        );
      }
      const states: Array<[Prisma.MessageStatusCreateInput['status'], Date | null]> = [
        ['sent', row.sentAt],
        ['delivered', row.deliveredAt],
        ['read', row.readAt],
        ['failed', row.failedAt],
      ];
      for (const [status, timestamp] of states)
        if (timestamp)
          await messages.upsertStatusInTransaction(tx, { wamid: row.messageId, status, timestamp });
    });
  }
}
