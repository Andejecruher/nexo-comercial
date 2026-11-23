import { Router } from 'express';
import { PrecampanaAnalyticsController } from '../controllers/precampana-analytics.controller';
import { jwtMiddleware } from '../middlewares/jwt.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import type { PrismaService } from '../services/prisma.service';

export function createPrecampanaAnalyticsRouter(
  controller: PrecampanaAnalyticsController,
  prisma: PrismaService,
): Router {
  const router = Router();

  router.use(jwtMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get(
    '/precampana/dashboard',
    requirePermissions(prisma, ['indicadores_precampana.view'], 'all'),
    controller.dashboard,
  );
  router.get(
    '/precampana/filter-options',
    requirePermissions(prisma, ['indicadores_precampana.view'], 'all'),
    controller.filterOptions,
  );
  router.get(
    '/precampana/goals',
    requirePermissions(prisma, ['indicadores_precampana.view'], 'all'),
    controller.goals,
  );
  router.post(
    '/precampana/goals',
    requirePermissions(prisma, ['indicadores_precampana.create'], 'all'),
    controller.createGoal,
  );
  router.patch(
    '/precampana/goals/:id',
    requirePermissions(prisma, ['indicadores_precampana.update'], 'all'),
    controller.updateGoal,
  );
  router.patch(
    '/precampana/goals/:id/deactivate',
    requirePermissions(prisma, ['indicadores_precampana.update'], 'all'),
    controller.deactivateGoal,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
