import { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { MessageRepository, serializeMessageForJson } from '../repositories/message.repository';
import type { TicketWithRelations } from '../repositories/ticket.repository';
import { TicketService } from '../services/tickets/ticket.service';
import { withSignedMediaUrls } from '../services/media/message-media-urls.service';
import { TicketPriority, TicketStatus } from '../services/tickets/ticket.types';

const ConversationIdParam = z.object({ id: z.string().uuid() });
const TicketIdParam = z.object({ ticketId: z.string().uuid() });

function blankToUndefined(value: unknown) {
  if (value === '' || value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return blankToUndefined(value[0]);
  return value;
}

const optionalUuid = z.preprocess(blankToUndefined, z.string().uuid().optional());
const optionalText = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional());

const ListQuery = z.object({
  // Paginación offset (contrato actual del dashboard admin).
  page: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(500).optional()),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(50).optional()),
  sortBy: z.preprocess(blankToUndefined, z.enum(['updatedAt', 'createdAt', 'priority']).optional()),
  sort: z.preprocess(blankToUndefined, z.enum(['asc', 'desc']).optional()),
  // Deprecado: se acepta y se ignora para no romper clientes viejos.
  cursor: optionalUuid,
  citizenId: optionalUuid,
  status: z.preprocess(blankToUndefined, z.nativeEnum(TicketStatus).optional()),
  priority: z.preprocess(blankToUndefined, z.nativeEnum(TicketPriority).optional()),
  departmentSlug: optionalText(100),
  dept: optionalText(100),
  assignedUserId: optionalUuid,
  agent: optionalUuid,
  search: optionalText(255),
  q: optionalText(255),
});

function ticketToJson(row: TicketWithRelations) {
  return {
    id: row.id,
    folio: row.folio,
    conversationId: row.conversationId,
    citizenId: row.citizenId,
    citizenName: row.citizen?.name ?? row.conversation?.citizen?.name ?? null,
    citizenPhone: row.citizen?.phone ?? row.conversation?.citizen?.phone ?? null,
    channel: row.conversation?.channel ?? 'whatsapp',
    flowState: flowState(row),
    conversationStatus: row.conversation?.status ?? 'open',
    status: row.status,
    priority: row.priority,
    source: row.source,
    departmentSlug: row.departmentSlug ?? null,
    assignedUserId: row.assignedUserId ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    closeReason: row.closeReason ?? null,
    closeSummary: row.closeSummary ?? null,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function flowState(row: TicketWithRelations): string {
  return row.conversation?.meta?.flowState ?? 'BOT_FLOW';
}

/**
 * TicketsController — endpoints de lectura del módulo de casos (tickets).
 * GET /tickets                     → listado paginado de tickets (CRM)
 * GET /conversations/:id/tickets   → tickets de una conversación
 * GET /tickets/:ticketId           → detalle de un ticket (con folio + conversación)
 * GET /tickets/:ticketId/messages  → mensajes aislados a un ticket
 */
export class TicketsController {
  constructor(
    private readonly ticketService: TicketService,
    private readonly messageRepo: MessageRepository,
  ) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ListQuery.parse(req.query);

      const result = await this.ticketService.listTicketsPage({
        page: query.page ?? 1,
        limit: query.limit ?? 25,
        sortBy: query.sortBy ?? 'updatedAt',
        sort: query.sort ?? 'desc',
        ...(query.citizenId ? { citizenId: query.citizenId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.priority ? { priority: query.priority } : {}),
        ...((query.departmentSlug ?? query.dept)
          ? { departmentSlug: query.departmentSlug ?? query.dept }
          : {}),
        ...((query.assignedUserId ?? query.agent)
          ? { assignedUserId: query.assignedUserId ?? query.agent }
          : {}),
        ...((query.search ?? query.q) ? { search: query.search ?? query.q } : {}),
      });

      const data = result.rows.map(ticketToJson);

      res.json({
        data,
        pagination: {
          totalItems: result.totalItems,
          totalPages: result.totalPages,
          currentPage: result.currentPage,
          itemsPerPage: result.itemsPerPage,
          hasNextPage: result.hasNextPage,
          hasPrevPage: result.hasPrevPage,
        },
        // TODO(pagination-v2): eliminar aliases `items`/`meta` cuando todos los
        // clientes lean `data`/`pagination`. Se mantienen un release para que
        // el frontend viejo siga funcionando si el backend se despliega antes.
        items: data,
        meta: { hasNextPage: result.hasNextPage },
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  listByConversation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = ConversationIdParam.parse(req.params);
      const items = await this.ticketService.listByConversation(id);
      res.json({ items });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  getTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticketId } = TicketIdParam.parse(req.params);
      const ticket = await this.ticketService.getTicketDetail(ticketId);
      if (!ticket) {
        res.status(404).json({ error: 'Ticket no encontrado' });
        return;
      }

      const conversation = ticket.conversation
        ? {
            id: ticket.conversation.id,
            citizenId: ticket.conversation.citizenId,
            status: ticket.conversation.status,
            channel: ticket.conversation.channel,
            assignedDept: ticket.conversation.assignedDept,
            assignedUserId: ticket.conversation.assignedUserId,
            createdAt: ticket.conversation.createdAt.toISOString(),
            updatedAt: ticket.conversation.updatedAt.toISOString(),
            meta: {
              id: `${ticket.conversation.id}-meta`,
              conversationId: ticket.conversation.id,
              flowState: flowState(ticket),
              departmentSlug: ticket.conversation.meta?.departmentSlug ?? null,
              version: 0,
              createdAt: ticket.conversation.createdAt.toISOString(),
              updatedAt: ticket.conversation.updatedAt.toISOString(),
            },
            citizen: ticket.conversation.citizen,
          }
        : null;

      res.json({ ticket: { ...ticketToJson(ticket), conversation } });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };

  getTicketMessages = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const { ticketId } = TicketIdParam.parse(req.params);
      const { cursor, limit } = req.pagination;
      const { items, hasNextPage } = await this.messageRepo.listByTicket({
        ticketId,
        cursor,
        limit,
      });
      const nextCursor = hasNextPage && items.length > 0 ? items[0].id : undefined;
      const signedItems = await withSignedMediaUrls(items);
      res.json({
        items: signedItems.map(serializeMessageForJson),
        meta: { nextCursor, hasNextPage },
      });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: 'Datos inválidos', details: err.issues });
        return;
      }
      next(err);
    }
  };
}
