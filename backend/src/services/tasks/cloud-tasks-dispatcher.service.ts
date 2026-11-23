import { CloudTasksClient, protos } from '@google-cloud/tasks';
import { env } from '../../config/env.config';

export type BackgroundTaskResult = 'processed' | 'noop' | 'not_found';

export type ITimestamp = protos.google.protobuf.ITimestamp;

export interface BackgroundTaskDispatcher {
  dispatchCampaign?(id: string, scheduleTime?: ITimestamp): Promise<void>;
  dispatchExportJob(id: string): Promise<void>;
  dispatchOcrJob(id: string): Promise<void>;
  dispatchInboxEvent(id: string, scheduleTime?: ITimestamp): Promise<void>;
  dispatchBatchEvent(phone: string, generation: number, scheduleTime?: ITimestamp): Promise<void>;
  dispatchOutboxEvent(id: string): Promise<void>;
  dispatchRealtimeEvent(id: string): Promise<void>;
}

type CloudTasksApi = {
  queuePath(project: string, location: string, queue: string): string;
  createTask(
    request: protos.google.cloud.tasks.v2.ICreateTaskRequest,
    options?: { timeout: number; retry: null },
  ): Promise<unknown>;
};

type CloudTasksConfig = {
  projectId: string;
  location: string;
  queueName: string;
  aiQueueName?: string;
  deliveryQueueName?: string;
  documentQueueName?: string;
  workerServiceUrl: string;
  serviceAccountEmail: string;
};

export class CloudTasksDispatcher implements BackgroundTaskDispatcher {
  private readonly parent: string;
  private readonly workerServiceUrl: string;

  constructor(
    private readonly config: CloudTasksConfig,
    private readonly client: CloudTasksApi = new CloudTasksClient() as unknown as CloudTasksApi,
  ) {
    this.parent = client.queuePath(config.projectId, config.location, config.queueName);
    this.workerServiceUrl = config.workerServiceUrl.replace(/\/+$/, '');
  }

  async dispatchCampaign(id: string, scheduleTime?: ITimestamp): Promise<void> {
    await this.dispatch('/tasks/process-campaign', { id }, scheduleTime);
  }

  async dispatchOcrJob(id: string): Promise<void> {
    await this.dispatch('/tasks/process-ocr', { id });
  }

  async dispatchExportJob(id: string): Promise<void> {
    await this.dispatch('/tasks/export', { id });
  }

  async dispatchInboxEvent(id: string, scheduleTime?: ITimestamp): Promise<void> {
    await this.dispatch('/tasks/process-inbox', { id }, scheduleTime);
  }

  async dispatchBatchEvent(
    phone: string,
    generation: number,
    scheduleTime?: ITimestamp,
  ): Promise<void> {
    await this.dispatch('/tasks/process-batch', { phone, generation }, scheduleTime);
  }

  async dispatchOutboxEvent(id: string): Promise<void> {
    await this.dispatch('/tasks/process-outbox', { id });
  }

  async dispatchRealtimeEvent(id: string): Promise<void> {
    await this.dispatch('/tasks/notifications', { id });
  }

  private async dispatch(
    path: string,
    body: Record<string, unknown>,
    scheduleTime?: ITimestamp,
  ): Promise<void> {
    const task: protos.google.cloud.tasks.v2.ITask = {
      httpRequest: {
        httpMethod: protos.google.cloud.tasks.v2.HttpMethod.POST,
        url: `${this.workerServiceUrl}${path}`,
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: this.config.serviceAccountEmail,
          audience: this.workerServiceUrl,
        },
      },
    };

    if (scheduleTime) {
      task.scheduleTime = scheduleTime;
    }

    const queueName =
      path === '/tasks/process-inbox' || path === '/tasks/process-batch'
        ? this.config.aiQueueName
        : path === '/tasks/process-outbox' || path === '/tasks/process-campaign'
          ? this.config.deliveryQueueName
          : path === '/tasks/process-ocr' || path === '/tasks/export'
            ? this.config.documentQueueName
            : undefined;
    const parent = queueName
      ? this.client.queuePath(this.config.projectId, this.config.location, queueName)
      : this.parent;
    // Durable records and reconciliation own retries; do not block ingress on SDK backoff.
    await this.client.createTask({ parent, task }, { timeout: 1000, retry: null });
  }
}

export function createBackgroundTaskDispatcher(): BackgroundTaskDispatcher | undefined {
  if (env.BACKGROUND_EXECUTION_BACKEND !== 'cloud_tasks') return undefined;

  return new CloudTasksDispatcher({
    projectId: env.GCP_PROJECT_ID!,
    location: env.GCP_LOCATION!,
    queueName: env.TASKS_QUEUE_NAME!,
    aiQueueName: env.TASKS_AI_QUEUE_NAME,
    deliveryQueueName: env.TASKS_DELIVERY_QUEUE_NAME,
    documentQueueName: env.TASKS_DOCUMENT_QUEUE_NAME,
    workerServiceUrl: env.WORKER_SERVICE_URL!,
    serviceAccountEmail: env.TASKS_SERVICE_ACCOUNT_EMAIL!,
  });
}
