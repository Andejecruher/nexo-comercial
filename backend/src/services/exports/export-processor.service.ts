import type { ExportJob } from '@prisma/client';
import { PassThrough } from 'node:stream';
import { env } from '../../config/env.config';
import { GoogleDriveFileStorageProvider } from '../ine/google-drive-file-storage.provider';
import { GCSFileStorageProvider } from '../ine/gcs-file-storage.provider';
import type { PrismaService } from '../prisma.service';
import { createStructuredLogger } from '../../utils/structured-logger';
import { EXPORT_RECONCILE_BATCH_SIZE, ExportJobService } from './export-job.service';
import { XlsxExportWriter } from './xlsx-export.writer';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const log = createStructuredLogger('ExportProcessorService');

export class ExportProcessorService {
  private readonly jobs: ExportJobService;
  private readonly writer: XlsxExportWriter;
  private readonly storage: GCSFileStorageProvider;

  constructor(prisma: PrismaService, storage = new GCSFileStorageProvider()) {
    this.jobs = new ExportJobService(prisma);
    this.writer = new XlsxExportWriter(prisma);
    this.storage = storage;
  }

  startWorker(): () => void {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await this.processBatch();
      } catch (error) {
        log('error', 'export.poll_failed', undefined, {
          errorType: error instanceof Error ? error.name : 'UnknownError',
        });
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, env.EXPORT_JOB_POLL_INTERVAL_MS);
    void tick();
    return () => clearInterval(timer);
  }

  async processBatch(): Promise<void> {
    const id = await this.jobs.findNextQueuedId();
    if (!id) return;
    await this.processJobById(id);
  }

  async processJobById(id: string): Promise<'processed' | 'noop' | 'not_found'> {
    const job = await this.jobs.getById(id);
    if (!job) return 'not_found';
    if (!(await this.jobs.claim(id))) return 'noop';
    try {
      await this.process(job);
      return 'processed';
    } catch (error) {
      await this.jobs.markFailed(id, errorCode(error), `export processing: ${errorMessage(error)}`);
      throw error;
    }
  }

  async reconcile(batchSize = EXPORT_RECONCILE_BATCH_SIZE): Promise<number> {
    return this.jobs.reconcile(
      (id) => new GoogleDriveFileStorageProvider().delete(id),
      new Date(),
      (path) => this.storage.delete(path),
      batchSize,
    );
  }

  private async process(job: ExportJob): Promise<void> {
    const filename = `${job.module}-${timestamp(job.requestedAt)}-${job.id.slice(0, 8)}.xlsx`;
    const path = `exports/${job.module}/${filename}`;
    const output = new PassThrough({ highWaterMark: env.EXPORT_STREAM_HIGH_WATER_MARK });
    const upload = this.storage.uploadStream({
      path,
      mimeType: XLSX_MIME,
      readable: output,
    });
    let uploaded = false;
    const trackedUpload = upload.then((stored) => {
      uploaded = true;
      return stored;
    });
    try {
      const [rowCount, stored] = await Promise.all([this.writer.write(job, output), trackedUpload]);
      await this.jobs.markReady({
        id: job.id,
        filePath: stored.path,
        driveFilename: filename,
        rowCount,
      });
    } catch (error) {
      output.destroy();
      await trackedUpload.catch(() => undefined);
      if (uploaded)
        await this.storage.delete(path).catch(() => {
          log('warn', 'export.cleanup_failed', job.id);
        });
      throw error;
    }
  }
}

function timestamp(value: Date): string {
  const iso = value.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'EXPORT_PROCESSING_FAILED';
}
