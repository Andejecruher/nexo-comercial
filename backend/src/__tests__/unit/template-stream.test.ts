import express from 'express';
import type { Server } from 'http';
import request from 'supertest';
import { createTemplatesRouter } from '../../routes/templates.routes';
import { TemplateManagementService } from '../../services/templates/template-management.service';
import { TemplateStatusService } from '../../services/templates/template-status.service';
import { errorHandler } from '../../middlewares/errorHandler';
jest.mock('../../middlewares/auth.middleware', () => ({
  authMiddleware: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.get('Authorization') === 'Bearer test') next();
    else res.sendStatus(401);
  },
}));
jest.mock('../../middlewares/permission.middleware', () => ({
  requireAnyPermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermissions:
    () => (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}));
function app() {
  const a = express();
  a.use('/templates', createTemplatesRouter({} as never));
  a.use(errorHandler);
  return a;
}
describe('Template SSE HTTP endpoint', () => {
  afterEach(() => jest.restoreAllMocks());
  it('passes an abort signal to sample uploads and aborts it on client disconnect', async () => {
    let started!: (signal: AbortSignal | undefined) => void;
    const pending = new Promise<AbortSignal | undefined>((resolve) => {
      started = resolve;
    });
    const upload = jest
      .spyOn(TemplateManagementService.prototype, 'uploadSample')
      .mockImplementation(async (_line, _file, signal) => {
        started(signal);
        await new Promise<void>((resolve) =>
          signal?.addEventListener('abort', () => resolve(), { once: true }),
        );
        throw new Error('cancelled');
      });
    const server = app().listen(0, '127.0.0.1');
    const abort = new AbortController();
    try {
      await new Promise<void>((resolve) => server.on('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing port');
      const body = new FormData();
      body.append('file', new Blob(['%PDF-sample'], { type: 'application/pdf' }), 'sample.pdf');
      const result = fetch(`http://127.0.0.1:${address.port}/templates/line/samples`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test' },
        body,
        signal: abort.signal,
      }).catch(() => undefined);
      const signal = await pending;
      expect(signal).toBeDefined();
      expect(signal!.aborted).toBe(false);
      const cancelled = new Promise<void>((resolve) =>
        signal!.addEventListener('abort', () => resolve(), { once: true }),
      );
      abort.abort();
      await cancelled;
      await result;
      expect(signal!.aborted).toBe(true);
      expect(upload.mock.calls[0][1].buffer).toEqual(Buffer.from('%PDF-sample'));
    } finally {
      abort.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('requires authentication', async () => {
    await request(app()).get('/templates/stream?lineId=a&cursor=0').expect(401);
  });
  it('rejects invalid replay cursors before opening the stream', async () => {
    jest
      .spyOn(TemplateManagementService.prototype, 'config')
      .mockResolvedValue({ businessAccountId: '100' } as never);
    await request(app())
      .get('/templates/stream?lineId=a&cursor=invalid')
      .set('Authorization', 'Bearer test')
      .expect(400);
  });
  it('emits named, WABA-scoped events with replay IDs and stops polling on disconnect', async () => {
    jest
      .spyOn(TemplateManagementService.prototype, 'config')
      .mockResolvedValue({ businessAccountId: '100' } as never);
    const since = jest.spyOn(TemplateStatusService.prototype, 'since').mockResolvedValue([
      {
        id: '43',
        waba_id: '100',
        message_template_id: '1',
        message_template_name: 'saludo',
        event: 'APPROVED',
        reason: null,
        occurred_at: '2026-10-13T00:00:00Z',
      },
    ]);
    let server: Server | undefined;
    const abort = new AbortController();
    try {
      server = app().listen(0, '127.0.0.1');
      await new Promise<void>((resolve) => server!.on('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing port');
      const response = await fetch(
        `http://127.0.0.1:${address.port}/templates/stream?lineId=a&cursor=42`,
        { headers: { Authorization: 'Bearer test' }, signal: abort.signal },
      );
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expect(response.headers.get('x-accel-buffering')).toBe('no');
      const reader = response.body!.getReader();
      let content = '';
      while (!content.includes('template_status_changed')) {
        const { value, done } = await reader.read();
        if (done) break;
        content += new TextDecoder().decode(value);
      }
      expect(content).toContain('id: 43\nevent: template_status_changed');
      expect(content).toContain('"waba_id":"100"');
      expect(since).toHaveBeenCalledWith('100', '42');
      await reader.cancel();
      abort.abort();
    } finally {
      abort.abort();
      if (server) {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server!.close(() => resolve()));
      }
    }
  });
});
