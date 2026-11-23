import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { createWorkerApp } from '../../worker-app';
import { ConversationRepository } from '../../repositories/conversation.repository';

const id = '550e8400-e29b-41d4-a716-446655440000';

function appWith(overrides: Record<string, unknown> = {}) {
  return createWorkerApp({
    prisma: { $queryRaw: jest.fn(async () => [{ ok: 1 }]) } as never,
    inboxProcessor: { processEventById: jest.fn(async () => 'noop') } as never,
    outboxProcessor: { processEventById: jest.fn(async () => 'noop') } as never,
    realtimeRelay: { processEventById: jest.fn(async () => 'noop') } as never,
    syncMedia: jest.fn(async () => undefined),
    syncDeliveryStatus: jest.fn(async () => undefined),
    processBulkActions: jest.fn(async () => undefined),
    cleanupExports: jest.fn(async () => 0),
    reconcileCareMode: jest.fn(async () => ({ reconciled: 0, stuckDepartmentHandoffs: 0 })),
    reconcileBackgroundTasks: jest.fn(async () => ({ attempted: 0, failed: 0, capped: false })),
    healthMetadata: {},
    ...overrides,
  });
}

describe('Cloud Tasks worker HTTP handlers', () => {
  it.each(['/tasks/process-inbox', '/tasks/process-batch'])(
    'acknowledges an invalid nested conversation UUID on %s without querying Prisma',
    async (path) => {
      const findUnique = jest.fn();
      const conversations = new ConversationRepository({
        conversation: { findUnique },
      } as never);
      const process = async () => {
        await conversations.getConversationContext('user_123');
        return 'processed';
      };
      const response = await request(
        appWith({ inboxProcessor: { processEventById: process, processBatch: process } }),
      )
        .post(path)
        .send(path === '/tasks/process-inbox' ? { id } : { phone: '521999888777', generation: 3 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'invalid_payload' });
      expect(findUnique).not.toHaveBeenCalled();
    },
  );

  it('exposes GET /healthz for Cloud Run and compose probes', async () => {
    const response = await request(appWith()).get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('exposes GET /ready as the same public liveness contract', async () => {
    const response = await request(appWith()).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('returns 200 on /healthz even with an Authorization header and down dependencies', async () => {
    const prismaQuery = jest.fn(async () => {
      throw new Error('postgres unavailable');
    });
    const response = await request(
      appWith({
        prisma: { $queryRaw: prismaQuery } as never,
      }),
    )
      .get('/healthz')
      .set('Authorization', 'Bearer cloud-run-oidc-token');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(prismaQuery).not.toHaveBeenCalled();
  });

  it('rejects bodies containing anything except one UUID id', async () => {
    const response = await request(appWith())
      .post('/tasks/process-inbox')
      .send({ id, phone: 'must-not-be-accepted' });

    // 2xx a propósito: Cloud Tasks reintenta todo lo que no sea 2xx, y un
    // payload con claves extrañas nunca va a sanar solo.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'invalid_payload' });
  });

  it('does not expose the removed OCR task route', async () => {
    const response = await request(appWith()).post('/tasks/process-ocr').send({ id });

    expect(response.status).toBe(404);
  });

  it('returns 200 for an idempotent duplicate/no-op', async () => {
    const response = await request(appWith()).post('/tasks/process-outbox').send({ id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'noop' });
  });

  it('returns 200 for an unknown durable id so the task is not retried forever', async () => {
    const response = await request(
      appWith({ inboxProcessor: { processEventById: jest.fn(async () => 'not_found') } as never }),
    )
      .post('/tasks/process-inbox')
      .send({ id });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'not_found' });
  });

  it('returns 500 when processing fails so Cloud Tasks retries', async () => {
    const response = await request(
      appWith({
        realtimeRelay: {
          processEventById: jest.fn(async () => {
            throw new Error('Redis unavailable');
          }),
        } as never,
      }),
    )
      .post('/tasks/notifications')
      .send({ id });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ status: 'processing_failed' });
  });

  it('returns 500 when any reconciliation dispatch fails so Scheduler retries', async () => {
    const response = await request(
      appWith({
        reconcileBackgroundTasks: jest.fn(async () => ({
          attempted: 4,
          failed: 1,
          capped: false,
        })),
      }),
    ).post('/tasks/reconcile');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      status: 'dispatch_failed',
      attempted: 4,
      failed: 1,
      capped: false,
    });
  });

  it('returns 200 for /tasks/process-batch when batch is processed', async () => {
    const response = await request(
      appWith({
        inboxProcessor: {
          processBatch: jest.fn(async () => 'processed'),
          processEventById: jest.fn(async () => 'noop'),
        } as never,
      }),
    )
      .post('/tasks/process-batch')
      .send({ phone: '521999888777', generation: 3 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'processed' });
  });

  it('returns 200 for /tasks/process-batch with missing fields', async () => {
    const response = await request(appWith())
      .post('/tasks/process-batch')
      .send({ phone: '521999888777' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'invalid_payload' });
  });

  it('returns 200 for /tasks/process-batch with a non-numeric phone', async () => {
    const response = await request(appWith())
      .post('/tasks/process-batch')
      .send({ phone: 'not-a-phone', generation: 1 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'invalid_payload' });
  });

  it('returns 200 for /tasks/process-batch when a non-UUID id reaches the lease lock', async () => {
    const response = await request(
      appWith({
        inboxProcessor: {
          processBatch: jest.fn(async () => {
            throw new Error('Invalid conversationId for conversation_meta: not a uuid');
          }),
          processEventById: jest.fn(async () => 'noop'),
        } as never,
      }),
    )
      .post('/tasks/process-batch')
      .send({ phone: '521999888777', generation: 3 });

    // El 22P02 original era permanente: sin esto Cloud Tasks consumía los
    // reintentos completos contra un payload que nunca iba a ser válido.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'invalid_payload' });
  });

  it('returns 500 for /tasks/process-batch when processing throws', async () => {
    const response = await request(
      appWith({
        inboxProcessor: {
          processBatch: jest.fn(async () => {
            throw new Error('batch failed');
          }),
          processEventById: jest.fn(async () => 'noop'),
        } as never,
      }),
    )
      .post('/tasks/process-batch')
      .send({ phone: '521999888777', generation: 3 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ status: 'processing_failed' });
  });

  it('returns 200 for /tasks/process-batch on a PG 23505 unique violation', async () => {
    // En $queryRaw Prisma sube P2010 con el código de Postgres en meta.code;
    // P2002 nunca aparece ahí. Si solo miráramos P2002, el 500 seguiría
    // quemando el presupuesto de reintentos de Cloud Tasks.
    const pgUnique = Object.assign(new Error('Key (phone, batch_generation) already exists.'), {
      code: 'P2010',
      meta: { code: '23505' },
    });

    const response = await request(
      appWith({
        inboxProcessor: {
          processBatch: jest.fn(async () => {
            throw pgUnique;
          }),
          processEventById: jest.fn(async () => 'noop'),
        } as never,
      }),
    )
      .post('/tasks/process-batch')
      .send({ phone: '521999888777', generation: 372 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'duplicate' });
  });

  it('returns 200 for /tasks/process-batch on a P2002 unique violation', async () => {
    const prismaUnique = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

    const response = await request(
      appWith({
        inboxProcessor: {
          processBatch: jest.fn(async () => {
            throw prismaUnique;
          }),
          processEventById: jest.fn(async () => 'noop'),
        } as never,
      }),
    )
      .post('/tasks/process-batch')
      .send({ phone: '521999888777', generation: 372 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'duplicate' });
  });

  it.each([
    ['/tasks/cron/sync-media', 'syncMedia'],
    ['/tasks/cron/sync-delivery-status', 'syncDeliveryStatus'],
    ['/tasks/cron/process-bulk-actions', 'processBulkActions'],
    ['/tasks/cron/cleanup-exports', 'cleanupExports'],
    ['/tasks/cron/reconcile-care-mode', 'reconcileCareMode'],
  ])('awaits %s before responding', async (path, dependency) => {
    let complete!: () => void;
    let started!: () => void;
    const taskStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const task = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
          started();
        }),
    );
    const app = appWith({ [dependency]: task });

    let responded = false;
    const response = request(app)
      .post(path)
      .then((result) => {
        responded = true;
        return result;
      });
    await taskStarted;

    expect(task).toHaveBeenCalledTimes(1);
    expect(responded).toBe(false);

    complete();
    expect((await response).status).toBe(200);
  });

  it('still returns 500 for /tasks/process-batch on an unrelated error', async () => {
    const otherPgError = Object.assign(new Error('connection terminated'), {
      code: 'P2010',
      meta: { code: '08006' },
    });

    const response = await request(
      appWith({
        inboxProcessor: {
          processBatch: jest.fn(async () => {
            throw otherPgError;
          }),
          processEventById: jest.fn(async () => 'noop'),
        } as never,
      }),
    )
      .post('/tasks/process-batch')
      .send({ phone: '521999888777', generation: 372 });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ status: 'processing_failed' });
  });
});
