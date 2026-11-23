import {
  AttendanceMode,
  ConversationStatus,
  MessageDirection,
  MessageType,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import type { DepartmentHoursSource } from '../ai/tools/assign-department-v2.tool';
import {
  type ConversationContext,
  type ConversationListItem,
  type ConversationListQuery,
  ConversationRepository,
} from '../repositories/conversation.repository';
import { type MessageWithSender, MessageRepository } from '../repositories/message.repository';
import { ConversationFlowState } from '../types/whatsapp.types';
import { AppError } from '../utils/app-error';
import { isOpenAt, parseServiceSchedule } from '../utils/department-hours';
import { eventBus } from './events/event-bus.service';
import { ConversationStateMachine } from './orchestrator/conversation-state-machine';
import { PrismaService } from './prisma.service';
import { buildInboxMessagePreview } from './realtime/inbox-preview.util';
import {
  type RealtimeInboxPatch,
  ConversationRealtimeAction,
  CriticalEventType,
  RealtimeDurableEvent,
  SocketEventName,
} from './realtime/realtime-event.contracts';
import { RealtimeNotifier } from './realtime/realtime-notifier.service';
import { withRealtimeTransaction } from './realtime/realtime-transaction';
import { buildTicketClosedEvent } from './realtime/ticket-event.builder';
import { TicketService } from './tickets/ticket.service';

export type InboxStatus = 'active' | 'inactive';

export function normalizeInboxListStatus(raw: string | undefined): InboxStatus | undefined {
  if (!raw?.trim()) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === 'active' || value === 'activa' || value === 'activas') return 'active';
  if (value === 'inactive' || value === 'inactiva' || value === 'inactivas') return 'inactive';
  return undefined;
}

export type ConversationListParams = {
  cursor?: string;
  limit?: number;
  citizenId?: string;
  inboxStatus?: InboxStatus;
  departmentId?: string;
  departmentIds?: string[];
  departmentSlug?: string;
  communicationLineId?: string;
  search?: string;
  viewerUserId?: string;
  /**
   * Filtro multi-bot: ids de agentes IA; `null` dentro del array = "todos los
   * bots" (cualquier línea con agente activo). Se combina con OR frente a los
   * filtros de departamento (nunca AND).
   */
  botIds?: (string | null)[];
};

export type ConversationListDto = Omit<ConversationListItem, 'messages' | 'tickets'> & {
  inboxStatus: InboxStatus;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  lastMessageDirection?: 'inbound' | 'outbound';
  unreadCount: number;
  /** Agente IA activo que atiende la línea de la conversación (null si humano/sin línea). */
  botAgent: { id: string; name: string } | null;
};

type ConversationListResult = {
  items: ConversationListDto[];
  meta: { nextCursor: string | undefined; hasNextPage: boolean };
};

/** Destino de una transferencia manual de conversación. */
export type TransferTarget =
  | { type: 'agent'; toUserId: string; departmentSlug?: string }
  | { type: 'department'; departmentSlug: string }
  | { type: 'ai' };

export type TransferResult = {
  transferred: boolean;
  conversationId: string;
  target: TransferTarget;
  flowState: ConversationFlowState;
};

/** Origen del último handoff (trazabilidad en ConversationMeta.handoffKind). */
export type TransferHandoffKind =
  | 'escalate'
  | 'agent_transfer'
  | 'manual_handover'
  | 'rule_handover'
  | 'department_transfer'
  | 'to_ai';

const LAST_MESSAGE_PREVIEW_MAX = 120;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function toConversationListDto(
  item: ConversationListItem,
  unreadCount = 0,
  botAgent: { id: string; name: string } | null = null,
): ConversationListDto {
  const { messages, tickets, ...rest } = item;
  const lastMessage = messages[0];

  return {
    ...rest,
    inboxStatus: tickets.length > 0 ? 'active' : 'inactive',
    lastMessagePreview: buildInboxMessagePreview(
      lastMessage?.body,
      lastMessage?.messageType,
      LAST_MESSAGE_PREVIEW_MAX,
    ),
    lastMessageAt: toIso(lastMessage?.createdAt) ?? toIso(item.updatedAt),
    lastMessageDirection: lastMessage?.direction,
    unreadCount,
    botAgent,
  };
}

export class ConversationsService {
  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly stateMachine: ConversationStateMachine,
    private readonly realtimeNotifier?: RealtimeNotifier,
    private readonly prisma?: PrismaService,
    private readonly ticketService?: TicketService,
    private readonly messageRepo?: MessageRepository,
    private readonly departmentHoursSource?: DepartmentHoursSource,
    private readonly now: () => Date = () => new Date(),
    private readonly fallbackTz: string = 'America/Mexico_City',
  ) {}

  async list(params: ConversationListParams = { limit: 20 }): Promise<ConversationListResult> {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const query: ConversationListQuery = {
      cursor: params.cursor,
      limit,
      citizenId: params.citizenId,
      inboxStatus: params.inboxStatus,
      departmentId: params.departmentId,
      departmentIds: params.departmentIds,
      departmentSlug: params.departmentSlug,
      communicationLineId: params.communicationLineId,
      search: params.search,
      botIds: params.botIds,
    };
    const { items, hasNextPage } = await this.conversationRepo.listWithContext(query);
    const unreadCounts =
      params.viewerUserId && items.length > 0
        ? await this.conversationRepo.countUnreadByConversationIds(
            params.viewerUserId,
            items.map((item) => item.id),
          )
        : new Map<string, number>();
    // Derivar el agente IA por línea en batch (evita N+1 sobre la página).
    const lineIds = Array.from(
      new Set(
        items
          .map((item) => item.meta?.communicationLineId)
          .filter((lineId): lineId is string => Boolean(lineId)),
      ),
    );
    const botAgents = await this.conversationRepo.findBotAgentsByLineIds(lineIds);
    const mapped = items.map((item) =>
      toConversationListDto(
        item,
        unreadCounts.get(item.id) ?? 0,
        (item.meta?.communicationLineId
          ? botAgents.get(item.meta.communicationLineId)
          : undefined) ?? null,
      ),
    );

    return {
      items: mapped,
      meta: { nextCursor: hasNextPage ? mapped[mapped.length - 1]?.id : undefined, hasNextPage },
    };
  }

  async getById(id: string): Promise<ConversationContext> {
    const ctx = await this.conversationRepo.getConversationContext(id);
    if (!ctx) throw AppError.notFound('Conversación no encontrada');
    return ctx;
  }

  /**
   * Garantiza una conversación abierta para el ciudadano. Un recontacto tras
   * cierre REACTIVA la conversación canónica: findOrCreateCanonical nunca
   * crea una fila nueva ni devuelve un ciclo cerrado.
   */
  async ensureOpenForCitizen(
    citizenId: string,
    communicationLineId?: string,
  ): Promise<ConversationContext> {
    if (communicationLineId) {
      const line = await this.conversationRepo.findActiveCommunicationLineById(communicationLineId);
      if (!line) throw AppError.notFound('Línea no encontrada o inactiva');
    }
    const conversation = communicationLineId
      ? await this.conversationRepo.findOrCreateCanonical(citizenId, { communicationLineId })
      : await this.conversationRepo.findOrCreateCanonical(citizenId, { allowUnbound: true });
    return this.getById(conversation.id);
  }

  /** Asigna una conversación a un agente. Si la conversación está en BOT_FLOW, hace handover a HUMAN_FLOW. */
  async assign(
    conversationId: string,
    agentId: string,
    departmentSlug?: string,
  ): Promise<{ assigned: boolean; conversationId: string; agentId: string }> {
    if (this.realtimeNotifier?.isEnabled()) {
      return this.assignDurable(conversationId, agentId, departmentSlug);
    }

    const ctx = await this.conversationRepo.getConversationContext(conversationId);
    if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

    const currentState = ctx.meta.flowState as ConversationFlowState;
    let flowState = currentState;

    if (
      currentState === 'BOT_FLOW' ||
      currentState === 'REGISTERING' ||
      currentState === 'DEPARTMENT_ROUTING'
    ) {
      if (!this.stateMachine.isValidTransition(currentState, 'HUMAN_FLOW')) {
        throw AppError.conflict(`Transición inválida: ${currentState} → HUMAN_FLOW`);
      }

      await this.stateMachine.transition(conversationId, 'HUMAN_FLOW', ctx.meta.version, {
        triggeredBy: 'agent',
        agentId,
        departmentSlug,
        suppressEventBus: true,
      });
      flowState = 'HUMAN_FLOW';
    }

    await this.conversationRepo.applyAssignment({
      conversationId,
      userId: agentId,
      departmentSlug,
      lockMeta: true,
      setLockedAt: true,
    });

    const occurredAt = new Date().toISOString();
    if (flowState === 'HUMAN_FLOW' && currentState !== 'HUMAN_FLOW') {
      eventBus.emit('conversation.handover', {
        conversationId,
        fromState: currentState,
        toState: 'HUMAN_FLOW',
        triggeredBy: 'agent',
        agentId,
        departmentSlug,
      });
    } else {
      eventBus.emit('conversation.updated', {
        conversationId,
        action: 'assign',
        flowState,
        triggeredBy: 'agent',
        actorId: agentId,
        occurredAt,
      });
    }

    return { assigned: true, conversationId, agentId };
  }

  private async assignDurable(
    conversationId: string,
    agentId: string,
    departmentSlug?: string,
  ): Promise<{ assigned: boolean; conversationId: string; agentId: string }> {
    if (!this.prisma) {
      throw new Error('ConversationsService requires PrismaService for durable realtime');
    }

    return withRealtimeTransaction(this.prisma, this.realtimeNotifier, async (tx) => {
      const ctx = await this.conversationRepo.getConversationContextInTransaction(
        tx,
        conversationId,
      );
      if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

      const currentState = ctx.meta.flowState as ConversationFlowState;
      let flowState = currentState;

      if (
        currentState === 'BOT_FLOW' ||
        currentState === 'REGISTERING' ||
        currentState === 'DEPARTMENT_ROUTING'
      ) {
        if (!this.stateMachine.isValidTransition(currentState, 'HUMAN_FLOW')) {
          throw AppError.conflict(`Transición inválida: ${currentState} → HUMAN_FLOW`);
        }

        await this.stateMachine.transition(
          conversationId,
          'HUMAN_FLOW',
          ctx.meta.version,
          {
            triggeredBy: 'agent',
            agentId,
            departmentSlug,
            suppressEventBus: true,
          },
          tx,
        );
        flowState = 'HUMAN_FLOW';
      }

      await this.conversationRepo.applyAssignmentInTransaction(tx, {
        conversationId,
        userId: agentId,
        departmentSlug,
        lockMeta: true,
        setLockedAt: true,
      });

      const correlationId = `assign-${conversationId}-${Date.now()}`;
      const occurredAt = new Date().toISOString();

      if (flowState === 'HUMAN_FLOW' && currentState !== 'HUMAN_FLOW') {
        await this.realtimeNotifier!.notifyCritical(
          tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
          this.buildConversationHandoverEvent(
            conversationId,
            currentState,
            'HUMAN_FLOW',
            correlationId,
            occurredAt,
            agentId,
            departmentSlug,
          ),
        );
      } else {
        await this.realtimeNotifier!.notifyCritical(
          tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
          this.buildConversationUpdatedEvent(
            conversationId,
            'assign',
            correlationId,
            occurredAt,
            agentId,
            flowState,
            undefined,
            {
              assignedUserId: agentId,
              assignedDept: departmentSlug ?? null,
              lockedByUserId: agentId,
              departmentSlug: departmentSlug ?? null,
            },
          ),
        );
      }

      return { assigned: true, conversationId, agentId };
    });
  }

  /**
   * Transfiere la conversación hacia un agente, un departamento o la IA.
   *
   * El control se decide exclusivamente por flowState (única fuente de verdad):
   *  - agent      → HUMAN_FLOW         (lockedByUserId = destino; handoverAt seteado)
   *  - department → DEPARTMENT_ROUTING (IA activa; departmentSlug; sin dueño humano)
   *  - ai         → BOT_FLOW           (locks liberados; vuelve el asistente)
   * En todos los casos genera un mensaje de sistema, actualiza el ticket activo y
   * emite eventos de tiempo real durables con el ownership resultante en el patch.
   */
  async transfer(
    conversationId: string,
    target: TransferTarget,
    options?: { performedBy?: string },
  ): Promise<TransferResult> {
    if (this.realtimeNotifier?.isEnabled()) {
      return this.transferDurable(conversationId, target, options?.performedBy);
    }

    const ctx = await this.conversationRepo.getConversationContext(conversationId);
    if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

    const fromState = ctx.meta.flowState as ConversationFlowState;
    if (fromState === 'CLOSED')
      throw AppError.conflict('No se puede transferir una conversación cerrada');

    const plan = this.resolveTransferTarget(target);
    if (target.type === 'department') {
      await this.ensureDepartmentAvailable(target.departmentSlug);
    }

    if (fromState !== plan.toState) {
      if (!this.stateMachine.isValidTransition(fromState, plan.toState)) {
        throw AppError.conflict(`Transición inválida: ${fromState} → ${plan.toState}`);
      }
      await this.stateMachine.transition(conversationId, plan.toState, ctx.meta.version, {
        triggeredBy: 'agent',
        agentId: options?.performedBy,
        departmentSlug: plan.departmentSlug,
        suppressEventBus: true,
      });
    }

    await this.applyTransferOwnership(conversationId, target);
    await this.conversationRepo.setHandoffKind(conversationId, plan.handoffKind);

    let activeTicketId: string | undefined;
    if (this.ticketService) {
      const activeTicket = await this.ticketService.getActiveTicketByConversation(conversationId);
      activeTicketId = activeTicket?.id;
      if (activeTicket) {
        await this.ticketService.assignTicket(activeTicket.id, {
          ...(plan.agentId ? { userId: plan.agentId } : {}),
          ...(plan.departmentSlug ? { departmentSlug: plan.departmentSlug } : {}),
        });
      }
    }

    const occurredAt = new Date().toISOString();
    const systemMessage = await this.createTransferSystemMessage(
      conversationId,
      target,
      plan.toState,
      occurredAt,
      undefined,
      activeTicketId,
      true,
    );
    if (systemMessage) {
      eventBus.emit('message.created', {
        messageId: systemMessage.id,
        conversationId,
        direction: 'outbound',
        messageType: systemMessage.messageType,
        body: systemMessage.body,
        createdAt: systemMessage.createdAt.toISOString(),
      });
    }

    eventBus.emit('conversation.updated', {
      conversationId,
      action: 'transfer',
      flowState: plan.toState,
      triggeredBy: 'agent',
      actorId: options?.performedBy ?? plan.agentId,
      occurredAt,
    });

    return { transferred: true, conversationId, target, flowState: plan.toState };
  }

  private async transferDurable(
    conversationId: string,
    target: TransferTarget,
    performedBy?: string,
  ): Promise<TransferResult> {
    if (!this.prisma) {
      throw new Error('ConversationsService requires PrismaService for durable realtime');
    }

    if (target.type === 'department') {
      await this.ensureDepartmentAvailable(target.departmentSlug);
    }

    return withRealtimeTransaction(
      this.prisma,
      this.realtimeNotifier,
      async (tx) => {
        const ctx = await this.conversationRepo.getConversationContextInTransaction(
          tx,
          conversationId,
        );
        if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

        const fromState = ctx.meta.flowState as ConversationFlowState;
        if (fromState === 'CLOSED')
          throw AppError.conflict('No se puede transferir una conversación cerrada');

        const plan = this.resolveTransferTarget(target);
        if (fromState !== plan.toState) {
          if (!this.stateMachine.isValidTransition(fromState, plan.toState)) {
            throw AppError.conflict(`Transición inválida: ${fromState} → ${plan.toState}`);
          }
          await this.stateMachine.transition(
            conversationId,
            plan.toState,
            ctx.meta.version,
            {
              triggeredBy: 'agent',
              agentId: performedBy,
              departmentSlug: plan.departmentSlug,
              suppressEventBus: true,
            },
            tx,
          );
        }

        await this.applyTransferOwnershipInTransaction(tx, conversationId, target);
        await this.conversationRepo.setHandoffKindInTransaction(
          tx,
          conversationId,
          plan.handoffKind,
        );
        await this.conversationRepo.updateActiveTicketInTransaction(tx, conversationId, {
          ...(plan.agentId ? { userId: plan.agentId } : {}),
          ...(plan.departmentSlug ? { departmentSlug: plan.departmentSlug } : {}),
          ...(target.type === 'ai' ? { userId: null } : {}),
        });

        const correlationId = `transfer-${conversationId}-${Date.now()}`;
        const occurredAt = new Date().toISOString();

        const systemMessage = await this.createTransferSystemMessage(
          conversationId,
          target,
          plan.toState,
          occurredAt,
          tx,
        );
        if (systemMessage) {
          await this.realtimeNotifier!.notifyCritical(
            tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
            this.buildMessageCreatedEvent(systemMessage, conversationId, correlationId, occurredAt),
          );
        }

        // Transferencia a departamento = handover (cubierto por conversation.handover).
        // Resto de targets mantienen conversation.updated action:transfer.
        const transferEvent =
          target.type === 'department'
            ? this.buildConversationHandoverEvent(
                conversationId,
                fromState,
                plan.toState,
                correlationId,
                occurredAt,
                undefined,
                plan.departmentSlug,
              )
            : this.buildConversationUpdatedEvent(
                conversationId,
                'transfer',
                correlationId,
                occurredAt,
                performedBy ?? plan.agentId,
                plan.toState,
                undefined,
                this.buildTransferOwnershipOverlay(target, occurredAt, plan.handoffKind),
              );

        await this.realtimeNotifier!.notifyCritical(
          tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
          transferEvent,
        );

        return { transferred: true, conversationId, target, flowState: plan.toState };
      },
      { timeout: 15_000 },
    );
  }

  private resolveTransferTarget(target: TransferTarget): {
    toState: ConversationFlowState;
    handoffKind: TransferHandoffKind;
    agentId?: string;
    departmentSlug?: string;
  } {
    switch (target.type) {
      case 'agent':
        return {
          toState: 'HUMAN_FLOW',
          handoffKind: 'agent_transfer',
          agentId: target.toUserId,
          ...(target.departmentSlug ? { departmentSlug: target.departmentSlug } : {}),
        };
      case 'department':
        return {
          toState: 'DEPARTMENT_ROUTING',
          handoffKind: 'department_transfer',
          departmentSlug: target.departmentSlug,
        };
      case 'ai':
        return { toState: 'BOT_FLOW', handoffKind: 'to_ai' };
    }
  }

  /**
   * Validación de disponibilidad del departamento (fail-open):
   * solo bloquea si el departamento es conocido y está inactivo o fuera de
   * horario. Ante errores de lookup o departamentos desconocidos no bloquea.
   */
  private async ensureDepartmentAvailable(departmentSlug: string): Promise<void> {
    if (!this.departmentHoursSource) return;

    let department: Awaited<ReturnType<DepartmentHoursSource['findHoursBySlug']>> | null = null;
    try {
      department = await this.departmentHoursSource.findHoursBySlug(departmentSlug);
    } catch {
      return;
    }
    if (!department) return;

    if (!department.isActive) {
      throw AppError.conflict(`El departamento "${department.name}" está inactivo`);
    }

    const schedule = parseServiceSchedule(department.serviceSchedule);
    if (!isOpenAt(schedule, this.now(), this.fallbackTz)) {
      throw AppError.conflict(
        `El departamento "${department.name}" está fuera de horario de atención`,
      );
    }
  }

  private async applyTransferOwnership(
    conversationId: string,
    target: TransferTarget,
  ): Promise<void> {
    switch (target.type) {
      case 'agent':
        await this.conversationRepo.applyAssignment({
          conversationId,
          userId: target.toUserId,
          departmentSlug: target.departmentSlug,
          lockMeta: true,
          setLockedAt: true,
        });
        return;
      case 'department':
        await this.conversationRepo.setDepartmentControl(conversationId, target.departmentSlug);
        return;
      case 'ai':
        await this.conversationRepo.releaseOwnership(conversationId);
        return;
    }
  }

  private async applyTransferOwnershipInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
    target: TransferTarget,
  ): Promise<void> {
    switch (target.type) {
      case 'agent':
        await this.conversationRepo.applyAssignmentInTransaction(tx, {
          conversationId,
          userId: target.toUserId,
          departmentSlug: target.departmentSlug,
          lockMeta: true,
          setLockedAt: true,
        });
        return;
      case 'department':
        await this.conversationRepo.setDepartmentControlInTransaction(
          tx,
          conversationId,
          target.departmentSlug,
        );
        return;
      case 'ai':
        await this.conversationRepo.releaseOwnershipInTransaction(tx, conversationId);
        return;
    }
  }

  private async createTransferSystemMessage(
    conversationId: string,
    target: TransferTarget,
    toState: ConversationFlowState,
    occurredAt: string,
    tx?: Prisma.TransactionClient,
    resolvedTicketId?: string,
    ticketLookupResolved = false,
  ): Promise<MessageWithSender | undefined> {
    if (!this.messageRepo) return undefined;

    const ticketId = ticketLookupResolved
      ? resolvedTicketId
      : this.ticketService
        ? (await this.ticketService.getActiveTicketByConversation(conversationId, tx))?.id
        : undefined;

    const input = {
      conversationId,
      ...(ticketId ? { ticketId } : {}),
      body: this.buildTransferSystemMessageBody(target),
      direction: MessageDirection.outbound,
      messageType: MessageType.system,
      meta: { kind: 'transfer', targetType: target.type, toState, occurredAt },
    };

    return tx ? this.messageRepo.createInTransaction(tx, input) : this.messageRepo.create(input);
  }

  private buildTransferSystemMessageBody(target: TransferTarget): string {
    switch (target.type) {
      case 'agent':
        return 'Conversación transferida a un agente';
      case 'department':
        return `Conversación canalizada al departamento ${target.departmentSlug}`;
      case 'ai':
        return 'Asistente reactivado — conversación devuelta al flujo automático';
    }
  }

  private buildTransferOwnershipOverlay(
    target: TransferTarget,
    occurredAt: string,
    handoffKind: TransferHandoffKind,
  ): {
    assignedUserId: string | null;
    assignedDept: string | null;
    lockedByUserId: string | null;
    departmentSlug: string | null;
    handoverAt: string | null;
    handoffKind: string;
  } {
    switch (target.type) {
      case 'agent':
        return {
          assignedUserId: target.toUserId,
          assignedDept: target.departmentSlug ?? null,
          lockedByUserId: target.toUserId,
          departmentSlug: target.departmentSlug ?? null,
          handoverAt: occurredAt,
          handoffKind,
        };
      case 'department':
        return {
          assignedUserId: null,
          assignedDept: target.departmentSlug,
          lockedByUserId: null,
          departmentSlug: target.departmentSlug,
          handoverAt: null,
          handoffKind,
        };
      case 'ai':
        return {
          assignedUserId: null,
          assignedDept: null,
          lockedByUserId: null,
          departmentSlug: null,
          handoverAt: null,
          handoffKind,
        };
    }
  }

  /** Handover explícito: fuerza la transición a HUMAN_FLOW y crea assignment. */
  async handover(
    conversationId: string,
    agentId: string,
    departmentSlug?: string,
  ): Promise<{ handover: boolean; conversationId: string; agentId: string }> {
    if (this.realtimeNotifier?.isEnabled()) {
      return this.handoverDurable(conversationId, agentId, departmentSlug);
    }

    const ctx = await this.conversationRepo.getConversationContext(conversationId);
    if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

    const from = ctx.meta.flowState as ConversationFlowState;
    if (!this.stateMachine.isValidTransition(from, 'HUMAN_FLOW'))
      throw AppError.conflict('Transición inválida');

    await this.stateMachine.transition(conversationId, 'HUMAN_FLOW', ctx.meta.version, {
      triggeredBy: 'agent',
      agentId,
      departmentSlug,
    });

    await this.conversationRepo.applyAssignment({
      conversationId,
      userId: agentId,
      departmentSlug,
      lockMeta: false,
    });

    eventBus.emit('conversation.updated', {
      conversationId,
      action: 'handover',
      flowState: 'HUMAN_FLOW',
      triggeredBy: 'agent',
      actorId: agentId,
      occurredAt: new Date().toISOString(),
    });

    return { handover: true, conversationId, agentId };
  }

  private async handoverDurable(
    conversationId: string,
    agentId: string,
    departmentSlug?: string,
  ): Promise<{ handover: boolean; conversationId: string; agentId: string }> {
    if (!this.prisma) {
      throw new Error('ConversationsService requires PrismaService for durable realtime');
    }

    return withRealtimeTransaction(this.prisma, this.realtimeNotifier, async (tx) => {
      const ctx = await this.conversationRepo.getConversationContextInTransaction(
        tx,
        conversationId,
      );
      if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

      const from = ctx.meta.flowState as ConversationFlowState;
      if (!this.stateMachine.isValidTransition(from, 'HUMAN_FLOW'))
        throw AppError.conflict('Transición inválida');

      await this.stateMachine.transition(
        conversationId,
        'HUMAN_FLOW',
        ctx.meta.version,
        {
          triggeredBy: 'agent',
          agentId,
          departmentSlug,
          suppressEventBus: true,
        },
        tx,
      );

      await this.conversationRepo.applyAssignmentInTransaction(tx, {
        conversationId,
        userId: agentId,
        departmentSlug,
        lockMeta: false,
      });

      const correlationId = `handover-${conversationId}-${Date.now()}`;
      const occurredAt = new Date().toISOString();
      await this.realtimeNotifier!.notifyCritical(
        tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        this.buildConversationHandoverEvent(
          conversationId,
          from,
          'HUMAN_FLOW',
          correlationId,
          occurredAt,
          agentId,
          departmentSlug,
        ),
      );

      return { handover: true, conversationId, agentId };
    });
  }

  async close(
    conversationId: string,
    performedBy?: string,
  ): Promise<{ closed: boolean; conversationId: string }> {
    if (this.realtimeNotifier?.isEnabled()) {
      return this.closeDurable(conversationId, performedBy);
    }

    const ctx = await this.conversationRepo.getConversationContext(conversationId);
    if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

    const from = ctx.meta.flowState as ConversationFlowState;
    if (!this.stateMachine.isValidTransition(from, 'CLOSED'))
      throw AppError.conflict('Transición inválida a CLOSED');

    await this.stateMachine.transition(conversationId, 'CLOSED', ctx.meta.version, {
      triggeredBy: 'agent',
      agentId: performedBy,
    });

    await this.conversationRepo.updateConversationStatus(conversationId, ConversationStatus.closed);
    await this.conversationRepo.clearInboxOwnership(conversationId);
    if (this.ticketService) {
      const activeTicket = await this.ticketService.getActiveTicketByConversation(conversationId);
      if (activeTicket) {
        await this.ticketService.closeTicket(activeTicket.id, { reason: 'user_request' });
      }
    } else {
      await this.conversationRepo.closeActiveTickets(conversationId, 'user_request');
    }

    eventBus.emit('conversation.updated', {
      conversationId,
      action: 'close',
      flowState: 'CLOSED',
      status: 'closed',
      triggeredBy: 'agent',
      actorId: performedBy,
      occurredAt: new Date().toISOString(),
    });

    return { closed: true, conversationId };
  }

  private async closeDurable(
    conversationId: string,
    performedBy?: string,
  ): Promise<{ closed: boolean; conversationId: string }> {
    if (!this.prisma) {
      throw new Error('ConversationsService requires PrismaService for durable realtime');
    }

    return withRealtimeTransaction(this.prisma, this.realtimeNotifier, async (tx) => {
      const ctx = await this.conversationRepo.getConversationContextInTransaction(
        tx,
        conversationId,
      );
      if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

      const from = ctx.meta.flowState as ConversationFlowState;
      if (!this.stateMachine.isValidTransition(from, 'CLOSED'))
        throw AppError.conflict('Transición inválida a CLOSED');

      await this.stateMachine.transition(
        conversationId,
        'CLOSED',
        ctx.meta.version,
        {
          triggeredBy: 'agent',
          agentId: performedBy,
          suppressEventBus: true,
        },
        tx,
      );

      await this.conversationRepo.updateConversationStatusInTransaction(
        tx,
        conversationId,
        ConversationStatus.closed,
      );
      await this.conversationRepo.clearInboxOwnershipInTransaction(tx, conversationId);

      // Snapshot previo al cierre: permite emitir un ticket.closed por ticket.
      const ticketsToClose = await this.conversationRepo.findActiveTicketsInTransaction(
        tx,
        conversationId,
      );
      await this.conversationRepo.closeActiveTicketsInTransaction(
        tx,
        conversationId,
        'user_request',
      );

      const correlationId = `close-${conversationId}-${Date.now()}`;
      const occurredAt = new Date().toISOString();

      // 1 evento durable por ticket cerrado (1:1, trazabilidad por entidad).
      for (const t of ticketsToClose) {
        await this.realtimeNotifier!.notifyCritical(
          tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
          buildTicketClosedEvent(
            t,
            `${correlationId}-t-${t.id}`,
            occurredAt,
            'conversations.service.close',
          ),
        );
      }

      // Compat hacia atrás: conversation.updated action:close (consumidores UI).
      await this.realtimeNotifier!.notifyCritical(
        tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        this.buildConversationUpdatedEvent(
          conversationId,
          'close',
          correlationId,
          occurredAt,
          performedBy,
          'CLOSED',
          'closed',
          { assignedUserId: null, assignedDept: null },
        ),
      );

      return { closed: true, conversationId };
    });
  }

  async reopen(
    conversationId: string,
    performedBy?: string,
  ): Promise<{ reopened: boolean; conversationId: string }> {
    if (this.realtimeNotifier?.isEnabled()) {
      return this.reopenDurable(conversationId, performedBy);
    }

    const ctx = await this.conversationRepo.getConversationContext(conversationId);
    if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

    const from = ctx.meta.flowState as ConversationFlowState;
    if (!this.stateMachine.isValidTransition(from, 'BOT_FLOW'))
      throw AppError.conflict('Transición inválida a BOT_FLOW');

    await this.stateMachine.transition(conversationId, 'BOT_FLOW', ctx.meta.version, {
      triggeredBy: 'agent',
      agentId: performedBy,
    });

    // Reapertura por agente → atención humana: el bot queda silenciado aunque el
    // flowState sea BOT_FLOW (attendance_mode es la fuente de verdad del bot).
    await this.conversationRepo.setAttendanceMode(conversationId, AttendanceMode.human, false);

    await this.conversationRepo.updateConversationStatus(conversationId, ConversationStatus.open);

    eventBus.emit('conversation.updated', {
      conversationId,
      action: 'reopen',
      flowState: 'BOT_FLOW',
      status: 'open',
      triggeredBy: 'agent',
      actorId: performedBy,
      occurredAt: new Date().toISOString(),
    });

    return { reopened: true, conversationId };
  }

  private async reopenDurable(
    conversationId: string,
    performedBy?: string,
  ): Promise<{ reopened: boolean; conversationId: string }> {
    if (!this.prisma) {
      throw new Error('ConversationsService requires PrismaService for durable realtime');
    }

    return withRealtimeTransaction(this.prisma, this.realtimeNotifier, async (tx) => {
      const ctx = await this.conversationRepo.getConversationContextInTransaction(
        tx,
        conversationId,
      );
      if (!ctx?.meta) throw AppError.notFound('Conversación no encontrada');

      const from = ctx.meta.flowState as ConversationFlowState;
      if (!this.stateMachine.isValidTransition(from, 'BOT_FLOW'))
        throw AppError.conflict('Transición inválida a BOT_FLOW');

      await this.stateMachine.transition(
        conversationId,
        'BOT_FLOW',
        ctx.meta.version,
        {
          triggeredBy: 'agent',
          agentId: performedBy,
          suppressEventBus: true,
        },
        tx,
      );

      await this.conversationRepo.updateConversationStatusInTransaction(
        tx,
        conversationId,
        ConversationStatus.open,
      );

      // Reapertura por agente → atención humana (bot silenciado), análogo al path
      // no durable. Se hace dentro de la misma transacción que el transition.
      await tx.conversation.update({
        where: { id: conversationId },
        data: { attendanceMode: AttendanceMode.human, botEnabled: false },
      });

      const correlationId = `reopen-${conversationId}-${Date.now()}`;
      const occurredAt = new Date().toISOString();
      await this.realtimeNotifier!.notifyCritical(
        tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
        this.buildConversationUpdatedEvent(
          conversationId,
          'reopen',
          correlationId,
          occurredAt,
          performedBy,
          'BOT_FLOW',
          'open',
        ),
      );

      return { reopened: true, conversationId };
    });
  }

  async markRead(
    conversationId: string,
    userId: string,
  ): Promise<{ read: true; conversationId: string }> {
    await this.getById(conversationId);
    await this.conversationRepo.markConversationRead(userId, conversationId);
    return { read: true, conversationId };
  }

  private buildConversationUpdatedEvent(
    conversationId: string,
    action: 'assign' | 'transfer' | 'handover' | 'close' | 'reopen' | 'message',
    correlationId: string,
    occurredAt: string,
    _actorId?: string,
    flowState?: ConversationFlowState,
    status?: 'open' | 'closed' | 'in_progress' | 'resolved',
    overlay?: {
      assignedUserId?: string | null;
      assignedDept?: string | null;
      lockedByUserId?: string | null;
      departmentSlug?: string | null;
      handoverAt?: string | null;
      handoffKind?: string | null;
      lastMessagePreview?: string | null;
      lastMessageDirection?: 'inbound' | 'outbound';
    },
  ): RealtimeDurableEvent {
    const hasMetaChanges =
      overlay &&
      (overlay.lockedByUserId !== undefined ||
        overlay.departmentSlug !== undefined ||
        overlay.handoverAt !== undefined ||
        overlay.handoffKind !== undefined);

    const inboxPatch: RealtimeInboxPatch = {
      ...(flowState ? { flowState } : {}),
      ...(status ? { status } : {}),
      ...(action === 'close' ? { inboxStatus: 'inactive' as const } : {}),
      ...(action === 'reopen' ? { inboxStatus: 'active' as const } : {}),
      ...(overlay?.assignedUserId !== undefined ? { assignedUserId: overlay.assignedUserId } : {}),
      ...(overlay?.assignedDept !== undefined ? { assignedDept: overlay.assignedDept } : {}),
      ...(overlay?.lastMessagePreview !== undefined
        ? { lastMessagePreview: overlay.lastMessagePreview, lastMessageAt: occurredAt }
        : {}),
      ...(overlay?.lastMessageDirection
        ? { lastMessageDirection: overlay.lastMessageDirection }
        : {}),
    };

    return {
      eventId: randomUUID(),
      correlationId,
      schemaVersion: 1,
      eventType: CriticalEventType.ConversationUpdated,
      socketEventName: SocketEventName.ConversationUpdated,
      occurredAt,
      source: 'conversations.service',
      conversationId,
      action,
      conversationPatch: {
        id: conversationId,
        ...(flowState ? { flowState } : {}),
        ...(status ? { status } : {}),
        ...(overlay?.assignedUserId !== undefined && {
          assignedUserId: overlay.assignedUserId ?? null,
        }),
        ...(overlay?.assignedDept !== undefined && {
          assignedDept: overlay.assignedDept ?? null,
        }),
        ...(hasMetaChanges
          ? {
              meta: {
                ...(overlay.lockedByUserId !== undefined && {
                  lockedByUserId: overlay.lockedByUserId ?? null,
                }),
                ...(overlay.departmentSlug !== undefined && {
                  departmentSlug: overlay.departmentSlug ?? null,
                }),
                ...(overlay.handoverAt !== undefined && {
                  handoverAt: overlay.handoverAt ?? null,
                }),
                ...(overlay.handoffKind !== undefined && {
                  handoffKind: overlay.handoffKind ?? null,
                }),
              },
            }
          : {}),
        updatedAt: occurredAt,
      },
      inboxPatch,
    };
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
      source: 'conversations.service',
      conversationId,
      action: ConversationRealtimeAction.Message,
      messagePatch: {
        id: message.id,
        conversationId,
        body: message.body,
        direction,
        messageType: message.messageType,
        sendByUserId: message.sendByUserId ?? undefined,
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

  private buildConversationHandoverEvent(
    conversationId: string,
    _fromState: ConversationFlowState,
    toState: ConversationFlowState,
    correlationId: string,
    occurredAt: string,
    agentId?: string,
    departmentSlug?: string,
  ): RealtimeDurableEvent {
    return {
      eventId: randomUUID(),
      correlationId,
      schemaVersion: 1,
      eventType: CriticalEventType.ConversationHandover,
      socketEventName: SocketEventName.ConversationHandover,
      occurredAt,
      source: 'conversations.service',
      conversationId,
      action: ConversationRealtimeAction.Handover,
      conversationPatch: {
        id: conversationId,
        flowState: toState,
        assignedUserId: agentId,
        ...(departmentSlug ? { assignedDept: departmentSlug } : {}),
        updatedAt: occurredAt,
      },
      inboxPatch: {
        flowState: toState,
        assignedUserId: agentId ?? null,
        ...(departmentSlug ? { assignedDept: departmentSlug } : {}),
      },
      notificationPatch: {
        type: 'conversation.handover',
        conversationId,
        ...(departmentSlug ? { departmentSlug } : {}),
      },
    };
  }
}
