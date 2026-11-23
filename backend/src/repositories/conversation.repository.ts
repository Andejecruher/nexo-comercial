/**
 * Repository para Conversation + ConversationMeta.
 * Encapsula toda la lógica de acceso a datos de conversaciones.
 */
import {
  AttendanceMode,
  ConversationStatus,
  MessageDirection,
  Prisma,
  TicketStatus,
} from '@prisma/client';
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../database/transaction-options';
import { PrismaService } from '../services/prisma.service';
import { ConversationFlowState } from '../types/whatsapp.types';
import { ConflictError } from '../utils/app-error';
import { assertConversationId } from '../utils/conversation-id';

export const ACTIVE_TICKET_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

export type InboxListStatus = 'active' | 'inactive';

export type ConversationListQuery = {
  cursor?: string;
  limit: number;
  citizenId?: string;
  inboxStatus?: InboxListStatus;
  departmentId?: string;
  departmentIds?: string[];
  departmentSlug?: string;
  departmentSlugs?: string[];
  communicationLineId?: string;
  search?: string;
  /**
   * Filtro multi-bot: ids de agentes IA; `null` dentro del array = "todos los
   * bots" (cualquier línea con agente activo). [] / undefined = sin restricción.
   * Se combina con OR frente a los filtros de departamento (nunca AND).
   */
  botIds?: (string | null)[];
};

/** Parámetros del handoff unificado a departamento (transferToDepartment). */
export type TransferToDepartmentParams = {
  conversationId: string;
  /** Slug del departamento destino. Si es undefined, no se pisa el actual. */
  departmentSlug?: string;
  /** Origen del handoff: 'bot', userId del agente o 'platform'/'system'. */
  transferredBy: string;
  reason?: string;
  /** userId para AuditLog.actorId (FK); null/undefined cuando no hay actor humano. */
  actorUserId?: string | null;
};

export function sanitizeConversationSearchTokens(raw: string): string[] {
  const cleaned = raw
    .replace(/[%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  return cleaned.split(' ').filter(Boolean).slice(0, 5);
}

export function buildConversationListWhere(
  params: Omit<
    ConversationListQuery,
    'cursor' | 'limit' | 'departmentId' | 'departmentIds' | 'botIds'
  > & {
    /** Líneas con agente IA activo ya resueltas (filtro bot). */
    botLineIds?: string[];
  },
): Prisma.ConversationWhereInput {
  const and: Prisma.ConversationWhereInput[] = [];

  // Una fila por ciudadano y línea: solo la conversación canónica
  // es visible (las filas legacy duplicadas quedan ocultas).
  and.push({ isCanonical: true });

  if (params.citizenId) {
    and.push({ citizenId: params.citizenId });
  }

  if (params.inboxStatus === 'active') {
    and.push({ tickets: { some: { status: { in: ACTIVE_TICKET_STATUSES } } } });
  } else if (params.inboxStatus === 'inactive') {
    and.push({ tickets: { none: { status: { in: ACTIVE_TICKET_STATUSES } } } });
  }

  const departmentSlugs = Array.from(
    new Set(
      [params.departmentSlug, ...(params.departmentSlugs ?? [])]
        .map((slug) => slug?.trim())
        .filter((slug): slug is string => Boolean(slug)),
    ),
  );
  const departmentCond: Prisma.ConversationWhereInput | undefined =
    departmentSlugs.length > 0
      ? {
          OR: [
            { assignedDept: { in: departmentSlugs } },
            { meta: { is: { departmentSlug: { in: departmentSlugs } } } },
          ],
        }
      : undefined;

  // Filtro "atendido por bot": conversaciones cuya línea tiene agente IA activo.
  const botCond: Prisma.ConversationWhereInput | undefined =
    params.botLineIds && params.botLineIds.length > 0
      ? { meta: { is: { communicationLineId: { in: params.botLineIds } } } }
      : undefined;

  // OR entre grupos (nunca AND): la conversación entra si matchea departamento
  // O bot. Con un solo grupo activo se aplica su condición directamente.
  if (departmentCond && botCond) {
    and.push({ OR: [departmentCond, botCond] });
  } else if (departmentCond) {
    and.push(departmentCond);
  } else if (botCond) {
    and.push(botCond);
  }

  if (params.communicationLineId) {
    and.push({ meta: { is: { communicationLineId: params.communicationLineId } } });
  }

  if (params.search) {
    for (const token of sanitizeConversationSearchTokens(params.search)) {
      const digits = token.replace(/\D/g, '');
      const citizenMatch: Prisma.CitizenWhereInput[] = [
        { name: { contains: token, mode: 'insensitive' } },
        { lastName: { contains: token, mode: 'insensitive' } },
        { phone: { contains: token, mode: 'insensitive' } },
        { neighborhood: { contains: token, mode: 'insensitive' } },
      ];
      if (digits.length >= 3 && digits !== token) {
        citizenMatch.push({ phone: { contains: digits } });
      }
      and.push({ citizen: { OR: citizenMatch } });
    }
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0] ?? {};
  return { AND: and };
}

const CONVERSATION_LIST_INCLUDE = {
  meta: true,
  assignedUser: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      body: true,
      messageType: true,
      direction: true,
      createdAt: true,
    },
  },
  tickets: {
    where: { status: { in: ACTIVE_TICKET_STATUSES } },
    select: { id: true },
  },
  citizen: {
    select: {
      id: true,
      phone: true,
      name: true,
      lastName: true,
      email: true,
      neighborhoodId: true,
      neighborhood: true,
      createdAt: true,
    },
  },
} satisfies Prisma.ConversationInclude;

export type ConversationContext = Prisma.ConversationGetPayload<{
  include: {
    meta: true;
    citizen: {
      select: {
        id: true;
        phone: true;
        name: true;
        leadStatus: true;
      };
    };
  };
}>;

export type ConversationListItem = Prisma.ConversationGetPayload<{
  include: typeof CONVERSATION_LIST_INCLUDE;
}>;

/**
 * Motivo por el que se reactiva una conversación cerrada:
 *  - `citizen_recontact`: el ciudadano vuelve a escribir → bot activo (BOT_FLOW).
 *  - `agent`: un agente reabre la conversación → atención humana (bot silenciado).
 */
export type ReopenReason = 'citizen_recontact' | 'agent';

/** Estados y modo de atención según el motivo de reapertura. */
const REOPEN_REASON_PLAN: Record<
  ReopenReason,
  {
    flowState: ConversationFlowState;
    attendanceMode: AttendanceMode;
    botEnabled: boolean;
  }
> = {
  citizen_recontact: {
    flowState: 'BOT_FLOW',
    attendanceMode: AttendanceMode.bot,
    botEnabled: true,
  },
  agent: {
    flowState: 'HUMAN_FLOW',
    attendanceMode: AttendanceMode.human,
    botEnabled: false,
  },
};

export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @deprecated Usar `findOrCreateCanonical` con una línea explícita.
   * Conserva el contrato antiguo y delega al mismo resolver de ciclos.
   */
  async findOrCreateOpen(citizenId: string): Promise<{ id: string; status: string }> {
    const { id, status } = await this.findOrCreateCanonical(citizenId);
    return { id, status };
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return code === 'P2002';
  }

  /**
   * Busca la conversación canónica del ciudadano en una línea (ciclo de contacto):
   * 1. Conversación OPEN existente (no cerrada) → se reutiliza (y se promueve
   *    a canónica si no lo era).
   * 2. Sin OPEN, la canónica no cerrada → se reutiliza.
   * 3. La canónica está cerrada (status closed o FSM CLOSED) → se REACTIVA la
   *    misma fila: status open, flowState BOT_FLOW, tickets activos cerrados
   *    con `cycle_restart`. El recontacto nunca crea una fila nueva ni deja el
   *    ciclo en CLOSED.
   * 4. Sin ninguna previa → se crea con meta BOT_FLOW (nace canónica).
   * El P2002 deja a los índices únicos (fila activa por canal, fila canónica
   * por ciudadano y línea) arbitrar la concurrencia: el perdedor recupera al ganador
   * por `resolveExistingCycle` y lo reactiva si está cerrado.
   * `created` es true solo cuando este caller creó la entidad; `reactivated`
   * es true solo cuando este caller reactivó el ciclo.
   */
  async findOrCreateCanonical(
    citizenId: string,
    opts?: { reopenReason?: ReopenReason; communicationLineId?: string; allowUnbound?: boolean },
  ): Promise<{ id: string; status: string; created: boolean; reactivated: boolean }> {
    const reopenReason = opts?.reopenReason ?? 'citizen_recontact';
    let lineId = opts?.communicationLineId ?? null;
    if (!lineId && !opts?.allowUnbound) {
      const lines = await this.prisma.communicationLine.findMany({
        where: { channel: 'whatsapp', isActive: true },
        select: { id: true },
        take: 2,
      });
      if (lines.length > 1) throw new Error('Selecciona la línea para resolver la conversación');
      lineId = lines[0]?.id ?? null;
    }
    const existing = await this.resolveExistingCycle(citizenId, reopenReason, lineId);
    if (existing) return existing;

    try {
      const conversation = await this.prisma.conversation.create({
        data: {
          citizenId,
          communicationLineId: lineId,
          status: ConversationStatus.open,
          meta: {
            create: { flowState: 'BOT_FLOW', communicationLineId: lineId },
          },
        },
      });
      return {
        id: conversation.id,
        status: conversation.status,
        created: true,
        reactivated: false,
      };
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        // A PostgreSQL unique violation aborts an enclosing transaction. Its
        // owner must retry the whole operation, not query the aborted TX.
        if (typeof this.prisma.$transaction !== 'function') throw error;
        const winner = await this.resolveExistingCycle(citizenId, reopenReason, lineId);
        if (winner) return winner;
      }
      throw error;
    }
  }

  /**
   * Resuelve un ciclo de contacto existente (pasos 1-3 de
   * `findOrCreateCanonical`). Devuelve null cuando no hay ninguna conversación
   * previa y corresponde crearla.
   */
  private async resolveExistingCycle(
    citizenId: string,
    reopenReason: ReopenReason,
    lineId: string | null,
  ): Promise<{ id: string; status: string; created: boolean; reactivated: boolean } | null> {
    // 1. Ciclo vivo: cualquier fila OPEN (canónica o legacy) se reutiliza.
    const open = await this.findOpenForCitizen(citizenId, lineId);
    if (open && !this.isClosedConversation(open)) {
      if (!open.isCanonical) {
        await this.promoteToCanonical(citizenId, open.id, lineId);
      }
      return { id: open.id, status: open.status, created: false, reactivated: false };
    }

    // 2. La canónica: reactivar si está cerrada, si no reutilizar.
    const canonical = await this.prisma.conversation.findFirst({
      where: { citizenId, channel: 'whatsapp', communicationLineId: lineId, isCanonical: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: { meta: true },
    });
    if (canonical) {
      if (this.isClosedConversation(canonical)) {
        return this.reactivateCycle(canonical.id, reopenReason);
      }
      return {
        id: canonical.id,
        status: canonical.status,
        created: false,
        reactivated: false,
      };
    }

    // 3. Sin canónica (hueco pre-backfill): la más reciente manda.
    const recent = await this.prisma.conversation.findFirst({
      where: { citizenId, channel: 'whatsapp', communicationLineId: lineId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: { meta: true },
    });
    if (!recent) return null;

    const result = this.isClosedConversation(recent)
      ? await this.reactivateCycle(recent.id, reopenReason)
      : { id: recent.id, status: recent.status, created: false, reactivated: false };
    await this.promoteToCanonical(citizenId, recent.id, lineId);
    return result;
  }

  /**
   * Reactiva un ciclo cerrado dentro de una transacción: la fila se mantiene
   * (una sola conversación por ciudadano y línea en el listado) y vuelve al estado y
   * modo de atención según `reopenReason`:
   *  - citizen_recontact → BOT_FLOW + attendance bot (IA activa).
   *  - agent             → HUMAN_FLOW + attendance human (IA silenciada).
   * Los `updateMany` con guards son idempotentes: dos reactivaciones
   * concurrentes hacen commit pero solo una reporta `reactivated: true`, así
   * el evento ticket.created no se duplica.
   */
  private async reactivateCycle(
    conversationId: string,
    reopenReason: ReopenReason,
  ): Promise<{ id: string; status: string; created: boolean; reactivated: boolean }> {
    const plan = REOPEN_REASON_PLAN[reopenReason];
    return this.canonicalTransaction(async (tx) => {
      await tx.conversation.updateMany({
        where: { id: conversationId },
        data: {
          assignedUserId: null,
          assignedDept: null,
          attendanceMode: plan.attendanceMode,
          botEnabled: plan.botEnabled,
          // Nuevo ciclo: los campos de transferencia del ciclo anterior dejan
          // de describir el handoff vigente (evita alertas falsas de "stuck").
          transferredAt: null,
          transferredBy: null,
          transferReason: null,
        },
      });
      const conversationUpdate = await tx.conversation.updateMany({
        where: { id: conversationId, status: ConversationStatus.closed },
        data: { status: ConversationStatus.open },
      });
      const metaUpdate = await tx.conversationMeta.updateMany({
        where: { conversationId, flowState: { not: plan.flowState } },
        data: {
          flowState: plan.flowState,
          version: { increment: 1 },
          lockedByUserId: null,
          lockedAt: null,
          fsmLockToken: null,
          fsmLockedAt: null,
          departmentSlug: null,
        },
      });
      // El estado bug (FSM CLOSED con status open) deja tickets abiertos en
      // la fila muerta: se cierran para que el nuevo ciclo cree el suyo.
      await this.closeActiveTicketsInTransaction(tx, conversationId, 'cycle_restart');

      const fresh = await tx.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      return {
        id: fresh.id,
        status: fresh.status,
        created: false,
        reactivated: conversationUpdate.count > 0 || metaUpdate.count > 0,
      };
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS);
  }

  /**
   * Garantiza que solo `targetId` sea la fila canónica del ciudadano en esta línea. El
   * orden (demote → promote) evita violar el índice único parcial
   * `uq_conversations_canonical_per_citizen_line`.
   */
  private async promoteToCanonical(
    citizenId: string,
    targetId: string,
    lineId: string | null,
  ): Promise<void> {
    await this.canonicalTransaction(async (tx) => {
      await tx.conversation.updateMany({
        where: {
          citizenId,
          channel: 'whatsapp',
          communicationLineId: lineId,
          id: { not: targetId },
          isCanonical: true,
        },
        data: { isCanonical: false },
      });
      await tx.conversation.update({ where: { id: targetId }, data: { isCanonical: true } });
    });
  }

  private async canonicalTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options = PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
  ): Promise<T> {
    if (typeof this.prisma.$transaction === 'function')
      return this.prisma.$transaction(work, options);
    return work(this.prisma as unknown as Prisma.TransactionClient);
  }

  /**
   * Una conversación es cerrada para reutilización cuando su status es closed o
   * su FSM quedó en CLOSED (flowState es la fuente de verdad; cubre filas
   * legacy con status open y FSM CLOSED). El recontacto tras cierre REACTIVA
   * esta misma fila: nunca se crea una fila nueva.
   */
  private isClosedConversation(conversation: {
    status: string;
    meta?: { flowState?: string } | null;
  }): boolean {
    return (
      conversation.status === ConversationStatus.closed || conversation.meta?.flowState === 'CLOSED'
    );
  }

  private async findOpenForCitizen(
    citizenId: string,
    lineId: string | null,
  ): Promise<{
    id: string;
    status: string;
    isCanonical: boolean;
    communicationLineId: string | null;
    meta?: { flowState?: string } | null;
  } | null> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        citizenId,
        channel: 'whatsapp',
        communicationLineId: lineId,
        status: ConversationStatus.open,
      },
      include: { meta: true },
    });

    if (!existing) return null;

    // Crear meta si no existe (migración de datos existentes)
    if (!existing.meta) {
      await this.prisma.conversationMeta.create({
        // Keep the meta row consistent with the immutable indexed scope. Creating
        // it without this value makes the line-scope trigger read NULL as a
        // reassignment for conversations already bound before meta existed.
        data: { conversationId: existing.id, communicationLineId: existing.communicationLineId },
      });
    }
    return existing;
  }

  /**
   * Actualiza el flowState con optimistic locking (version).
   * Lanza error si la version no coincide (concurrent update).
   */
  async updateFlowState(
    conversationId: string,
    newState: ConversationFlowState,
    expectedVersion: number,
    opts?: {
      lockedByUserId?: string | undefined;
      departmentSlug?: string | undefined;
    },
  ): Promise<void> {
    await this.updateFlowStateInTransaction(
      this.prisma,
      conversationId,
      newState,
      expectedVersion,
      opts,
    );
  }

  async updateFlowStateInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
    newState: ConversationFlowState,
    expectedVersion: number,
    opts?: {
      lockedByUserId?: string | undefined;
      departmentSlug?: string | undefined;
    },
  ): Promise<void> {
    const humanStates: ConversationFlowState[] = ['HUMAN_FLOW', 'ESCALATED'];
    const updated = await tx.conversationMeta.updateMany({
      where: { conversationId, version: expectedVersion },
      data: {
        flowState: newState,
        version: { increment: 1 },
        ...(opts?.lockedByUserId !== undefined ? { lockedByUserId: opts.lockedByUserId } : {}),
        ...(opts?.departmentSlug !== undefined ? { departmentSlug: opts.departmentSlug } : {}),
        ...(humanStates.includes(newState) ? { handoverAt: new Date() } : { handoverAt: null }),
        ...(newState === 'CLOSED'
          ? { lockedByUserId: null, lockedAt: null, departmentSlug: null }
          : {}),
      },
    });

    if (updated.count === 0) {
      throw new Error(
        `Optimistic lock failed for conversation ${conversationId} at version ${expectedVersion}`,
      );
    }
  }

  /**
   * Lee el contexto completo de una conversación.
   */
  async getConversationContext(conversationId: string): Promise<ConversationContext | null> {
    return this.getConversationContextInTransaction(this.prisma, conversationId);
  }

  async getConversationContextInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<ConversationContext | null> {
    assertConversationId(conversationId);
    return tx.conversation.findUnique({
      where: { id: conversationId },
      include: {
        meta: true,
        citizen: { select: { id: true, phone: true, name: true, leadStatus: true } },
      },
    });
  }

  async bindCommunicationLine(conversationId: string, communicationLineId: string): Promise<void> {
    assertConversationId(conversationId);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { communicationLineId: true },
    });

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (
      conversation.communicationLineId !== null &&
      conversation.communicationLineId !== communicationLineId
    ) {
      // The indexed scope is authoritative. Do not attempt a meta write that the
      // trigger would reject as a reassignment.
      throw new ConflictError('La conversación pertenece a otra línea');
    }

    // The database trigger synchronizes the indexed scope for the first binding.
    // When scope is already bound to this same line, this only repairs a missing
    // legacy meta value; it never changes the established conversation line.
    await this.prisma.conversationMeta.updateMany({
      where: { conversationId, communicationLineId: null },
      data: { communicationLineId },
    });
    const context = await this.getCommunicationLineContext(conversationId);
    if (context.communicationLineId !== communicationLineId) {
      // Conflicto de negocio determinista: reintentar no reasigna la línea.
      throw new ConflictError('La conversación pertenece a otra línea');
    }
  }

  async getCommunicationLineContext(conversationId: string): Promise<{
    communicationLineId?: string;
    externalIdentifier?: string;
  }> {
    const meta = await this.prisma.conversationMeta.findUnique({
      where: { conversationId },
      select: {
        communicationLineId: true,
        communicationLine: {
          select: {
            externalIdentifier: true,
          },
        },
      },
    });

    return {
      ...(typeof meta?.communicationLineId === 'string'
        ? { communicationLineId: meta.communicationLineId }
        : {}),
      ...(typeof meta?.communicationLine?.externalIdentifier === 'string'
        ? { externalIdentifier: meta.communicationLine.externalIdentifier }
        : {}),
    };
  }

  findActiveCommunicationLineById(id: string): Promise<{ id: string } | null> {
    return this.prisma.communicationLine.findFirst({
      where: { id, channel: 'whatsapp', isActive: true },
      select: { id: true },
    });
  }

  findActiveCommunicationLineByExternalIdentifier(externalIdentifier: string): Promise<{
    id: string;
    externalIdentifier: string;
  } | null> {
    return this.prisma.communicationLine.findFirst({
      where: {
        channel: 'whatsapp',
        externalIdentifier,
        isActive: true,
      },
      select: {
        id: true,
        externalIdentifier: true,
      },
    });
  }

  async findDepartmentSlugsByIds(departmentIds: string[]): Promise<string[]> {
    const departments = await this.prisma.department.findMany({
      where: { id: { in: departmentIds }, isActive: true },
      select: { slug: true },
    });
    return departments.map((department) => department.slug);
  }

  /**
   * Líneas cuya atención IA está activa (línea → agente, relación 1:1).
   * `botAgentIds` limita a los agentes seleccionados; `null` dentro del array
   * incluye TODAS las líneas con agente activo (unión, por eso domina sobre los
   * ids). Sin argumento o array vacío equivale a "todas" (back-compat).
   */
  async findBotLineIds(botAgentIds?: (string | null)[]): Promise<string[]> {
    const selected = (botAgentIds ?? []).filter((id): id is string => typeof id === 'string');
    const includeAll =
      botAgentIds === undefined || botAgentIds.length === 0 || botAgentIds.includes(null);
    const lines = await this.prisma.communicationLine.findMany({
      where: {
        agent: { isActive: true },
        ...(includeAll ? { agentId: { not: null } } : { agentId: { in: selected } }),
      },
      select: { id: true },
    });
    return lines.map((line) => line.id);
  }

  /**
   * Agente IA activo por línea, batcheado para la página del listado
   * (deriva el campo `botAgent` del DTO sin N+1).
   */
  async findBotAgentsByLineIds(
    lineIds: string[],
  ): Promise<Map<string, { id: string; name: string }>> {
    const byLine = new Map<string, { id: string; name: string }>();
    if (lineIds.length === 0) return byLine;
    const lines = await this.prisma.communicationLine.findMany({
      where: { id: { in: lineIds }, agent: { isActive: true } },
      select: { id: true, agent: { select: { id: true, name: true } } },
    });
    for (const line of lines) {
      if (line.agent) byLine.set(line.id, { id: line.agent.id, name: line.agent.name });
    }
    return byLine;
  }

  async listWithContext(
    params: ConversationListQuery,
  ): Promise<{ items: ConversationListItem[]; hasNextPage: boolean }> {
    const departmentIds = Array.from(
      new Set([params.departmentId, ...(params.departmentIds ?? [])].filter(Boolean)),
    ) as string[];
    let departmentSlugs = params.departmentSlugs ?? [];
    if (departmentIds.length > 0) {
      const resolved = await this.findDepartmentSlugsByIds(departmentIds);
      departmentSlugs = [...departmentSlugs, ...resolved];
    }

    // Filtro bot: resolver líneas con agente IA activo.
    let botLineIds: string[] | undefined;
    if (params.botIds && params.botIds.length > 0) {
      botLineIds = await this.findBotLineIds(params.botIds);
    }

    // OR entre grupos: un grupo que resuelve vacío se descarta, el otro sigue
    // activo. Página vacía solo cuando el usuario pidió filtrar y ningún grupo
    // solicitado puede matchear (ambos inactivos).
    const deptRequested =
      Boolean(params.departmentSlug) ||
      (params.departmentSlugs?.length ?? 0) > 0 ||
      departmentIds.length > 0;
    const botRequested = Boolean(params.botIds?.length);
    const deptActive = departmentSlugs.length > 0;
    const botActive = (botLineIds?.length ?? 0) > 0;
    if ((deptRequested || botRequested) && !deptActive && !botActive) {
      return { items: [], hasNextPage: false };
    }

    const where = buildConversationListWhere({
      citizenId: params.citizenId,
      inboxStatus: params.inboxStatus,
      departmentSlug: params.departmentSlug,
      departmentSlugs,
      communicationLineId: params.communicationLineId,
      search: params.search,
      botLineIds,
    });

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      include: CONVERSATION_LIST_INCLUDE,
    });

    const hasNextPage = rows.length > params.limit;
    const items = hasNextPage ? rows.slice(0, params.limit) : rows;
    return { items, hasNextPage };
  }

  async applyAssignment(params: {
    conversationId: string;
    userId: string;
    departmentSlug?: string;
    lockMeta?: boolean;
    setLockedAt?: boolean;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.applyAssignmentInTransaction(tx, params);
    });
  }

  async applyAssignmentInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      conversationId: string;
      userId: string;
      departmentSlug?: string;
      lockMeta?: boolean;
      setLockedAt?: boolean;
    },
  ): Promise<void> {
    await tx.assignment.updateMany({
      where: { conversationId: params.conversationId, isActive: true },
      data: { isActive: false, releasedAt: new Date() },
    });

    await tx.assignment.create({
      data: {
        conversationId: params.conversationId,
        userId: params.userId,
        departmentSlug: params.departmentSlug,
      },
    });

    await tx.conversation.update({
      where: { id: params.conversationId },
      data: {
        assignedUserId: params.userId,
        assignedDept: params.departmentSlug ?? null,
        attendanceMode: AttendanceMode.human,
        botEnabled: false,
      },
    });

    if (params.lockMeta) {
      await tx.conversationMeta.updateMany({
        where: { conversationId: params.conversationId },
        data: {
          lockedByUserId: params.userId,
          ...(params.setLockedAt ? { lockedAt: new Date() } : {}),
        },
      });
    }
  }

  async updateConversationStatus(
    conversationId: string,
    status: ConversationStatus,
  ): Promise<void> {
    await this.updateConversationStatusInTransaction(this.prisma, conversationId, status);
  }

  async updateConversationStatusInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
    status: ConversationStatus,
  ): Promise<void> {
    await tx.conversation.update({
      where: { id: conversationId },
      data: { status },
    });
  }

  async clearInboxOwnership(conversationId: string): Promise<void> {
    await this.clearInboxOwnershipInTransaction(this.prisma, conversationId);
  }

  async clearInboxOwnershipInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<void> {
    const now = new Date();
    await tx.conversation.update({
      where: { id: conversationId },
      data: { assignedUserId: null, assignedDept: null },
    });
    await tx.conversationMeta.updateMany({
      where: { conversationId },
      data: { lockedByUserId: null, lockedAt: null, departmentSlug: null },
    });
    await tx.assignment.updateMany({
      where: { conversationId, isActive: true },
      data: { isActive: false, releasedAt: now },
    });
  }

  /** Libera todo control humano/BOT sobre la conversación (transferencia a IA). */
  async releaseOwnership(conversationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.releaseOwnershipInTransaction(tx, conversationId);
    });
  }

  async releaseOwnershipInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<void> {
    const now = new Date();
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        assignedUserId: null,
        assignedDept: null,
        attendanceMode: AttendanceMode.bot,
        botEnabled: true,
        // Deja de describir el handoff a departamento: la IA vuelve a estar al mando.
        transferredAt: null,
        transferredBy: null,
        transferReason: null,
      },
    });
    await tx.conversationMeta.updateMany({
      where: { conversationId },
      data: {
        lockedByUserId: null,
        lockedAt: null,
        departmentSlug: null,
        handoverAt: null,
      },
    });
    await tx.assignment.updateMany({
      where: { conversationId, isActive: true },
      data: { isActive: false, releasedAt: now },
    });
  }

  /**
   * Pone la conversación bajo control de un departamento sin dueño humano
   * (DEPARTMENT_ROUTING). Delega en el handoff unificado transferToDepartment.
   */
  async setDepartmentControl(
    conversationId: string,
    departmentSlug: string,
    performedBy?: string,
  ): Promise<void> {
    await this.transferToDepartment({
      conversationId,
      departmentSlug,
      transferredBy: performedBy ?? 'platform',
      reason: 'platform_transfer',
      actorUserId: performedBy,
    });
  }

  async setDepartmentControlInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
    departmentSlug: string,
    performedBy?: string,
  ): Promise<void> {
    await this.transferToDepartmentInTransaction(tx, {
      conversationId,
      departmentSlug,
      transferredBy: performedBy ?? 'platform',
      reason: 'platform_transfer',
      actorUserId: performedBy,
    });
  }

  /**
   * Handoff unificado a departamento — única autoridad que mueve una conversación
   * a atención humana por departamento. En una sola transacción:
   *  - bloquea la fila (SELECT ... FOR UPDATE) para serializar handoffs concurrentes,
   *  - libera asignaciones activas y limpia locks de meta,
   *  - fija `assignedDept` + `attendanceMode=human` + `botEnabled=false`,
   *  - marca `transferredAt/By/Reason`,
   *  - inserta el evento de auditoría TRANSFERRED_TO_DEPARTMENT.
   *
   * `transferredBy` es 'bot' cuando el handoff lo origina la IA, el userId del
   * agente cuando lo origina la plataforma, o 'platform'/'system' sin actor.
   */
  async transferToDepartment(params: TransferToDepartmentParams): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.transferToDepartmentInTransaction(tx, params);
    }, PRISMA_INTERACTIVE_TRANSACTION_OPTIONS);
  }

  async transferToDepartmentInTransaction(
    tx: Prisma.TransactionClient,
    params: TransferToDepartmentParams,
  ): Promise<void> {
    const { conversationId, departmentSlug, transferredBy, reason, actorUserId } = params;
    const now = new Date();

    // Serializa handoffs concurrentes sobre la misma conversación.
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;

    await tx.assignment.updateMany({
      where: { conversationId, isActive: true },
      data: { isActive: false, releasedAt: now },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        assignedUserId: null,
        ...(departmentSlug !== undefined ? { assignedDept: departmentSlug } : {}),
        attendanceMode: AttendanceMode.human,
        botEnabled: false,
        transferredAt: now,
        transferredBy,
        transferReason: reason ?? null,
      },
    });

    await tx.conversationMeta.updateMany({
      where: { conversationId },
      data: {
        lockedByUserId: null,
        lockedAt: null,
        ...(departmentSlug !== undefined ? { departmentSlug } : {}),
        handoverAt: null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUserId ?? null,
        action: 'conversation.transferred_to_department',
        targetType: 'Conversation',
        targetId: conversationId,
        metadata: {
          departmentSlug: departmentSlug ?? null,
          transferredBy,
          reason: reason ?? null,
        },
      },
    });
  }

  /** Registra el origen del último handoff en ConversationMeta (trazabilidad). */
  async setHandoffKind(conversationId: string, handoffKind: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.setHandoffKindInTransaction(tx, conversationId, handoffKind);
    });
  }

  /**
   * Fija el modo de atención de una conversación (bot/human) y su kill-switch.
   * Independiente del flowState: un BOT_FLOW con attendance human silencia al bot.
   */
  async setAttendanceMode(
    conversationId: string,
    attendanceMode: AttendanceMode,
    botEnabled: boolean,
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { attendanceMode, botEnabled },
    });
  }

  async setHandoffKindInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
    handoffKind: string,
  ): Promise<void> {
    await tx.conversationMeta.updateMany({
      where: { conversationId },
      data: { handoffKind },
    });
  }

  /** Actualiza la asignación del ticket activo (si existe) dentro de una transacción. */
  async updateActiveTicketInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
    data: { userId?: string | null; departmentSlug?: string | null },
  ): Promise<void> {
    const active = await tx.ticket.findFirst({
      where: { conversationId, status: { in: ACTIVE_TICKET_STATUSES } },
      select: { id: true },
    });
    if (!active) return;
    await tx.ticket.update({
      where: { id: active.id },
      data: {
        ...(data.userId !== undefined ? { assignedUserId: data.userId } : {}),
        ...(data.departmentSlug !== undefined ? { departmentSlug: data.departmentSlug } : {}),
      },
    });
  }

  async closeActiveTickets(conversationId: string, reason: string): Promise<number> {
    return this.closeActiveTicketsInTransaction(this.prisma, conversationId, reason);
  }

  /** Tickets activos de una conversación, para emitir ticket.closed por ticket al cerrar. */
  async findActiveTicketsInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
  ): Promise<
    Array<{
      id: string;
      conversationId: string;
      assignedUserId: string | null;
      departmentSlug: string | null;
    }>
  > {
    return tx.ticket.findMany({
      where: { conversationId, status: { in: ACTIVE_TICKET_STATUSES } },
      select: { id: true, conversationId: true, assignedUserId: true, departmentSlug: true },
    }) as Promise<
      Array<{
        id: string;
        conversationId: string;
        assignedUserId: string | null;
        departmentSlug: string | null;
      }>
    >;
  }

  async closeActiveTicketsInTransaction(
    tx: Prisma.TransactionClient,
    conversationId: string,
    reason: string,
  ): Promise<number> {
    const result = await tx.ticket.updateMany({
      where: {
        conversationId,
        status: { in: ACTIVE_TICKET_STATUSES },
      },
      data: {
        status: TicketStatus.CLOSED,
        closedAt: new Date(),
        closeReason: reason,
        assignedUserId: null,
        departmentSlug: null,
      },
    });
    return result.count;
  }

  /**
   * Cierra conversaciones inactivas (sin mensajes en N días).
   */
  async closeInactive(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const result = await this.prisma.conversation.updateMany({
      where: {
        status: ConversationStatus.open,
        updatedAt: { lt: cutoff },
      },
      data: { status: ConversationStatus.closed },
    });
    return result.count;
  }

  /**
   * Concilia inconsistencias de atención (job periódico): si una conversación
   * tiene agente asignado pero quedó en `attendance_mode = 'bot'`, un agente
   * humano está atendiéndola y el bot no debe responder. Se corrige a human.
   * Devuelve la cantidad de filas corregidas.
   */
  async reconcileAttendanceMode(): Promise<number> {
    const result = await this.prisma.conversation.updateMany({
      where: {
        assignedUserId: { not: null },
        attendanceMode: AttendanceMode.bot,
      },
      data: { attendanceMode: AttendanceMode.human, botEnabled: false },
    });
    return result.count;
  }

  /**
   * Detecta handoffs a departamento que, pasado el umbral, siguen con la IA
   * activa (attendance bot): el bot podría seguir respondiendo tras el transfer.
   * Devuelve las conversaciones afectadas para logging/alerta.
   */
  async findStuckDepartmentHandoffs(
    olderThanMs: number,
    limit = 100,
  ): Promise<{ id: string; transferredAt: Date | null }[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return this.prisma.conversation.findMany({
      where: {
        transferReason: { not: null },
        attendanceMode: AttendanceMode.bot,
        transferredAt: { lt: cutoff },
      },
      select: { id: true, transferredAt: true },
      take: limit,
    });
  }

  async countUnreadByConversationIds(
    userId: string,
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map(conversationIds.map((id) => [id, 0]));
    if (conversationIds.length === 0) return counts;

    const reads = await this.prisma.conversationRead.findMany({
      where: { userId, conversationId: { in: conversationIds } },
      select: { conversationId: true, lastReadAt: true },
    });
    const readAt = new Map(reads.map((row) => [row.conversationId, row.lastReadAt]));
    const oldestUnreadCursor =
      reads.length === conversationIds.length
        ? reads.reduce(
            (min, row) => (row.lastReadAt < min ? row.lastReadAt : min),
            reads[0]?.lastReadAt ?? new Date(0),
          )
        : new Date(0);

    const inbound = await this.prisma.message.findMany({
      where: {
        conversationId: { in: conversationIds },
        direction: MessageDirection.inbound,
        createdAt: { gt: oldestUnreadCursor },
      },
      select: { conversationId: true, createdAt: true },
    });

    for (const message of inbound) {
      const cursor = readAt.get(message.conversationId) ?? new Date(0);
      if (message.createdAt > cursor) {
        counts.set(message.conversationId, (counts.get(message.conversationId) ?? 0) + 1);
      }
    }

    return counts;
  }

  async markConversationRead(
    userId: string,
    conversationId: string,
    readAt = new Date(),
  ): Promise<void> {
    await this.prisma.conversationRead.upsert({
      where: {
        userId_conversationId: { userId, conversationId },
      },
      create: {
        userId,
        conversationId,
        lastReadAt: readAt,
      },
      update: {
        lastReadAt: readAt,
      },
    });
  }
}
