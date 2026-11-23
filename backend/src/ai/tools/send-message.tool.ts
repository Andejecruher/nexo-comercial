import { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
/**
 * SendMessageTool — internal AI tool.
 *
 * Responsabilidad:
 *  - Validar phone y body.
 *  - Garantizar que el ciudadano y su conversación existan.
 *  - Crear mensaje outbound (direction=outbound, messageType=text).
 *  - Encolar payload en outbox_events (NO envía directamente).
 *  - Idempotency key externo (o autogenerado) para reintentos seguros sin duplicados.
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 *
 * Diseño extensible:
 *  - `messageType` ya es parámetro; en el futuro aceptará 'image' | 'template' | 'interactive'.
 *  - `templateName` / `components` son placeholders opcionales para templates WA en el futuro.
 */
import * as crypto from 'crypto';
import { z } from 'zod';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { OutboxMessageRepository } from '../../repositories/outbox-message.repository';
import { OutboxProcessorService } from '../../services/events/outbox-processor.service';
import { PrismaService } from '../../services/prisma.service';
import { TicketService } from '../../services/tickets/ticket.service';
import { WaTextOutbound } from '../../types/whatsapp.types';
import { createStructuredLogger } from '../../utils/structured-logger';

const log = createStructuredLogger('SendMessageTool');

export const sendMessageSchema = z.object({
  phone: z.string().trim().min(7).max(20),
  body: z.string().trim().min(1).max(4096),
  /**
   * Tipo de mensaje. Por ahora solo 'text'. Se añadirán 'image', 'template', 'interactive'.
   */
  messageType: z.enum(['text', 'template', 'interactive', 'image']).default('text'),
  /**
   * ID de conversación existente. Si no se provee, se abre o recupera la conversación activa.
   */
  conversationId: z.string().uuid().optional(),
  /**
   * Clave de idempotencia externa. Si no se provee, se genera automáticamente.
   * Útil cuando el agente reintenta la tool con el mismo key.
   */
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  /**
   * Placeholder para extensibilidad futura (attachments, templates, interactive).
   */
  templateName: z.string().trim().min(1).max(120).optional(),
  components: z.array(z.unknown()).optional(),
  attachments: z.array(z.unknown()).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export type SendMessageOutput = {
  messageId: string;
  conversationId: string;
  idempotencyKey: string;
  isReplay: boolean;
};

export class SendMessageTool {
  readonly key = 'sendMessage';
  private readonly outboxMessages: OutboxMessageRepository;

  constructor(
    private readonly citizenRepo: CitizenRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly outboxProcessor: OutboxProcessorService,
    prisma: PrismaService,
    private readonly ticketService?: TicketService,
    realtimeNotifier?: RealtimeNotifier,
  ) {
    this.outboxMessages = new OutboxMessageRepository(prisma, realtimeNotifier);
  }

  async execute(input: unknown): Promise<unknown> {
    log('debug', 'send_message.start');

    const parsed = sendMessageSchema.safeParse(input);
    if (!parsed.success) {
      log('warn', 'send_message.invalid_input', undefined, {
        issueCount: parsed.error.issues.length,
      });
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const data = parsed.data;

    try {
      // 1. Garantizar ciudadano
      const citizen = await this.citizenRepo.findByPhone(data.phone);
      if (!citizen) {
        log('warn', 'send_message.citizen_not_found');
        return { error: 'CITIZEN_NOT_FOUND', phone: data.phone };
      }
      const phone = citizen.phone;
      if (!phone) {
        log('warn', 'send_message.citizen_phone_missing', undefined, { citizenId: citizen.id });
        return { error: 'CITIZEN_PHONE_MISSING', citizenId: citizen.id };
      }

      // 2. Garantizar conversación (un recontacto tras cierre reactiva la canónica)
      let convId = data.conversationId;
      if (!convId) {
        const conv = await this.conversationRepo.findOrCreateCanonical(citizen.id);
        convId = conv.id;
        log('debug', 'send_message.conversation_ensured', undefined, {
          conversationId: convId,
        });
      }

      // 3. Message types no implementados aún (estructura extensible).
      if (data.messageType !== 'text') {
        log('warn', 'send_message.unsupported_message_type', undefined, {
          messageType: data.messageType,
        });
        return { error: 'UNSUPPORTED_MESSAGE_TYPE', messageType: data.messageType };
      }

      // 4. Idempotency key
      const idempotencyKey =
        data.idempotencyKey ??
        `ai-send:${crypto
          .createHash('sha256')
          .update(`${convId}|${phone}|${data.body}`)
          .digest('hex')
          .slice(0, 32)}`;

      // 5. Construir payload outbound (patrón outbox — NO envío directo)
      const waPayload: WaTextOutbound = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: data.body },
      };

      // 6. Resolver ticket activo (si existe) para adjuntarlo al insert.
      const activeTicket = this.ticketService
        ? await this.ticketService.getActiveTicketByConversation(convId)
        : undefined;

      // 7. Persistir de forma atómica (mensaje + outbox) para evitar inconsistencias.
      const txResult = await this.outboxMessages.createOutboundTextWithOutbox({
        conversationId: convId,
        phone,
        body: data.body,
        idempotencyKey,
        waPayload,
        ...(activeTicket ? { ticketId: activeTicket.id } : {}),
      });

      // 8. Ticket integration: crear la asociación ticket→mensaje (join table).
      // `messages.ticket_id` ya quedó seteado en el insert; attach es idempotente.
      if (this.ticketService && activeTicket && !txResult.isReplay) {
        try {
          await this.ticketService.attachMessageToTicket(activeTicket.id, txResult.messageId);
        } catch (ticketErr: unknown) {
          // No fallar el send por un error de ticket
          log('warn', 'send_message.ticket_attach_failed', undefined, {
            messageId: txResult.messageId,
            errorType: ticketErr instanceof Error ? ticketErr.name : 'UnknownError',
          });
        }
      }

      const lineContext = await this.conversationRepo.getCommunicationLineContext(convId);

      // 8. Notificar al outbox processor para acelerar dispatch (sin envío directo).
      await this.outboxProcessor.enqueue(phone, waPayload, idempotencyKey, convId, {
        ...(lineContext.communicationLineId ? { lineId: lineContext.communicationLineId } : {}),
        ...(lineContext.externalIdentifier
          ? { lineExternalIdentifier: lineContext.externalIdentifier }
          : {}),
      });

      const result: SendMessageOutput = {
        messageId: txResult.messageId,
        conversationId: convId,
        idempotencyKey,
        isReplay: txResult.isReplay,
      };

      log('debug', 'send_message.success', undefined, {
        messageId: result.messageId,
        conversationId: result.conversationId,
        isReplay: result.isReplay,
      });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', 'send_message.error', undefined, {
        errorType: err instanceof Error ? err.name : 'UnknownError',
      });
      return { error: 'EXECUTION_ERROR', message };
    }
  }
}
