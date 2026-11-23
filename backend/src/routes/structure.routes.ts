import { Router } from 'express';
import { StructureController } from '../controllers/structure.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { validate } from '../middlewares/validation';
import type { AuditService } from '../services/audit.service';
import {
  CreateStructureSchema,
  StructureIdParamSchema,
  StructureListQuerySchema,
  type StructureService,
  UpdateStructureSchema,
} from '../services/structure.service';
import type { PrismaService } from '../services/prisma.service';

export function createStructureRouter(
  service: StructureService,
  audit: AuditService,
  prisma: PrismaService,
): Router {
  const router = Router();
  const ctrl = new StructureController(service, audit);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get(
    '/',
    requirePermissions(prisma, 'coordinadores.view'),
    validate({ query: StructureListQuerySchema }),
    ctrl.list,
  );
  router.post(
    '/',
    requirePermissions(prisma, 'coordinadores.create'),
    validate({ body: CreateStructureSchema }),
    ctrl.create,
  );
  router.get(
    '/:id',
    requirePermissions(prisma, 'coordinadores.view'),
    validate({ params: StructureIdParamSchema }),
    ctrl.getById,
  );
  router.patch(
    '/:id',
    requirePermissions(prisma, 'coordinadores.update'),
    validate({ params: StructureIdParamSchema, body: UpdateStructureSchema }),
    ctrl.update,
  );
  router.delete(
    '/:id',
    requirePermissions(prisma, 'coordinadores.delete'),
    validate({ params: StructureIdParamSchema }),
    ctrl.delete,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
