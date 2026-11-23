import {
  Router,
  raw,
  type RequestHandler,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions } from '../middlewares/permission.middleware';
import type { PrismaService } from '../services/prisma.service';
import { TemplateManagementService } from '../services/templates/template-management.service';
import { TemplateStatusService } from '../services/templates/template-status.service';
import { templateInputSchema } from '../services/templates/template.schemas';
import { parseMultipartForm } from '../utils/multipart';
import { AppError, ValidationError } from '../utils/app-error';

function parseInput(body: unknown) {
  const result = templateInputSchema.safeParse(body);
  if (!result.success)
    throw new ValidationError(
      result.error.issues.map((i) => i.message).join('; '),
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  return result.data;
}
const route =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
export function createTemplatesRouter(prisma: PrismaService): Router {
  const router = Router();
  const service = new TemplateManagementService(prisma);
  const updates = new TemplateStatusService(prisma);
  router.use(
    authMiddleware,
    requireAnyPermission(prisma, ['plantillas.view', 'conversaciones.update']),
  );
  router.get(
    '/lines',
    route(async (_req, res) => {
      res.json(await service.lines());
    }),
  );
  router.get(
    '/stream',
    route(async (req, res) => {
      if (typeof req.query.lineId !== 'string') throw AppError.badRequest('lineId requerido');
      const config = await service.config(req.query.lineId);
      const from = req.get('Last-Event-ID') ?? req.query.cursor;
      if (
        typeof from !== 'string' ||
        !/^\d{1,20}$/.test(from) ||
        BigInt(from) > 9223372036854775807n
      )
        throw AppError.badRequest('Cursor inválido');
      let cursor = from;
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
      res.write(': connected\n\n');
      const cleanup = () => {
        closed = true;
        if (timer) clearTimeout(timer);
        clearTimeout(lifetime);
      };
      // Periodically reconnect to recheck access permissions and JWT expiry.
      const lifetime = setTimeout(() => {
        cleanup();
        res.end();
      }, 60_000);
      res.on('close', cleanup);
      const poll = async () => {
        try {
          const events = await updates.since(config.businessAccountId!, cursor);
          if (closed) return;
          for (const event of events) {
            if (
              !res.write(
                `id: ${event.id}\nevent: template_status_changed\ndata: ${JSON.stringify(event)}\n\n`,
              )
            ) {
              cleanup();
              res.end();
              return;
            }
            cursor = event.id;
          }
          res.write(': heartbeat\n\n');
          timer = setTimeout(
            () => {
              void poll();
            },
            events.length === 100 ? 0 : 2000,
          );
        } catch {
          cleanup();
          res.end();
        }
      };
      void poll();
    }),
  );
  router.post(
    '/:lineId/samples',
    requirePermissions(prisma, ['plantillas.create', 'plantillas.update'], 'any'),
    raw({ type: 'multipart/form-data', limit: '17mb' }),
    route(async (req, res) => {
      const file = parseMultipartForm(req).files.file;
      if (!file) throw AppError.badRequest('Archivo de muestra requerido');
      const controller = new AbortController();
      const disconnect = () => controller.abort();
      res.once('close', disconnect);
      try {
        const result = await service.uploadSample(req.params.lineId, file, controller.signal);
        if (!res.destroyed) res.json(result);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        res.off('close', disconnect);
      }
    }),
  );
  router.get(
    '/:lineId',
    route(async (req, res) => {
      const config = await service.config(req.params.lineId);
      const cursor = await updates.cursor(config.businessAccountId!);
      const filters = z
        .object({
          name: z.string().trim().max(512).optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        })
        .safeParse(req.query);
      if (!filters.success) throw AppError.badRequest('Filtros de plantillas inválidos');
      const page = await service.list(
        req.params.lineId,
        typeof req.query.after === 'string' ? req.query.after : undefined,
        filters.data,
      );
      res.json({ ...page, cursor });
    }),
  );
  router.post(
    '/:lineId',
    requirePermissions(prisma, 'plantillas.create'),
    route(async (req, res) => {
      res.status(201).json(await service.create(req.params.lineId, parseInput(req.body)));
    }),
  );
  router.post(
    '/:lineId/:templateId',
    requirePermissions(prisma, 'plantillas.update'),
    route(async (req, res) => {
      res.json(await service.edit(req.params.lineId, req.params.templateId, parseInput(req.body)));
    }),
  );
  router.delete(
    '/:lineId',
    requirePermissions(prisma, 'plantillas.delete'),
    route(async (req, res) => {
      if (typeof req.query.name !== 'string') throw AppError.badRequest('name requerido');
      res.json(await service.remove(req.params.lineId, req.query.name));
    }),
  );
  router.get(
    '/:lineId/:templateId/analytics',
    route(async (req, res) => {
      res.json(await service.analytics(req.params.lineId, req.params.templateId));
    }),
  );
  return router;
}
