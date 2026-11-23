import { MessageType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ConversationsService } from '../conversations.service';
import { MessageService } from '../message.service';
import { TicketService } from '../tickets/ticket.service';
import { AuthorizationService } from '../authorization.service';
import { AppError } from '../../utils/app-error';
import { createStructuredLogger } from '../../utils/structured-logger';
import { BulkActionSchema, BULK_PERMISSIONS, type BulkAction } from './bulk-action.schema';

const log = createStructuredLogger('bulk-worker');
export const BULK_CHUNK_SIZE = 10;
export const BULK_CRON_CHUNK_SIZE = 100;
export const BULK_INTERVAL_MS = 1000;

/** No automatic replay of uncertain side effects after process loss. MessageService
 * also receives a stable per-item idempotency key and dispatches via its existing outbox. */
export class BulkActionWorker {
  private stopped = false;
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: Pick<ConversationsService, 'transfer'>,
    private readonly messages: Pick<MessageService, 'sendMessage'>,
    private readonly tickets: Pick<TicketService, 'getActiveTicketByConversation' | 'closeTicket'>,
  ) {}

  async execute(
    payload: BulkAction,
    conversationId: string,
    actorId: string,
    itemId: string,
  ): Promise<void> {
    switch (payload.action) {
      case 'send_message':
        if (!(await this.tickets.getActiveTicketByConversation(conversationId))) {
          throw AppError.conflict('Conversación inactiva; no se envió el mensaje');
        }
        await this.messages.sendMessage({
          conversationId,
          senderId: actorId,
          body: payload.message,
          messageType: MessageType.text,
          idempotencyKey: `bulk-${itemId}`,
        });
        break;
      case 'activate_bot':
        await this.conversations.transfer(conversationId, { type: 'ai' }, { performedBy: actorId });
        break;
      case 'deactivate_bot':
        await this.conversations.transfer(conversationId, payload.target, { performedBy: actorId });
        break;
      case 'close_tickets': {
        const ticket = await this.tickets.getActiveTicketByConversation(conversationId);
        if (ticket) await this.tickets.closeTicket(ticket.id, { reason: 'user_request' });
        break;
      }
    }
  }

  async tick(chunkSize = BULK_CHUNK_SIZE): Promise<void> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      // Serialize claims across worker replicas. Never hold this lock during domain actions.
      const [lock] = await tx.$queryRaw<
        { acquired: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(74623981) AS acquired`;
      if (!lock?.acquired) return [];
      await tx.conversationBulkItem.updateMany({
        where: { status: 'running', claimedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
        data: {
          status: 'uncertain',
          error: 'Ejecución interrumpida: verificar el resultado antes de repetir',
        },
      });
      if (await tx.conversationBulkItem.count({ where: { status: 'running' } })) return [];
      // A global cooldown also bounds throughput when several worker replicas poll.
      const latest = await tx.conversationBulkItem.findFirst({
        where: { claimedAt: { not: null } },
        orderBy: { claimedAt: 'desc' },
      });
      if (latest?.claimedAt && Date.now() - latest.claimedAt.getTime() < BULK_INTERVAL_MS)
        return [];
      const items = await tx.conversationBulkItem.findMany({
        where: { status: 'pending' },
        orderBy: [{ job: { createdAt: 'asc' } }, { id: 'asc' }],
        take: chunkSize,
        include: { job: true },
      });
      await tx.conversationBulkItem.updateMany({
        where: { id: { in: items.map((item) => item.id) } },
        data: { status: 'running', claimedAt: new Date() },
      });
      return items;
    });
    for (const item of claimed) {
      // Refresh the entire batch lease while progressing through slow domain services.
      await this.prisma.conversationBulkItem.updateMany({
        where: { id: { in: claimed.map((entry) => entry.id) }, status: 'running' },
        data: { claimedAt: new Date() },
      });
      const current = await this.prisma.conversationBulkItem.findUnique({ where: { id: item.id } });
      if (current?.status !== 'running') continue;
      try {
        const permissions = await new AuthorizationService(this.prisma).getUserPermissionSlugs(
          item.job.actorId,
        );
        if (!BULK_PERMISSIONS.every((permission) => permissions.includes(permission)))
          throw AppError.forbidden('Permisos revocados');
        await this.execute(
          BulkActionSchema.parse(item.job.payload),
          item.conversationId,
          item.job.actorId,
          item.id,
        );
        await this.prisma.conversationBulkItem.update({
          where: { id: item.id },
          data: { status: 'succeeded', error: null },
        });
      } catch (error) {
        await this.prisma.conversationBulkItem.update({
          where: { id: item.id },
          data: {
            status: error instanceof AppError && error.statusCode < 500 ? 'failed' : 'uncertain',
            error:
              error instanceof AppError
                ? error.message
                : 'No se pudo confirmar el resultado; revisar antes de repetir',
          },
        });
      }
    }
  }

  start(): void {
    const run = (): void => {
      if (this.stopped) return;
      this.inFlight = this.tick()
        .catch((error: unknown) => {
          log('error', 'bulk.tick_failed', undefined, {
            errorType: error instanceof Error ? error.name : 'UnknownError',
          });
        })
        .finally(() => {
          if (!this.stopped) this.timer = setTimeout(run, BULK_INTERVAL_MS);
        });
    };
    run();
  }
  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
  }
}
