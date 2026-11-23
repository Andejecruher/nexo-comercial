import { describe, expect, it, jest } from '@jest/globals';
import { protos } from '@google-cloud/tasks';
import { CloudTasksDispatcher } from '../../services/tasks/cloud-tasks-dispatcher.service';

function createClient() {
  return {
    queuePath: jest.fn(() => 'projects/project-1/locations/us-central1/queues/background-tasks'),
    createTask: jest.fn(async (_request: unknown) => [{}]),
  };
}

function createDispatcher(client: ReturnType<typeof createClient>) {
  return new CloudTasksDispatcher(
    {
      projectId: 'project-1',
      location: 'us-central1',
      queueName: 'background-tasks',
      workerServiceUrl: 'https://nexo-worker.example.run.app/',
      serviceAccountEmail: 'cloud-tasks-invoker@project-1.iam.gserviceaccount.com',
    },
    client as never,
  );
}

describe('CloudTasksDispatcher', () => {
  it('routes heavy work independently from delivery with bounded RPC retry', async () => {
    const createTask = jest.fn(async (_request: unknown, _options: unknown) => [{}]);
    const dispatcher = new CloudTasksDispatcher(
      {
        projectId: 'p',
        location: 'r',
        queueName: 'base',
        aiQueueName: 'ai',
        deliveryQueueName: 'delivery',
        documentQueueName: 'documents',
        workerServiceUrl: 'https://worker.example',
        serviceAccountEmail: 'tasks@example.com',
      },
      { queuePath: (_project, _location, queue) => queue, createTask },
    );
    await dispatcher.dispatchBatchEvent('phone', 1);
    await dispatcher.dispatchOutboxEvent('outbox');
    await dispatcher.dispatchOcrJob('ocr');
    expect(
      createTask.mock.calls.map(([request]) => (request as { parent: string }).parent),
    ).toEqual(['ai', 'delivery', 'documents']);
    for (const [, options] of createTask.mock.calls)
      expect(options).toEqual({ timeout: 1000, retry: null });
  });

  it('creates an ID-only JSON task with the worker-origin OIDC audience', async () => {
    const client = createClient();
    const dispatcher = createDispatcher(client);

    await dispatcher.dispatchInboxEvent('550e8400-e29b-41d4-a716-446655440000');

    expect(client.createTask).toHaveBeenCalledTimes(1);
    const request = client.createTask.mock.calls[0][0] as {
      parent: string;
      task: {
        name?: string;
        httpRequest: {
          httpMethod: number;
          url: string;
          headers: Record<string, string>;
          body: string;
          oidcToken: { serviceAccountEmail: string; audience: string };
        };
      };
    };
    expect(request.parent).toBe('projects/project-1/locations/us-central1/queues/background-tasks');
    expect(request.task.name).toBeUndefined();
    expect(request.task.httpRequest).toMatchObject({
      httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
      url: 'https://nexo-worker.example.run.app/tasks/process-inbox',
      headers: { 'Content-Type': 'application/json' },
      oidcToken: {
        serviceAccountEmail: 'cloud-tasks-invoker@project-1.iam.gserviceaccount.com',
        audience: 'https://nexo-worker.example.run.app',
      },
    });
    expect(Buffer.from(request.task.httpRequest.body, 'base64').toString('utf8')).toBe(
      '{"id":"550e8400-e29b-41d4-a716-446655440000"}',
    );
  });

  it('creates a fresh provider-named task for repeated delivery requests', async () => {
    const client = createClient();
    const dispatcher = createDispatcher(client);

    await dispatcher.dispatchOutboxEvent('550e8400-e29b-41d4-a716-446655440001');
    await dispatcher.dispatchOutboxEvent('550e8400-e29b-41d4-a716-446655440001');

    expect(client.createTask).toHaveBeenCalledTimes(2);
    for (const [request] of client.createTask.mock.calls) {
      expect((request as { task: { name?: string } }).task.name).toBeUndefined();
    }
  });

  it('schedules a single inbox event with protobuf seconds and nanos', async () => {
    const client = createClient();
    const dispatcher = createDispatcher(client);
    const scheduleTime = new Date('2026-09-22T12:00:00.250Z');

    await dispatcher.dispatchInboxEvent('550e8400-e29b-41d4-a716-446655440000', {
      seconds: Math.floor(scheduleTime.getTime() / 1000),
      nanos: (scheduleTime.getTime() % 1000) * 1_000_000,
    });

    const request = client.createTask.mock.calls[0][0] as {
      task: { scheduleTime?: { seconds?: number; nanos?: number }; name?: string };
    };
    expect(request.task.name).toBeUndefined();
    expect(request.task.scheduleTime).toEqual({
      seconds: 1_790_078_400,
      nanos: 250_000_000,
    });
  });

  it('dispatches a batch event to /tasks/process-batch with phone, generation and scheduleTime', async () => {
    const client = createClient();
    const dispatcher = createDispatcher(client);
    const scheduleTime = new Date('2026-09-22T12:00:00.500Z');

    await dispatcher.dispatchBatchEvent('521999888777', 3, {
      seconds: Math.floor(scheduleTime.getTime() / 1000),
      nanos: (scheduleTime.getTime() % 1000) * 1_000_000,
    });

    const request = client.createTask.mock.calls[0][0] as {
      task: {
        httpRequest: { url: string; body: string };
        scheduleTime?: { seconds?: number; nanos?: number };
        name?: string;
      };
    };
    expect(request.task.name).toBeUndefined();
    expect(request.task.httpRequest.url).toBe(
      'https://nexo-worker.example.run.app/tasks/process-batch',
    );
    expect(Buffer.from(request.task.httpRequest.body, 'base64').toString('utf8')).toBe(
      '{"phone":"521999888777","generation":3}',
    );
    expect(request.task.scheduleTime).toEqual({
      seconds: 1_790_078_400,
      nanos: 500_000_000,
    });
  });
});
