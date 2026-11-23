import { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
import { withRealtimeTransaction } from '../../services/realtime/realtime-transaction';
import {
  buildMessageCreatedEvent,
  buildConversationUpdatedEvent,
} from '../../services/realtime/message-event.builder';
import { serializeOutboxPayload } from '../../services/events/outbox-payload';
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../../database/transaction-options';
import { ConversationChannel, MessageDirection, MessageType } from '@prisma/client';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { MessageRepository } from '../../repositories/message.repository';
import { AuditService } from '../../services/audit.service';
import { OutboxProcessorService } from '../../services/events/outbox-processor.service';
import { PrismaService } from '../../services/prisma.service';
import { TicketService } from '../../services/tickets/ticket.service';
import { AIExecutionContext, AIMessage, AIStreamChunk } from '../core/types';
import { DEFAULT_FSM_GUARDRAILS, FsmGuardrails } from '../fsm/fsm-guards';
import { AILogger } from '../logging/ai.logger';
import { AIOrchestrator, OrchestratorResult } from '../orchestrator/orchestrator';
import { ProviderFactory } from '../providers/provider.factory';
import { AgentRegistry } from '../registry/agent.registry';
import { ToolRegistry } from '../registry/tool.registry';
import { TopicRegistry } from '../registry/topic.registry';
import { ExternalToolRunner } from '../runners/external-tool.runner';
import { InternalToolRunner } from '../runners/internal-tool.runner';
import { ToolRunner } from '../runners/tool.runner';
import { ToolPolicy } from '../security/tool-policy';
import { createStructuredLogger } from '../../utils/structured-logger';
import { MultimodalService } from './multimodal.service';

const log = createStructuredLogger('AIService');

interface AIServiceDeps {
  multimodal?: Pick<MultimodalService, 'prepare'>;
  prisma: PrismaService;
  realtimeNotifier?: RealtimeNotifier;
  outboxProcessor: OutboxProcessorService;
  messageRepo: MessageRepository;
  citizenRepo: CitizenRepository;
  conversationRepo: ConversationRepository;
  auditService?: AuditService;
  /** TicketService — opcional para compatibilidad con entornos sin tickets */
  ticketService?: TicketService;
  /** Guardrails FSM que limitan iteraciones y tool calls en el orquestador */
  guardrails?: Partial<FsmGuardrails>;
  onStreamChunk?: (payload: {
    conversationId: string;
    citizenId: string;
    correlationId: string;
    runId: string;
    provider: 'openai' | 'anthropic';
    model: string;
    chunk: AIStreamChunk;
    iteration: number;
  }) => Promise<void> | void;
  onStreamDone?: (payload: {
    conversationId: string;
    citizenId: string;
    correlationId: string;
    runId?: string;
    handled: boolean;
  }) => Promise<void> | void;
}

export class AIService {
  private readonly agentRegistry: AgentRegistry;
  private readonly orchestrator: AIOrchestrator;
  readonly toolRunner: ToolRunner;

  constructor(private readonly deps: AIServiceDeps) {
    this.agentRegistry = new AgentRegistry(deps.prisma);

    const guardrails: FsmGuardrails = { ...DEFAULT_FSM_GUARDRAILS, ...deps.guardrails };

    const logger = new AILogger(deps.prisma);
    const auditService = deps.auditService ?? new AuditService(deps.prisma);
    const internalToolRunner = new InternalToolRunner({
      citizenRepo: deps.citizenRepo,
      conversationRepo: deps.conversationRepo,
      messageRepo: deps.messageRepo,
      outboxProcessor: deps.outboxProcessor,
      prisma: deps.prisma,
      auditService,
      ticketService: deps.ticketService,
      realtimeNotifier: deps.realtimeNotifier,
    });
    const externalToolRunner = new ExternalToolRunner(new ToolPolicy());
    const toolRunner = new ToolRunner(internalToolRunner, externalToolRunner, logger);
    this.toolRunner = toolRunner;

    this.orchestrator = new AIOrchestrator(
      new ProviderFactory(),
      new TopicRegistry(deps.prisma),
      new ToolRegistry(deps.prisma),
      toolRunner,
      logger,
      {
        maxIterations: guardrails.maxIterations,
        maxToolCalls: guardrails.maxToolCalls,
        duplicateToolLoopThreshold: guardrails.duplicateToolLoopThreshold,
      },
    );
  }

  async handleMessage(context: AIExecutionContext): Promise<{ handled: boolean; runId?: string }> {
    const resolved = await this.agentRegistry.resolveLineAgent({
      channel: ConversationChannel.whatsapp,
      phoneNumber: context.phone,
      externalIdentifier: context.lineExternalIdentifier,
    });

    if (!resolved) {
      return { handled: false };
    }

    const recentMessages = await this.deps.messageRepo.findRecentForAiContext({
      conversationId: context.conversationId,
      limit: 20,
      excludeMessageIds: context.excludeMessageIds ?? [context.messageId],
    });

    const historyMessages: AIMessage[] = recentMessages.map((m) => ({
      role: m.direction === MessageDirection.inbound ? 'user' : 'assistant',
      content: m.body,
    }));

    const prepared = this.deps.multimodal
      ? await this.deps.multimodal.prepare(context, resolved.lineId)
      : undefined;

    if (prepared?.status === 'ready' && prepared.mediaCount > 0) {
      log('info', 'ai.multimodal_context_delivered', context.correlationId, {
        conversationId: context.conversationId,
        messageId: context.messageId,
        sourceMessageIds: prepared.sourceMessageIds,
        mediaCount: prepared.mediaCount,
      });
    }

    const run: OrchestratorResult =
      prepared?.status === 'fallback'
        ? { handled: true, responseText: prepared.responseText }
        : await this.orchestrator.run({
            context:
              prepared?.status === 'ready'
                ? { ...context, messageText: prepared.messageText }
                : context,
            lineId: resolved.lineId,
            agent: resolved.agent,
            historyMessages,
            onChunk: this.deps.onStreamChunk
              ? async ({ runId, provider, model, chunk, iteration }) => {
                  try {
                    await this.deps.onStreamChunk?.({
                      conversationId: context.conversationId,
                      citizenId: context.citizenId,
                      correlationId: context.correlationId,
                      runId,
                      provider,
                      model,
                      chunk,
                      iteration,
                    });
                  } catch (error) {
                    this.logStreamNotificationFailure('chunk', context, runId, error);
                  }
                }
              : undefined,
          });

    // La entrega al ciudadano es durable y tiene prioridad: se publica antes de
    // cualquier señal efímera de realtime. Así, un fallo del transporte
    // (p. ej. Pub/Sub no disponible) nunca descarta la respuesta al ciudadano.
    let handled = false;
    try {
      if (run.handled && run.responseText) {
        const idempotencyKey =
          context.batchGeneration !== undefined
            ? `ai:${context.conversationId}:batch:${context.batchGeneration}`
            : `ai:${context.conversationId}:${context.messageId}`;

        const aiAgentName = resolved.agent.name.trim();
        await this.persistOutboundReply(
          context.conversationId,
          run.responseText,
          idempotencyKey,
          {
            source: 'ai',
            ...(run.runId ? { aiRunId: run.runId } : {}),
            ...(aiAgentName ? { aiAgentName } : {}),
          },
          context,
        );

        await this.deps.outboxProcessor.enqueue(
          context.phone,
          {
            messaging_product: 'whatsapp',
            to: context.phone,
            type: 'text',
            text: { body: run.responseText },
          },
          idempotencyKey,
          context.conversationId,
          {
            ...(context.lineExternalIdentifier
              ? { lineExternalIdentifier: context.lineExternalIdentifier }
              : {}),
          },
        );

        handled = true;
      }
    } finally {
      await this.notifyStreamDone(context, run);
    }

    return { handled, runId: run.runId };
  }

  private async persistOutboundReply(
    conversationId: string,
    body: string,
    idempotencyKey: string,
    meta: Record<string, unknown>,
    execution: AIExecutionContext,
  ): Promise<void> {
    const notifier = this.deps.realtimeNotifier;
    if (notifier?.isEnabled()) {
      await withRealtimeTransaction(
        this.deps.prisma,
        notifier,
        async (tx) => {
          if (await tx.message.findUnique({ where: { idempotencyKey } })) return;
          const context = await tx.conversation.findUniqueOrThrow({
            where: { id: conversationId },
            include: { meta: true, citizen: true },
          });
          const inbound = await tx.message.findUnique({
            where: { id: execution.messageId },
            select: { ticketId: true },
          });
          // Preserve the originating case if a new ticket opens while the model is running.
          const active = inbound?.ticketId
            ? await tx.ticket.findUnique({ where: { id: inbound.ticketId } })
            : await tx.ticket.findFirst({
                where: { conversationId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
              });
          const message = await this.deps.messageRepo.createInTransaction(tx, {
            conversationId,
            ticketId: active?.id,
            body,
            direction: MessageDirection.outbound,
            messageType: MessageType.text,
            idempotencyKey,
            meta,
          });
          if (active)
            await this.deps.ticketService
              ?.inTransaction(tx)
              .attachMessageToTicket(active.id, message.id);
          await tx.outboxEvent.create({
            data: {
              phone: execution.phone,
              conversationId,
              idempotencyKey,
              payload: serializeOutboxPayload(
                {
                  messaging_product: 'whatsapp',
                  to: execution.phone,
                  type: 'text',
                  text: { body },
                },
                { lineExternalIdentifier: execution.lineExternalIdentifier },
              ) as object,
            },
          });
          await notifier.notifyCritical(
            tx,
            buildMessageCreatedEvent(
              message,
              conversationId,
              execution.correlationId,
              message.createdAt.toISOString(),
            ),
          );
          await notifier.notifyCritical(
            tx,
            buildConversationUpdatedEvent(
              conversationId,
              execution.correlationId,
              message.createdAt.toISOString(),
              context.meta?.flowState ?? 'BOT_FLOW',
              message,
            ),
          );
        },
        PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
      );
      return;
    }
    // Adjuntar al ticket activo de la conversación (best-effort: si el servicio
    // de tickets no está disponible o no hay ticket, el mensaje queda sin ticket).
    let ticketId: string | undefined;
    if (this.deps.ticketService) {
      const activeTicket =
        await this.deps.ticketService.getActiveTicketByConversation(conversationId);
      ticketId = activeTicket?.id;
    }

    try {
      await this.deps.messageRepo.create({
        conversationId,
        ...(ticketId ? { ticketId } : {}),
        body,
        direction: MessageDirection.outbound,
        messageType: MessageType.text,
        idempotencyKey,
        meta,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const existing = await this.deps.messageRepo.findByIdempotencyKey(idempotencyKey);
      if (!existing) throw error;
    }
  }

  /**
   * Señal efímera de fin de streaming. Es best-effort: si el transporte de
   * realtime falla, se registra pero NO se propaga, porque no debe afectar la
   * entrega durable ni el resultado de la atención.
   */
  private async notifyStreamDone(
    context: AIExecutionContext,
    run: { runId?: string; handled: boolean },
  ): Promise<void> {
    if (!this.deps.onStreamDone) {
      return;
    }
    try {
      await this.deps.onStreamDone({
        conversationId: context.conversationId,
        citizenId: context.citizenId,
        correlationId: context.correlationId,
        runId: run.runId,
        handled: run.handled,
      });
    } catch (error) {
      this.logStreamNotificationFailure('done', context, run.runId, error);
    }
  }

  private logStreamNotificationFailure(
    kind: 'chunk' | 'done',
    context: AIExecutionContext,
    runId: string | undefined,
    error: unknown,
  ): void {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        service: 'AIService',
        event: 'ai.stream_notify_failed',
        kind,
        runId,
        correlationId: context.correlationId,
        conversationId: context.conversationId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
