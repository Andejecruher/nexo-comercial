import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import { CloudTasksDispatcher } from '../../../services/tasks/cloud-tasks-dispatcher.service';
import { createWorkerApp } from '../../../worker-app';

const id = '550e8400-e29b-41d4-a716-446655440000';

describe('export Cloud Task', () => {
  it('processes /tasks/export through the worker', async () => {
    const app = createWorkerApp({
      prisma: {} as never,
      ineOcrService: {} as never,
      inboxProcessor: {} as never,
      outboxProcessor: {} as never,
      syncMedia: jest.fn(async () => undefined),
      syncDeliveryStatus: jest.fn(async () => undefined),
      processBulkActions: jest.fn(async () => undefined),
      cleanupExports: jest.fn(async () => undefined),
      reconcileCareMode: jest.fn(async () => undefined),
      reconcileBackgroundTasks: jest.fn(async () => ({
        attempted: 0,
        failed: 0,
        capped: false,
      })),
      healthMetadata: {},
      exportProcessor: {
        processJobById: jest.fn(
          async (): Promise<'processed' | 'noop' | 'not_found'> => 'processed',
        ),
      },
    });
    await request(app).post('/tasks/export').send({ id }).expect(200, { status: 'processed' });
  });

  it('dispatches export jobs to the dedicated worker route', async () => {
    const client = { queuePath: jest.fn(() => 'queue'), createTask: jest.fn(async () => []) };
    const dispatcher = new CloudTasksDispatcher(
      {
        projectId: 'p',
        location: 'l',
        queueName: 'q',
        workerServiceUrl: 'https://worker.test',
        serviceAccountEmail: 'worker@test',
      },
      client as never,
    );
    await dispatcher.dispatchExportJob(id);
    expect(client.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task: expect.objectContaining({
          httpRequest: expect.objectContaining({ url: 'https://worker.test/tasks/export' }),
        }),
      }),
      { timeout: 1000, retry: null },
    );
  });
});
