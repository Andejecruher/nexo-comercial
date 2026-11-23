/**
 * Rutas de administración de IA.
 * Base: /api/v1/admin/ai
 * Acceso: permisos ai.view + ai.create (por el seed, solo SUPER_ADMIN los posee).
 */
import { Router } from 'express';
import { AdminAiController } from '../controllers/admin-ai.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import type { PrismaService } from '../services/prisma.service';

export function createAdminAiRouter(prisma: PrismaService): Router {
  const router = Router();
  const ctrl = new AdminAiController(prisma);

  // Todas las rutas requieren auth + permisos ai.view y ai.create.
  // Se usa requirePermissions (no checkRole) para mantener el shape uniforme de errores
  // gestionado por errorHandler global: { success: false, error, message }.
  router.use(authMiddleware, requirePermissions(prisma, ['ai.view', 'ai.create'], 'all'));

  /* eslint-disable @typescript-eslint/no-misused-promises */

  // ── Agents ──────────────────────────────────────────────────────────────────
  router.get('/agents', ctrl.listAgents);
  router.post('/agents', ctrl.createAgent);
  router.get('/agents/:id', ctrl.getAgent);
  router.get('/agents/:id/detail', ctrl.getAgentDetail);
  router.put('/agents/:id/topics', ctrl.assignAgentTopics);
  router.patch('/agents/:id', ctrl.updateAgent);
  router.delete('/agents/:id', ctrl.deleteAgent);

  // ── Tools ────────────────────────────────────────────────────────────────────
  router.get('/tools', ctrl.listTools);
  router.post('/tools', ctrl.createTool);
  router.get('/tools/:id', ctrl.getTool);
  router.patch('/tools/:id', ctrl.updateTool);
  router.delete('/tools/:id', ctrl.deleteTool);

  // ── Topics ───────────────────────────────────────────────────────────────────
  router.get('/topics', ctrl.listTopics);
  router.post('/topics', ctrl.createTopic);
  router.get('/topics/:id', ctrl.getTopic);
  router.patch('/topics/:id', ctrl.updateTopic);
  router.delete('/topics/:id', ctrl.deleteTopic);
  router.post('/topics/:id/tools', ctrl.assignTopicTools);

  // ── Prompts ──────────────────────────────────────────────────────────────────
  router.get('/prompts', ctrl.listPrompts);
  router.post('/prompts', ctrl.createPrompt);
  router.get('/prompts/:id', ctrl.getPrompt);
  router.patch('/prompts/:id', ctrl.updatePrompt);
  router.delete('/prompts/:id', ctrl.deletePrompt);
  router.post('/prompts/:id/activate', ctrl.activatePrompt);

  // ── Lines ────────────────────────────────────────────────────────────────────
  router.get('/lines', ctrl.listLines);
  router.post('/lines', ctrl.createLine);
  router.get('/lines/:id', ctrl.getLine);
  router.patch('/lines/:id', ctrl.updateLine);

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
