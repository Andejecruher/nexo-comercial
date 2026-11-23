/**
 * Messages routes — envío de mensajes outbound y gestión de attachments.
 * Requiere JWT auth + permiso conversaciones.update.
 */
import { Router } from 'express';
import { MessagesController } from '../controllers/messages.controller';
import { jwtMiddleware } from '../middlewares/jwt.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import type { PrismaService } from '../services/prisma.service';

export function createMessagesRouter(
  controller: MessagesController,
  prisma: PrismaService,
): Router {
  const router = Router();

  router.use(jwtMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.post(
    '/text',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.sendText,
  );
  router.post(
    '/:id/attachments',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.addAttachment,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
