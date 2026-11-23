import { Prisma } from '@prisma/client';
import {
  InteractiveTransactionOptions,
  PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
} from '../database/transaction-options';
import { PrismaService } from '../services/prisma.service';
import { assertConversationId } from '../utils/conversation-id';
import {
  Ticket,
  TicketActorType,
  TicketMessage,
  TicketPriority,
  TicketSource,
  TicketStatus,
  type ListTicketFilters,
  type PageTicketFilters,
} from '../services/tickets/ticket.types';

type TicketTransaction = <T>(
  fn: (tx: TicketPrismaLike) => Promise<T>,
  options?: InteractiveTransactionOptions,
) => Promise<T>;

export interface TicketPrismaLike {
  $transaction?: TicketTransaction;
  ticket: {
    create: (args: unknown) => Promise<Ticket>;
    findFirst: (args: unknown) => Promise<Ticket | null>;
    findMany: (args: unknown) => Promise<Ticket[]>;
    findUnique: (args: unknown) => Promise<Ticket | null>;
    update: (args: unknown) => Promise<Ticket>;
    count: (args: unknown) => Promise<number>;
  };
  ticketMessage: {
    create: (args: unknown) => Promise<TicketMessage>;
    findFirst: (args: unknown) => Promise<TicketMessage | null>;
  };
  message: {
    updateMany: (args: unknown) => Promise<unknown>;
  };
  conversation: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      citizenId: string;
      activeTicketId?: string | null;
      citizen?: { phone: string | null } | null;
      meta?: { communicationLine?: { phoneNumber: string | null } | null } | null;
    } | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  citizen: {
    findUnique: (args: unknown) => Promise<{ id: string } | null>;
  };
}

export interface ConversationContact {
  id: string;
  citizenId: string;
  userPhone: string | null;
  platformLine: string | null;
}

/** Contexto de conversación embebido en un ticket para la vista CRM. */
export interface TicketConversationContext {
  id: string;
  citizenId: string;
  status: string;
  channel: string;
  assignedDept: string | null;
  assignedUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  meta: { flowState: string; departmentSlug: string | null } | null;
  citizen: { id: string; name: string | null; phone: string | null } | null;
}

/** Ticket con ciudadano y conversación resueltos (listado/detalle CRM). */
export interface TicketWithRelations extends Ticket {
  citizen: { id: string; name: string | null; phone: string | null } | null;
  conversation: TicketConversationContext | null;
}

/** Selección de relaciones compartida por listado y detalle de tickets. */
const TICKET_RELATIONS_INCLUDE = {
  citizen: { select: { id: true, name: true, phone: true } },
  conversation: {
    select: {
      id: true,
      citizenId: true,
      status: true,
      channel: true,
      assignedDept: true,
      assignedUserId: true,
      createdAt: true,
      updatedAt: true,
      meta: { select: { flowState: true, departmentSlug: true } },
      citizen: { select: { id: true, name: true, phone: true } },
    },
  },
} as const;

/**
 * WHERE compartido por el listado cursor-based (legacy) y el offset-based.
 * Centralizarlo evita que ambas rutas diverjan en filtros.
 */
function buildTicketListWhere(filters: ListTicketFilters): Prisma.TicketWhereInput {
  const search = filters.search?.trim();

  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.departmentSlug ? { departmentSlug: filters.departmentSlug } : {}),
    ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
    ...(filters.citizenId ? { citizenId: filters.citizenId } : {}),
    ...(search
      ? {
          OR: [
            { folio: { contains: search, mode: 'insensitive' } },
            {
              citizen: {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search } },
                ],
              },
            },
          ],
        }
      : {}),
  };
}

/**
 * Orden determinista para paginación por OFFSET.
 *
 * `id` actúa como tiebreaker: sin él, dos tickets con el mismo `updatedAt`
 * pueden aparecer en dos páginas distintas o desaparecer del recorrido.
 * Es la causa raíz de que el scroll actual duplique filas.
 */
function buildTicketOrderBy(
  sortBy: PageTicketFilters['sortBy'] = 'updatedAt',
  sort: 'asc' | 'desc' = 'desc',
): Prisma.TicketOrderByWithRelationInput[] {
  const direction = sort === 'asc' ? 'asc' : 'desc';

  switch (sortBy) {
    case 'priority':
      return [{ priority: direction }, { updatedAt: 'desc' }, { id: 'desc' }];
    case 'createdAt':
      return [{ createdAt: direction }, { id: direction }];
    case 'updatedAt':
    default:
      return [{ updatedAt: direction }, { id: direction }];
  }
}

export class TicketRepository {
  constructor(private readonly prisma: PrismaService | TicketPrismaLike) {}

  transactionClient(): TicketPrismaLike {
    return this.prisma as TicketPrismaLike;
  }

  async runInTransaction<T>(fn: (repo: TicketRepository) => Promise<T>): Promise<T> {
    const transaction = this.prisma.$transaction as TicketTransaction | undefined;
    if (transaction) {
      return transaction.call(
        this.prisma,
        (tx: TicketPrismaLike) => fn(new TicketRepository(tx)),
        PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
      ) as Promise<T>;
    }
    return fn(this);
  }

  async findConversationById(
    conversationId: string,
  ): Promise<{ id: string; citizenId: string } | null> {
    assertConversationId(conversationId);
    return this.prisma.conversation.findUnique({ where: { id: conversationId } }) as Promise<{
      id: string;
      citizenId: string;
    } | null>;
  }

  findCitizenById(citizenId: string): Promise<{ id: string } | null> {
    return this.prisma.citizen.findUnique({ where: { id: citizenId } }) as Promise<{
      id: string;
    } | null>;
  }

  /**
   * Datos de contacto de la conversación para el folio: teléfono del ciudadano
   * y teléfono de la línea de plataforma (vía conversation_meta.communication_line).
   */
  async findConversationContact(conversationId: string): Promise<ConversationContact | null> {
    assertConversationId(conversationId);
    const row = (await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        citizenId: true,
        citizen: { select: { phone: true } },
        meta: { select: { communicationLine: { select: { phoneNumber: true } } } },
      },
    })) as {
      id: string;
      citizenId: string;
      citizen?: { phone: string | null } | null;
      meta?: { communicationLine?: { phoneNumber: string | null } | null } | null;
    } | null;

    if (!row) return null;
    return {
      id: row.id,
      citizenId: row.citizenId,
      userPhone: row.citizen?.phone ?? null,
      platformLine: row.meta?.communicationLine?.phoneNumber ?? null,
    };
  }

  async findActiveTicketByConversation(
    conversationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Ticket | null> {
    assertConversationId(conversationId);
    const conv = tx
      ? await tx.conversation.findUnique({
          where: { id: conversationId },
          select: { activeTicketId: true },
        })
      : ((await this.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { activeTicketId: true },
        })) as { activeTicketId?: string | null } | null);

    if (conv?.activeTicketId) {
      const byId = tx
        ? ((await tx.ticket.findUnique({
            where: { id: conv.activeTicketId },
          })) as unknown as Ticket | null)
        : ((await this.prisma.ticket.findUnique({
            where: { id: conv.activeTicketId },
          })) as Ticket | null);
      if (byId && (byId.status === TicketStatus.OPEN || byId.status === TicketStatus.IN_PROGRESS)) {
        return byId;
      }
    }

    return tx
      ? (tx.ticket.findFirst({
          where: {
            conversationId,
            status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
          },
        }) as unknown as Promise<Ticket | null>)
      : (this.prisma.ticket.findFirst({
          where: {
            conversationId,
            status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
          },
        }) as Promise<Ticket | null>);
  }

  createTicket(data: {
    conversationId: string;
    citizenId: string;
    folio: string;
    status: TicketStatus;
    priority: TicketPriority;
    source: TicketSource;
    title?: string;
    description?: string;
    departmentSlug?: string;
    createdAt?: Date;
  }): Promise<Ticket> {
    return this.prisma.ticket.create({ data }) as Promise<Ticket>;
  }

  /** Marca el ticket activo de la conversación (o lo limpia con null). */
  setConversationActiveTicket(conversationId: string, ticketId: string | null): Promise<unknown> {
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { activeTicketId: ticketId },
    }) as Promise<unknown>;
  }

  /**
   * Fija messages.ticket_id SOLO si aún no tiene ticket, para no reasignar
   * mensajes históricos a un ticket nuevo.
   */
  setMessageTicketId(messageId: string, ticketId: string): Promise<unknown> {
    return this.prisma.message.updateMany({
      where: { id: messageId, ticketId: null },
      data: { ticketId },
    }) as Promise<unknown>;
  }

  findTicketMessage(ticketId: string, messageId: string): Promise<TicketMessage | null> {
    return this.prisma.ticketMessage.findFirst({
      where: { ticketId, messageId },
    }) as Promise<TicketMessage | null>;
  }

  findTicketById(ticketId: string): Promise<Ticket | null> {
    return this.prisma.ticket.findUnique({ where: { id: ticketId } }) as Promise<Ticket | null>;
  }

  findRecentByCitizen(citizenId: string, limit: number): Promise<Ticket[]> {
    return this.prisma.ticket.findMany({
      where: { citizenId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    }) as Promise<Ticket[]>;
  }

  createTicketMessage(data: {
    ticketId: string;
    messageId: string;
    actorType: TicketActorType;
  }): Promise<TicketMessage> {
    return this.prisma.ticketMessage.create({ data }) as Promise<TicketMessage>;
  }

  updateTicket(ticketId: string, data: Record<string, unknown>): Promise<Ticket> {
    return this.prisma.ticket.update({ where: { id: ticketId }, data }) as Promise<Ticket>;
  }

  async closeActiveByConversation(
    conversationId: string,
    options?: { reason?: string; summary?: string },
  ): Promise<Ticket | null> {
    const active = await this.findActiveTicketByConversation(conversationId);
    if (!active) {
      return null;
    }

    const closed = await this.updateTicket(active.id, {
      status: TicketStatus.CLOSED,
      closedAt: new Date(),
      assignedUserId: null,
      departmentSlug: null,
      ...(options?.reason !== undefined ? { closeReason: options.reason } : {}),
      ...(options?.summary !== undefined ? { closeSummary: options.summary } : {}),
    });
    await this.setConversationActiveTicket(conversationId, null);
    return closed;
  }

  listByConversation(conversationId: string, limit = 50): Promise<Ticket[]> {
    return this.prisma.ticket.findMany({
      where: { conversationId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { _count: { select: { ticketMessages: true } } },
    }) as unknown as Promise<Ticket[]>;
  }

  /**
   * Listado CRM de tickets (entidades ticket reales, no conversaciones).
   * Paginación por cursor (id) y filtros por estado, prioridad, departamento,
   * agente y búsqueda por folio/nombre/teléfono del ciudadano.
   *
   * @deprecated Este cursor es inestable porque el orden usa `updatedAt`
   * (columna mutable). Usar {@link listTicketsPage}.
   */
  async listTickets(
    filters: ListTicketFilters,
  ): Promise<{ rows: TicketWithRelations[]; hasNextPage: boolean }> {
    const rows = (await this.prisma.ticket.findMany({
      where: buildTicketListWhere(filters),
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      include: TICKET_RELATIONS_INCLUDE,
    })) as unknown as TicketWithRelations[];

    const hasNextPage = rows.length > filters.limit;
    return { rows: hasNextPage ? rows.slice(0, filters.limit) : rows, hasNextPage };
  }

  /**
   * Listado CRM paginado por OFFSET con total de filas.
   *
   * Ejecuta `findMany` y `count` en paralelo. Preferimos dos consultas antes
   * que `COUNT(*) OVER()` porque una página fuera de rango devolvería cero
   * filas y perderíamos el total, imposibilitando clampear la UI.
   *
   * `count` puede resolverse con un index-only scan cuando los índices
   * compuestos (status, updated_at, id) están presentes.
   *
   * @param knownTotal total ya calculado (caché). Cuando se provee, se omite
   * el `COUNT(*)`, que es la parte cara de la paginación.
   */
  async listTicketsPage(
    filters: PageTicketFilters,
    knownTotal?: number,
  ): Promise<{ rows: TicketWithRelations[]; totalItems: number }> {
    const where = buildTicketListWhere(filters);
    const skip = (filters.page - 1) * filters.limit;

    const [rows, totalItems] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: buildTicketOrderBy(filters.sortBy, filters.sort),
        skip,
        take: filters.limit,
        include: TICKET_RELATIONS_INCLUDE,
      }) as unknown as Promise<TicketWithRelations[]>,
      knownTotal !== undefined ? Promise.resolve(knownTotal) : this.countTickets(where),
    ]);

    return { rows, totalItems };
  }

  /** Total de tickets que matchean el WHERE del listado. */
  countTickets(where: Prisma.TicketWhereInput): Promise<number> {
    return this.prisma.ticket.count({ where });
  }

  /** Detalle de un ticket con ciudadano y conversación resueltos. */
  async findTicketWithRelations(ticketId: string): Promise<TicketWithRelations | null> {
    return (await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: TICKET_RELATIONS_INCLUDE,
    })) as unknown as TicketWithRelations | null;
  }
}
