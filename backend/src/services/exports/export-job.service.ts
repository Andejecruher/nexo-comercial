import { createHash, randomBytes } from 'node:crypto';
import type { ExportJob, ExportModule, Prisma } from '@prisma/client';
import { env } from '../../config/env.config';
import type { ScopeContext } from '../../types/auth.types';
import type { PrismaService } from '../prisma.service';
import { assertObjectPath } from '../storage/object-path';

export const EXPORT_JOB_TTL_MS = (): number => env.EXPORT_JOB_TTL_MS;
export const EXPORT_RECONCILE_BATCH_SIZE = 100;
const DOWNLOAD_TOKEN_TTL_MS = (): number => env.EXPORT_DOWNLOAD_TOKEN_TTL_MS;

export class ExportJobService {
  constructor(private readonly prisma: PrismaService) {}

  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createJob(input: {
    module: ExportModule;
    filters: Record<string, unknown>;
    scopeSnapshot: ScopeContext;
    requestedByUserId: string;
  }): Promise<ExportJob> {
    return this.prisma.exportJob.create({
      data: {
        module: input.module,
        filtersJson: input.filters as Prisma.InputJsonValue,
        scopeSnapshot: input.scopeSnapshot as Prisma.InputJsonValue,
        requestedByUserId: input.requestedByUserId,
        expiresAt: new Date(Date.now() + EXPORT_JOB_TTL_MS()),
      },
    });
  }

  async getById(id: string): Promise<ExportJob | null> {
    return this.prisma.exportJob.findUnique({ where: { id } });
  }

  async findNextQueuedId(): Promise<string | undefined> {
    const row = await this.prisma.exportJob.findFirst({
      where: { status: 'queued' },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return row?.id;
  }

  async claim(id: string): Promise<boolean> {
    const result = await this.prisma.exportJob.updateMany({
      where: { id, status: 'queued' },
      data: { status: 'processing' },
    });
    return result.count === 1;
  }

  async markReady(input: {
    id: string;
    filePath?: string;
    driveFileId?: string;
    driveFolderId?: string;
    driveFilename: string;
    rowCount: number;
  }): Promise<void> {
    if (input.filePath) {
      assertObjectPath(input.filePath);
      if (!/^exports\/[^/]+\/[^/]+$/.test(input.filePath))
        throw new Error('GCS_OBJECT_NAME_INVALID');
    }
    await this.prisma.exportJob.update({
      where: { id: input.id },
      data: { status: 'ready', ...input, completedAt: new Date() },
    });
  }

  async markFailed(id: string, errorCode: string, lastError: string): Promise<void> {
    await this.prisma.exportJob.update({
      where: { id },
      data: {
        status: 'failed',
        errorCode,
        lastError: lastError.slice(0, 4_000),
        completedAt: new Date(),
      },
    });
  }

  async listExpired(now = new Date(), limit = EXPORT_RECONCILE_BATCH_SIZE): Promise<ExportJob[]> {
    return this.prisma.exportJob.findMany({
      where: {
        OR: [
          { expiresAt: { lt: now }, status: { in: ['ready', 'failed', 'processing'] } },
          {
            status: 'processing',
            updatedAt: { lt: new Date(now.getTime() - env.EXPORT_WATCHDOG_TIMEOUT_MS) },
          },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
  }

  async purge(id: string): Promise<void> {
    await this.prisma.exportJob.delete({ where: { id } });
  }

  async issueDownloadToken(
    id: string,
    now = new Date(),
  ): Promise<{ token: string; expiresAt: Date } | null> {
    const job = await this.prisma.exportJob.findUnique({ where: { id } });
    if (!job || job.status !== 'ready') return null;
    const token = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(now.getTime() + DOWNLOAD_TOKEN_TTL_MS());
    const expiresAt = tokenExpiresAt < job.expiresAt ? tokenExpiresAt : job.expiresAt;
    await this.prisma.exportJob.update({
      where: { id },
      data: {
        downloadTokenHash: ExportJobService.hashToken(token),
        downloadTokenExpiresAt: expiresAt,
        downloadTokenConsumedAt: null,
      },
    });
    return { token, expiresAt };
  }

  async consumeDownloadToken(id: string, token: string, now = new Date()): Promise<boolean> {
    const result = await this.prisma.exportJob.updateMany({
      where: {
        id,
        downloadTokenHash: ExportJobService.hashToken(token),
        downloadTokenConsumedAt: null,
        downloadTokenExpiresAt: { gt: now },
      },
      data: { downloadTokenConsumedAt: now },
    });
    return result.count === 1;
  }

  async reconcile(
    deleteDriveFile: (id: string) => Promise<void>,
    now = new Date(),
    deleteGcsFile?: (path: string) => Promise<void>,
    batchSize = EXPORT_RECONCILE_BATCH_SIZE,
  ): Promise<number> {
    const jobs = await this.listExpired(now, batchSize);
    for (const job of jobs) {
      const expired = job.expiresAt < now;
      const timedOut =
        job.status === 'processing' &&
        now.getTime() - job.updatedAt.getTime() >= env.EXPORT_WATCHDOG_TIMEOUT_MS;
      if (timedOut && !expired) {
        await this.markFailed(
          job.id,
          'WORKER_TIMEOUT',
          'export processing exceeded its watchdog timeout',
        );
        continue;
      }
      if (job.filePath) {
        if (!deleteGcsFile) throw new Error('GCS_DELETE_HANDLER_MISSING');
        await deleteGcsFile(job.filePath);
      } else if (job.driveFileId) await deleteDriveFile(job.driveFileId);
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: job.status === 'processing' ? 'failed' : 'expired',
          errorCode: job.status === 'processing' ? 'WORKER_TIMEOUT' : undefined,
          completedAt: new Date(),
        },
      });
      await this.purge(job.id);
    }
    return jobs.length;
  }
}
