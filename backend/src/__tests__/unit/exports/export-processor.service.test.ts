import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { env } from '../../../config/env.config';
import { ExportJobService } from '../../../services/exports/export-job.service';
import { ExportProcessorService } from '../../../services/exports/export-processor.service';
import { XlsxExportWriter } from '../../../services/exports/xlsx-export.writer';
import { GCSFileStorageProvider } from '../../../services/ine/gcs-file-storage.provider';

const requestedAt = new Date('2026-09-07T10:00:00Z');

function job(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'job-1',
    module: 'citizens',
    filtersJson: { search: 'ana' },
    scopeSnapshot: { kind: 'admin' },
    status: 'queued',
    requestedByUserId: 'user-1',
    requestedAt,
    expiresAt: new Date(Date.now() + 3_600_000),
    createdAt: requestedAt,
    updatedAt: requestedAt,
    driveFileId: null,
    driveFolderId: null,
    driveFilename: null,
    rowCount: null,
    errorCode: null,
    lastError: null,
    completedAt: null,
    ...overrides,
  };
}

describe('ExportProcessorService', () => {
  beforeEach(() => {
    jest
      .spyOn(GCSFileStorageProvider.prototype, 'uploadStream')
      .mockImplementation(async (input) => ({
        provider: 'google_cloud_storage',
        objectId: input.path,
        path: input.path,
        folderId: 'exports/citizens',
      }));
    jest.spyOn(GCSFileStorageProvider.prototype, 'delete').mockResolvedValue(undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('moves a queued job to ready with a relative GCS path and row count', async () => {
    jest.spyOn(ExportJobService.prototype, 'getById').mockResolvedValue(job() as never);
    const claim = jest.spyOn(ExportJobService.prototype, 'claim').mockResolvedValue(true);
    const markReady = jest
      .spyOn(ExportJobService.prototype, 'markReady')
      .mockResolvedValue(undefined as never);
    const markFailed = jest
      .spyOn(ExportJobService.prototype, 'markFailed')
      .mockResolvedValue(undefined as never);
    const uploadStream = jest
      .spyOn(GCSFileStorageProvider.prototype, 'uploadStream')
      .mockResolvedValue({
        objectId: 'drive-file-1',
        folderId: 'folder-citizens',
        path: 'exports/citizens/citizens-2026-09-07-1000-job-1.xlsx',
      } as never);
    jest.spyOn(XlsxExportWriter.prototype, 'write').mockResolvedValue(3_500);

    const processor = new ExportProcessorService({} as never);
    await expect(processor.processJobById('job-1')).resolves.toBe('processed');

    expect(claim).toHaveBeenCalledWith('job-1');
    expect(claim.mock.invocationCallOrder[0]).toBeLessThan(markReady.mock.invocationCallOrder[0]);
    expect(uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'exports/citizens/citizens-2026-09-07-1000-job-1.xlsx',
      }),
    );
    expect(markReady).toHaveBeenCalledWith({
      id: 'job-1',
      filePath: 'exports/citizens/citizens-2026-09-07-1000-job-1.xlsx',
      driveFilename: 'citizens-2026-09-07-1000-job-1.xlsx',
      rowCount: 3_500,
    });
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('records a stable errorCode and lastsError when the writer throws before upload', async () => {
    jest.spyOn(ExportJobService.prototype, 'getById').mockResolvedValue(job() as never);
    jest.spyOn(ExportJobService.prototype, 'claim').mockResolvedValue(true);
    const markReady = jest.spyOn(ExportJobService.prototype, 'markReady');
    const markFailed = jest
      .spyOn(ExportJobService.prototype, 'markFailed')
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(XlsxExportWriter.prototype, 'write')
      .mockRejectedValue(Object.assign(new Error('stream broke'), { code: 'DRIVE_QUOTA' }));

    const processor = new ExportProcessorService({} as never);
    await expect(processor.processJobById('job-1')).rejects.toThrow('stream broke');

    expect(markFailed).toHaveBeenCalledWith(
      'job-1',
      'DRIVE_QUOTA',
      expect.stringContaining('export processing: stream broke'),
    );
    expect(markReady).not.toHaveBeenCalled();
  });

  it('falls back to EXPORT_PROCESSING_FAILED when the failure carries no code', async () => {
    jest.spyOn(ExportJobService.prototype, 'getById').mockResolvedValue(job() as never);
    jest.spyOn(ExportJobService.prototype, 'claim').mockResolvedValue(true);
    const markFailed = jest
      .spyOn(ExportJobService.prototype, 'markFailed')
      .mockResolvedValue(undefined as never);
    jest.spyOn(XlsxExportWriter.prototype, 'write').mockRejectedValue(new Error('boom'));

    const processor = new ExportProcessorService({} as never);
    await expect(processor.processJobById('job-1')).rejects.toThrow('boom');
    expect(markFailed).toHaveBeenCalledWith(
      'job-1',
      'EXPORT_PROCESSING_FAILED',
      expect.stringContaining('export processing: boom'),
    );
  });

  it('does not double-process (noop) when another handler already claimed the job', async () => {
    jest.spyOn(ExportJobService.prototype, 'getById').mockResolvedValue(job() as never);
    jest.spyOn(ExportJobService.prototype, 'claim').mockResolvedValue(false);
    const markReady = jest.spyOn(ExportJobService.prototype, 'markReady');
    const markFailed = jest.spyOn(ExportJobService.prototype, 'markFailed');
    const write = jest.spyOn(XlsxExportWriter.prototype, 'write');

    const processor = new ExportProcessorService({} as never);
    await expect(processor.processJobById('job-1')).resolves.toBe('noop');
    expect(write).not.toHaveBeenCalled();
    expect(markReady).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('removes the completed GCS object if persisting its path fails', async () => {
    jest.spyOn(ExportJobService.prototype, 'getById').mockResolvedValue(job() as never);
    jest.spyOn(ExportJobService.prototype, 'claim').mockResolvedValue(true);
    jest.spyOn(XlsxExportWriter.prototype, 'write').mockResolvedValue(1);
    jest
      .spyOn(ExportJobService.prototype, 'markReady')
      .mockRejectedValue(new Error('database unavailable'));
    jest.spyOn(ExportJobService.prototype, 'markFailed').mockResolvedValue(undefined);
    const remove = jest.spyOn(GCSFileStorageProvider.prototype, 'delete');
    await expect(new ExportProcessorService({} as never).processJobById('job-1')).rejects.toThrow(
      'database unavailable',
    );
    expect(remove).toHaveBeenCalledWith('exports/citizens/citizens-2026-09-07-1000-job-1.xlsx');
  });

  it('observes an early upload failure and marks the job failed without saving a path', async () => {
    jest.spyOn(ExportJobService.prototype, 'getById').mockResolvedValue(job() as never);
    jest.spyOn(ExportJobService.prototype, 'claim').mockResolvedValue(true);
    jest.spyOn(XlsxExportWriter.prototype, 'write').mockResolvedValue(1);
    jest
      .spyOn(GCSFileStorageProvider.prototype, 'uploadStream')
      .mockRejectedValue(new Error('GCS unavailable'));
    const ready = jest.spyOn(ExportJobService.prototype, 'markReady');
    const failed = jest
      .spyOn(ExportJobService.prototype, 'markFailed')
      .mockResolvedValue(undefined);
    await expect(new ExportProcessorService({} as never).processJobById('job-1')).rejects.toThrow(
      'GCS unavailable',
    );
    expect(ready).not.toHaveBeenCalled();
    expect(failed).toHaveBeenCalledWith('job-1', 'EXPORT_PROCESSING_FAILED', expect.any(String));
  });

  it('returns not_found and does no work for an unknown job id', async () => {
    jest.spyOn(ExportJobService.prototype, 'getById').mockResolvedValue(null);
    const markReady = jest.spyOn(ExportJobService.prototype, 'markReady');

    const processor = new ExportProcessorService({} as never);
    await expect(processor.processJobById('job-1')).resolves.toBe('not_found');
    expect(markReady).not.toHaveBeenCalled();
  });

  it('processes two distinct jobs in parallel with independent filenames', async () => {
    jest
      .spyOn(ExportJobService.prototype, 'getById')
      .mockImplementation(
        async (id: string) =>
          (id === 'job-a' ? job({ id: 'job-a' }) : job({ id: 'job-b' })) as never,
      );
    const claim = jest.spyOn(ExportJobService.prototype, 'claim').mockResolvedValue(true);
    const markReady = jest
      .spyOn(ExportJobService.prototype, 'markReady')
      .mockResolvedValue(undefined as never);
    jest.spyOn(GCSFileStorageProvider.prototype, 'uploadStream').mockImplementation(
      async (input: { path: string }) =>
        ({
          objectId: input.path,
          path: input.path,
          folderId: 'folder-citizens',
        }) as never,
    );
    jest.spyOn(XlsxExportWriter.prototype, 'write').mockResolvedValue(2);

    const processor = new ExportProcessorService({} as never);
    await expect(
      Promise.all([processor.processJobById('job-a'), processor.processJobById('job-b')]),
    ).resolves.toEqual(['processed', 'processed']);

    expect(claim).toHaveBeenCalledWith('job-a');
    expect(claim).toHaveBeenCalledWith('job-b');
    expect(markReady).toHaveBeenCalledTimes(2);
  });

  it('processBatch claims the next queued job and skips an empty queue', async () => {
    const findNext = jest
      .spyOn(ExportJobService.prototype, 'findNextQueuedId')
      .mockResolvedValueOnce('job-1')
      .mockResolvedValueOnce(undefined);
    const processor = new ExportProcessorService({} as never);
    const processJobById = jest.spyOn(processor, 'processJobById').mockResolvedValue('processed');

    await processor.processBatch();
    expect(findNext).toHaveBeenCalledTimes(1);
    expect(processJobById).toHaveBeenCalledWith('job-1');

    await processor.processBatch();
    expect(processJobById).toHaveBeenCalledTimes(1);
  });
});

describe('ExportProcessorService worker polling', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('logs a sanitized poll failure and keeps the poll loop active', async () => {
    jest.useFakeTimers();
    const processor = new ExportProcessorService({} as never);
    const processBatch = jest
      .spyOn(processor, 'processBatch')
      .mockRejectedValueOnce(new Error('synthetic failure'))
      .mockResolvedValueOnce(undefined);
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const stop = processor.startWorker();
    await Promise.resolve();
    await Promise.resolve();

    expect(processBatch).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('export.poll_failed'));
    jest.advanceTimersByTime(env.EXPORT_JOB_POLL_INTERVAL_MS);
    await Promise.resolve();
    expect(processBatch).toHaveBeenCalledTimes(2);
    stop();
  });
});
