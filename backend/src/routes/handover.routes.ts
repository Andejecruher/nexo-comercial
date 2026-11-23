/**
 * Handover routes — gestión de handover bot↔humano.
 * Requiere JWT auth + permiso conversaciones.update.
 */
import { Router } from 'express';
import { HandoverController } from '../controllers/handover.controller';
import { jwtMiddleware } from '../middlewares/jwt.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import type { PrismaService } from '../services/prisma.service';

export function createHandoverRouter(
  controller: HandoverController,
  prisma: PrismaService,
): Router {
  const router = Router();

  router.use(jwtMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.post(
    '/take',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.take,
  );
  router.post(
    '/release',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.release,
  );
  router.post(
    '/escalate',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.escalate,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
