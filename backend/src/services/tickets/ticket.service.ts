import { Prisma } from '@prisma/client';
import { buildTicketCreatedEvent } from '../realtime/message-event.builder';
import { withRealtimeTransaction } from '../realtime/realtime-transaction';
/**
 * TicketService — Gestión del ciclo de vida de tickets ciudadanos.
 *
 * Reglas de negocio:
 * - Una conversación puede tener múltiples tickets históricos.
 * - Solo puede haber 1 ticket activo (OPEN | IN_PROGRESS) por conversación.
 * - Las transiciones de estado siguen la FSM: OPEN → IN_PROGRESS → RESOLVED → CLOSED.
 * - No se permiten duplicados en TicketMessage (idempotencia por (ticketId, messageId)).
 */
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../../database/transaction-options';
import {
  TicketPrismaLike,
  TicketRepository,
  type TicketWithRelations,
} from '../../repositories/ticket.repository';
import { AppError } from '../../utils/app-error';
import { PrismaService } from '../prisma.service';
import { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import { buildTicketClosedEvent } from '../realtime/ticket-event.builder';
import { buildFolio } from './folio.generator';
import {
  AssignTicketInput,
  CloseTicketOptions,
  CloseTicketRef,
  CloseTicketResult,
  ConversationTicketSummary,
  CreateTicketInput,
  Ticket,
  TicketActorType,
  TicketMessage,
  TicketPriority,
  TicketSource,
  TicketStatus,
  VALID_TICKET_TRANSITIONS,
  type ListTicketFilters,
  type PageTicketFilters,
} from './ticket.types';
import { getCachedTotal, setCachedTotal, totalCacheKey } from './ticket-total-cache';

// ─── Logger estructurado ──────────────────────────────────────────────────────

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: 'TicketService',
    event,
    ...data,
  };
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(entry));
}

// ─── Paginación ───────────────────────────────────────────────────────────────

/**
 * Techo duro de tamaño de página. Es una decisión de producto y de coste:
 * 50 filas × 8 columnas es el máximo razonable para reconciliar la tabla.
 */
export const MAX_PAGE_SIZE = 50;

/** Techo de página: 500 × 50 = 25 000 filas de OFFSET máximo. */
export const MAX_PAGE = 500;

export interface PaginatedTickets {
  rows: TicketWithRelations[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ─── TicketService ────────────────────────────────────────────────────────────

export class TicketService {
  private readonly repository: TicketRepository;
  private readonly realtimeNotifier?: RealtimeNotifier;
  private readonly prisma?: PrismaService;

  constructor(
    repositoryOrPrisma: TicketRepository | TicketPrismaLike,
    realtimeNotifier?: RealtimeNotifier,
    prisma?: PrismaService,
    private readonly inExistingTransaction = false,
    private readonly transactionCorrelationId?: string,
  ) {
    this.repository =
      repositoryOrPrisma instanceof TicketRepository
        ? repositoryOrPrisma
        : new TicketRepository(repositoryOrPrisma);
    this.realtimeNotifier = realtimeNotifier;
    this.prisma = prisma;
  }

  private async runInTransaction<T>(fn: (repo: TicketRepository) => Promise<T>): Promise<T> {
    if (
      this.prisma &&
      typeof this.prisma.$transaction === 'function' &&
      this.realtimeNotifier?.isEnabled()
    ) {
      return withRealtimeTransaction(
        this.prisma,
        this.realtimeNotifier,
        (tx) => fn(new TicketRepository(tx as unknown as TicketPrismaLike)),
        PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
      );
    }
    return this.repository.runInTransaction(fn);
  }

  inTransaction(tx: Prisma.TransactionClient, correlationId?: string): TicketService {
    return new TicketService(
      new TicketRepository(tx as unknown as TicketPrismaLike),
      this.realtimeNotifier,
      tx as unknown as PrismaService,
      true,
      correlationId,
    );
  }

  private isActiveTicketUniqueViolation(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }

    const code = 'code' in err ? err.code : undefined;
    const message = 'message' in err ? String(err.message) : '';

    return (
      code === 'P2002' &&
      (message.includes('uq_tickets_one_active_per_conversation') ||
        message.includes('tickets_conversation_id') ||
        message.includes('conversation_id'))
    );
  }

  private isFolioUniqueViolation(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }

    const code = 'code' in err ? err.code : undefined;
    const message = 'message' in err ? String(err.message) : '';
    const meta = 'meta' in err ? (err as { meta?: { target?: unknown } }).meta : undefined;
    const target = meta?.target;
    const targetStr = Array.isArray(target)
      ? target.filter((t): t is string => typeof t === 'string').join(',')
      : typeof target === 'string'
        ? target
        : '';

    return (
      code === 'P2002' &&
      (message.includes('uq_tickets_folio') ||
        message.includes('folio') ||
        targetStr.toLowerCase().includes('folio'))
    );
  }

  /**
   * Crea un nuevo ticket para una conversación.
   * Valida que la conversación y el citizen existan, y que no haya ticket activo.
   * Genera un folio único (reintenta con timestamp +1s ante colisión).
   */
  async createTicket(input: CreateTicketInput): Promise<Ticket> {
    // Keep validation reads outside the interactive transaction. On Cloud SQL
    // these round-trips can collectively exceed Prisma's transaction timeout.
    const conversation = await this.repository.findConversationById(input.conversationId);
    if (!conversation) {
      throw new Error(`Conversación no encontrada: ${input.conversationId}`);
    }

    const citizen = await this.repository.findCitizenById(input.citizenId);
    if (!citizen) {
      throw new Error(`Ciudadano no encontrado: ${input.citizenId}`);
    }

    const activeTicket = await this.repository.findActiveTicketByConversation(input.conversationId);
    if (activeTicket) {
      throw new Error(
        `Ya existe un ticket activo (${activeTicket.id}) en la conversación ${input.conversationId}`,
      );
    }

    const contact = await this.repository.findConversationContact(input.conversationId);
    const createdAt = new Date();
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const folio = buildFolio(
        new Date(createdAt.getTime() + attempt * 1000),
        contact?.platformLine,
        contact?.userPhone,
      );

      // A known collision must be skipped before INSERT in an existing PG
      // transaction: a unique violation would abort the whole transaction.
      // The unique index still handles races; ingress retries the whole TX.
      if (
        this.inExistingTransaction &&
        (await this.repository.transactionClient().ticket.findUnique({ where: { folio } }))
      ) {
        continue;
      }

      try {
        // The partial unique index (one active ticket per conversation) and the
        // folio unique index remain the concurrency authority. The get-or-create
        // caller recovers the winner when this create gets P2002.
        const ticket = await this.runInTransaction(async (repo) => {
          const created = await repo.createTicket({
            conversationId: input.conversationId,
            citizenId: input.citizenId,
            folio,
            status: TicketStatus.OPEN,
            priority: input.priority ?? TicketPriority.MEDIUM,
            source: input.source ?? TicketSource.WHATSAPP,
            title: input.title,
            description: input.description,
            departmentSlug: input.departmentSlug,
            createdAt,
          });
          await repo.setConversationActiveTicket(input.conversationId, created.id);
          if (this.realtimeNotifier?.isEnabled()) {
            const tx = repo.transactionClient() as unknown as Prisma.TransactionClient;
            const context = await tx.conversation.findUnique({
              where: { id: input.conversationId },
              include: { citizen: true, meta: true },
            });
            await this.realtimeNotifier.notifyCritical(
              tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
              buildTicketCreatedEvent(
                input.conversationId,
                this.transactionCorrelationId ?? 'ticket:' + created.id,
                createdAt.toISOString(),
                {
                  contactName: context?.citizen.name ?? undefined,
                  phone: context?.citizen.phone ?? undefined,
                  flowState: context?.meta?.flowState,
                  channel: context?.channel,
                  departmentSlug: created.departmentSlug ?? undefined,
                  communicationLineId: context?.meta?.communicationLineId ?? undefined,
                },
                { ...created, updatedAt: created.updatedAt.toISOString() },
              ),
            );
          }
          return created;
        });

        log('info', 'ticket.created', {
          ticketId: ticket.id,
          conversationId: input.conversationId,
          citizenId: input.citizenId,
          folio: ticket.folio,
        });

        return ticket;
      } catch (err: unknown) {
        if (
          !this.inExistingTransaction &&
          this.isFolioUniqueViolation(err) &&
          attempt < maxAttempts - 1
        ) {
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `No se pudo generar un folio único para la conversación ${input.conversationId}`,
    );
  }

  /**
   * Retorna el ticket activo (OPEN | IN_PROGRESS) de una conversación, o undefined si no existe.
   */
  async getActiveTicketByConversation(
    conversationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Ticket | undefined> {
    const ticket = await this.repository.findActiveTicketByConversation(conversationId, tx);
    return ticket ?? undefined;
  }

  /** Retorna el detalle de un ticket por id, o undefined si no existe. */
  async getTicketById(ticketId: string): Promise<Ticket | undefined> {
    const ticket = await this.repository.findTicketById(ticketId);
    return ticket ?? undefined;
  }

  /**
   * Lista tickets (casos) con su contexto de conversación/ciudadano resuelto,
   * paginado por cursor. Vista principal del módulo CRM.
   */
  async listTickets(
    filters: ListTicketFilters,
  ): Promise<{ rows: TicketWithRelations[]; hasNextPage: boolean }> {
    const limit = Math.min(Math.max(Math.trunc(filters.limit), 1), 100);
    return this.repository.listTickets({ ...filters, limit });
  }

  /**
   * Listado CRM paginado por offset con metadata de paginación.
   *
   * Clampa `page`/`limit` (defensa en profundidad: el controller valida, pero
   * este método es público y otros callers podrían olvidarlo) y cachea el
   * total 30 s para no repetir el `COUNT(*)` en cada cambio de página.
   *
   * Si `page` excede `totalPages` se devuelve la página vacía con el total
   * real, de modo que el cliente pueda clampear la UI en lugar de mostrar
   * "0 resultados" sobre una lista que sí tiene datos.
   */
  async listTicketsPage(filters: PageTicketFilters): Promise<PaginatedTickets> {
    const itemsPerPage = Math.min(Math.max(Math.trunc(filters.limit), 1), MAX_PAGE_SIZE);
    const requestedPage = Math.min(Math.max(Math.trunc(filters.page), 1), MAX_PAGE);

    const cacheKey = totalCacheKey(filters);
    const cachedTotal = getCachedTotal(cacheKey);

    const { rows, totalItems: freshTotal } = await this.repository.listTicketsPage(
      {
        ...filters,
        page: requestedPage,
        limit: itemsPerPage,
      },
      cachedTotal,
    );

    const totalItems = cachedTotal ?? freshTotal;
    if (cachedTotal === undefined) setCachedTotal(cacheKey, totalItems);

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const currentPage = Math.min(requestedPage, totalPages);

    return {
      rows,
      totalItems,
      totalPages,
      currentPage,
      itemsPerPage,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
    };
  }

  /** Detalle CRM de un ticket (con ciudadano y conversación), o undefined. */
  async getTicketDetail(ticketId: string): Promise<TicketWithRelations | undefined> {
    const row = await this.repository.findTicketWithRelations(ticketId);
    return row ?? undefined;
  }

  /**
   * Obtiene el ticket activo de la conversación o crea uno nuevo si no existe.
   * Idempotente: llamadas repetidas retornan el mismo ticket.
   *
   * `created` es true solo cuando ESTE caller creó el ticket; permite al
   * orchestrator emitir ticket.created cuando nace un ticket sin ciclo nuevo
   * (p. ej. recontacto tras despedida).
   */
  async getOrCreateActiveTicket(
    conversationId: string,
    citizenId: string,
  ): Promise<{ ticket: Ticket; created: boolean }> {
    const existing = await this.getActiveTicketByConversation(conversationId);
    if (existing) {
      return { ticket: existing, created: false };
    }

    try {
      return { ticket: await this.createTicket({ conversationId, citizenId }), created: true };
    } catch (err: unknown) {
      if (!this.inExistingTransaction && this.isActiveTicketUniqueViolation(err)) {
        const current = await this.getActiveTicketByConversation(conversationId);
        if (current) {
          return { ticket: current, created: false };
        }
      }
      throw err;
    }
  }

  /**
   * Asocia un mensaje al ticket.
   * Idempotente: si ya existe la asociación, retorna el registro existente.
   * Además fija `messages.ticket_id` (fuente de lectura del detalle por ticket)
   * sin reasignar mensajes que ya tienen ticket.
   */
  async attachMessageToTicket(ticketId: string, messageId: string): Promise<TicketMessage> {
    // 1. Verificar idempotencia
    const existing = await this.repository.findTicketMessage(ticketId, messageId);
    if (existing) {
      await this.repository.setMessageTicketId(messageId, ticketId);
      return existing;
    }

    // 2. Verificar que el ticket existe
    const ticket = await this.repository.findTicketById(ticketId);
    if (!ticket) {
      throw new Error(`Ticket no encontrado: ${ticketId}`);
    }

    // 3. Crear asociación
    const ticketMessage = await this.repository.createTicketMessage({
      ticketId,
      messageId,
      actorType: TicketActorType.CITIZEN,
    });

    // 4. Fijar messages.ticket_id (no-op si ya estaba seteado).
    await this.repository.setMessageTicketId(messageId, ticketId);

    return ticketMessage;
  }

  /**
   * Asigna un usuario y/o departamento al ticket.
   */
  async assignTicket(ticketId: string, input: AssignTicketInput): Promise<Ticket> {
    const ticket = await this.repository.updateTicket(ticketId, {
      ...(input.userId !== undefined && { assignedUserId: input.userId }),
      ...(input.departmentSlug !== undefined && { departmentSlug: input.departmentSlug }),
    });

    log('info', 'ticket.assigned', {
      ticketId,
      userId: input.userId,
      departmentSlug: input.departmentSlug,
    });

    return ticket;
  }

  /**
   * Cierra un ticket directamente (transition → CLOSED).
   * Acepta trazabilidad opcional (motivo y resumen) que queda persistida.
   * Limpia `conversations.active_ticket_id`. No reabre tickets.
   */
  async closeTicket(ticketId: string, options?: CloseTicketOptions): Promise<Ticket> {
    if (this.realtimeNotifier?.isEnabled()) {
      return this.closeTicketDurable(ticketId, options);
    }

    const ticket = await this.repository.updateTicket(ticketId, {
      status: TicketStatus.CLOSED,
      closedAt: new Date(),
      ...(options?.reason !== undefined && { closeReason: options.reason }),
      ...(options?.summary !== undefined && { closeSummary: options.summary }),
    });

    await this.repository.setConversationActiveTicket(ticket.conversationId, null);

    log('info', 'ticket.closed', {
      ticketId,
      folio: ticket.folio,
      ...(options?.reason !== undefined && { reason: options.reason }),
    });

    return ticket;
  }

  /**
   * Resuelve y cierra el ticket activo a partir de un id de ticket o de
   * conversación. Valida que esté abierto (OPEN | IN_PROGRESS) y nunca reabre.
   */
  async closeActiveTicketByRef(
    ref: CloseTicketRef,
    options?: CloseTicketOptions,
  ): Promise<CloseTicketResult> {
    if (!ref.ticketId && !ref.conversationId) {
      throw AppError.badRequest('Se requiere ticketId o conversationId');
    }

    let ticket: Ticket | undefined;
    if (ref.ticketId) {
      ticket = (await this.repository.findTicketById(ref.ticketId)) ?? undefined;
    } else if (ref.conversationId) {
      ticket = await this.getActiveTicketByConversation(ref.conversationId);
    }

    if (!ticket) {
      throw AppError.notFound('Ticket no encontrado');
    }

    if (ticket.status === TicketStatus.CLOSED) {
      throw AppError.conflict(`El ticket ${ticket.folio} ya está cerrado`);
    }

    const closed = await this.closeTicket(ticket.id, options);

    return {
      ticketId: closed.id,
      conversationId: closed.conversationId,
      folio: closed.folio,
      closedAt: closed.closedAt ?? new Date(),
    };
  }

  /**
   * Variante durable: cierra ticket y emite `ticket.closed` en la misma
   * transacción (outbox), garantizando fan-out realtime vía el pipeline durable.
   */
  private async closeTicketDurable(
    ticketId: string,
    options?: CloseTicketOptions,
  ): Promise<Ticket> {
    if (!this.prisma) {
      throw new Error('TicketService requires PrismaService for durable realtime');
    }

    return withRealtimeTransaction(
      this.prisma,
      this.realtimeNotifier,
      async (tx) => {
        const closedAt = new Date();
        const ticket = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            status: TicketStatus.CLOSED,
            closedAt,
            ...(options?.reason !== undefined && { closeReason: options.reason }),
            ...(options?.summary !== undefined && { closeSummary: options.summary }),
          },
        });

        await tx.conversation.updateMany({
          where: { activeTicketId: ticketId },
          data: { activeTicketId: null },
        });

        const occurredAt = closedAt.toISOString();
        const correlationId = `ticket-close-${ticketId}-${Date.now()}`;

        await this.realtimeNotifier!.notifyCritical(
          tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
          buildTicketClosedEvent(ticket, correlationId, occurredAt, 'ticket.service'),
        );

        log('info', 'ticket.closed', {
          ticketId,
          folio: ticket.folio,
          ...(options?.reason !== undefined && { reason: options.reason }),
        });

        return ticket as Ticket;
      },
      PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
    );
  }

  /**
   * Actualiza el estado del ticket validando la transición.
   * Transiciones válidas: OPEN → IN_PROGRESS → RESOLVED → CLOSED
   */
  async updateStatus(
    ticketId: string,
    newStatus: TicketStatus,
    options?: { escalationReason?: string },
  ): Promise<Ticket> {
    // 1. Leer estado actual
    const current = await this.repository.findTicketById(ticketId);
    if (!current) {
      throw new Error(`Ticket no encontrado: ${ticketId}`);
    }

    // 2. Validar transición
    const allowedTargets = VALID_TICKET_TRANSITIONS[current.status] ?? [];
    if (!allowedTargets.includes(newStatus)) {
      throw new Error(
        `Transición de estado inválida: ${current.status} → ${newStatus}. Permitidas: ${allowedTargets.join(', ') || 'ninguna'}`,
      );
    }

    // 3. Aplicar
    const updated = await this.repository.updateTicket(ticketId, {
      status: newStatus,
      ...(newStatus === TicketStatus.CLOSED && { closedAt: new Date() }),
      ...(options?.escalationReason !== undefined && {
        escalationReason: options.escalationReason,
      }),
    });

    if (newStatus === TicketStatus.CLOSED) {
      await this.repository.setConversationActiveTicket(current.conversationId, null);
    }

    log('info', 'ticket.status_updated', {
      ticketId,
      from: current.status,
      to: newStatus,
    });

    return updated;
  }

  /** Últimos tickets del ciudadano, más recientes primero (máximo 5). */
  async listRecentByCitizen(citizenId: string, limit = 5): Promise<Ticket[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 5);
    return this.repository.findRecentByCitizen(citizenId, safeLimit);
  }

  /**
   * Lista los tickets de una conversación con su historial resumido
   * (para la vista "Detalles del Ticket").
   */
  async listByConversation(
    conversationId: string,
    limit = 50,
  ): Promise<ConversationTicketSummary[]> {
    const conversation = await this.repository.findConversationById(conversationId);
    if (!conversation) {
      throw new AppError('Conversación no encontrada', 404);
    }

    const rows = await this.repository.listByConversation(conversationId, limit);
    return rows.map((ticket) => ({
      id: ticket.id,
      folio: ticket.folio,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      closeReason: ticket.closeReason,
      messageCount:
        (ticket as unknown as { _count?: { ticketMessages?: number } })._count?.ticketMessages ?? 0,
    }));
  }
}
