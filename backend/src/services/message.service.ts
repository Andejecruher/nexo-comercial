import { withSignedMediaUrls, type MessageWithMediaUrls } from './media/message-media-urls.service';
import { contactsSchema } from './whatsapp/message-content';
import { templateSnapshot } from './whatsapp/template-snapshot';
import { safeFilename, validateMedia } from './whatsapp/media-policy';
import type { Prisma } from '@prisma/client';
import type { WaContact } from '../types/whatsapp.types';
import { TemplateManagementService } from './templates/template-management.service';
import {
  buildCampaignPayload,
  templateVariables,
  resolveVariables,
  campaignMediaType,
} from './campaigns/campaign-contract';
import { serializeOutboxPayload } from './events/outbox-payload';
import { validateCampaignMedia } from './campaigns/campaign-media.service';
import type { MultipartFilePart } from '../utils/multipart';
import { textValue, type CustomerServiceWindow } from './message-content';
import { PrivateMediaStore } from './whatsapp/private-media.store';
import { presentationMeta } from './message-content';
import { withRealtimeTransaction } from './realtime/realtime-transaction';
/**
 * MessageService — lógica de negocio para el recurso Message.
 *
 * Responsabilidades:
 *  - Listar mensajes de una conversación (cursor-based pagination)
 *  - Enviar mensaje outbound desde el dashboard con idempotencia por la
 *    columna `messages.idempotency_key` (UNIQUE)
 *  - Adjuntar un Attachment a un mensaje existente
 *
 * Append-only: no expone operaciones de update ni delete.
 */
import { randomUUID } from 'crypto';
import { Attachment, MessageDirection, MessageType } from '@prisma/client';
import { type MessageWithSender, MessageRepository } from '../repositories/message.repository';
import { PrismaService } from './prisma.service';
import { WaMediaOutbound, WaTextOutbound, WaOutboundMessage } from '../types/whatsapp.types';
import { AppError } from '../utils/app-error';
import { eventBus } from './events/event-bus.service';
import { OutboxProcessorService } from './events/outbox-processor.service';
import { RealtimeNotifier } from './realtime/realtime-notifier.service';
import {
  ConversationRealtimeAction,
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from './realtime/realtime-event.contracts';
import { buildInboxMessagePreview } from './realtime/inbox-preview.util';
import { TicketService } from './tickets/ticket.service';
import { AudioTranscoder, FfmpegAudioTranscoder } from './whatsapp/audio-transcoder';
import { WhatsAppProvider } from './whatsapp/whatsapp.provider';
import { formatPhoneForMeta } from '../utils/phone-normalizer';

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

function formatAudioClock(totalSeconds: number): string {
  const safe = Math.max(1, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export type MessageListResult = {
  items: MessageWithMediaUrls[];
  meta: { nextCursor: string | undefined; hasNextPage: boolean };
};

export type SendMessageResult = {
  message: MessageWithSender;
  /** true cuando la respuesta es fruto de un replay (mismo Idempotency-Key) */
  isReplay: boolean;
};

/** Detecta violación de constraint UNIQUE (Prisma P2002) — carrera de idempotencia. */
function isUniqueConstraintError(error: unknown): boolean {
  return (error as { code?: string }).code === 'P2002';
}

function normalizeContactPhone(phone: string): string {
  return formatPhoneForMeta(phone).replace(/\D/g, '');
}

export class MessageService {
  constructor(
    private readonly messageRepo: MessageRepository,
    private readonly outboxProcessor: OutboxProcessorService,
    private readonly realtimeNotifier?: RealtimeNotifier,
    private readonly prisma?: PrismaService,
    private readonly whatsappProvider?: WhatsAppProvider,
    private readonly ticketService?: TicketService,
    private readonly audioTranscoder: AudioTranscoder = new FfmpegAudioTranscoder(),
  ) {}

  async sendMedia(
    input: { conversationId: string; senderId: string; idempotencyKey: string; caption?: string },
    file: MultipartFilePart,
  ): Promise<SendMessageResult> {
    if (!this.prisma || !this.whatsappProvider)
      throw AppError.badRequest('Envío multimedia no disponible');
    const prior = await this.messageRepo.findByIdempotencyKey(input.idempotencyKey);
    if (prior) {
      if (prior.conversationId !== input.conversationId || prior.sendByUserId !== input.senderId)
        throw AppError.conflict('Clave de envío ya utilizada');
      return { message: prior, isReplay: true };
    }
    await this.assertWindow(input.conversationId);
    const conv = await this.messageRepo.findConversationWithCitizenPhone(input.conversationId);
    if (!conv) throw AppError.notFound('Conversación no encontrada');
    const supported: Record<string, 'image' | 'video' | 'audio' | 'document' | 'sticker'> = {
      'image/jpeg': 'image',
      'image/png': 'image',
      'image/webp': 'sticker',
      'video/mp4': 'video',
      'video/3gpp': 'video',
      'audio/ogg': 'audio',
      'audio/mpeg': 'audio',
      'audio/mp4': 'audio',
      'audio/aac': 'audio',
      'audio/amr': 'audio',
      'application/pdf': 'document',
      'text/plain': 'document',
      'application/msword': 'document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
      'application/vnd.ms-excel': 'document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
    };
    const mime = file.mimeType.split(';')[0].trim().toLowerCase();
    const kind = supported[mime];
    if (!kind || !file.buffer.length)
      throw AppError.badRequest('Formato multimedia no compatible con WhatsApp');
    await validateMedia(file.buffer, mime, kind);
    file = { ...file, filename: safeFilename(file.filename) };
    const max =
      kind === 'image' ? 5 * 1024 * 1024 : kind === 'sticker' ? 500 * 1024 : 16 * 1024 * 1024;
    if (file.buffer.length > max) throw AppError.badRequest(`El archivo supera ${max} bytes`);
    if ((input.caption?.length ?? 0) > 1024)
      throw AppError.badRequest('La descripción admite hasta 1024 caracteres');
    if (input.caption && ['audio', 'sticker'].includes(kind))
      throw AppError.badRequest('Este medio no admite descripción');
    const context = conv.meta?.communicationLineId
      ? { lineId: conv.meta.communicationLineId }
      : undefined;
    const uploaded = await this.whatsappProvider.uploadMedia(
      file.buffer,
      mime,
      file.filename,
      context,
    );
    await new PrivateMediaStore().put(uploaded.id, file.buffer, context?.lineId);
    const payload: WaMediaOutbound = {
      messaging_product: 'whatsapp',
      to: conv.citizen.phone,
      type: kind,
      [kind]: {
        id: uploaded.id,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(kind === 'document' ? { filename: file.filename } : {}),
      },
    };
    const ticketId = await this.resolveActiveTicketId(input.conversationId);
    const message = await withRealtimeTransaction(
      this.prisma,
      this.realtimeNotifier,
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))`;
        const replay = await tx.message.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { sender: { select: { id: true, fullName: true, email: true } } },
        });
        if (replay) {
          if (
            replay.conversationId !== input.conversationId ||
            replay.sendByUserId !== input.senderId
          )
            throw AppError.conflict('Clave de envío ya utilizada');
          return replay;
        }
        const created = await this.messageRepo.createInTransaction(tx, {
          conversationId: input.conversationId,
          ticketId,
          body: input.caption ?? '',
          direction: 'outbound',
          messageType: kind,
          sendByUserId: input.senderId,
          idempotencyKey: input.idempotencyKey,
          meta: {
            ...(context?.lineId ? { lineId: context.lineId } : {}),
            media: {
              id: uploaded.id,
              mimeType: mime,
              filename: file.filename,
              size: file.buffer.length,
              caption: input.caption,
            },
          },
        });
        await tx.attachment.create({
          data: {
            messageId: created.id,
            storageKey: uploaded.id,
            providerMediaId: uploaded.id,
            communicationLineId: context?.lineId,
            processingState: 'pending',
            mimeType: mime,
            fileSizeBytes: BigInt(file.buffer.length),
            originalFilename: file.filename,
            uploadedBy: input.senderId,
          },
        });
        await tx.outboxEvent.create({
          data: {
            phone: conv.citizen.phone,
            conversationId: conv.id,
            idempotencyKey: input.idempotencyKey,
            payload: serializeOutboxPayload(payload, context) as object,
          },
        });
        if (this.realtimeNotifier?.isEnabled()) {
          await this.realtimeNotifier.notifyCritical(
            tx,
            this.buildMessageCreatedEvent(
              created,
              conv.id,
              input.idempotencyKey,
              created.createdAt.toISOString(),
            ),
          );
          await this.realtimeNotifier.notifyCritical(
            tx,
            this.buildConversationUpdatedEvent(
              conv.id,
              input.idempotencyKey,
              created.createdAt.toISOString(),
              created,
            ),
          );
        }
        return created;
      },
    );
    await this.outboxProcessor.enqueue(
      conv.citizen.phone,
      payload,
      input.idempotencyKey,
      conv.id,
      context,
    );
    return { message, isReplay: false };
  }

  async sendLegacyMedia(params: {
    conversationId: string;
    senderId: string;
    idempotencyKey: string;
    buffer: Buffer;
    mimeType: string;
    filename: string;
    kind: 'image' | 'audio' | 'video' | 'document' | 'sticker';
    caption?: string;
  }): Promise<SendMessageResult> {
    await validateMedia(params.buffer, params.mimeType, params.kind);
    return this.sendMedia(params, {
      buffer: params.buffer,
      mimeType: params.mimeType,
      filename: safeFilename(params.filename),
    });
  }

  async getWindow(conversationId: string): Promise<CustomerServiceWindow> {
    const conv = await this.messageRepo.findConversationWithCitizenPhone(conversationId);
    if (!conv) throw AppError.notFound('Conversación no encontrada');
    return this.messageRepo.customerWindow(conversationId);
  }

  async assertWindow(conversationId: string): Promise<void> {
    if (!(await this.getWindow(conversationId)).isOpen)
      throw new AppError(
        'La ventana de atención de 24 horas está cerrada. Inicia la conversación con una plantilla aprobada.',
        409,
        'WHATSAPP_WINDOW_CLOSED',
      );
  }

  async uploadTemplateMedia(
    input: { conversationId: string; lineId: string; templateId: string; senderId: string },
    file: MultipartFilePart,
  ): Promise<{ attachmentId: string; filename: string }> {
    if (!this.prisma || !this.whatsappProvider) throw AppError.badRequest('Medios no disponibles');
    const conv = await this.messageRepo.findConversationWithCitizenPhone(input.conversationId);
    if (!conv) throw AppError.notFound('Conversación no encontrada');
    if (conv.meta?.communicationLineId && conv.meta.communicationLineId !== input.lineId)
      throw AppError.badRequest('La plantilla debe usar la línea de la conversación');
    const template = await new TemplateManagementService(this.prisma).assertOwnership(
      input.lineId,
      input.templateId,
    );
    templateVariables(template);
    const kind = campaignMediaType(template);
    if (!kind) throw AppError.badRequest('La plantilla no requiere medios');
    validateCampaignMedia(file, kind);
    const uploaded = await this.whatsappProvider.uploadMedia(
      file.buffer,
      file.mimeType,
      file.filename,
      { lineId: input.lineId },
    );
    await new PrivateMediaStore().put(uploaded.id, file.buffer, input.lineId);
    // Reuse Attachment as a private, user-owned upload receipt. No public sharing.
    const attachment = await this.prisma.attachment.create({
      data: {
        storageKey: uploaded.id,
        mimeType: file.mimeType,
        fileSizeBytes: BigInt(file.buffer.length),
        originalFilename: file.filename,
        uploadedBy: input.senderId,
      },
    });
    return { attachmentId: attachment.id, filename: file.filename };
  }

  async sendTemplate(input: {
    conversationId: string;
    lineId: string;
    templateId: string;
    values: Record<string, string>;
    attachmentId?: string;
    senderId: string;
    idempotencyKey: string;
  }): Promise<SendMessageResult> {
    if (!this.prisma) throw AppError.badRequest('Envío no disponible');
    const existing = await this.messageRepo.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (
        existing.conversationId !== input.conversationId ||
        existing.sendByUserId !== input.senderId
      )
        throw AppError.conflict('Clave de envío ya utilizada');
      return { message: existing, isReplay: true };
    }
    const conv = await this.prisma.conversation.findUnique({
      where: { id: input.conversationId },
      include: { citizen: true, meta: true },
    });
    if (!conv?.citizen.phone) throw AppError.notFound('Conversación sin teléfono');
    if (conv.meta?.communicationLineId && conv.meta.communicationLineId !== input.lineId)
      throw AppError.badRequest('La plantilla debe usar la línea de la conversación');
    const template = await new TemplateManagementService(this.prisma).assertOwnership(
      input.lineId,
      input.templateId,
    );
    const variables = templateVariables(template);
    const values = resolveVariables(
      variables,
      Object.fromEntries(
        Object.entries(input.values).map(([key, value]) => [
          key,
          { mode: 'static' as const, value },
        ]),
      ),
      {},
    );
    const kind = campaignMediaType(template);
    const attachment = input.attachmentId
      ? await this.prisma.attachment.findFirst({
          where: { id: input.attachmentId, uploadedBy: input.senderId, messageId: null },
        })
      : null;
    if (kind && (!attachment || !/^\d+$/.test(attachment.storageKey)))
      throw AppError.badRequest('Carga el encabezado requerido');
    if (attachment && !kind) throw AppError.badRequest('Esta plantilla no utiliza un adjunto');
    if (attachment && kind) {
      const allowed =
        kind === 'IMAGE'
          ? ['image/jpeg', 'image/png']
          : kind === 'VIDEO'
            ? ['video/mp4']
            : ['application/pdf'];
      if (!allowed.includes(attachment.mimeType))
        throw AppError.badRequest('El archivo no corresponde al encabezado de la plantilla');
    }
    if (attachment) values['header.media'] = attachment.storageKey;
    const payload = buildCampaignPayload(
      template,
      values,
      conv.citizen.phone,
      input.idempotencyKey,
    );
    const snapshot = {
      version: 1,
      id: template.id,
      name: template.name,
      language: template.language,
      components: template.components,
      values,
      parameters: payload.template.components,
    };
    const bodyComponent = template.components.find((c) => c.type === 'BODY');
    const body = textValue(bodyComponent?.text).replace(
      /\{\{([^{}]+)\}\}/g,
      (token, key: string) => values[`body.${key}`] ?? token,
    );
    const lineContext = { lineId: input.lineId };
    const message = await withRealtimeTransaction(
      this.prisma,
      this.realtimeNotifier,
      async (tx) => {
        // Serialize the canonical conversation and key claim before any provider send.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'template:' + input.conversationId}, 0))`;
        const replay = await tx.message.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: { sender: { select: { id: true, fullName: true, email: true } } },
        });
        if (replay) {
          if (
            replay.conversationId !== input.conversationId ||
            replay.sendByUserId !== input.senderId
          )
            throw AppError.conflict('Clave de envío ya utilizada');
          return replay;
        }
        const current = await tx.conversationMeta.findUnique({
          where: { conversationId: conv.id },
        });
        if (current?.communicationLineId && current.communicationLineId !== input.lineId)
          throw AppError.conflict('La línea de conversación cambió');
        await tx.conversationMeta.upsert({
          where: { conversationId: conv.id },
          create: { conversationId: conv.id, communicationLineId: input.lineId },
          update: { communicationLineId: input.lineId },
        });
        const ticket = this.ticketService
          ? (
              await this.ticketService
                .inTransaction(tx, input.idempotencyKey)
                .getOrCreateActiveTicket(conv.id, conv.citizenId)
            ).ticket
          : undefined;
        const created = await this.messageRepo.createInTransaction(tx, {
          conversationId: conv.id,
          ticketId: ticket?.id,
          body,
          direction: MessageDirection.outbound,
          messageType: MessageType.template,
          sendByUserId: input.senderId,
          idempotencyKey: input.idempotencyKey,
          meta: {
            lineId: input.lineId,
            templateSnapshot: snapshot,
            ...(attachment
              ? {
                  media: {
                    id: attachment.storageKey,
                    mimeType: attachment.mimeType,
                    filename: attachment.originalFilename,
                  },
                }
              : {}),
          },
        });
        if (attachment) {
          const bound = await tx.attachment.updateMany({
            where: { id: attachment.id, messageId: null, uploadedBy: input.senderId },
            data: { messageId: created.id },
          });
          if (!bound.count) throw AppError.conflict('El adjunto ya fue utilizado');
        }
        await tx.outboxEvent.create({
          data: {
            phone: conv.citizen.phone!,
            conversationId: conv.id,
            idempotencyKey: input.idempotencyKey,
            payload: serializeOutboxPayload(payload, lineContext) as object,
          },
        });
        if (this.realtimeNotifier?.isEnabled()) {
          await this.realtimeNotifier.notifyCritical(
            tx,
            this.buildMessageCreatedEvent(
              created,
              conv.id,
              input.idempotencyKey,
              created.createdAt.toISOString(),
            ),
          );
          await this.realtimeNotifier.notifyCritical(
            tx,
            this.buildConversationUpdatedEvent(
              conv.id,
              input.idempotencyKey,
              created.createdAt.toISOString(),
              created,
            ),
          );
        }
        return created;
      },
    );
    await this.outboxProcessor.enqueue(
      conv.citizen.phone,
      payload,
      input.idempotencyKey,
      conv.id,
      lineContext,
    );
    return { message, isReplay: false };
  }

  /**
   * Resuelve el ticket activo de la conversación para adjuntarlo al mensaje
   * saliente. Best-effort: si no hay servicio de tickets o no hay ticket activo,
   * retorna undefined (el mensaje queda sin ticket).
   */
  private async resolveActiveTicketId(conversationId: string): Promise<string | undefined> {
    if (!this.ticketService) {
      return undefined;
    }

    try {
      const activeTicket = await this.ticketService.getActiveTicketByConversation(conversationId);
      return activeTicket?.id;
    } catch {
      return undefined;
    }
  }

  /**
   * Devuelve los mensajes de una conversación en orden cronológico ascendente,
   * incluyendo statuses de entrega y attachments.
   */
  async listByConversation(params: {
    conversationId: string;
    cursor?: string;
    limit: number;
  }): Promise<MessageListResult> {
    const conv = await this.messageRepo.findConversationWithCitizenPhone(params.conversationId);
    if (!conv) throw AppError.notFound('Conversación no encontrada');

    const { items, hasNextPage } = await this.messageRepo.listByConversation(params);

    return {
      items: await withSignedMediaUrls(items),
      meta: {
        nextCursor: hasNextPage ? items[0]?.id : undefined,
        hasNextPage,
      },
    };
  }

  /**
   * Persiste un mensaje outbound y lo encola en WhatsApp.
   * Si el mismo Idempotency-Key ya fue procesado, devuelve el mensaje original (isReplay: true).
   */
  async sendMessage(params: {
    conversationId: string;
    body: string;
    messageType: MessageType;
    senderId: string;
    idempotencyKey: string;
  }): Promise<SendMessageResult> {
    // Idempotency check — evita duplicados en retries del cliente
    const existing = await this.messageRepo.findByIdempotencyKey(params.idempotencyKey);
    if (existing) {
      if (
        existing.conversationId !== params.conversationId ||
        existing.sendByUserId !== params.senderId
      )
        throw AppError.conflict('Clave de envío ya utilizada');
      return { message: existing, isReplay: true };
    }

    // Cargar conversación con el teléfono del ciudadano (necesario para envío WA)
    const conv = await this.messageRepo.findConversationWithCitizenPhone(params.conversationId);
    if (!conv) throw AppError.notFound('Conversación no encontrada');

    if (params.messageType !== MessageType.text)
      throw AppError.badRequest('Usa el endpoint específico para este tipo de mensaje');
    await this.assertWindow(params.conversationId);

    // Ticket activo de la conversación (si existe) — se adjunta al mensaje saliente.
    const ticketId = await this.resolveActiveTicketId(params.conversationId);

    const waPayload: WaTextOutbound = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: conv.citizen.phone,
      type: 'text',
      text: { body: params.body },
    };

    try {
      // Persistir registro de mensaje (append-only — no update/delete).
      // La columna idempotency_key (UNIQUE) garantiza single-write.
      // Cuando el durable path está activo, la escritura del mensaje y del outbox
      // de tiempo real deben ocurrir en la misma transacción.
      const message =
        this.prisma || this.realtimeNotifier?.isEnabled()
          ? await this.persistMessageWithOutbox(params, conv, ticketId, waPayload)
          : await this.messageRepo.create({
              conversationId: params.conversationId,
              ...(ticketId ? { ticketId } : {}),
              body: params.body,
              direction: MessageDirection.outbound,
              messageType: params.messageType,
              idempotencyKey: params.idempotencyKey,
              sendByUserId: params.senderId,
            });

      // Encolar entrega outbound vía WhatsApp

      await this.outboxProcessor.enqueue(
        conv.citizen.phone,
        waPayload,
        params.idempotencyKey,
        params.conversationId,
        {
          ...(conv.meta?.communicationLineId ? { lineId: conv.meta.communicationLineId } : {}),
        },
      );

      if (!this.realtimeNotifier?.isEnabled()) {
        eventBus.emit('message.created', {
          messageId: message.id,
          conversationId: params.conversationId,
          direction: 'outbound',
          messageType: message.messageType,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
          externalMessageId: message.externalMessageId ?? undefined,
        });

        eventBus.emit('conversation.updated', {
          conversationId: params.conversationId,
          action: 'message',
          occurredAt: new Date().toISOString(),
          triggeredBy: 'agent',
          actorId: params.senderId,
        });
      }

      return { message, isReplay: false };
    } catch (err) {
      // Carrera de idempotencia: un request concurrente con la misma key
      // ya insertó el mensaje. Tratar como replay del vencedor.
      if (isUniqueConstraintError(err)) {
        const winner = await this.messageRepo.findByIdempotencyKey(params.idempotencyKey);
        if (winner) {
          if (
            winner.conversationId !== params.conversationId ||
            winner.sendByUserId !== params.senderId
          )
            throw AppError.conflict('Clave de envío ya utilizada');
          return { message: winner, isReplay: true };
        }
      }
      throw err;
    }
  }

  /**
   * Sube un audio a Meta, persiste el mensaje `audio` y lo encola en WhatsApp.
   */
  async sendAudio(params: {
    conversationId: string;
    senderId: string;
    idempotencyKey: string;
    buffer: Buffer;
    mimeType: string;
    filename: string;
    durationSeconds: number;
  }): Promise<SendMessageResult> {
    if (!this.whatsappProvider) {
      throw AppError.badRequest('El envío de audio no está disponible');
    }

    const existing = await this.messageRepo.findByIdempotencyKey(params.idempotencyKey);
    if (existing) {
      if (
        existing.conversationId !== params.conversationId ||
        existing.sendByUserId !== params.senderId
      )
        throw AppError.conflict('Clave de envío ya utilizada');
      return { message: existing, isReplay: true };
    }

    const declaredMimeType = params.mimeType.trim().toLowerCase().split(';')[0];
    if (!declaredMimeType.startsWith('audio/') && declaredMimeType !== 'application/octet-stream') {
      throw AppError.badRequest('El archivo debe ser audio');
    }
    if (params.buffer.byteLength === 0) {
      throw AppError.badRequest('Audio vacío');
    }
    if (params.buffer.byteLength > MAX_AUDIO_BYTES) {
      throw AppError.badRequest('El audio supera 16 MB');
    }

    let validatedSource: Awaited<ReturnType<typeof validateMedia>> | undefined;
    try {
      validatedSource = await validateMedia(params.buffer, declaredMimeType, 'audio');
    } catch {
      // Non-OGG sources are decoded by FFmpeg and validated again below.
    }
    const encodedAudio =
      validatedSource?.mimeType === 'audio/ogg'
        ? params.buffer
        : await this.audioTranscoder.transcodeToOggOpus(params.buffer);
    const mimeType =
      validatedSource?.mimeType === 'audio/ogg'
        ? validatedSource.mimeType
        : (await validateMedia(encodedAudio, 'audio/ogg', 'audio')).mimeType;
    const filename = `${safeFilename(params.filename).replace(/\.[^.]+$/, '') || 'audio'}.ogg`;

    const conv = await this.messageRepo.findConversationWithCitizenPhone(params.conversationId);
    if (!conv) throw AppError.notFound('Conversación no encontrada');

    await this.assertWindow(params.conversationId);
    const ticketId = await this.resolveActiveTicketId(params.conversationId);

    const lineContext = conv.meta?.communicationLineId
      ? { lineId: conv.meta.communicationLineId }
      : undefined;
    const uploaded = await this.whatsappProvider.uploadMedia(
      encodedAudio,
      mimeType,
      filename,
      lineContext,
    );

    await new PrivateMediaStore().put(uploaded.id, encodedAudio, lineContext?.lineId);
    const body = formatAudioClock(params.durationSeconds);
    const persistParams = {
      conversationId: params.conversationId,
      body,
      messageType: MessageType.audio,
      senderId: params.senderId,
      idempotencyKey: params.idempotencyKey,
      meta: {
        durationSeconds: params.durationSeconds,
        ...(lineContext?.lineId ? { lineId: lineContext.lineId } : {}),
        media: { id: uploaded.id, mimeType, filename, voice: true },
      },
      attachment: {
        storageKey: uploaded.id,
        mimeType,
        fileSizeBytes: BigInt(encodedAudio.length),
        originalFilename: filename,
      },
    };

    const waPayload: WaMediaOutbound = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: conv.citizen.phone,
      type: 'audio',
      audio: { id: uploaded.id },
    };

    try {
      const message =
        this.prisma || this.realtimeNotifier?.isEnabled()
          ? await this.persistMessageWithOutbox(persistParams, conv, ticketId, waPayload)
          : await this.messageRepo.create({
              conversationId: params.conversationId,
              ...(ticketId ? { ticketId } : {}),
              body,
              direction: MessageDirection.outbound,
              messageType: MessageType.audio,
              idempotencyKey: params.idempotencyKey,
              sendByUserId: params.senderId,
              meta: { durationSeconds: params.durationSeconds },
            });

      if (!this.prisma)
        await this.messageRepo.createAttachment({
          messageId: message.id,
          storageKey: uploaded.id,
          mimeType,
          fileSizeBytes: BigInt(encodedAudio.byteLength),
          originalFilename: filename,
          uploadedBy: params.senderId,
        });

      await this.outboxProcessor.enqueue(
        conv.citizen.phone,
        waPayload,
        params.idempotencyKey,
        params.conversationId,
        {
          ...(conv.meta?.communicationLineId ? { lineId: conv.meta.communicationLineId } : {}),
        },
      );

      if (!this.realtimeNotifier?.isEnabled()) {
        eventBus.emit('message.created', {
          messageId: message.id,
          conversationId: params.conversationId,
          direction: 'outbound',
          messageType: message.messageType,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
          externalMessageId: message.externalMessageId ?? undefined,
        });

        eventBus.emit('conversation.updated', {
          conversationId: params.conversationId,
          action: 'message',
          occurredAt: new Date().toISOString(),
          triggeredBy: 'agent',
          actorId: params.senderId,
        });
      }

      return { message, isReplay: false };
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const winner = await this.messageRepo.findByIdempotencyKey(params.idempotencyKey);
        if (winner) {
          if (
            winner.conversationId !== params.conversationId ||
            winner.sendByUserId !== params.senderId
          )
            throw AppError.conflict('Clave de envío ya utilizada');
          return { message: winner, isReplay: true };
        }
      }
      throw err;
    }
  }

  private async persistMessageWithOutbox(
    params: {
      conversationId: string;
      body: string;
      messageType: MessageType;
      senderId: string;
      idempotencyKey: string;
      meta?: Record<string, unknown>;
      attachment?: {
        storageKey: string;
        mimeType: string;
        fileSizeBytes: bigint;
        originalFilename: string;
      };
    },
    conv: {
      id: string;
      citizen: { phone: string };
      meta?: { communicationLineId?: string | null } | null;
    },
    ticketId: string | undefined,
    payload: WaOutboundMessage,
  ): Promise<MessageWithSender> {
    if (!this.prisma) {
      throw new Error('MessageService requires PrismaService for durable realtime');
    }

    return withRealtimeTransaction(this.prisma, this.realtimeNotifier, async (tx) => {
      const message = await this.messageRepo.createInTransaction(tx, {
        conversationId: params.conversationId,
        ...(ticketId ? { ticketId } : {}),
        body: params.body,
        direction: MessageDirection.outbound,
        messageType: params.messageType,
        idempotencyKey: params.idempotencyKey,
        sendByUserId: params.senderId,
        meta: params.meta,
      });

      if (params.attachment)
        await tx.attachment.create({
          data: {
            ...params.attachment,
            providerMediaId: params.attachment.storageKey,
            communicationLineId: conv.meta?.communicationLineId,
            processingState: 'pending',
            messageId: message.id,
            uploadedBy: params.senderId,
          },
        });
      await tx.outboxEvent.create({
        data: {
          phone: conv.citizen.phone,
          conversationId: params.conversationId,
          idempotencyKey: params.idempotencyKey,
          payload: serializeOutboxPayload(
            payload,
            conv.meta?.communicationLineId ? { lineId: conv.meta.communicationLineId } : undefined,
          ) as object,
        },
      });
      if (!this.realtimeNotifier?.isEnabled()) return message;
      const occurredAt = message.createdAt.toISOString();
      const correlationId = params.idempotencyKey;

      await this.realtimeNotifier!.notifyCritical(
        tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        this.buildMessageCreatedEvent(message, params.conversationId, correlationId, occurredAt),
      );

      await this.realtimeNotifier!.notifyCritical(
        tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        this.buildConversationUpdatedEvent(
          params.conversationId,
          correlationId,
          occurredAt,
          message,
        ),
      );

      return message;
    });
  }

  private buildMessageCreatedEvent(
    message: MessageWithSender,
    conversationId: string,
    correlationId: string,
    occurredAt: string,
  ): RealtimeDurableEvent {
    const direction = message.direction === MessageDirection.inbound ? 'inbound' : 'outbound';
    return {
      eventId: message.id,
      correlationId,
      schemaVersion: 1,
      eventType: CriticalEventType.MessageCreated,
      socketEventName: SocketEventName.ConversationMessageNew,
      occurredAt,
      source: 'message.service',
      conversationId,
      action: ConversationRealtimeAction.Message,
      messagePatch: {
        id: message.id,
        conversationId,
        ...(message.ticketId ? { ticketId: message.ticketId } : {}),
        body: message.body,
        direction,
        messageType: message.messageType,
        meta: presentationMeta(message),
        externalMessageId: message.externalMessageId ?? undefined,
        sendByUserId: message.sendByUserId ?? undefined,
        sender: message.sender ?? undefined,
        createdAt: message.createdAt.toISOString(),
      },
      inboxPatch: {
        lastMessagePreview: buildInboxMessagePreview(message.body, message.messageType),
        lastMessageAt: occurredAt,
        lastMessageDirection: direction,
        unreadDelta: direction === 'inbound' ? 1 : 0,
      },
    };
  }

  private buildConversationUpdatedEvent(
    conversationId: string,
    correlationId: string,
    occurredAt: string,
    message: MessageWithSender,
  ): RealtimeDurableEvent {
    const direction = message.direction === MessageDirection.inbound ? 'inbound' : 'outbound';
    return {
      eventId: randomUUID(),
      correlationId,
      schemaVersion: 1,
      eventType: CriticalEventType.ConversationUpdated,
      socketEventName: SocketEventName.ConversationUpdated,
      occurredAt,
      source: 'message.service',
      conversationId,
      action: ConversationRealtimeAction.Message,
      conversationPatch: {
        id: conversationId,
        updatedAt: occurredAt,
      },
      inboxPatch: {
        lastMessagePreview: buildInboxMessagePreview(message.body, message.messageType),
        lastMessageAt: occurredAt,
        lastMessageDirection: direction,
        unreadDelta: direction === 'inbound' ? 1 : 0,
      },
    };
  }

  /**
   * Crea un Attachment y lo vincula al mensaje indicado.
   * La subida del archivo al storage es responsabilidad del cliente —
   * este método solo persiste los metadatos y el storageKey resultante.
   */
  async sendContactMessage(params: {
    conversationId: string;
    senderId: string;
    idempotencyKey: string;
    citizenId: string;
  }): Promise<SendMessageResult> {
    const replay = await this.replay(params);
    if (replay) return replay;
    if (!this.prisma) throw AppError.badRequest('Servicio no disponible');

    const citizen = await this.prisma.citizen.findUnique({
      where: { id: params.citizenId },
      select: {
        id: true,
        name: true,
        lastName: true,
        phone: true,
        email: true,
        neighborhood: true,
      },
    });
    if (!citizen) throw AppError.notFound('Ciudadano no encontrado');
    if (!citizen.phone) throw AppError.badRequest('El ciudadano no tiene teléfono');

    const firstName = citizen.name?.trim();
    const lastName = citizen.lastName?.trim();
    const formattedName = [firstName, lastName].filter(Boolean).join(' ');
    if (!formattedName) throw AppError.badRequest('El ciudadano no tiene nombre');

    const phone = normalizeContactPhone(citizen.phone);
    if (!phone) throw AppError.badRequest('El teléfono del ciudadano no es válido');

    const contact = {
      name: {
        formatted_name: formattedName,
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
      },
      phones: [{ phone, type: 'CELL', wa_id: phone }],
      ...(citizen.email?.trim() ? { emails: [{ email: citizen.email.trim(), type: 'WORK' }] } : {}),
      ...(citizen.neighborhood?.trim()
        ? { addresses: [{ street: citizen.neighborhood.trim(), type: 'HOME' }] }
        : {}),
    };
    const contacts = contactsSchema.parse([contact]);

    return this.persistRich(
      params,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '',
        type: 'contacts',
        contacts: contacts as WaContact[],
      },
      MessageType.contacts,
      formattedName,
      { contactCitizenId: citizen.id, contacts },
    );
  }

  async sendLegacyTemplate(params: {
    conversationId: string;
    senderId: string;
    idempotencyKey: string;
    templateId: string;
    variables: Record<string, string>;
  }): Promise<SendMessageResult> {
    const replay = await this.replay(params);
    if (replay) return replay;
    if (!this.prisma) throw AppError.badRequest('Servicio no disponible');
    const conv = await this.messageRepo.findConversationWithCitizenPhone(params.conversationId);
    if (!conv?.meta?.communicationLineId)
      throw AppError.badRequest('Falta la línea de comunicación');
    const definition = await new TemplateManagementService(this.prisma).assertOwnership(
      conv.meta.communicationLineId,
      params.templateId,
    );
    if (definition.status !== 'APPROVED')
      throw AppError.badRequest('La plantilla no está aprobada');
    const payload = buildCampaignPayload(
      definition,
      params.variables,
      conv.citizen.phone,
      params.idempotencyKey,
    );
    const keys = templateVariables(definition).map((v) => v.key);
    if (campaignMediaType(definition)) keys.push('header.media');
    if (
      Object.keys(params.variables).length !== keys.length ||
      keys.some((key) => !params.variables[key]?.trim())
    )
      throw AppError.badRequest('Completa exactamente las variables de la plantilla');
    const snapshot = templateSnapshot(payload.template, definition);
    return this.persistRich(
      params,
      payload as WaOutboundMessage,
      MessageType.template,
      snapshot.resolved
        .filter((c) => c.text)
        .map((c) => c.text)
        .join('\n') || definition.name,
      { templateSnapshot: snapshot },
    );
  }

  private async replay(params: {
    conversationId: string;
    senderId: string;
    idempotencyKey: string;
  }): Promise<SendMessageResult | undefined> {
    const existing = await this.messageRepo.findByIdempotencyKey(params.idempotencyKey);
    if (!existing) return undefined;
    if (
      existing.conversationId !== params.conversationId ||
      existing.sendByUserId !== params.senderId
    )
      throw AppError.badRequest('Idempotency-Key pertenece a otra solicitud');
    return { message: existing, isReplay: true };
  }

  /** Message, attachment, delivery intent and realtime notification commit together. No network in TX. */
  private async persistRich(
    params: { conversationId: string; senderId: string; idempotencyKey: string },
    payload: WaOutboundMessage,
    messageType: MessageType,
    body: string,
    meta: Record<string, unknown>,
  ): Promise<SendMessageResult> {
    const replay = await this.replay(params);
    if (replay) return replay;
    if (!this.prisma) throw AppError.badRequest('Servicio no disponible');
    const conv = await this.messageRepo.findConversationWithCitizenPhone(params.conversationId);
    if (!conv?.meta?.communicationLineId)
      throw AppError.badRequest('Falta la línea de comunicación');
    if (messageType !== MessageType.template) await this.assertWindow(params.conversationId);
    const ticketId = await this.resolveActiveTicketId(params.conversationId);
    const waPayload = { ...payload, to: conv.citizen.phone } as WaOutboundMessage;
    const context = { lineId: conv.meta.communicationLineId };
    try {
      const message = await withRealtimeTransaction(
        this.prisma,
        this.realtimeNotifier,
        async (tx) => {
          const created = await this.messageRepo.createInTransaction(tx, {
            ...params,
            sendByUserId: params.senderId,
            body,
            messageType,
            ticketId,
            direction: MessageDirection.outbound,
            meta: { ...meta, lineId: context.lineId },
          });
          await tx.outboxEvent.create({
            data: {
              phone: conv.citizen.phone,
              conversationId: params.conversationId,
              idempotencyKey: params.idempotencyKey,
              payload: serializeOutboxPayload(
                waPayload,
                context,
              ) as unknown as Prisma.InputJsonValue,
            },
          });
          if (this.realtimeNotifier?.isEnabled()) {
            await this.realtimeNotifier.notifyCritical(
              tx,
              this.buildMessageCreatedEvent(
                created,
                params.conversationId,
                params.idempotencyKey,
                created.createdAt.toISOString(),
              ),
            );
            await this.realtimeNotifier.notifyCritical(
              tx,
              this.buildConversationUpdatedEvent(
                params.conversationId,
                params.idempotencyKey,
                created.createdAt.toISOString(),
                created,
              ),
            );
          }
          return created;
        },
      );
      // Dispatch is an optimization; the existing reconciler can recover a missed Cloud Task.
      try {
        await this.outboxProcessor.enqueue(
          conv.citizen.phone,
          waPayload,
          params.idempotencyKey,
          params.conversationId,
          context,
        );
      } catch {
        /* Durable delivery intent already committed. */
      }
      if (!this.realtimeNotifier?.isEnabled()) {
        eventBus.emit('message.created', {
          messageId: message.id,
          conversationId: params.conversationId,
          direction: 'outbound',
          messageType,
          body,
          createdAt: message.createdAt.toISOString(),
        });
        eventBus.emit('conversation.updated', {
          conversationId: params.conversationId,
          action: 'message',
          occurredAt: new Date().toISOString(),
          triggeredBy: 'agent',
          actorId: params.senderId,
        });
      }
      return { message, isReplay: false };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const winner = await this.replay(params);
        if (winner) return winner;
      }
      throw error;
    }
  }

  async addAttachment(params: {
    messageId: string;
    storageKey: string;
    mimeType: string;
    fileSizeBytes: bigint;
    originalFilename?: string;
    cdnUrl?: string;
    uploadedBy: string;
  }): Promise<Attachment> {
    const msg = await this.messageRepo.findById(params.messageId);
    if (!msg) throw AppError.notFound('Mensaje no encontrado');

    return this.messageRepo.createAttachment({
      messageId: params.messageId,
      storageKey: params.storageKey,
      mimeType: params.mimeType,
      fileSizeBytes: params.fileSizeBytes,
      originalFilename: params.originalFilename,
      cdnUrl: params.cdnUrl,
      uploadedBy: params.uploadedBy,
    });
  }
}
