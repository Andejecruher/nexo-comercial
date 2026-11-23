import { Router } from 'express';
import { CitizensController } from '../controllers/citizens.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { paginate } from '../middlewares/pagination';
import type { AuditService } from '../services/audit.service';
import type { CitizensService } from '../services/citizens.service';
import type { PrismaService } from '../services/prisma.service';
import type { TicketService } from '../services/tickets/ticket.service';

export function createCitizensRouter(
  citizensService: CitizensService,
  audit: AuditService,
  prisma: PrismaService,
  ticketService: TicketService,
): Router {
  const router = Router();
  const ctrl = new CitizensController(citizensService, audit, ticketService);

  router.use(authMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get('/', requirePermissions(prisma, ['ciudadanos.view'], 'all'), paginate(), ctrl.list);

  router.post('/', requirePermissions(prisma, ['ciudadanos.create'], 'all'), ctrl.create);
  router.get('/:id', requirePermissions(prisma, ['ciudadanos.view'], 'all'), ctrl.get);
  router.patch('/:id', requirePermissions(prisma, ['ciudadanos.update'], 'all'), ctrl.update);
  router.delete('/:id', requirePermissions(prisma, ['ciudadanos.delete'], 'all'), ctrl.remove);

  router.post(
    '/:id/tags/:tagId',
    requirePermissions(prisma, ['ciudadanos.update'], 'all'),
    ctrl.assignTag,
  );
  router.delete(
    '/:id/tags/:tagId',
    requirePermissions(prisma, ['ciudadanos.update'], 'all'),
    ctrl.removeTag,
  );
  router.post(
    '/tags/bulk',
    requirePermissions(prisma, ['ciudadanos.update'], 'all'),
    ctrl.bulkTagAssignment,
  );

  router.get('/:id/profile', requirePermissions(prisma, ['ciudadanos.view'], 'all'), ctrl.profile);
  router.get(
    '/:id/tickets',
    requirePermissions(prisma, ['ciudadanos.view'], 'all'),
    ctrl.recentTickets,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
