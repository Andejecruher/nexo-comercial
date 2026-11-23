import { Router } from 'express';
import { TicketsController } from '../controllers/tickets.controller';
import { jwtMiddleware } from '../middlewares/jwt.middleware';
import { paginate } from '../middlewares/pagination';
import { requireAnyPermission } from '../middlewares/permission.middleware';
import type { PrismaService } from '../services/prisma.service';

export function createTicketsRouter(controller: TicketsController, prisma: PrismaService): Router {
  const router = Router();

  router.use(jwtMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  // Listado CRM de tickets (casos), paginado y con filtros.
  router.get(
    '/',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    controller.list,
  );

  // Detalle de un ticket (incluye folio + conversación)
  router.get(
    '/:ticketId',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    controller.getTicket,
  );

  // Mensajes aislados a un ticket (vista "Detalles del Ticket")
  router.get(
    '/:ticketId/messages',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    paginate(),
    controller.getTicketMessages,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
