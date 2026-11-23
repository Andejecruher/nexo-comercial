import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AppError } from '../../utils/app-error';
import { PrismaService } from '../prisma.service';
import { BulkAction } from './bulk-action.schema';

export class BulkActionQueue {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    actorId: string,
    requestKey: string,
    payload: BulkAction,
  ): Promise<{ job_id: string; total: number }> {
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const job = await this.prisma.conversationBulkJob
      .upsert({
        where: { actorId_requestKey: { actorId, requestKey } },
        update: {},
        create: {
          actorId,
          requestKey,
          payloadHash,
          payload,
          items: { create: payload.conversation_ids.map((conversationId) => ({ conversationId })) },
        },
        select: { id: true, payloadHash: true },
      })
      .catch((error: unknown) => {
        // Nested Prisma upserts can race on creation. Reuse the committed winner.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
          throw error;
        return this.prisma.conversationBulkJob.findUniqueOrThrow({
          where: { actorId_requestKey: { actorId, requestKey } },
          select: { id: true, payloadHash: true },
        });
      });
    if (job.payloadHash !== payloadHash)
      throw AppError.conflict('La clave de solicitud ya se usó para otra acción');
    return { job_id: job.id, total: payload.conversation_ids.length };
  }

  async status(
    actorId: string,
    id: string,
  ): Promise<{
    job_id: string;
    done: boolean;
    items: { conversationId: string; status: string; error: string | null }[];
  }> {
    const job = await this.prisma.conversationBulkJob.findFirst({
      where: { id, actorId },
      select: { id: true, items: { select: { conversationId: true, status: true, error: true } } },
    });
    if (!job) throw AppError.notFound('Trabajo no encontrado');
    return {
      job_id: job.id,
      items: job.items,
      done: job.items.every((item) => !['pending', 'running'].includes(item.status)),
    };
  }
}
