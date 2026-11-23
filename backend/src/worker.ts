import {
  DELIVERY_STATUS_CRON_RECONCILE_BATCH_SIZE,
  DeliveryStatusService,
} from './services/whatsapp/delivery-status.service';
import {
  MEDIA_CRON_RECONCILE_BATCH_SIZE,
  MessageMediaService,
} from './services/media/message-media.service';
import { TicketRepository } from './repositories/ticket.repository';
import { BULK_CRON_CHUNK_SIZE, BulkActionWorker } from './services/bulk/bulk-action-worker.service';
import { ConversationsService } from './services/conversations.service';
import { MessageService } from './services/message.service';
import { MessageRepository } from './repositories/message.repository';
import { DepartmentRepository } from './repositories/department.repository';
import { TicketService } from './services/tickets/ticket.service';
import { ConversationStateMachine } from './services/orchestrator/conversation-state-machine';
import { CampaignWorkerService } from './services/campaigns/campaign-worker.service';
import { logLlmSdkReadiness } from './ai/health/llm-sdk.readiness';
import { env } from './config/env.config';
import { InboxProcessorService } from './services/events/inbox-processor.service';
import { OutboxProcessorService } from './services/events/outbox-processor.service';
import { ExportProcessorService } from './services/exports/export-processor.service';
import { EXPORT_RECONCILE_BATCH_SIZE } from './services/exports/export-job.service';
import { PostgresRateLimiter } from './services/postgres-rate-limiter.service';
import { PrismaService } from './services/prisma.service';
import { ConversationRepository } from './repositories/conversation.repository';
import { RealtimeNotifier } from './services/realtime/realtime-notifier.service';
import { createRealtimeMetrics } from './services/realtime/realtime-observability.service';
import { PubSubRealtimeTransport } from './services/realtime/pubsub-realtime-transport.service';
import { createPubSubClient } from './services/realtime/pubsub.util';
import { createWorkerRealtimeRelay } from './services/realtime/realtime-runtime.factory';
import { reconcilePendingBackgroundTasks } from './services/tasks/background-task-reconciler.service';
import { createBackgroundTaskDispatcher } from './services/tasks/cloud-tasks-dispatcher.service';
import { WhatsAppLineConfigResolver } from './services/whatsapp/whatsapp-line-config.resolver';
import { WhatsAppProvider } from './services/whatsapp/whatsapp.provider';
import { createStructuredLogger } from './utils/structured-logger';
import { createWorkerApp } from './worker-app';

const prisma = new PrismaService();
const log = createStructuredLogger('worker');

/** Umbral de alerta: un handoff a departamento no debe seguir con IA activa 5 min después. */
const STUCK_DEPARTMENT_HANDOFF_THRESHOLD_MS = 5 * 60_000;

async function startWorker(): Promise<void> {
  await prisma.connect();

  await logLlmSdkReadiness();

  const taskDispatcher = createBackgroundTaskDispatcher();
  const campaignProcessor = new CampaignWorkerService(prisma, taskDispatcher);
  let stopCampaignWorker: (() => void) | undefined;
  const whatsappLineConfigResolver = new WhatsAppLineConfigResolver(prisma);
  const rateLimiter = new PostgresRateLimiter(prisma);
  const exportProcessor = new ExportProcessorService(prisma);
  const whatsappProvider = new WhatsAppProvider(rateLimiter, whatsappLineConfigResolver);

  const realtimeMetrics = createRealtimeMetrics('worker');
  const realtimeTransport = env.REALTIME_DURABLE_ENABLED
    ? new PubSubRealtimeTransport(
        createPubSubClient({ projectId: env.GCP_PROJECT_ID || undefined }),
      )
    : undefined;
  const realtimeNotifier = new RealtimeNotifier(realtimeTransport, env.REALTIME_DURABLE_ENABLED, {
    metrics: realtimeMetrics,
    prisma,
    immediate: env.REALTIME_IMMEDIATE_PUBLISH_ENABLED,
  });

  const outboxProcessor = new OutboxProcessorService(prisma, whatsappProvider, taskDispatcher, {
    pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    realtimeNotifier,
  });
  const messageMediaService = new MessageMediaService(prisma, whatsappProvider, realtimeNotifier);
  const deliveryStatusService = new DeliveryStatusService(
    prisma,
    new MessageRepository(prisma),
    realtimeNotifier,
  );
  const internalPollingEnabled = env.WORKERS_ENABLED && !env.DISABLE_INTERNAL_POLLING;
  const stopMessageMedia = internalPollingEnabled ? messageMediaService.start() : undefined;
  const stopDeliveryStatuses = internalPollingEnabled ? deliveryStatusService.start() : undefined;
  const inboxProcessor = new InboxProcessorService(
    prisma,
    whatsappProvider,
    outboxProcessor,
    realtimeNotifier,
    taskDispatcher,
    undefined,
    undefined,
    { pollIntervalMs: env.INBOX_POLL_INTERVAL_MS },
  );
  const realtimeRelayFactory = createWorkerRealtimeRelay({
    realtimeDurableEnabled: env.REALTIME_DURABLE_ENABLED,
    workersEnabled: env.WORKERS_ENABLED,
    transport: realtimeTransport,
    prisma,
    pollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    instanceId: `worker-${process.pid}`,
    metrics: realtimeMetrics,
  });
  let relayInterval: NodeJS.Timeout | undefined;
  let stopExportWorker: (() => void) | undefined;
  let exportReconcileInterval: NodeJS.Timeout | undefined;
  let attendanceReconcileInterval: NodeJS.Timeout | undefined;

  if (!internalPollingEnabled) {
    log('warn', 'worker.idle', undefined, {
      reason: env.WORKERS_ENABLED ? 'internal_polling_disabled' : 'workers_disabled',
    });
  } else if (env.BACKGROUND_EXECUTION_BACKEND === 'polling') {
    if (env.OUTBOX_POLLING_ENABLED) outboxProcessor.start();
    if (env.INBOX_POLLING_ENABLED) inboxProcessor.start();
    stopExportWorker = exportProcessor.startWorker();
    stopCampaignWorker = campaignProcessor.start();

    if (realtimeRelayFactory) {
      relayInterval = realtimeRelayFactory.start();
    }
  }

  const reconcileBackgroundTasks = () => reconcilePendingBackgroundTasks(prisma, taskDispatcher);
  if (internalPollingEnabled) {
    exportReconcileInterval = setInterval(() => {
      void exportProcessor.reconcile().catch((error: unknown) =>
        log('error', 'worker.export_reconcile_failed', undefined, {
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    }, env.EXPORT_RECONCILE_INTERVAL_MS);
    exportReconcileInterval.unref();
  }
  const conversationRepo = new ConversationRepository(prisma);
  const bulkMessageRepo = new MessageRepository(prisma);
  const bulkTickets = new TicketService(new TicketRepository(prisma), realtimeNotifier, prisma);
  const bulkWorker = new BulkActionWorker(
    prisma,
    new ConversationsService(
      conversationRepo,
      new ConversationStateMachine(conversationRepo),
      realtimeNotifier,
      prisma,
      bulkTickets,
      bulkMessageRepo,
      new DepartmentRepository(prisma),
    ),
    new MessageService(
      bulkMessageRepo,
      outboxProcessor,
      realtimeNotifier,
      prisma,
      whatsappProvider,
      bulkTickets,
    ),
    bulkTickets,
  );
  // Durable PostgreSQL queue is polled only while autonomous polling is enabled.
  if (internalPollingEnabled) bulkWorker.start();

  const reconcileCareMode = async (): Promise<{
    reconciled: number;
    stuckDepartmentHandoffs: number;
  }> => {
    const reconciled = await conversationRepo.reconcileAttendanceMode();
    if (reconciled > 0) {
      log('warn', 'worker.attendance_reconciled', undefined, { count: reconciled });
    }
    const stuck = await conversationRepo.findStuckDepartmentHandoffs(
      STUCK_DEPARTMENT_HANDOFF_THRESHOLD_MS,
    );
    if (stuck.length > 0) {
      log('warn', 'worker.attendance.stuck_department_handoffs', undefined, {
        count: stuck.length,
        conversationIds: stuck.map((conversation) => conversation.id),
      });
    }
    return { reconciled, stuckDepartmentHandoffs: stuck.length };
  };

  if (internalPollingEnabled) {
    attendanceReconcileInterval = setInterval(() => {
      void reconcileCareMode().catch((error: unknown) =>
        log('error', 'worker.attendance_reconcile_failed', undefined, {
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    }, env.ATTENDANCE_RECONCILE_INTERVAL_MS);
    attendanceReconcileInterval.unref();
  }
  if (internalPollingEnabled) {
    const reconciliation = await reconcileBackgroundTasks();
    if (reconciliation.attempted) {
      log('info', 'worker.tasks_reconciled', undefined, reconciliation);
    }
  }

  const app = createWorkerApp({
    prisma,
    inboxProcessor,
    outboxProcessor,
    realtimeRelay: realtimeRelayFactory?.relay,
    exportProcessor,
    campaignProcessor,
    syncMedia: () => messageMediaService.reconcile(MEDIA_CRON_RECONCILE_BATCH_SIZE),
    syncDeliveryStatus: () =>
      deliveryStatusService.reconcile(DELIVERY_STATUS_CRON_RECONCILE_BATCH_SIZE),
    processBulkActions: () => bulkWorker.tick(BULK_CRON_CHUNK_SIZE),
    cleanupExports: () => exportProcessor.reconcile(EXPORT_RECONCILE_BATCH_SIZE),
    reconcileCareMode,
    reconcileBackgroundTasks,
    healthMetadata: {
      workersEnabled: env.WORKERS_ENABLED,
      internalPollingDisabled: env.DISABLE_INTERNAL_POLLING,
      backgroundExecutionBackend: env.BACKGROUND_EXECUTION_BACKEND,
    },
  });

  const healthPort = process.env.PORT ? env.PORT : env.WORKER_HEALTH_PORT;
  const healthServer = app.listen(healthPort, () => {
    log('info', 'worker.started', undefined, {
      workerHealthPort: healthPort,
      workersEnabled: env.WORKERS_ENABLED,
      backgroundExecutionBackend: env.BACKGROUND_EXECUTION_BACKEND,
      logLevel: env.LOG_LEVEL,
      inboxPollIntervalMs: env.INBOX_POLL_INTERVAL_MS,
      outboxPollIntervalMs: env.OUTBOX_POLL_INTERVAL_MS,
    });
  });

  let isShuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (isShuttingDown) {
      log('debug', 'worker.shutdown_signal_ignored', undefined, { signal });
      return;
    }
    isShuttingDown = true;

    log('info', 'worker.stopping', undefined, { signal });
    inboxProcessor.stop();
    outboxProcessor.stop();
    if (relayInterval) {
      clearInterval(relayInterval);
    }
    if (exportReconcileInterval) clearInterval(exportReconcileInterval);
    if (attendanceReconcileInterval) clearInterval(attendanceReconcileInterval);
    stopExportWorker?.();
    stopCampaignWorker?.();
    stopMessageMedia?.();
    stopDeliveryStatuses?.();

    const forceExit = setTimeout(() => {
      log('error', 'worker.shutdown_timeout', undefined, {
        timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
      });
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    healthServer.close(() => {
      Promise.resolve()
        .then(() => bulkWorker.stop())
        .then(() => realtimeTransport?.dispose())
        .then(() => prisma.disconnect())
        .then(() => {
          clearTimeout(forceExit);
          log('info', 'worker.stopped');
          process.exit(0);
        })
        .catch((err: unknown) => {
          clearTimeout(forceExit);
          log('error', 'worker.shutdown_failed', undefined, {
            errorType: err instanceof Error ? err.name : 'UnknownError',
          });
          process.exit(1);
        });
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason: unknown) => {
  log('error', 'worker.unhandled_rejection', undefined, {
    errorType: reason instanceof Error ? reason.name : 'UnknownError',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  log('error', 'worker.uncaught_exception', undefined, {
    errorType: err.name,
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

startWorker().catch((err: unknown) => {
  log('error', 'worker.start_failed', undefined, {
    errorType: err instanceof Error ? err.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
