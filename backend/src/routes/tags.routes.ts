import { Router } from 'express';
import { TagsController } from '../controllers/tags.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { paginate } from '../middlewares/pagination';
import type { AuditService } from '../services/audit.service';
import type { PrismaService } from '../services/prisma.service';
import type { TagsService } from '../services/tags.service';

export function createTagsRouter(
  tagsService: TagsService,
  audit: AuditService,
  prisma: PrismaService,
): Router {
  const router = Router();
  const ctrl = new TagsController(tagsService, audit);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get('/tags', requirePermissions(prisma, ['etiquetas.view'], 'all'), paginate(), ctrl.list);

  router.post('/tags', requirePermissions(prisma, ['etiquetas.create'], 'all'), ctrl.create);
  router.patch('/tags/:id', requirePermissions(prisma, ['etiquetas.update'], 'all'), ctrl.update);
  router.delete('/tags/:id', requirePermissions(prisma, ['etiquetas.delete'], 'all'), ctrl.remove);

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
