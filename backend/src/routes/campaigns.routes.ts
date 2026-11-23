import { Router, raw, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { createCampaignSchema } from '../services/campaigns/campaign-contract';
import { CampaignMediaService } from '../services/campaigns/campaign-media.service';
import { CampaignService } from '../services/campaigns/campaign.service';
import { PrismaService } from '../services/prisma.service';
import { createBackgroundTaskDispatcher } from '../services/tasks/cloud-tasks-dispatcher.service';
import { AppError } from '../utils/app-error';
import { hasAllPermissions } from '../utils/authorization.util';
import { parseMultipartForm } from '../utils/multipart';

const route =
  (fn: (req: Request, res: Response) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const pageNumber = (value: unknown) => {
  const result = z.coerce.number().int().min(1).max(100000).default(1).safeParse(value);
  if (!result.success) throw AppError.badRequest('Página inválida');
  return result.data;
};

export function createCampaignsRouter(prisma: PrismaService): Router {
  const router = Router();
  const service = new CampaignService(prisma, createBackgroundTaskDispatcher());
  router.use(authMiddleware, requirePermissions(prisma, 'campanas_whatsapp.view'));
  router.get(
    '/',
    route(async (req, res) => {
      res.json(await service.list(pageNumber(req.query.page)));
    }),
  );
  router.post(
    '/media',
    requirePermissions(prisma, ['campanas_whatsapp.create', 'plantillas.view']),
    raw({ type: 'multipart/form-data', limit: '17mb' }),
    route(async (req, res) => {
      const form = parseMultipartForm(req);
      const input = z
        .object({
          name: z.string().trim().min(1).max(160),
          lineId: z.string().uuid(),
          templateId: z.string().regex(/^\d+$/).max(100),
        })
        .strict()
        .safeParse(form.fields);
      if (!input.success || !form.files.file || Object.keys(form.files).length !== 1)
        throw AppError.badRequest('Datos de adjunto inválidos');
      res
        .status(201)
        .json(
          await new CampaignMediaService(prisma).upload(input.data, req.user!.id, form.files.file),
        );
    }),
  );
  router.post(
    '/',
    requirePermissions(prisma, ['campanas_whatsapp.create', 'plantillas.view']),
    route(async (req, res) => {
      const parsed = createCampaignSchema.safeParse(req.body);
      const key = z.string().uuid().safeParse(req.get('Idempotency-Key'));
      if (!parsed.success)
        throw AppError.badRequest(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        );
      if (!key.success) throw AppError.badRequest('Idempotency-Key UUID requerido');
      // Citizen source needs the same permission as its selector endpoint.
      if (
        parsed.data.audience.source === 'citizen' &&
        !hasAllPermissions(req.user?.permissions ?? [], ['ciudadanos.view'])
      ) {
        throw AppError.forbidden('Necesitas permiso para consultar ciudadanos');
      }
      res.status(202).json(await service.create(parsed.data, req.user!.id, key.data));
    }),
  );
  router.get(
    '/:id',
    route(async (req, res) => {
      if (!z.string().uuid().safeParse(req.params.id).success)
        throw AppError.badRequest('ID inválido');
      res.json(await service.detail(req.params.id, pageNumber(req.query.page)));
    }),
  );
  return router;
}
