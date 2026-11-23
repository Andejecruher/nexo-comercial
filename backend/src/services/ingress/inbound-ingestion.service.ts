import { InboxEvent, MessageType, Prisma } from '@prisma/client';
import { env } from '../../config/env.config';
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../../database/transaction-options';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { MessageRepository } from '../../repositories/message.repository';
import { ParsedWebhookMessage, extractMessageText } from '../../utils/wa-message-parser';
import { inboundContent, internalMessageType } from '../message-content';
import { PrismaService } from '../prisma.service';
import {
  buildConversationUpdatedEvent,
  buildMessageCreatedEvent,
} from '../realtime/message-event.builder';
import { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import { withRealtimeTransaction } from '../realtime/realtime-transaction';
import { TicketService } from '../tickets/ticket.service';

/** Persists visible state before the debounce/AI turn. No AI dependencies. */
export class InboundIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: RealtimeNotifier,
    private readonly tickets: TicketService,
  ) {}

  async ingest(input: ParsedWebhookMessage, correlationId: string): Promise<InboxEvent> {
    // Retry the entire transaction: a unique violation aborts PostgreSQL's TX.
    for (let attempt = 0; ; attempt++) {
      try {
        return await withRealtimeTransaction(
          this.prisma,
          this.notifier,
          async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'inbound:' + input.phone}, 0))`;
            const inbox = await tx.inboxEvent.upsert({
              where: { wamid: input.wamid },
              update: {},
              create: {
                wamid: input.wamid,
                phone: input.phone,
                payload: input as unknown as Prisma.InputJsonValue,
                idempotencyKey: input.wamid,
                correlationId,
              },
            });
            if (inbox.ingestedAt) return inbox;
            const db = tx as unknown as PrismaService;
            const messages = new MessageRepository(db);
            const existing = await messages.findByExternalId(input.message.id);
            if (existing)
              return tx.inboxEvent.update({
                where: { id: inbox.id },
                data: { ingestedAt: new Date(), messageId: existing.id, correlationId },
              });
            const citizen = await new CitizenRepository(db).findOrCreate(
              input.phone,
              input.profileName,
            );
            const conversations = new ConversationRepository(db);
            const line = await conversations.findActiveCommunicationLineByExternalIdentifier(
              input.phoneNumberId,
            );
            if (!line) throw new Error('Línea receptora desconocida o inactiva');
            const conversation = await conversations.findOrCreateCanonical(citizen.id, {
              communicationLineId: line.id,
            });
            const context = await conversations.getConversationContext(conversation.id);
            const ticketService = this.tickets.inTransaction(tx, correlationId);
            const { ticket } = await ticketService.getOrCreateActiveTicket(
              conversation.id,
              citizen.id,
            );
            const message = await messages.createInTransaction(tx, {
              conversationId: conversation.id,
              ticketId: ticket.id,
              body: extractMessageText(input.message) ?? '',
              direction: 'inbound',
              messageType: this.messageType(input.message.type),
              externalMessageId: input.message.id,
              meta: {
                ...inboundContent(input.message, input.phoneNumberId),
                ...(line ? { lineId: line.id } : {}),
              },
            });
            await ticketService.attachMessageToTicket(ticket.id, message.id);
            {
              const snapshot = {
                contactName: citizen.name ?? undefined,
                phone: input.phone,
                flowState: context?.meta?.flowState ?? 'BOT_FLOW',
                channel: context?.channel,
                departmentSlug: context?.meta?.departmentSlug ?? undefined,
                assignedUserId: context?.assignedUserId ?? undefined,
                // Línea resuelta desde el webhook (phoneNumberId) y enlazada arriba.
                communicationLineId: line?.id,
              };
              const received = buildMessageCreatedEvent(
                message,
                conversation.id,
                correlationId,
                message.createdAt.toISOString(),
                snapshot,
              );
              received.notificationPatch = { ...received.notificationPatch!, ticketId: ticket.id };
              await this.notifier.notifyCritical(tx, received);
              await this.notifier.notifyCritical(
                tx,
                buildConversationUpdatedEvent(
                  conversation.id,
                  correlationId,
                  message.createdAt.toISOString(),
                  snapshot.flowState,
                  message,
                  snapshot,
                ),
              );
            }
            return tx.inboxEvent.update({
              where: { id: inbox.id },
              data: { ingestedAt: new Date(), messageId: message.id, correlationId },
            });
          },
          PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
        );
      } catch (error) {
        if (attempt >= 2 || !['P2002', 'P2034'].includes((error as { code?: string }).code ?? ''))
          throw error;
      }
    }
  }

  private messageType(type: string): MessageType {
    return internalMessageType(type);
  }
}

export function eagerIngestionEnabled(): boolean {
  return env.REALTIME_DURABLE_ENABLED && env.INBOUND_EAGER_INGESTION_ENABLED;
}
