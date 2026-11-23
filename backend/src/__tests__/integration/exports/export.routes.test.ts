import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import { Readable } from 'node:stream';
import request from 'supertest';

import { env } from '../../../config/env.config';
import { ExportController, scopeAllows } from '../../../controllers/export.controller';
import { createExportsRouter } from '../../../routes/exports.routes';
import { resolveExportModule } from '../../../services/exports/module-export-config';
import { GoogleDriveFileStorageProvider } from '../../../services/ine/google-drive-file-storage.provider';
import { createTestApp } from '../../setup/test-app';

type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

jest.mock('../../../middlewares/auth.middleware', () => ({
  authMiddleware: (
    req: {
      headers: Record<string, string | undefined>;
      user?: { id: string; email: string; fullName: string; roles: string[] };
    },
    res: { status: (code: number) => { json: (p: Record<string, unknown>) => void } },
    next: () => void,
  ) => {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer role:')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }
    req.user = { id: 'u-1', email: 'admin@test', fullName: 'Admin', roles: ['ADMIN'] };
    next();
  },
}));

jest.mock('../../../middlewares/scope.middleware', () => {
  const { NotFoundError } = require('../../../utils/app-error');
  const SCOPES: Record<string, unknown> = {
    admin: { kind: 'admin' },
  };
  return {
    scopeMiddleware:
      () =>
      (
        req: { scope?: unknown; headers: Record<string, string | undefined> },
        _res: Response,
        next: NextFunction,
      ) => {
        const key = req.headers['x-test-scope'] ?? 'none';
        req.scope = SCOPES[key] ?? { kind: 'none' };
        next();
      },
    requireScope:
      (...allowed: string[]) =>
      (req: { scope?: { kind: string } }, _res: Response, next: NextFunction) => {
        if (!req.scope || !allowed.includes(req.scope.kind)) {
          next(new NotFoundError('Resource not found'));
          return;
        }
        next();
      },
    scopeWhere: () => undefined,
  };
});

const readyJob = {
  id: 'job-1',
  module: 'citizens',
  filtersJson: {},
  scopeSnapshot: { kind: 'admin' },
  status: 'ready',
  driveFileId: 'drive-file-1',
  driveFolderId: 'folder-1',
  driveFilename: 'citizens-2026-09-06-1432.xlsx',
  rowCount: 3,
  errorCode: null,
  lastError: null,
  requestedByUserId: 'u-1',
  requestedAt: new Date(),
  expiresAt: new Date(Date.now() + 3_600_000),
  completedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  downloadTokenHash: null,
  downloadTokenExpiresAt: null,
  downloadTokenConsumedAt: null,
};

function buildHarness(options: { dispatcher?: { dispatchExportJob: jest.Mock } } = {}) {
  const prisma = {
    exportJob: {
      create: jest.fn(async () => ({
        ...readyJob,
        id: 'job-created',
        status: 'queued',
        driveFileId: null,
        driveFilename: null,
        rowCount: null,
        completedAt: null,
      })),
      findUnique: jest.fn<AsyncFn<[unknown], Record<string, unknown> | null>>(),
      update: jest.fn(async (args: never) => {
        const data = (args as { data: Record<string, unknown> }).data;
        return { ...readyJob, ...data };
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const dispatcher =
    'dispatcher' in options
      ? options.dispatcher
      : { dispatchExportJob: jest.fn(async () => undefined) };
  const app = createTestApp((_app, router) => {
    router.use(
      '/api/v1/exports',
      createExportsRouter(prisma as never, {} as never, dispatcher as never),
    );
  });
  return {
    prisma,
    dispatcher,
    app,
    getStream: jest.spyOn(GoogleDriveFileStorageProvider.prototype, 'getStream'),
  };
}

beforeEach(() => {
  env.ENABLE_XLSX_EXPORT = true;
});

describe('export routes: create', () => {
  it('creates a job and dispatches the worker when enabled', async () => {
    const { prisma, dispatcher, app } = buildHarness();
    const res = await request(app)
      .post('/api/v1/exports/citizens')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin')
      .send({ search: 'ciudad' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: 'job-created', status: 'queued' });
    expect(dispatcher!.dispatchExportJob).toHaveBeenCalledWith('job-created');
    expect(prisma.exportJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          module: 'citizens',
          filtersJson: { search: 'ciudad' },
          scopeSnapshot: { kind: 'admin' },
          requestedByUserId: 'u-1',
        }),
      }),
    );
  });

  it('creates a queued job without dispatching when the Cloud Tasks dispatcher is absent', async () => {
    const { prisma, dispatcher, app } = buildHarness({ dispatcher: undefined });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(app)
      .post('/api/v1/exports/citizens')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin')
      .send({ search: 'ciudad' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: 'job-created', status: 'queued' });
    expect(dispatcher).toBeUndefined();
    expect(prisma.exportJob.create).toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns 202 after persisting when Cloud Tasks dispatch fails', async () => {
    const { prisma, dispatcher, app } = buildHarness();
    dispatcher!.dispatchExportJob.mockRejectedValue(new Error('queue unavailable') as never);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await request(app)
      .post('/api/v1/exports/citizens')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin')
      .send({ search: 'ciudad' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: 'job-created', status: 'queued' });
    expect(prisma.exportJob.create).toHaveBeenCalled();
    expect(dispatcher!.dispatchExportJob).toHaveBeenCalledWith('job-created');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('export.task_dispatch_failed'));
    warn.mockRestore();
  });

  it('returns 503 and does no work when the feature flag is disabled', async () => {
    env.ENABLE_XLSX_EXPORT = false;
    const { prisma, dispatcher, app } = buildHarness();
    const res = await request(app)
      .post('/api/v1/exports/citizens')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin')
      .send({ search: 'ciudad' });
    expect(res.status).toBe(503);
    expect(dispatcher!.dispatchExportJob).not.toHaveBeenCalled();
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
  });

  it('rejects pagination fields with 400', async () => {
    const { app } = buildHarness();
    const res = await request(app)
      .post('/api/v1/exports/citizens')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin')
      .send({ page: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Pagination');
  });

  it('rejects unknown citizen filters with 400', async () => {
    const { prisma, app } = buildHarness();
    const res = await request(app)
      .post('/api/v1/exports/citizens')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin')
      .send({ unintendedField: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid export filters');
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
  });

  it.each(['promoted', 'simpatizantes', 'leaders', 'coordinators'])(
    'rejects removed module %s',
    async (module) => {
      const { prisma, app } = buildHarness();
      const res = await request(app)
        .post(`/api/v1/exports/${module}`)
        .set('Authorization', 'Bearer role:ADMIN')
        .set('x-test-scope', 'admin')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Unsupported export module');
      expect(prisma.exportJob.create).not.toHaveBeenCalled();
    },
  );

  it('rejects pagination fields for citizens', async () => {
    const { prisma, app } = buildHarness();
    const res = await request(app)
      .post('/api/v1/exports/citizens')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin')
      .send({ limit: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Pagination');
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
  });

  it('requires authentication for the authenticated routes', async () => {
    const { app } = buildHarness();
    const res = await request(app).post('/api/v1/exports/citizens').send({ search: 'x' });
    expect(res.status).toBe(401);
  });

  it('requires a permitted scope kind', async () => {
    const { app } = buildHarness();
    const res = await request(app)
      .post('/api/v1/exports/citizens')
      .set('Authorization', 'Bearer role:X')
      .set('x-test-scope', 'none')
      .send({ search: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('export routes: status', () => {
  it('returns the ready view for a matching scope', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    const res = await request(app)
      .get('/api/v1/exports/job-1')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body).not.toHaveProperty('driveFileId');
    expect(res.body.cdn_url).toBeNull();
  });

  it('returns 404 for an unknown job', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/exports/job-1')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Export not found');
  });

  it('returns 404 to a user without admin scope', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    const res = await request(app)
      .get('/api/v1/exports/job-1')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'none');
    expect(res.status).toBe(404);
  });
});

describe('export routes: download token issuance', () => {
  it('issues a fresh 64-char token for a ready job in scope', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    const res = await request(app)
      .post('/api/v1/exports/job-1/download-token')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin');
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(res.body.expiresAt).getTime()).toBeLessThanOrEqual(
      readyJob.expiresAt.getTime(),
    );
    expect(prisma.exportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          downloadTokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          downloadTokenConsumedAt: null,
        }),
      }),
    );
  });

  it('rejects issuance for a job that is not ready yet with 409 and the readiness message', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue({ ...readyJob, status: 'processing' });
    const res = await request(app)
      .post('/api/v1/exports/job-1/download-token')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Export is not ready yet');
  });

  it('rejects issuance for an expired job with 410', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue({
      ...readyJob,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const res = await request(app)
      .post('/api/v1/exports/job-1/download-token')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'admin');
    expect(res.status).toBe(410);
  });

  it('returns 404 to a user without admin scope', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    const res = await request(app)
      .post('/api/v1/exports/job-1/download-token')
      .set('Authorization', 'Bearer role:ADMIN')
      .set('x-test-scope', 'none');
    expect(res.status).toBe(404);
  });
});

describe('export routes: download', () => {
  it('streams the file with attachment headers when a valid token is consumed', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    getStream.mockResolvedValue({
      stream: Readable.from(['<xlsx>']),
      contentLength: 6,
    });
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toContain(
      'attachment; filename="citizens-2026-09-06-1432.xlsx"',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toBe('<xlsx>');
  });

  it('serves download without any session scope (token is the gate)', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    getStream.mockResolvedValue({ stream: Readable.from(['ok']) });
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });

  it('returns 404 when no token is provided', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    const res = await request(app).get('/api/v1/exports/job-1/download');
    expect(res.status).toBe(404);
  });

  it('returns 404 when the token is invalid or consumed and never touches Drive', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    prisma.exportJob.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).get('/api/v1/exports/job-1/download?token=used-or-bogus');
    expect(res.status).toBe(404);
    expect(getStream).not.toHaveBeenCalled();
  });

  it('returns 404 when the token has expired even though the hash matches', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue({
      ...readyJob,
      downloadTokenHash: 'ab'.repeat(32),
      downloadTokenExpiresAt: new Date(Date.now() - 1),
    });
    prisma.exportJob.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).get(`/api/v1/exports/job-1/download?token=${'ab'.repeat(32)}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Export not found' });
    expect(getStream).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown job even with a token present', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(404);
  });

  it('returns 410 for an expired job', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue({
      ...readyJob,
      expiresAt: new Date(Date.now() - 1),
    });
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(410);
    expect(res.body.message).toBe('Export is no longer available');
    expect(getStream).not.toHaveBeenCalled();
  });

  it('returns 410 for a failed job and never touches Drive', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue({
      ...readyJob,
      status: 'failed',
      errorCode: 'DRIVE_QUOTA',
      driveFileId: null,
    });
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(410);
    expect(res.body.message).toBe('Export is no longer available');
    expect(getStream).not.toHaveBeenCalled();
  });

  it('returns 409 with the readiness message while processing', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue({ ...readyJob, status: 'processing' });
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Export is not ready yet');
  });

  it('returns a generic 404 for an unknown job even with a token present', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Export not found' });
  });

  it('returns 404 when no token is provided and never touches Drive', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    const res = await request(app).get('/api/v1/exports/job-1/download');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Export not found' });
    expect(getStream).not.toHaveBeenCalled();
  });

  it('streams a large file in chunks without a content-length header', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    let remaining = 25;
    const source = new Readable({
      read() {
        if (remaining <= 0) {
          this.push(null);
          return;
        }
        remaining -= 1;
        this.push(Buffer.alloc(1024 * 1024, 7));
      },
      highWaterMark: 64 * 1024,
    });
    getStream.mockResolvedValue({ stream: source });
    let receivedChunks = 0;
    let totalBytes = 0;
    const res = await request(app)
      .get('/api/v1/exports/job-1/download?token=abc123')
      .buffer(true)
      .parse((responseless, callback) => {
        const chunks: Buffer[] = [];
        const nodeRes = responseless as unknown as {
          on: (e: string, cb: (c: never) => void) => void;
        };
        nodeRes.on('data', (chunk: never) => {
          chunks.push(Buffer.from(chunk));
          receivedChunks += 1;
          totalBytes += Buffer.from(chunk).length;
        });
        nodeRes.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['transfer-encoding']).toBe('chunked');
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(receivedChunks).toBeGreaterThan(50);
    expect(totalBytes).toBe(25 * 1024 * 1024);
    expect((res.body as Buffer).length).toBe(25 * 1024 * 1024);
  });

  it('returns 409 while the job is still processing', async () => {
    const { prisma, app } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue({ ...readyJob, status: 'processing' });
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(409);
  });

  it('surfaces a Drive failure as 502 and closes cleanly', async () => {
    const { prisma, app, getStream } = buildHarness();
    prisma.exportJob.findUnique.mockResolvedValue(readyJob);
    getStream.mockRejectedValue(new Error('drive down'));
    const res = await request(app).get('/api/v1/exports/job-1/download?token=abc123');
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('Export file is unavailable');
  });
});

describe('export service scope contract', () => {
  it('allows admin scope to access retained export jobs', () => {
    expect(scopeAllows({ kind: 'admin' }, { kind: 'admin' })).toBe(true);
  });

  it('denies users without admin scope', () => {
    expect(scopeAllows({ kind: 'none' }, { kind: 'admin' })).toBe(false);
  });

  it('rejects removed module aliases', () => {
    expect(() => resolveExportModule('simpatizantes')).toThrow('Unsupported export module');
    expect(() => resolveExportModule('leaders')).toThrow('Unsupported export module');
  });
});

describe('export controller direct download gate', () => {
  it('responds 404 when downloading without a single-use token', async () => {
    const prisma = {
      exportJob: { findUnique: jest.fn(async () => null), updateMany: jest.fn() },
    } as never;
    const controller = new ExportController(prisma, {} as never);
    const res = responseMock();
    await controller.download(
      { params: { id: 'job-1' }, query: {} } as unknown as Request,
      res,
      noopNext(),
    );
    expect(res.statusCode).toBe(404);
    expect(res.payload).toEqual({ message: 'Export not found' });
  });

  it('destroys the response when the Drive stream errors mid-transfer', async () => {
    const prisma = {
      exportJob: {
        findUnique: jest.fn(async () => ({ ...readyJob })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    } as never;
    const source = new Readable({
      read() {
        this.push(Buffer.from('partial-bytes'));
        this.destroy(new Error('connection reset'));
      },
    });
    const drive = { getStream: jest.fn(async () => ({ stream: source })) } as never;
    const controller = new ExportController(prisma, drive);
    const res = responseMock();
    await controller.download(
      { params: { id: 'job-1' }, query: { token: 'abc123' } } as unknown as Request,
      res as unknown as Response,
      noopNext(),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(res.destroyed).toBe(true);
  });
});

type ResponseMock = Response & { statusCode: number; payload: unknown; destroyed: boolean };

function responseMock(): ResponseMock {
  const res = {
    statusCode: 0,
    payload: undefined as unknown,
    destroyed: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
    setHeader() {
      return this;
    },
    write(_chunk: unknown) {
      return true;
    },
    end() {
      return this;
    },
    on() {
      return this;
    },
    emit() {
      return this;
    },
    removeListener() {
      return this;
    },
    destroy() {
      this.destroyed = true;
      return this;
    },
  };
  return res as unknown as ResponseMock;
}

function noopNext(): NextFunction {
  return (() => undefined) as NextFunction;
}
