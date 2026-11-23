import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { jwtMiddleware } from '../middlewares/jwt.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import type { PrismaService } from '../services/prisma.service';

export function createAnalyticsRouter(
  controller: AnalyticsController,
  prisma: PrismaService,
): Router {
  const router = Router();

  router.use(jwtMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get(
    '/dashboard',
    requirePermissions(prisma, ['analytics.view'], 'all'),
    controller.dashboard,
  );
  router.get('/tickets', requirePermissions(prisma, ['analytics.view'], 'all'), controller.tickets);
  router.get('/agents', requirePermissions(prisma, ['analytics.view'], 'all'), controller.agents);
  router.get(
    '/departments',
    requirePermissions(prisma, ['analytics.view'], 'all'),
    controller.departments,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
