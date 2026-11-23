import type { Notification } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import type { PrismaService } from '../services/prisma.service';
import { sendOk } from '../utils/api-response';

const listQuerySchema = z
  .object({
    /** ISO datetime — solo notificaciones con occurredAt posterior */
    since: z.string().datetime().optional(),
    replay: z.literal('1').optional(),
    cursor: z.string().max(1024).optional(),
    after: z.string().max(1024).optional(),
    until: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export interface NotificationApi {
  id: string;
  eventId: string;
  ticketId?: string;
  createdAt: string;
  type: string;
  conversationId: string | null;
  occurredAt: string;
  contactName?: string;
  phone?: string;
  messagePreview?: string;
  flowState?: string;
  channel?: string;
  priority?: string;
  departmentSlug?: string;
  communicationLineId?: string;
  assignedUserId?: string;
}

function toApi(row: Notification): NotificationApi {
  return {
    id: row.id,
    eventId: row.eventId,
    createdAt: row.createdAt.toISOString(),
    ...(row.ticketId ? { ticketId: row.ticketId } : {}),
    type: row.type,
    conversationId: row.conversationId,
    occurredAt: row.occurredAt.toISOString(),
    ...(row.contactName !== null ? { contactName: row.contactName } : {}),
    ...(row.phone !== null ? { phone: row.phone } : {}),
    ...(row.messagePreview !== null ? { messagePreview: row.messagePreview } : {}),
    ...(row.flowState !== null ? { flowState: row.flowState } : {}),
    ...(row.communicationLineId ? { communicationLineId: row.communicationLineId } : {}),
    ...(row.channel !== null ? { channel: row.channel } : {}),
    ...(row.priority !== null ? { priority: row.priority } : {}),
    ...(row.departmentSlug !== null ? { departmentSlug: row.departmentSlug } : {}),
    ...(row.assignedUserId !== null ? { assignedUserId: row.assignedUserId } : {}),
  };
}

/**
 * Catch-up del centro de notificaciones. El cliente llama
 * `GET /admin/notifications?replay=1&cursor=<checkpoint>` al reconectar.
 * El parámetro `since` se conserva para clientes anteriores.
 */
const cursorSchema = z.object({ at: z.string().datetime(), id: z.string().uuid() });
function decodeCursor(cursor: string) {
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown,
    );
  } catch {
    throw new z.ZodError([{ code: 'custom', path: ['cursor'], message: 'Invalid replay cursor' }]);
  }
}
function encodeCursor(at: Date, id: string) {
  return Buffer.from(JSON.stringify({ at: at.toISOString(), id })).toString('base64url');
}

export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { since, limit, replay, cursor, after, until } = listQuerySchema.parse(req.query);
      if (!replay) {
        const rows = await this.prisma.notification.findMany({
          ...(since ? { where: { occurredAt: { gt: new Date(since) } } } : {}),
          orderBy: { occurredAt: 'desc' },
          take: limit,
        });
        sendOk(res, { notifications: rows.map(toApi) });
        return;
      }
      // Fixed upper bound plus a 60s overlap covers commits delayed by our 15s TX limit.
      // Live receipts never advance this cursor. Pagination uses an exact keyset.
      const upper = until
        ? new Date(until)
        : (await this.prisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`)[0].now;
      const checkpoint = encodeCursor(upper, '00000000-0000-0000-0000-000000000000');
      if (!cursor && !after) {
        const seed = await this.prisma.notification.findMany({
          where: { createdAt: { lte: upper } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
        });
        sendOk(res, {
          notifications: seed.map(toApi),
          checkpoint,
          hasMore: false,
          until: upper.toISOString(),
        });
        return;
      }
      const lower = decodeCursor(after ?? cursor!);
      const rows = await this.prisma.notification.findMany({
        where: {
          AND: [
            { createdAt: { lte: upper } },
            after
              ? {
                  OR: [
                    { createdAt: { gt: new Date(lower.at) } },
                    { createdAt: new Date(lower.at), id: { gt: lower.id } },
                  ],
                }
              : { createdAt: { gte: new Date(Date.parse(lower.at) - 60_000) } },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      sendOk(res, {
        notifications: page.map(toApi),
        hasMore: rows.length > limit,
        nextCursor: last ? encodeCursor(last.createdAt, last.id) : undefined,
        checkpoint,
        until: upper.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}
