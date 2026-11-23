import { AIStreamCoalescer } from '../realtime/ai-stream-coalescer';
import { FsmRouterV2 } from '../../ai/fsm/fsm-router-v2';
import { MultimodalService } from '../../ai/services/multimodal.service';
import { NvidiaService } from '../../ai/services/nvidia.service';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { MessageRepository } from '../../repositories/message.repository';
import { TicketRepository } from '../../repositories/ticket.repository';
import { OutboxProcessorService } from '../events/outbox-processor.service';
import { ConversationLeaseLock } from '../fsm-lock.service';
import { createAttachmentMediaFallback } from '../media/attachment-media.fallback';
import { PrismaService } from '../prisma.service';
import { AIStreamPubSubPublisher } from '../realtime/ai-stream-pubsub.service';
import { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import { TicketService } from '../tickets/ticket.service';
import { WhatsAppProvider } from '../whatsapp/whatsapp.provider';
import { PrivateMediaStore } from '../whatsapp/private-media.store';
import { ConversationStateMachine } from './conversation-state-machine';
import { DepartmentRouterStrategy } from './department-router.strategy';
import { MessageOrchestratorService } from './message-orchestrator.service';

interface AiRuntimeFactoryDeps {
  prisma: PrismaService;
  fsmLock: ConversationLeaseLock;
  whatsappProvider: WhatsAppProvider;
  outboxProcessor: OutboxProcessorService;
  aiStreamPublisher: AIStreamPubSubPublisher;
  realtimeNotifier?: RealtimeNotifier;
}

/**
 * Dependencias de runtime construidas una sola vez por proceso/worker.
 * Son stateless respecto del mensaje: el correlationId fluye por argumento.
 */
interface AiRuntime {
  citizenRepo: CitizenRepository;
  conversationRepo: ConversationRepository;
  messageRepo: MessageRepository;
  stateMachine: ConversationStateMachine;
  deptRouter: DepartmentRouterStrategy;
  ticketService: TicketService;
  fsmRouter: FsmRouterV2;
}

/**
 * Construye el runtime de IA/FSM para procesar mensajes inbound.
 *
 * El wiring pesado (repositorios, registries de IA, FSM router) se construye
 * una sola vez por instancia y se reutiliza entre mensajes; solo el
 * MessageOrchestratorService se crea por mensaje para portar su correlationId.
 */
export class AiRuntimeFactory {
  private runtimePromise?: Promise<AiRuntime>;

  constructor(private readonly deps: AiRuntimeFactoryDeps) {}

  async buildOrchestrator(correlationId: string): Promise<MessageOrchestratorService> {
    const runtime = await this.getRuntime();

    return new MessageOrchestratorService(
      runtime.citizenRepo,
      runtime.conversationRepo,
      runtime.messageRepo,
      runtime.stateMachine,
      runtime.deptRouter,
      this.deps.whatsappProvider,
      runtime.fsmRouter,
      correlationId,
      runtime.ticketService,
      this.deps.realtimeNotifier,
      this.deps.prisma,
    );
  }

  private getRuntime(): Promise<AiRuntime> {
    if (!this.runtimePromise) {
      this.runtimePromise = this.buildRuntime();
    }
    return this.runtimePromise;
  }

  private async buildRuntime(): Promise<AiRuntime> {
    const citizenRepo = new CitizenRepository(this.deps.prisma);
    const conversationRepo = new ConversationRepository(this.deps.prisma);
    const messageRepo = new MessageRepository(this.deps.prisma);

    const stateMachine = new ConversationStateMachine(conversationRepo);
    const deptRouter = new DepartmentRouterStrategy(this.deps.prisma);

    const { AIService } = await import('../../ai/services/ai.service');
    const { DEFAULT_FSM_GUARDRAILS } = await import('../../ai/fsm/fsm-guards');

    const ticketRepository = new TicketRepository(this.deps.prisma);
    const ticketService = new TicketService(
      ticketRepository,
      this.deps.realtimeNotifier,
      this.deps.prisma,
    );

    const stream = new AIStreamCoalescer(this.deps.aiStreamPublisher);
    const aiService = new AIService({
      multimodal: new MultimodalService(
        this.deps.whatsappProvider,
        new NvidiaService(),
        new PrivateMediaStore({ fallback: createAttachmentMediaFallback(this.deps.prisma) }),
      ),
      realtimeNotifier: this.deps.realtimeNotifier,
      prisma: this.deps.prisma,
      outboxProcessor: this.deps.outboxProcessor,
      messageRepo,
      citizenRepo,
      conversationRepo,
      guardrails: DEFAULT_FSM_GUARDRAILS,
      ticketService,
      onStreamChunk: (payload) => {
        stream.push({
          conversationId: payload.conversationId,
          citizenId: payload.citizenId,
          correlationId: payload.correlationId,
          runId: payload.runId,
          provider: payload.provider,
          model: payload.model,
          iteration: payload.iteration,
          textDelta: payload.chunk.textDelta,
          accumulatedText: payload.chunk.accumulatedText,
        });
      },
      onStreamDone: async (payload) => {
        await stream.finish({
          conversationId: payload.conversationId,
          citizenId: payload.citizenId,
          correlationId: payload.correlationId,
          runId: payload.runId,
          handled: payload.handled,
        });
      },
    });

    const fsmRouter = new FsmRouterV2(
      conversationRepo,
      stateMachine,
      this.deps.fsmLock,
      aiService,
      undefined,
      this.deps.whatsappProvider,
      this.deps.realtimeNotifier,
      this.deps.prisma,
    );

    aiService.toolRunner.setFsmRouter(fsmRouter);

    return {
      citizenRepo,
      conversationRepo,
      messageRepo,
      stateMachine,
      deptRouter,
      ticketService,
      fsmRouter,
    };
  }
}
