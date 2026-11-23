import { Router } from 'express';
import { NotificationsController } from '../controllers/notifications.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import type { PrismaService } from '../services/prisma.service';

export function createNotificationsRouter(prisma: PrismaService): Router {
  const router = Router();
  const ctrl = new NotificationsController(prisma);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */
  router.get('/notifications', ctrl.list);
  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
