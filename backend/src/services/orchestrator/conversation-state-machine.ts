/**
 * Conversation State Machine.
 *
 * Gestiona las transiciones de estado de una conversación:
 * BOT_FLOW → REGISTERING → DEPARTMENT_ROUTING → HUMAN_FLOW → ESCALATED → CLOSED
 *
 * Usa optimistic locking via ConversationRepository.updateFlowState.
 * Emite eventos en el EventBus para que otros componentes reaccionen.
 */
import { ConversationStatus, Prisma } from '@prisma/client';
import { VALID_TRANSITIONS } from '../../config/conversation-states';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { ConversationFlowState } from '../../types/whatsapp.types';
import { createStructuredLogger } from '../../utils/structured-logger';
import { eventBus } from '../events/event-bus.service';

const log = createStructuredLogger('ConversationStateMachine');

export class ConversationStateMachine {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    /** Optional override for tests or custom transition policies */
    private readonly transitionTable: Record<
      ConversationFlowState,
      ConversationFlowState[]
    > = VALID_TRANSITIONS,
  ) {}

  /**
   * Transiciona el estado de una conversación con validación y optimistic locking.
   *
   * @param conversationId  - UUID de la conversación
   * @param toState         - Estado destino
   * @param currentVersion  - Versión actual para optimistic locking
   * @param opts            - Opciones adicionales (agente, departamento)
   */
  async transition(
    conversationId: string,
    toState: ConversationFlowState,
    currentVersion: number,
    opts?: {
      triggeredBy?: 'bot' | 'user' | 'agent' | 'system';
      agentId?: string;
      departmentSlug?: string;
      /** When true, the state machine skips its internal EventBus emits so the caller can route events through the durable outbox. */
      suppressEventBus?: boolean;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const ctx = tx
      ? await this.conversationRepo.getConversationContextInTransaction(tx, conversationId)
      : await this.conversationRepo.getConversationContext(conversationId);
    if (!ctx?.meta) {
      throw new Error(`Conversación ${conversationId} no encontrada o sin meta`);
    }

    const fromState = ctx.meta.flowState as ConversationFlowState;

    // Validar transición
    if (!this.isValidTransition(fromState, toState)) {
      throw new Error(
        `Transición inválida: ${fromState} → ${toState} para conversación ${conversationId}`,
      );
    }

    // Anti-loop: prevenir transiciones cíclicas rápidas BOT↔HUMAN
    if (fromState === toState) {
      log('debug', 'fsm.transition_idempotent', undefined, {
        conversationId,
        fromState,
        toState,
      });
      return;
    }

    // Aplicar con optimistic locking
    if (tx) {
      await this.conversationRepo.updateFlowStateInTransaction(
        tx,
        conversationId,
        toState,
        currentVersion,
        {
          lockedByUserId: opts?.agentId,
          departmentSlug: opts?.departmentSlug,
        },
      );
    } else {
      await this.conversationRepo.updateFlowState(conversationId, toState, currentVersion, {
        lockedByUserId: opts?.agentId,
        departmentSlug: opts?.departmentSlug,
      });
    }

    // Punto único de cierre: al llegar a CLOSED, la entidad también pasa a
    // status closed y los tickets activos se cierran. Sin esto, el índice
    // parcial `uq_conversations_active_per_citizen_channel` sigue cubriendo la
    // fila (status open) y un recontacto choca con P2002 en
    // findOrCreateCanonical, que terminaba devolviendo el ciclo muerto.
    if (toState === 'CLOSED') {
      if (tx) {
        await this.conversationRepo.updateConversationStatusInTransaction(
          tx,
          conversationId,
          ConversationStatus.closed,
        );
        await this.conversationRepo.closeActiveTicketsInTransaction(
          tx,
          conversationId,
          'conversation_closed',
        );
      } else {
        await this.conversationRepo.updateConversationStatus(
          conversationId,
          ConversationStatus.closed,
        );
        await this.conversationRepo.closeActiveTickets(conversationId, 'conversation_closed');
      }
    }

    // Emitir evento de handover
    if (!opts?.suppressEventBus) {
      if (
        (fromState === 'BOT_FLOW' || fromState === 'REGISTERING') &&
        (toState === 'HUMAN_FLOW' || toState === 'ESCALATED')
      ) {
        eventBus.emit('conversation.handover', {
          conversationId,
          fromState,
          toState,
          triggeredBy: opts?.triggeredBy ?? 'system',
          agentId: opts?.agentId,
          departmentSlug: opts?.departmentSlug,
        });
      }

      eventBus.emit('conversation.updated', {
        conversationId,
        action: 'state-transition',
        flowState: toState,
        triggeredBy: opts?.triggeredBy ?? 'system',
        actorId: opts?.agentId,
        occurredAt: new Date().toISOString(),
      });
    }

    log('info', 'fsm.transition', undefined, {
      conversationId,
      fromState,
      toState,
      triggeredBy: opts?.triggeredBy ?? 'system',
    });
  }

  /** Verifica si una transición es válida */
  isValidTransition(from: ConversationFlowState, to: ConversationFlowState): boolean {
    return this.transitionTable[from]?.includes(to) ?? false;
  }
}
