import type { ExportJob } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { resolveExportModule } from '../services/exports/module-export-config';
import { ExportJobService } from '../services/exports/export-job.service';
import type { GoogleDriveFileStorageProvider } from '../services/ine/google-drive-file-storage.provider';
import { GCSFileStorageProvider } from '../services/ine/gcs-file-storage.provider';
import type { PrismaService } from '../services/prisma.service';
import type { BackgroundTaskDispatcher } from '../services/tasks/cloud-tasks-dispatcher.service';
import type { ScopeContext } from '../types/auth.types';
import { env } from '../config/env.config';
import { createStructuredLogger } from '../utils/structured-logger';

const log = createStructuredLogger('ExportController');

const paginationKeys = new Set(['take', 'skip', 'limit', 'cursor', 'page', 'pageSize', 'offset']);
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ExportController {
  private readonly jobs: ExportJobService;

  constructor(
    prisma: PrismaService,
    private readonly drive: GoogleDriveFileStorageProvider,
    private readonly dispatcher?: BackgroundTaskDispatcher,
    private readonly storage = new GCSFileStorageProvider(),
  ) {
    this.jobs = new ExportJobService(prisma);
    this.prisma = prisma;
  }

  private readonly prisma: PrismaService;

  featureFlag = (_req: Request, res: Response): void => {
    res.json({ enabled: env.ENABLE_XLSX_EXPORT });
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      if (!req.user || !req.scope) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }
      const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit);
      const jobs = await this.prisma.exportJob.findMany({
        where: { requestedByUserId: req.user.id },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: limit,
      });
      const allowed = jobs.map((job) => (scopeAllows(req.scope!, toScope(job)) ? job : null));
      res.json({
        items: await this.signedViews(allowed.filter((job): job is ExportJob => job !== null)),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: 'Invalid export query' });
        return;
      }
      next(error);
    }
  };

  private async signedViews(jobs: ExportJob[]) {
    return Promise.all(
      jobs.map(async (job) => {
        let cdnUrl: string | null = null;
        try {
          if (job.status === 'ready' && job.expiresAt > new Date() && job.filePath)
            cdnUrl = await this.storage.getSignedUrl(job.filePath, 2 * 60 * 60 * 1000);
        } catch {
          log('warn', 'export.signing_failed', job.id);
        }
        return { ...exportView(job), cdn_url: cdnUrl };
      }),
    );
  }

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!env.ENABLE_XLSX_EXPORT) {
        res.status(503).json({ message: 'XLSX exports are disabled' });
        return;
      }
      const config = resolveExportModule(req.params.module);
      const body = req.body ?? {};
      const pagination = Object.keys(body).find((key) => paginationKeys.has(key));
      if (pagination) {
        res
          .status(400)
          .json({ message: `Pagination field '${pagination}' is not supported for exports` });
        return;
      }
      const filters = config.filterSchema.parse(body);
      if (!req.user || !req.scope) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }
      const job = await this.jobs.createJob({
        module: config.module,
        filters,
        scopeSnapshot: req.scope,
        requestedByUserId: req.user.id,
      });
      if (this.dispatcher) {
        try {
          await this.dispatcher.dispatchExportJob(job.id);
        } catch (error) {
          log('warn', 'export.task_dispatch_failed', job.id, {
            errorType: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }
      res.status(202).json({ jobId: job.id, status: job.status });
    } catch (error) {
      if (
        error instanceof z.ZodError ||
        (error instanceof Error && error.message === 'Unsupported export module')
      ) {
        res.status(400).json({
          message: error instanceof z.ZodError ? 'Invalid export filters' : error.message,
        });
        return;
      }
      next(error);
    }
  };

  status = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const job = await this.jobs.getById(req.params.id);
      if (!job || !req.scope || !scopeAllows(req.scope, toScope(job))) {
        res.status(404).json({ message: 'Export not found' });
        return;
      }
      const [view] = await this.signedViews([job]);
      res.json(view);
    } catch (error) {
      next(error);
    }
  };

  issueDownloadToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await this.jobs.getById(req.params.id);
      if (!job || !req.scope || !scopeAllows(req.scope, toScope(job))) {
        res.status(404).json({ message: 'Export not found' });
        return;
      }
      if (job.expiresAt < new Date() || job.status === 'expired' || job.status === 'failed') {
        res.status(410).json({ message: 'Export is no longer available' });
        return;
      }
      if (job.status !== 'ready') {
        res.status(409).json({ message: 'Export is not ready yet' });
        return;
      }
      const issued = await this.jobs.issueDownloadToken(job.id);
      if (!issued) {
        res.status(409).json({ message: 'Export is not ready yet' });
        return;
      }
      res.json({
        token: issued.token,
        expiresAt: issued.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  };

  download = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token =
        typeof req.query.token === 'string' && req.query.token.length > 0
          ? req.query.token
          : undefined;
      const job = await this.jobs.getById(req.params.id);
      if (!job) {
        res.status(404).json({ message: 'Export not found' });
        return;
      }
      if (job.expiresAt < new Date() || job.status === 'expired' || job.status === 'failed') {
        res.status(410).json({ message: 'Export is no longer available' });
        return;
      }
      if (job.status === 'queued' || job.status === 'processing') {
        res.status(409).json({ message: 'Export is not ready yet' });
        return;
      }
      if (!token || !(await this.jobs.consumeDownloadToken(job.id, token))) {
        res.status(404).json({ message: 'Export not found' });
        return;
      }
      if ((!job.filePath && !job.driveFileId) || !job.driveFilename) {
        res.status(410).json({ message: 'Export is no longer available' });
        return;
      }
      try {
        if (job.filePath) {
          const url = await this.storage.getSignedUrl(job.filePath, 2 * 60 * 60 * 1000);
          res.setHeader('Cache-Control', 'private, no-store');
          res.redirect(307, url);
          return;
        }
        const file = await this.drive.getStream(job.driveFileId!);
        res.setHeader('Content-Type', xlsxMime);
        res.setHeader('Content-Disposition', `attachment; filename="${job.driveFilename}"`);
        res.setHeader('Cache-Control', 'no-store');
        if (file.contentLength) res.setHeader('Content-Length', file.contentLength);
        file.stream.on('error', () => res.destroy());
        file.stream.pipe(res);
      } catch {
        res.status(502).json({ message: 'Export file is unavailable' });
      }
    } catch (error) {
      next(error);
    }
  };
}

export function scopeAllows(
  session: ScopeContext,
  _snapshot: ScopeContext,
): boolean {
  return session.kind === 'admin';
}

function toScope(job: ExportJob): ScopeContext {
  return job.scopeSnapshot as unknown as ScopeContext;
}
function exportView(job: ExportJob) {
  return {
    id: job.id,
    module: job.module,
    status: job.status,
    rowCount: job.rowCount,
    errorCode: job.errorCode,
    expiresAt: job.expiresAt,
  };
}
