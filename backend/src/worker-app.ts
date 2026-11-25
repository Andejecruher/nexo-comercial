import express, { Express, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { InboxProcessorService } from './services/events/inbox-processor.service';
import { OutboxProcessorService } from './services/events/outbox-processor.service';
import { PrismaService } from './services/prisma.service';
import { RealtimeOutboxRelay } from './services/realtime/realtime-outbox-relay.service';
import { BackgroundTaskReconciliationResult } from './services/tasks/background-task-reconciler.service';
import { BackgroundTaskResult } from './services/tasks/cloud-tasks-dispatcher.service';

type ExportProcessor = { processJobById(id: string): Promise<BackgroundTaskResult> };
type CronTask = () => Promise<unknown>;

const taskBodySchema = z.object({ id: z.string().uuid() }).strict();
const batchTaskBodySchema = z
  .object({
    phone: z.string().trim().min(1).max(30).regex(/^\d+$/, 'phone debe ser solo dígitos'),
    generation: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Errores que reintentar no puede arreglar. Cloud Tasks reintenta TODO lo que
 * no sea 2xx, así que devolver 4xx/5xx para un error permanente quema el
 * presupuesto de reintentos entero sin chance de éxito. Un payload corrupto o
 * un id con formato inválido se responde 2xx para que la tarea muera y el
 * evento quede observable, en lugar de rebotar hasta el dead-letter.
 */
function isPermanentTaskError(error: unknown): boolean {
  if (error instanceof ZodError) return true;
  if (!(error instanceof Error)) return false;

  // Violación de contrato interna (p. ej. un id que no es UUID) — no es transitorio.
  return error.name === 'TypeError' || /^Invalid conversationId/.test(error.message);
}

/**
 * Violación de clave única. Ojo: en `$queryRaw` Prisma NO lanza P2002 (ese
 * código es del query builder); sube `P2010` con el código de Postgres anidado
 * en `meta.code`, y para un unique violation ese código es `23505`. Detectar
 * solo P2002 no atraparía nada en una sentencia cruda.
 */
function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; meta?: { code?: string } } | null;
  return err?.code === 'P2002' || err?.meta?.code === '23505';
}

type WorkerAppDependencies = {
  prisma: PrismaService;
  inboxProcessor: InboxProcessorService;
  outboxProcessor: OutboxProcessorService;
  realtimeRelay?: RealtimeOutboxRelay;
  exportProcessor?: ExportProcessor;
  campaignProcessor?: { processBatch(id: string): Promise<BackgroundTaskResult> };
  syncMedia: CronTask;
  syncDeliveryStatus: CronTask;
  processBulkActions: CronTask;
  cleanupExports: CronTask;
  reconcileCareMode: CronTask;
  reconcileBackgroundTasks: () => Promise<BackgroundTaskReconciliationResult>;
  healthMetadata: Record<string, unknown>;
};

function sendLiveness(res: Response, healthMetadata: Record<string, unknown>): void {
  res.status(200).json({
    status: 'ok',
    ...healthMetadata,
    ts: new Date().toISOString(),
  });
}

export function createWorkerApp(deps: WorkerAppDependencies): Express {
  const app = express();
  app.use(express.json({ limit: '16kb' }));

  // Process liveness for Cloud Run, compose, and GitHub smoke. No app-level
  // auth: Cloud Run IAM still requires an OIDC Bearer on the private service;
  // Express ignores Authorization so a valid (or absent) header cannot 404.
  const liveness = (_req: Request, res: Response): void => {
    sendLiveness(res, deps.healthMetadata);
  };
  // Google Frontend swallows the literal `/healthz` path on run.app URLs, so
  // probes that cross the edge must use `/ready`. `/healthz` stays for Compose
  // and other checks that reach the container port directly.
  app.get('/healthz', liveness);
  app.get('/ready', liveness);

  // Authentication is enforced by private Cloud Run ingress plus IAM/OIDC.
  // Cloud Tasks retries every non-2xx response, including the 4xx responses below.
  registerTaskRoute(app, '/tasks/process-inbox', (id) => deps.inboxProcessor.processEventById(id));
  registerTaskRoute(app, '/tasks/process-outbox', (id) =>
    deps.outboxProcessor.processEventById(id),
  );
  registerBatchTaskRoute(app, (phone, generation) =>
    deps.inboxProcessor.processBatch(phone, generation),
  );
  registerTaskRoute(app, '/tasks/notifications', (id) =>
    deps.realtimeRelay
      ? deps.realtimeRelay.processEventById(id)
      : Promise.reject(new Error('Durable realtime relay is disabled')),
  );
  if (deps.exportProcessor) {
    registerTaskRoute(app, '/tasks/export', (id) => deps.exportProcessor!.processJobById(id));
  }
  if (deps.campaignProcessor) {
    registerTaskRoute(app, '/tasks/process-campaign', (id) =>
      deps.campaignProcessor!.processBatch(id),
    );
  }
  registerCronRoute(app, '/tasks/cron/sync-media', deps.syncMedia);
  registerCronRoute(app, '/tasks/cron/sync-delivery-status', deps.syncDeliveryStatus);
  registerCronRoute(app, '/tasks/cron/process-bulk-actions', deps.processBulkActions);
  registerCronRoute(app, '/tasks/cron/cleanup-exports', deps.cleanupExports);
  registerCronRoute(app, '/tasks/cron/reconcile-care-mode', deps.reconcileCareMode);
  registerReconcileRoute(app, deps.reconcileBackgroundTasks);

  return app;
}

function registerCronRoute(app: Express, path: string, task: CronTask): void {
  app.post(path, (_req: Request, res: Response): void => {
    void (async () => {
      try {
        await task();
        res.status(200).json({ status: 'completed' });
      } catch (error: unknown) {
        console.error(`[${path}] processing failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ status: 'processing_failed' });
      }
    })();
  });
}

function registerBatchTaskRoute(
  app: Express,
  processBatch: (phone: string, generation: number) => Promise<BackgroundTaskResult>,
): void {
  app.post('/tasks/process-batch', (req: Request, res: Response): void => {
    void (async () => {
      try {
        const { phone, generation } = batchTaskBodySchema.parse(req.body);
        const result = await processBatch(phone, generation);
        if (result === 'not_found') {
          res.status(200).json({ status: 'not_found' });
          return;
        }
        res.status(200).json({ status: result });
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          // Defensa en profundidad. El claim del lote es un upsert condicional
          // (`ON CONFLICT ... DO UPDATE ... WHERE`), así que la PK no debería
          // reventar nunca; si aparece, la clave ya está tomada y el trabajo
          // está en manos de otro worker. Cerrar la tarea en 2xx evita que
          // Cloud Tasks la reintente hasta el dead-letter.
          console.warn('[tasks/process-batch] duplicate claim, task will not be retried', {
            error: error instanceof Error ? error.message : String(error),
          });
          res.status(200).json({ status: 'duplicate' });
          return;
        }
        if (isPermanentTaskError(error)) {
          console.warn('[tasks/process-batch] permanent error, task will not be retried', {
            error: error instanceof Error ? error.message : String(error),
          });
          res.status(200).json({ status: 'invalid_payload' });
          return;
        }
        console.error('[tasks/process-batch] processing failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ status: 'processing_failed' });
      }
    })();
  });
}

function registerReconcileRoute(
  app: Express,
  reconcile: () => Promise<BackgroundTaskReconciliationResult>,
): void {
  app.post('/tasks/reconcile', (_req, res): void => {
    void (async () => {
      try {
        const result = await reconcile();
        res.status(result.failed > 0 ? 500 : 200).json({
          status: result.failed > 0 ? 'dispatch_failed' : 'reconciled',
          ...result,
        });
      } catch {
        res.status(500).json({ status: 'reconciliation_failed' });
      }
    })();
  });
}

function registerTaskRoute(
  app: Express,
  path: string,
  processById: (id: string) => Promise<BackgroundTaskResult>,
): void {
  app.post(path, (req: Request, res: Response): void => {
    void (async () => {
      try {
        const { id } = taskBodySchema.parse(req.body);
        const result = await processById(id);
        if (result === 'not_found') {
          // La fila ya no existe (borrada o nunca commiteada). Reintentar no la
          // resurrected, así que se responde 2xx para cerrar la tarea.
          res.status(200).json({ status: 'not_found' });
          return;
        }
        res.status(200).json({ status: result });
      } catch (error: unknown) {
        if (isPermanentTaskError(error)) {
          console.warn(`[${path}] permanent error, task will not be retried`, {
            error: error instanceof Error ? error.message : String(error),
          });
          res.status(200).json({ status: 'invalid_payload' });
          return;
        }
        console.error(`[${path}] processing failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ status: 'processing_failed' });
      }
    })();
  });
}
