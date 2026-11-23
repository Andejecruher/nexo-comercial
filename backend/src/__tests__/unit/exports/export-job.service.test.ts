import { describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { env } from '../../../config/env.config';
import { EXPORT_JOB_TTL_MS, ExportJobService } from '../../../services/exports/export-job.service';

const now = new Date('2026-09-07T10:00:00Z');

describe('ExportJobService', () => {
  it('claims a queued job exactly once and applies the configured TTL', async () => {
    const prisma = {
      exportJob: { create: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })) },
    } as any;
    const service = new ExportJobService(prisma);
    await service.claim('550e8400-e29b-41d4-a716-446655440000');
    expect(prisma.exportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: expect.any(String), status: 'queued' } }),
    );
  });

  it('returns the oldest queued job id for the polling worker', async () => {
    const prisma = {
      exportJob: {
        findFirst: jest.fn(async () => ({ id: 'job-oldest' })),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await expect(service.findNextQueuedId()).resolves.toBe('job-oldest');
    expect(prisma.exportJob.findFirst).toHaveBeenCalledWith({
      where: { status: 'queued' },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
  });

  it('creates a job with the default TTL, ISO UTC expiry, and audit fields', async () => {
    let captured: Record<string, unknown> | undefined;
    const prisma = {
      exportJob: {
        create: jest.fn(async (args: never) => {
          captured = (args as { data: Record<string, unknown> }).data;
          return { id: 'job-1', status: 'queued' };
        }),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await service.createJob({
      module: 'promoted',
      filters: { q: 'ana', sex: 'M' },
      scopeSnapshot: { kind: 'leader', leaderId: 'leader-42' },
      requestedByUserId: 'user-1',
    });
    expect(captured).toMatchObject({
      module: 'promoted',
      filtersJson: { q: 'ana', sex: 'M' },
      scopeSnapshot: { kind: 'leader', leaderId: 'leader-42' },
      requestedByUserId: 'user-1',
    });
    const expiresAt = captured!.expiresAt as Date;
    expect(expiresAt).toBeInstanceOf(Date);
    const tolerance = 5_000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
      Date.now() + EXPORT_JOB_TTL_MS() - tolerance,
    );
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + EXPORT_JOB_TTL_MS());
    expect(expiresAt.toISOString().endsWith('Z')).toBe(true);
  });

  it('keeps audit fields on a row that moves from queued to processing to ready', async () => {
    const created: Record<string, unknown> = {};
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      exportJob: {
        create: jest.fn(async (args: never) => {
          Object.assign(created, (args as { data: Record<string, unknown> }).data);
          return { id: 'job-1', status: 'queued' };
        }),
        updateMany: jest.fn(async (args: never) => {
          updates.push((args as { data: Record<string, unknown> }).data);
          return { count: 1 };
        }),
        update: jest.fn(async (args: never) => {
          updates.push((args as { data: Record<string, unknown> }).data);
          return { id: 'job-1' };
        }),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await service.createJob({
      module: 'promoted',
      filters: { q: 'ana' },
      scopeSnapshot: { kind: 'leader', leaderId: 'leader-42' },
      requestedByUserId: 'user-1',
    });
    await service.claim('job-1');
    await service.markReady({
      id: 'job-1',
      driveFileId: 'drive-file-1',
      driveFolderId: 'folder-1',
      driveFilename: 'promoted-2026-09-07-1000-job-1.xlsx',
      rowCount: 3_500,
    });
    expect(created).toMatchObject({
      requestedByUserId: 'user-1',
      expiresAt: expect.any(Date),
    });
    expect(updates[0]).toEqual({ status: 'processing' });
    expect(updates[1]).toMatchObject({
      status: 'ready',
      driveFileId: 'drive-file-1',
      driveFilename: 'promoted-2026-09-07-1000-job-1.xlsx',
      rowCount: 3_500,
      completedAt: expect.any(Date),
    });
  });

  it('persists the full audit trail when marking a job ready', async () => {
    let captured: Record<string, unknown> | undefined;
    const prisma = {
      exportJob: {
        update: jest.fn(async (args: never) => {
          captured = (args as { data: Record<string, unknown> }).data;
          return { id: 'job-1' };
        }),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await service.markReady({
      id: 'job-1',
      driveFileId: 'drive-file-1',
      driveFolderId: 'folder-1',
      driveFilename: 'promoted-2026-09-07-1000-job-1.xlsx',
      rowCount: 3_500,
    });
    expect(captured).toMatchObject({
      status: 'ready',
      driveFileId: 'drive-file-1',
      driveFolderId: 'folder-1',
      driveFilename: 'promoted-2026-09-07-1000-job-1.xlsx',
      rowCount: 3_500,
      completedAt: expect.any(Date),
    });
  });

  it('persists a stable errorCode and truncated lastError on failure', async () => {
    let captured: Record<string, unknown> | undefined;
    const prisma = {
      exportJob: {
        update: jest.fn(async (args: never) => {
          captured = (args as { data: Record<string, unknown> }).data;
          return { id: 'job-1' };
        }),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await service.markFailed('job-1', 'DRIVE_QUOTA', 'x'.repeat(5_000));
    expect(captured).toMatchObject({
      status: 'failed',
      errorCode: 'DRIVE_QUOTA',
      completedAt: expect.any(Date),
    });
    expect((captured!.lastError as string).length).toBe(4_000);
  });

  it('consumes a valid, unexpired, unconsumed token exactly once', async () => {
    const prisma = {
      exportJob: {
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await expect(service.consumeDownloadToken('job-1', 'token-value')).resolves.toBe(true);
    const whereArg = (
      prisma.exportJob.updateMany.mock.calls[0] as unknown as Array<{
        where: Record<string, unknown>;
      }>
    )[0];
    expect(whereArg.where).toMatchObject({
      id: 'job-1',
      downloadTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      downloadTokenConsumedAt: null,
      downloadTokenExpiresAt: { gt: expect.any(Date) },
    });
    expect(whereArg.where.downloadTokenHash).toBe(
      createHash('sha256').update('token-value').digest('hex'),
    );
    expect(whereArg.where.downloadTokenExpiresAt).toMatchObject({ gt: expect.any(Date) });
  });

  it('rejects a second use of the same token and any non-matching token', async () => {
    const prisma = {
      exportJob: {
        updateMany: jest.fn(async () => ({ count: 0 })).mockResolvedValueOnce({ count: 1 }),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await expect(service.consumeDownloadToken('job-1', 'same-token')).resolves.toBe(true);
    await expect(service.consumeDownloadToken('job-1', 'same-token')).resolves.toBe(false);
    await expect(service.consumeDownloadToken('job-1', 'wrong-token')).resolves.toBe(false);
  });

  it('issues a download token and persists only its SHA-256 hash', async () => {
    const savedData: Record<string, unknown> = {};
    const prisma = {
      exportJob: {
        findUnique: jest.fn(async () => ({
          id: 'job-1',
          status: 'ready',
          expiresAt: new Date(now.getTime() + 3_600_000),
        })),
        update: jest.fn(async (args: never) => {
          savedData.data = (args as { data: Record<string, unknown> }).data;
          return { id: 'job-1' };
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    } as any;
    const service = new ExportJobService(prisma);
    const issued = await service.issueDownloadToken('job-1', now);
    expect(issued).not.toBeNull();
    expect(issued?.token).toHaveLength(64);
    const expectedHash = createHash('sha256').update(issued!.token).digest('hex');
    expect(savedData.data).toMatchObject({
      downloadTokenHash: expectedHash,
      downloadTokenConsumedAt: null,
    });
    expect((savedData.data as Record<string, unknown>).downloadTokenHash).not.toBe(issued!.token);
    expect(issued!.expiresAt.getTime()).toBeLessThanOrEqual(now.getTime() + 3_600_000);
  });

  it('clamps the token TTL to the job expiry when that is earlier', async () => {
    const savedData: Record<string, unknown> = {};
    const prisma = {
      exportJob: {
        findUnique: jest.fn(async () => ({
          id: 'job-1',
          status: 'ready',
          expiresAt: new Date(now.getTime() + 60_000),
        })),
        update: jest.fn(async (args: never) => {
          savedData.data = (args as { data: Record<string, unknown> }).data;
          return { id: 'job-1' };
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    } as any;
    const service = new ExportJobService(prisma);
    const issued = await service.issueDownloadToken('job-1', now);
    expect(issued!.expiresAt.getTime()).toBe(now.getTime() + 60_000);
  });

  it('refuses to issue a token for a job that is not ready', async () => {
    const prisma = {
      exportJob: {
        findUnique: jest.fn(async () => ({
          id: 'job-1',
          status: 'processing',
          expiresAt: new Date(now.getTime() + 3_600_000),
        })),
        update: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await expect(service.issueDownloadToken('job-1', now)).resolves.toBeNull();
    expect(prisma.exportJob.update).not.toHaveBeenCalled();
  });

  it('reports consumption failure when no row matches', async () => {
    const prisma = {
      exportJob: {
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await expect(service.consumeDownloadToken('job-1', 'wrong-token')).resolves.toBe(false);
  });
});

describe('ExportJobService reconciliation', () => {
  const expiredTick = new Date(now.getTime() + 3_600_000);

  const readyJob = {
    id: 'job-1',
    status: 'ready',
    driveFileId: 'drive-file-1',
    driveFolderId: 'folder-1',
    driveFilename: 'promoted-2026-09-07-1000-job-1.xlsx',
    errorCode: null,
    lastError: null,
    requestedByUserId: 'user-1',
    requestedAt: now,
    rowCount: 3_500,
    expiresAt: new Date(now.getTime() - 3_600_000),
    completedAt: now,
    updatedAt: now,
    createdAt: now,
  };

  it('marks an expired ready job as expired, deletes its Drive file, and purges it', async () => {
    let updated: Record<string, unknown> | undefined;
    const deleteDriveFile = jest.fn(async () => undefined);
    const prisma = {
      exportJob: {
        findMany: jest.fn(async () => [readyJob]),
        update: jest.fn(async (args: never) => {
          updated = (args as { where: { id: string } }).where as unknown as Record<string, unknown>;
          return readyJob;
        }),
        delete: jest.fn(async () => ({})),
      },
    } as any;
    const service = new ExportJobService(prisma);
    const count = await service.reconcile(deleteDriveFile, expiredTick);
    expect(count).toBe(1);
    expect(deleteDriveFile).toHaveBeenCalledWith('drive-file-1');
    expect(prisma.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'expired', completedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.exportJob.delete).toHaveBeenCalledWith({ where: { id: 'job-1' } });
  });

  it('purges expired failed jobs and their partial artifacts', async () => {
    const deleteDriveFile = jest.fn(async () => undefined);
    const prisma = {
      exportJob: {
        findMany: jest.fn(async () => [
          { ...readyJob, status: 'failed', errorCode: 'DRIVE_UPLOAD_500' },
        ]),
        update: jest.fn(async () => ({})),
        delete: jest.fn(async () => ({})),
      },
    } as any;
    const service = new ExportJobService(prisma);
    const count = await service.reconcile(deleteDriveFile, expiredTick);
    expect(count).toBe(1);
    expect(deleteDriveFile).toHaveBeenCalledWith('drive-file-1');
    expect(prisma.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'expired' }) }),
    );
    expect(prisma.exportJob.delete).toHaveBeenCalled();
  });

  it('purges an expired processing job as failed after its watchdog timeout', async () => {
    const deleteDriveFile = jest.fn(async () => undefined);
    const prisma = {
      exportJob: {
        findMany: jest.fn(async () => [{ ...readyJob, status: 'processing' }]),
        update: jest.fn(async () => ({})),
        delete: jest.fn(async () => ({})),
      },
    } as any;
    const service = new ExportJobService(prisma);
    const count = await service.reconcile(deleteDriveFile, expiredTick);
    expect(count).toBe(1);
    expect(prisma.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'failed',
          errorCode: 'WORKER_TIMEOUT',
        }),
      }),
    );
    expect(prisma.exportJob.delete).toHaveBeenCalled();
  });

  it('marks a hung (non-expired) processing job as failed WORKER_TIMEOUT without deleting its row or file', async () => {
    const deleteDriveFile = jest.fn(async () => undefined);
    const hungAt = new Date(now.getTime() - env.EXPORT_WATCHDOG_TIMEOUT_MS - 60_000);
    const prisma = {
      exportJob: {
        findMany: jest.fn(async () => [
          {
            ...readyJob,
            status: 'processing',
            expiresAt: new Date(now.getTime() + 3_600_000),
            updatedAt: hungAt,
          },
        ]),
        update: jest.fn(async () => ({})),
        delete: jest.fn(async () => ({})),
      },
    } as any;
    const service = new ExportJobService(prisma);
    const count = await service.reconcile(deleteDriveFile, now);
    expect(count).toBe(1);
    expect(prisma.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed', errorCode: 'WORKER_TIMEOUT' }),
      }),
    );
    expect(deleteDriveFile).not.toHaveBeenCalled();
    expect(prisma.exportJob.delete).not.toHaveBeenCalled();
  });

  it('leaves active jobs untouched when nothing is expired', async () => {
    const deleteDriveFile = jest.fn(async () => undefined);
    const prisma = {
      exportJob: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as any;
    const service = new ExportJobService(prisma);
    const count = await service.reconcile(deleteDriveFile, now);
    expect(count).toBe(0);
    expect(deleteDriveFile).not.toHaveBeenCalled();
    expect(prisma.exportJob.update).not.toHaveBeenCalled();
    expect(prisma.exportJob.delete).not.toHaveBeenCalled();
  });

  it('keeps the full audit trail readable on the job before it is purged', async () => {
    const deleteDriveFile = jest.fn(async () => undefined);
    const queried = [
      {
        ...readyJob,
        id: 'job-1',
        status: 'ready',
        requestedByUserId: 'user-1',
        requestedAt: now,
        filtersJson: { q: 'ana', sex: 'M' },
        rowCount: 3_500,
        errorCode: null,
      },
    ];
    const findMany = jest.fn(async () => queried);
    const prisma = {
      exportJob: {
        findMany,
        update: jest.fn(async () => ({})),
        delete: jest.fn(async () => ({})),
      },
    } as any;
    const service = new ExportJobService(prisma);
    await service.reconcile(deleteDriveFile, expiredTick);

    const rows = (await findMany.mock.results[0].value) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      requestedByUserId: 'user-1',
      requestedAt: now,
      filtersJson: { q: 'ana', sex: 'M' },
      rowCount: 3_500,
      status: 'ready',
    });
    expect(prisma.exportJob.delete).toHaveBeenCalledWith({ where: { id: 'job-1' } });
  });
});
