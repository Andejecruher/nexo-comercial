import { Router } from 'express';
import { CoordinatorController } from '../controllers/coordinator.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { validate } from '../middlewares/validation';
import type { AuditService } from '../services/audit.service';
import type { CoordinatorService } from '../services/coordinator.service';
import {
  CoordinatorIdParamSchema,
  CoordinatorListQuerySchema,
  CreateCoordinatorSchema,
  UpdateCoordinatorSchema,
} from '../services/coordinator.schemas';
import type { PrismaService } from '../services/prisma.service';

export function createCoordinatorRouter(
  service: CoordinatorService,
  audit: AuditService,
  prisma: PrismaService,
): Router {
  const router = Router();
  const ctrl = new CoordinatorController(service, audit);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get(
    '/',
    requirePermissions(prisma, 'coordinadores.view'),
    validate({ query: CoordinatorListQuerySchema }),
    ctrl.list,
  );
  router.post(
    '/',
    requirePermissions(prisma, 'coordinadores.create'),
    validate({ body: CreateCoordinatorSchema }),
    ctrl.create,
  );
  router.get(
    '/:id',
    requirePermissions(prisma, 'coordinadores.view'),
    validate({ params: CoordinatorIdParamSchema }),
    ctrl.getById,
  );
  router.patch(
    '/:id',
    requirePermissions(prisma, 'coordinadores.update'),
    validate({ params: CoordinatorIdParamSchema, body: UpdateCoordinatorSchema }),
    ctrl.update,
  );
  router.delete(
    '/:id',
    requirePermissions(prisma, 'coordinadores.delete'),
    validate({ params: CoordinatorIdParamSchema }),
    ctrl.delete,
  );
  router.post(
    '/:id/reinvite',
    requirePermissions(prisma, 'coordinadores.update'),
    validate({ params: CoordinatorIdParamSchema }),
    ctrl.reinvite,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
