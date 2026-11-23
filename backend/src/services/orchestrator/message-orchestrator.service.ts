import { inboundContent, internalMessageType, record } from '../message-content';
import {
  buildConversationUpdatedEvent,
  buildMessageCreatedEvent,
} from '../realtime/message-event.builder';
import { withRealtimeTransaction } from '../realtime/realtime-transaction';
import { createAttachmentMediaFallback } from '../media/attachment-media.fallback';
import { PrivateMediaStore } from '../whatsapp/private-media.store';
/**
 * MessageOrchestratorService — Orquesta el procesamiento de mensajes inbound.
 *
 * Flujo:
 * 1. Ciudadano: find or create
 * 2. Conversación: find or create + obtener estado actual
 * 3. Según flowState → delegar a Bot o Agente
 * 4. Persistir mensaje inbound
 * 5. Emitir evento message.received
 */
import { Message, MessageDirection, MessageType } from '@prisma/client';
import { canAiOperate, isBotAllowed } from '../../ai/fsm/fsm-guards';
import { FsmRouterV2 } from '../../ai/fsm/fsm-router-v2';
import { BOT_ACTIVE_STATES } from '../../config/conversation-states';
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../../database/transaction-options';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { MessageRepository } from '../../repositories/message.repository';
import { ConversationFlowState, WaInboundMessage } from '../../types/whatsapp.types';
import { ConflictError } from '../../utils/app-error';
import { citizenHasCompleteRegistrationProfile } from '../../utils/citizen-profile';
import { createStructuredLogger } from '../../utils/structured-logger';
import { extractMessageText, ParsedWebhookMessage } from '../../utils/wa-message-parser';
import { eventBus } from '../events/event-bus.service';
import { PrismaService } from '../prisma.service';
import { EphemeralEventType, SocketEventName } from '../realtime/realtime-event.contracts';
import { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import { TicketService } from '../tickets/ticket.service';
import { WhatsAppProvider } from '../whatsapp/whatsapp.provider';
import { ConversationStateMachine } from './conversation-state-machine';
import { DepartmentRouterStrategy } from './department-router.strategy';

const log = createStructuredLogger('Orchestrator');

export class MessageOrchestratorService {
  private static readonly HUMAN_REQUEST_REGEX =
    /\b(humano|persona|agente|asesor|operador|representante|hablar con alguien)\b/i;

  private static readonly FRUSTRATION_REGEX =
    /\b(no (entiendo|sirve|funciona)|me (canse|cansé)|frustrad|no resuelv|inutil|inútil)\b/i;

  private static readonly ROUTING_INTENT_REGEX =
    /\b(reclamo|denuncia|solicitud|tramite|trámite|problema|reporte|queja|pedido)\b/i;

  /**
   * Detecta despedidas explícitas del ciudadano.
   * Red de seguridad determinística: activa el cierre aunque el LLM no llame closeConversation.
   */
  private static readonly FAREWELL_REGEX =
    /\b(adios|adiós|hasta luego|hasta pronto|nos vemos|chao|bye|eso es todo|nada mas|nada más|listo gracias|ya es todo|gracias adios|gracias adiós|muchas gracias (hasta|adios)|fin|finalizar)\b/i;

  private static readonly COMPLEXITY_COUNTER_TTL_SECONDS = 60 * 15;

  /** Contador de complejidad por conversación (in-process, TTL). */
  private readonly complexityCounters = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly citizenRepo: CitizenRepository,
    private readonly conversationRepo: ConversationRepository,
    private readonly messageRepo: MessageRepository,
    private readonly stateMachine: ConversationStateMachine,
    private readonly deptRouter: DepartmentRouterStrategy,
    private readonly whatsappProvider: WhatsAppProvider,
    private readonly fsmRouter?: FsmRouterV2,
    private readonly correlationId: string = '',
    private readonly ticketService?: TicketService,
    private readonly realtimeNotifier?: RealtimeNotifier,
    private readonly prisma?: PrismaService,
  ) {}

  private static readonly MULTIMODAL_MESSAGE_TYPES = new Set([
    'image',
    'audio',
    'video',
    'document',
    'sticker',
  ]);

  /**
   * Punto de entrada para un mensaje inbound ya parseado.
   */
  async handleInboundMessage(
    phone: string,
    message: WaInboundMessage,
    profileName?: string,
    lineExternalIdentifier?: string,
  ): Promise<void> {
    // 1. Ciudadano
    const citizen = await this.citizenRepo.findOrCreate(phone, profileName);

    // 2. Conversación + meta
    const ingested = await this.messageRepo.findByExternalId(message.id);
    const line = lineExternalIdentifier
      ? await this.conversationRepo.findActiveCommunicationLineByExternalIdentifier(
          lineExternalIdentifier,
        )
      : undefined;
    if (lineExternalIdentifier && !line)
      throw new ConflictError('Línea receptora desconocida o inactiva');
    const conversation = ingested
      ? { id: ingested.conversationId, created: false, reactivated: false }
      : await this.conversationRepo.findOrCreateCanonical(
          citizen.id,
          line ? { communicationLineId: line.id } : undefined,
        );
    const ctx = await this.conversationRepo.getConversationContext(conversation.id);

    const boundLineId = await this.bindConversationLineContext(
      conversation.id,
      lineExternalIdentifier,
    );
    await this.archiveMedia(message, boundLineId);

    if (!ctx?.meta) {
      throw new Error(`Conversación sin meta para ciudadano ${citizen.id}`);
    }

    let flowState = ctx.meta.flowState as ConversationFlowState;
    let version = ctx.meta.version;
    let assignedUserId = ctx.assignedUserId ?? undefined;

    // 3. Delegar según estado + modo de atención (isBotAllowed silencia al bot
    //    cuando attendanceMode=human o botEnabled=false, aunque el flowState
    //    permita IA — p. ej. DEPARTMENT_ROUTING por transfer de plataforma).
    if (
      BOT_ACTIVE_STATES.includes(flowState) &&
      isBotAllowed({ flowState, attendanceMode: ctx.attendanceMode, botEnabled: ctx.botEnabled })
    ) {
      // Determinar si el ciudadano ya completó el registro en DB.
      // Esto es clave para evitar re-iniciar el flujo de registro cuando
      // la sesión FSM expiró pero el ciudadano ya está registrado.
      const citizenAlreadyRegistered = citizenHasCompleteRegistrationProfile({
        name: citizen.name,
        phone: citizen.phone,
        neighborhoodId: citizen.neighborhoodId,
        neighborhood: citizen.neighborhood,
      });

      await this.handleBotFlow(
        message,
        conversation.id,
        citizen.id,
        flowState,
        version,
        citizen.interests ?? [],
        citizenAlreadyRegistered,
      );
    }
    // HUMAN_FLOW / ESCALATED → el agente responde desde el dashboard (no acción aquí)

    // Refrescar meta después de reglas/transiciones previas para evitar decisiones con estado stale.
    const freshCtx = await this.conversationRepo.getConversationContext(conversation.id);
    if (freshCtx?.meta) {
      flowState = freshCtx.meta.flowState as ConversationFlowState;
      version = freshCtx.meta.version;
      assignedUserId = freshCtx.assignedUserId ?? undefined;
    } else {
      log('warn', 'orchestrator.refresh_meta.failed', this.correlationId, {
        conversationId: conversation.id,
      });
    }

    // 4. Persistir mensaje inbound
    const text = extractMessageText(message) ?? '';
    const existingInboundMessage = ingested;
    let persistedMessage: Message;

    if (existingInboundMessage) {
      persistedMessage = existingInboundMessage;
      log('info', 'orchestrator.inbound_replay_reused', this.correlationId, {
        conversationId: conversation.id,
        messageId: persistedMessage.id,
      });
    } else if (this.realtimeNotifier?.isEnabled()) {
      persistedMessage = await this.persistInboundMessageWithOutbox({
        conversationId: conversation.id,
        body: text,
        messageType: this.mapMessageType(message.type),
        externalMessageId: message.id,
        meta: {
          ...inboundContent(message, lineExternalIdentifier),
          ...(boundLineId ? { lineId: boundLineId } : {}),
        },
        flowState,
        contactName: citizen.name ?? undefined,
        phone,
        channel: (freshCtx ?? ctx)?.channel,
        departmentSlug: (freshCtx?.meta ?? ctx?.meta)?.departmentSlug ?? undefined,
        assignedUserId,
        communicationLineId: boundLineId,
      });
    } else {
      persistedMessage = await this.messageRepo.create({
        conversationId: conversation.id,
        body: text,
        direction: MessageDirection.inbound,
        messageType: this.mapMessageType(message.type),
        externalMessageId: message.id,
        meta: {
          ...inboundContent(message, lineExternalIdentifier),
          ...(boundLineId ? { lineId: boundLineId } : {}),
        },
      });
    }

    // 4b. Ticket: crear/recuperar ticket activo y asociar mensaje inbound
    // TODO: mover ticket attachment dentro de la transacción de tiempo real durable
    // cuando TicketService soporte transaction clients.
    if (this.ticketService && !persistedMessage.ticketId) {
      const { ticket } = await this.ticketService.getOrCreateActiveTicket(
        conversation.id,
        citizen.id,
      );
      await this.ticketService.attachMessageToTicket(ticket.id, persistedMessage.id);
    }

    // 4c. Salvaguarda de despedida: si el ciudadano ya está registrado y detectamos
    // una despedida explícita en BOT_FLOW, cerramos el ticket y la conversación de
    // forma determinística y omitimos la IA para ese turno.
    const isBotActive =
      (flowState === 'BOT_FLOW' || flowState === 'DEPARTMENT_ROUTING') &&
      isBotAllowed({
        flowState,
        attendanceMode: (freshCtx ?? ctx)?.attendanceMode,
        botEnabled: (freshCtx ?? ctx)?.botEnabled,
      });
    const citizenFullyRegistered = citizenHasCompleteRegistrationProfile({
      name: citizen.name,
      phone: citizen.phone,
      neighborhoodId: citizen.neighborhoodId,
      neighborhood: citizen.neighborhood,
    });
    // Guard de atención: métrica cuando el bot queda silenciado pese a que el
    // estado permitiría IA (p. ej. DEPARTMENT_ROUTING por handoff de plataforma).
    this.emitBotSkipMetric(conversation.id, flowState, freshCtx ?? ctx);
    if (
      isBotActive &&
      citizenFullyRegistered &&
      MessageOrchestratorService.FAREWELL_REGEX.test(text)
    ) {
      await this.applyFarewellClose(conversation.id);
      // No invocamos el fsmRouter: el cierre ya ocurrió.
      log('info', 'orchestrator.farewell_close', this.correlationId, {
        conversationId: conversation.id,
        flowState,
      });
      // Continúa hacia mark-as-read y eventos (pasos 5–6).
    } else if (this.fsmRouter) {
      const aiText = text.trim();
      if (aiText || MessageOrchestratorService.hasMultimodalMessage(message)) {
        const shouldShowTyping = isBotActive;
        if (shouldShowTyping) this.emitTyping(conversation.id, true);
        try {
          const fsmResult = await this.fsmRouter.handle({
            conversationId: conversation.id,
            citizenId: citizen.id,
            phone,
            lineExternalIdentifier,
            messageId: persistedMessage.id,
            waMessageId: message.id,
            messageText: aiText,
            inboundMessages: [message],
            correlationId: this.correlationId,
            metaOverride: {
              flowState,
              version,
              assignedUserId,
              attendanceMode: (freshCtx ?? ctx)?.attendanceMode,
              botEnabled: (freshCtx ?? ctx)?.botEnabled,
            },
          });

          if (fsmResult.decision.kind === 'lock_conflict')
            throw new Error('Conversation AI turn is still active');
          log('info', 'orchestrator.fsm_result', this.correlationId, {
            conversationId: conversation.id,
            flowState: fsmResult.flowState,
            decision: fsmResult.decision.kind,
            transitioned: fsmResult.transitioned,
            newFlowState: fsmResult.newFlowState,
            durationMs: fsmResult.durationMs,
          });
        } finally {
          if (shouldShowTyping) this.emitTyping(conversation.id, false);
        }
      }
    }
    // if isBotActive && farewell → ya cerrado; no hay bloque adicional aquí.

    // 5. Marcar como leído en WhatsApp
    this.whatsappProvider
      .markAsRead(message.id, {
        ...(lineExternalIdentifier ? { lineExternalIdentifier } : {}),
        allowDefault: true,
      })
      .catch((err: unknown) => {
        log('warn', 'orchestrator.mark_read.failed', this.correlationId, { error: String(err) });
      });

    // 6. Emitir evento
    eventBus.emit('message.received', {
      wamid: message.id,
      phone,
      conversationId: conversation.id,
      citizenId: citizen.id,
      message,
      correlationId: this.correlationId,
    });

    if (!this.realtimeNotifier?.isEnabled()) {
      eventBus.emit('message.created', {
        messageId: persistedMessage.id,
        conversationId: conversation.id,
        direction: 'inbound',
        messageType: persistedMessage.messageType,
        body: persistedMessage.body,
        createdAt: persistedMessage.createdAt.toISOString(),
        externalMessageId: persistedMessage.externalMessageId ?? undefined,
      });

      eventBus.emit('conversation.updated', {
        conversationId: conversation.id,
        action: 'message',
        flowState,
        occurredAt: new Date().toISOString(),
        triggeredBy: 'user',
      });

      // Sin modo durable no hay inboxPatch: una fila conocida en Inactivas no
      // se mueve con action 'message' → emitir reopen para reabrir la fila.
      if (conversation.reactivated) {
        eventBus.emit('conversation.updated', {
          conversationId: conversation.id,
          action: 'reopen',
          flowState,
          occurredAt: new Date().toISOString(),
          triggeredBy: 'user',
        });
      }
    }
  }

  /**
   * Procesa un lote de fragmentos inbound como un único turno IA.
   *
   * El lease de conversación lo toma el FSM sobre `conversation.id` ya
   * resuelto aquí. El worker de batch nunca ve el token: antes lo adquiría
   * por teléfono, que no es el UUID de `conversation_meta.conversation_id`.
   */
  async handleInboundBatch(
    phone: string,
    fragments: (ParsedWebhookMessage & { createdAt: Date; inboxEventId: string })[],
    generation: number,
    lineExternalIdentifier?: string,
  ): Promise<void> {
    if (fragments.length === 0) return;
    const groups = new Map<string, typeof fragments>();
    for (const fragment of fragments) {
      const key = fragment.phoneNumberId || lineExternalIdentifier || '';
      const group = groups.get(key) ?? [];
      group.push(fragment);
      groups.set(key, group);
    }
    if (groups.size > 1) {
      for (const [line, group] of groups) {
        await this.handleInboundBatch(phone, group, generation, line || undefined);
      }
      return;
    }
    lineExternalIdentifier = fragments[0].phoneNumberId || lineExternalIdentifier;

    // 1. Ciudadano y conversación canónica
    const citizen = await this.citizenRepo.findOrCreate(phone, fragments[0]?.profileName);
    const ingested = await this.messageRepo.findByExternalId(fragments[0].message.id);
    const line = lineExternalIdentifier
      ? await this.conversationRepo.findActiveCommunicationLineByExternalIdentifier(
          lineExternalIdentifier,
        )
      : undefined;
    if (lineExternalIdentifier && !line)
      throw new ConflictError('Línea receptora desconocida o inactiva');
    const conversation = ingested
      ? { id: ingested.conversationId, created: false, reactivated: false }
      : await this.conversationRepo.findOrCreateCanonical(
          citizen.id,
          line ? { communicationLineId: line.id } : undefined,
        );
    const ctx = await this.conversationRepo.getConversationContext(conversation.id);

    const boundLineId = await this.bindConversationLineContext(
      conversation.id,
      lineExternalIdentifier,
    );
    for (const fragment of fragments) await this.archiveMedia(fragment.message, boundLineId);

    if (!ctx?.meta) {
      throw new Error(`Conversación sin meta para ciudadano ${citizen.id}`);
    }

    let flowState = ctx.meta.flowState as ConversationFlowState;
    let version = ctx.meta.version;
    let assignedUserId = ctx.assignedUserId ?? undefined;

    // 2. Persistir/reutilizar cada fragmento en orden
    const persistedMessages: Message[] = [];
    for (const fragment of fragments) {
      const text = extractMessageText(fragment.message) ?? '';
      const existingInboundMessage =
        fragment === fragments[0]
          ? ingested
          : await this.messageRepo.findByExternalId(fragment.message.id);
      let persistedMessage: Message;

      if (existingInboundMessage && existingInboundMessage.conversationId !== conversation.id) {
        throw new ConflictError('El lote contiene mensajes de otra conversación');
      }
      if (existingInboundMessage) {
        persistedMessage = existingInboundMessage;
        log('info', 'orchestrator.batch.inbound_replay_reused', this.correlationId, {
          conversationId: conversation.id,
          messageId: persistedMessage.id,
        });
      } else if (this.realtimeNotifier?.isEnabled()) {
        persistedMessage = await this.persistInboundMessageWithOutbox({
          conversationId: conversation.id,
          body: text,
          messageType: this.mapMessageType(fragment.message.type),
          externalMessageId: fragment.message.id,
          meta: {
            ...inboundContent(fragment.message, fragment.phoneNumberId),
            ...(boundLineId ? { lineId: boundLineId } : {}),
          },
          flowState,
          contactName: citizen.name ?? undefined,
          phone,
          channel: ctx.channel,
          departmentSlug: ctx.meta.departmentSlug ?? undefined,
          assignedUserId,
          communicationLineId: boundLineId,
        });
      } else {
        persistedMessage = await this.messageRepo.create({
          conversationId: conversation.id,
          body: text,
          direction: MessageDirection.inbound,
          messageType: this.mapMessageType(fragment.message.type),
          externalMessageId: fragment.message.id,
          meta: {
            ...inboundContent(fragment.message, fragment.phoneNumberId),
            ...(boundLineId ? { lineId: boundLineId } : {}),
          },
        });
      }

      persistedMessages.push(persistedMessage);

      if (this.ticketService && !persistedMessage.ticketId) {
        const { ticket } = await this.ticketService.getOrCreateActiveTicket(
          conversation.id,
          citizen.id,
        );
        await this.ticketService.attachMessageToTicket(ticket.id, persistedMessage.id);
      }
    }

    // 3. Refrescar meta después de posibles transiciones
    const freshCtx = await this.conversationRepo.getConversationContext(conversation.id);
    if (freshCtx?.meta) {
      flowState = freshCtx.meta.flowState as ConversationFlowState;
      version = freshCtx.meta.version;
      assignedUserId = freshCtx.assignedUserId ?? undefined;
    }

    // 4. Aplicar reglas determinísticas sobre el texto unido
    const joinedText = persistedMessages.map((m) => m.body).join('\n');
    const isBotActive =
      (flowState === 'BOT_FLOW' || flowState === 'DEPARTMENT_ROUTING') &&
      isBotAllowed({
        flowState,
        attendanceMode: (freshCtx ?? ctx)?.attendanceMode,
        botEnabled: (freshCtx ?? ctx)?.botEnabled,
      });
    const citizenFullyRegistered = citizenHasCompleteRegistrationProfile({
      name: citizen.name,
      phone: citizen.phone,
      neighborhoodId: citizen.neighborhoodId,
      neighborhood: citizen.neighborhood,
    });
    // Guard de atención (batch): métrica cuando el bot queda silenciado.
    this.emitBotSkipMetric(conversation.id, flowState, freshCtx ?? ctx);

    if (
      isBotActive &&
      citizenFullyRegistered &&
      MessageOrchestratorService.FAREWELL_REGEX.test(joinedText)
    ) {
      await this.applyFarewellClose(conversation.id);
      log('info', 'orchestrator.batch.farewell_close', this.correlationId, {
        conversationId: conversation.id,
        flowState,
      });
    } else if (this.fsmRouter) {
      const aiText = joinedText.trim();
      if (
        aiText ||
        fragments.some(({ message }) => MessageOrchestratorService.hasMultimodalMessage(message))
      ) {
        const lastFragment = fragments[fragments.length - 1];
        const lastMessage = persistedMessages[persistedMessages.length - 1];
        const shouldShowTyping = isBotActive;
        if (shouldShowTyping) this.emitTyping(conversation.id, true);
        try {
          const fsmResult = await this.fsmRouter.handle({
            conversationId: conversation.id,
            citizenId: citizen.id,
            phone,
            lineExternalIdentifier,
            messageId: lastMessage.id,
            waMessageId: lastFragment.message.id,
            messageText: aiText,
            inboundMessages: fragments.map((fragment) => fragment.message),
            correlationId: this.correlationId,
            excludeMessageIds: persistedMessages.map(({ id }) => id),
            batchGeneration: generation,
            metaOverride: {
              flowState,
              version,
              assignedUserId,
              attendanceMode: (freshCtx ?? ctx)?.attendanceMode,
              botEnabled: (freshCtx ?? ctx)?.botEnabled,
            },
          });
          if (fsmResult.decision.kind === 'lock_conflict')
            throw new Error('Conversation AI turn is still active');
        } finally {
          if (shouldShowTyping) this.emitTyping(conversation.id, false);
        }
      }
    }

    // 5. Marcar como leído cada fragmento
    for (const fragment of fragments) {
      this.whatsappProvider
        .markAsRead(fragment.message.id, {
          ...(lineExternalIdentifier ? { lineExternalIdentifier } : {}),
          allowDefault: true,
        })
        .catch((err: unknown) => {
          log('warn', 'orchestrator.batch.mark_read.failed', this.correlationId, {
            error: String(err),
          });
        });
    }
  }

  private async persistInboundMessageWithOutbox(params: {
    conversationId: string;
    body: string;
    messageType: MessageType;
    externalMessageId: string;
    meta: Record<string, unknown>;
    flowState: ConversationFlowState;
    contactName?: string;
    phone?: string;
    channel?: string;
    departmentSlug?: string;
    assignedUserId?: string;
    /** UUID interno de la línea resuelta en el bind del orquestador. */
    communicationLineId?: string;
  }): Promise<Message> {
    if (!this.prisma) {
      throw new Error('MessageOrchestratorService requires PrismaService for durable realtime');
    }

    return withRealtimeTransaction(
      this.prisma,
      this.realtimeNotifier,
      async (tx) => {
        const message = await this.messageRepo.createInTransaction(tx, {
          conversationId: params.conversationId,
          body: params.body,
          direction: MessageDirection.inbound,
          messageType: params.messageType,
          externalMessageId: params.externalMessageId,
          meta: params.meta,
        });

        const occurredAt = message.createdAt.toISOString();
        const correlationId =
          this.correlationId || `inbound-${params.conversationId}-${Date.now()}`;

        await this.realtimeNotifier!.notifyCritical(
          tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
          buildMessageCreatedEvent(message, params.conversationId, correlationId, occurredAt, {
            contactName: params.contactName,
            phone: params.phone,
            flowState: params.flowState,
            channel: params.channel,
            departmentSlug: params.departmentSlug,
            assignedUserId: params.assignedUserId,
            communicationLineId: params.communicationLineId,
          }),
        );

        await this.realtimeNotifier!.notifyCritical(
          tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
          buildConversationUpdatedEvent(
            params.conversationId,
            correlationId,
            occurredAt,
            params.flowState,
            message,
            {
              assignedUserId: params.assignedUserId,
              departmentSlug: params.departmentSlug,
              contactName: params.contactName,
              phone: params.phone,
            },
          ),
        );

        return message;
      },
      PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
    );
  }

  private emitTyping(conversationId: string, typing: boolean): void {
    const payload = { conversationId, typing, ttlMs: 8_000 };
    if (this.realtimeNotifier?.isEnabled()) {
      void this.realtimeNotifier
        .notifyEphemeral({
          eventType: EphemeralEventType.ConversationTyping,
          socketEventName: SocketEventName.ConversationTyping,
          payload,
        })
        .catch((err: unknown) => {
          log('warn', 'orchestrator.typing.emit_failed', this.correlationId, {
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      return;
    }
    eventBus.emit('conversation.typing', payload);
  }

  /**
   * Enlaza la línea activa a la conversación y devuelve su UUID interno
   * (`communication_lines.id`) para portearlo en los eventos realtime.
   */
  private async bindConversationLineContext(
    conversationId: string,
    lineExternalIdentifier?: string,
  ): Promise<string | undefined> {
    if (!lineExternalIdentifier) {
      return undefined;
    }

    const line =
      await this.conversationRepo.findActiveCommunicationLineByExternalIdentifier(
        lineExternalIdentifier,
      );

    if (!line?.id) {
      return undefined;
    }

    await this.conversationRepo.bindCommunicationLine(conversationId, line.id);
    return line.id;
  }

  /**
   * Métrica log-based del guard del orquestador: cuándo el bot queda silenciado
   * por modo de atención pese a que el estado permitiría IA. No cambia el ruteo
   * (la autoridad de bloqueo sigue siendo isBotAllowed + el guard del router).
   *
   * @returns 'human_mode' | 'assigned_agent' | null
   */
  private botSkipReason(
    flowState: ConversationFlowState,
    ctx: {
      attendanceMode?: string | null;
      botEnabled?: boolean | null;
      assignedUserId?: string | null;
    },
  ): 'human_mode' | 'assigned_agent' | null {
    if (!canAiOperate(flowState)) return null;
    if (ctx.attendanceMode === 'human' || ctx.botEnabled === false) return 'human_mode';
    if (ctx.assignedUserId != null) return 'assigned_agent';
    return null;
  }

  private emitBotSkipMetric(
    conversationId: string,
    flowState: ConversationFlowState,
    ctx: {
      attendanceMode?: string | null;
      botEnabled?: boolean | null;
      assignedUserId?: string | null;
    },
  ): void {
    const reason = this.botSkipReason(flowState, ctx);
    if (!reason) return;
    log('info', `bot.skipped.${reason}`, this.correlationId, {
      conversationId,
      flowState,
      attendanceMode: ctx.attendanceMode ?? null,
      botEnabled: ctx.botEnabled ?? null,
      assignedUserId: ctx.assignedUserId ?? null,
    });
  }

  private async handleBotFlow(
    message: WaInboundMessage,
    conversationId: string,
    citizenId: string,
    flowState: ConversationFlowState,
    version: number,
    citizenInterests: string[] = [],
    citizenAlreadyRegistered = false,
  ): Promise<void> {
    let currentFlowState = flowState;
    let currentVersion = version;

    if (flowState === 'BOT_FLOW' && !citizenAlreadyRegistered) {
      try {
        await this.stateMachine.transition(conversationId, 'REGISTERING', version, {
          triggeredBy: 'system',
        });
        currentFlowState = 'REGISTERING';
        currentVersion = version + 1;
      } catch (err) {
        log('warn', 'orchestrator.transition.bot_flow_to_registering.failed', this.correlationId, {
          error: String(err),
        });
      }
    }

    const text = extractMessageText(message);
    if (!text) {
      return;
    }

    if (currentFlowState === 'REGISTERING' && this.hasExplicitHumanRequest(text)) {
      await this.stateMachine.transition(conversationId, 'HUMAN_FLOW', currentVersion, {
        triggeredBy: 'user',
      });
      this.resetComplexityCounter(conversationId);
      return;
    }

    if (currentFlowState !== 'BOT_FLOW') {
      return;
    }

    // En BOT_FLOW normal: aplicar reglas determinísticas post-mensaje
    await this.applyBotFlowRules(conversationId, citizenId, text, currentVersion, citizenInterests);
  }

  /**
   * Aplica reglas determinísticas en BOT_FLOW normal (no post-registro):
   *  1. "quiero un humano" → HUMAN_FLOW inmediato
   *  2. intención de departamento → DEPARTMENT_ROUTING → HUMAN_FLOW
   *  3. frustración o 2 fallos seguidos → HUMAN_FLOW
   *  4. caso normal → bot/IA
   */
  private async applyBotFlowRules(
    conversationId: string,
    citizenId: string,
    text: string,
    currentVersion: number,
    citizenInterests: string[] = [],
  ): Promise<void> {
    // Regla 1: solicitud explícita de humano
    if (this.hasExplicitHumanRequest(text)) {
      await this.stateMachine.transition(conversationId, 'HUMAN_FLOW', currentVersion, {
        triggeredBy: 'user',
      });
      this.resetComplexityCounter(conversationId);
      return;
    }

    // Regla 2: intención de departamento (ventas, obras, etc.)
    const deptSlug = await this.deptRouter.route({
      message: {
        type: 'text',
        id: '',
        from: '',
        timestamp: '',
        text: { body: text },
      } as WaInboundMessage,
      citizenId,
      conversationId,
      citizenInterests,
    });

    if (deptSlug) {
      await this.stateMachine.transition(conversationId, 'DEPARTMENT_ROUTING', currentVersion, {
        triggeredBy: 'system',
        departmentSlug: deptSlug,
      });

      this.resetComplexityCounter(conversationId);
      return;
    }

    // Regla 3: frustración o complejidad acumulada
    const frustrated = this.hasFrustrationSignal(text);
    const hasRoutingIntent = this.hasRoutingIntent(text);
    if (!frustrated && !hasRoutingIntent) {
      this.resetComplexityCounter(conversationId);
      return;
    }

    const attempts = this.incrementComplexityCounter(conversationId);
    if (frustrated || attempts >= 2) {
      await this.stateMachine.transition(conversationId, 'HUMAN_FLOW', currentVersion, {
        triggeredBy: 'system',
      });
      this.resetComplexityCounter(conversationId);
    }
  }

  private hasExplicitHumanRequest(text: string): boolean {
    return MessageOrchestratorService.HUMAN_REQUEST_REGEX.test(text);
  }

  private hasFrustrationSignal(text: string): boolean {
    return MessageOrchestratorService.FRUSTRATION_REGEX.test(text);
  }

  private hasRoutingIntent(text: string): boolean {
    return MessageOrchestratorService.ROUTING_INTENT_REGEX.test(text);
  }

  private incrementComplexityCounter(conversationId: string): number {
    const now = Date.now();
    const entry = this.complexityCounters.get(conversationId);
    if (!entry || entry.expiresAt <= now) {
      this.complexityCounters.set(conversationId, {
        count: 1,
        expiresAt: now + MessageOrchestratorService.COMPLEXITY_COUNTER_TTL_SECONDS * 1000,
      });
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }

  private resetComplexityCounter(conversationId: string): void {
    this.complexityCounters.delete(conversationId);
  }

  /**
   * Cierre determinístico por despedida (red de seguridad).
   * Cierra solo el ticket activo. La conversación permanece como entidad continua:
   * el siguiente mensaje del ciudadano reactiva la misma conversación y crea un ticket nuevo.
   */
  private async applyFarewellClose(conversationId: string): Promise<void> {
    try {
      // Ticket primero (best-effort — mensaje ya adjuntado en paso 4b)
      if (this.ticketService) {
        const activeTicket = await this.ticketService.getActiveTicketByConversation(conversationId);
        if (activeTicket) {
          await this.ticketService.closeTicket(activeTicket.id, {
            reason: 'resolved',
            summary: 'El ciudadano indicó que no necesita nada más.',
          });
        }
      }
    } catch (err: unknown) {
      log('warn', 'orchestrator.farewell_close.failed', this.correlationId, {
        conversationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async archiveMedia(message: WaInboundMessage, lineId?: string) {
    const media = record(inboundContent(message).media);
    if (typeof media.id !== 'string') return;
    const store = new PrivateMediaStore(
      this.prisma ? { fallback: createAttachmentMediaFallback(this.prisma) } : {},
    );
    try {
      await store.get(media.id, this.whatsappProvider, lineId ? { lineId } : undefined);
    } catch {
      log('warn', 'media.archive_failed', this.correlationId, { messageId: message.id });
    }
  }

  private static hasMultimodalMessage(message: WaInboundMessage): boolean {
    return MessageOrchestratorService.MULTIMODAL_MESSAGE_TYPES.has(message.type);
  }

  private mapMessageType(type: string): MessageType {
    return internalMessageType(type);
  }
}
