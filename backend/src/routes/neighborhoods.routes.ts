import { Router } from 'express';
import { NeighborhoodsController } from '../controllers/neighborhoods.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { paginate } from '../middlewares/pagination';
import type { AuditService } from '../services/audit.service';
import type { NeighborhoodsService } from '../services/neighborhoods.service';
import type { PrismaService } from '../services/prisma.service';

export function createNeighborhoodsRouter(
  neighborhoodsService: NeighborhoodsService,
  audit: AuditService,
  prisma: PrismaService,
): Router {
  const router = Router();
  const ctrl = new NeighborhoodsController(neighborhoodsService, audit);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get(
    '/neighborhoods',
    requirePermissions(prisma, ['barrios.view'], 'all'),
    paginate(),
    ctrl.list,
  );

  router.post('/neighborhoods', requirePermissions(prisma, ['barrios.create'], 'all'), ctrl.create);
  router.patch(
    '/neighborhoods/:id',
    requirePermissions(prisma, ['barrios.update'], 'all'),
    ctrl.update,
  );
  router.delete(
    '/neighborhoods/:id',
    requirePermissions(prisma, ['barrios.delete'], 'all'),
    ctrl.remove,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
