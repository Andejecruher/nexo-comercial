import { Router } from 'express';
import { DepartmentsController } from '../controllers/departments.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { paginate } from '../middlewares/pagination';
import type { AuditService } from '../services/audit.service';
import type { DepartmentsService } from '../services/departments.service';
import type { PrismaService } from '../services/prisma.service';

export function createDepartmentsRouter(
  departmentsService: DepartmentsService,
  audit: AuditService,
  prisma: PrismaService,
): Router {
  const router = Router();
  const ctrl = new DepartmentsController(departmentsService, audit);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get(
    '/departments',
    requirePermissions(prisma, ['departamentos.view'], 'all'),
    paginate(),
    ctrl.list,
  );
  router.get(
    '/departments/:slug/availability',
    requirePermissions(prisma, ['departamentos.view'], 'all'),
    ctrl.availability,
  );

  router.post(
    '/departments',
    requirePermissions(prisma, ['departamentos.create'], 'all'),
    ctrl.create,
  );
  router.patch(
    '/departments/:id',
    requirePermissions(prisma, ['departamentos.update'], 'all'),
    ctrl.update,
  );
  router.delete(
    '/departments/:id',
    requirePermissions(prisma, ['departamentos.delete'], 'all'),
    ctrl.remove,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
