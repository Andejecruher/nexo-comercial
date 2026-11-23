/**
 * Rutas de consulta de agentes IA para la bandeja de conversaciones (inbox).
 * Base: /api/v1/ai-agents
 * Acceso: mismo permiso que el listado de conversaciones (conversaciones.view o tickets.view).
 * No reusar el permiso de /admin/ai: este endpoint es de lectura operativa, no de gestión.
 */
import { Router } from 'express';
import { AiAgentsController } from '../controllers/ai-agents.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireAnyPermission } from '../middlewares/permission.middleware';
import { AiAgentsService } from '../services/ai-agents.service';
import type { PrismaService } from '../services/prisma.service';

export function createAiAgentsRouter(prisma: PrismaService): Router {
  const router = Router();
  const ctrl = new AiAgentsController(new AiAgentsService(prisma));

  router.use(authMiddleware, requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']));

  /* eslint-disable @typescript-eslint/no-misused-promises */

  router.get('/', ctrl.list);

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
