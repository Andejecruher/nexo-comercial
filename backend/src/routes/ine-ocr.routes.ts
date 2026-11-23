import express, { Router } from 'express';
import { env } from '../config/env.config';
import { IneOcrController } from '../controllers/ine-ocr.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { requireRole } from '../middlewares/rbac';
import { requireScope, scopeMiddleware } from '../middlewares/scope.middleware';
import type { AuditService } from '../services/audit.service';
import type { IneOcrService } from '../services/ine/ine-ocr.service';
import type { PrismaService } from '../services/prisma.service';
import { PromovidoService } from '../services/promovido.service';
import type { ScopeService } from '../services/scope.service';

// El workflow de escaneo/carga de INE no tiene módulo propio en el catálogo
// de permisos: se mantiene el guard por rol (mismo criterio que system.routes).
const WORKFLOW_ROLES = ['SUPER_ADMIN', 'COORDINADOR'] as const;

export function createIneOcrRouter(
  service: IneOcrService,
  prisma: PrismaService,
  audit: AuditService,
  scopeService: ScopeService,
): Router {
  const router = Router();
  const promovidoService = new PromovidoService(prisma);
  const ctrl = new IneOcrController(service, promovidoService, audit);
  router.use(authMiddleware);
  router.use(scopeMiddleware(scopeService));

  /* eslint-disable @typescript-eslint/no-misused-promises */

  // ── Workflow INE OCR (sin módulo de permiso: guard por rol) ────────────────
  router.post(
    '/uploads',
    requireRole([...WORKFLOW_ROLES]),
    express.raw({ type: 'multipart/form-data', limit: env.INE_UPLOAD_MAX_BYTES * 2 + 1024 * 1024 }),
    ctrl.createUpload,
  );
  router.get('/uploads/:id', requireRole([...WORKFLOW_ROLES]), ctrl.getUpload);
  router.patch('/uploads/:id/review', requireRole([...WORKFLOW_ROLES]), ctrl.review);
  router.post('/uploads/:id/confirm', requireRole([...WORKFLOW_ROLES]), ctrl.confirm);
  router.post('/uploads/:id/retry', requireRole([...WORKFLOW_ROLES]), ctrl.retry);
  router.post(
    '/uploads/:id/section-candidates',
    requireRole([...WORKFLOW_ROLES]),
    ctrl.sectionCandidates,
  );
  router.post('/neighborhood-match', requireRole([...WORKFLOW_ROLES]), ctrl.neighborhoodMatch);
  router.get('/uploads/:id/candidates', requireRole([...WORKFLOW_ROLES]), ctrl.candidates);

  // ── Promovidos (módulo promovidos) ──────────────────────────────────────────
  router.get(
    '/promovidos',
    requirePermissions(prisma, ['promovidos.view'], 'all'),
    requireScope('admin', 'coordinator', 'leader'),
    ctrl.listPromovidos,
  );
  router.get(
    '/promovidos/check-voter-key',
    requirePermissions(prisma, ['promovidos.view'], 'all'),
    requireScope('admin', 'coordinator', 'leader'),
    ctrl.checkVoterKey,
  );
  router.post(
    '/promovidos',
    requirePermissions(prisma, ['promovidos.create'], 'all'),
    requireScope('admin', 'coordinator', 'leader'),
    ctrl.createPromovido,
  );
  router.get(
    '/promovidos/:id',
    requirePermissions(prisma, ['promovidos.view'], 'all'),
    requireScope('admin', 'coordinator', 'leader'),
    ctrl.getPromovido,
  );
  router.patch(
    '/promovidos/:id',
    requirePermissions(prisma, ['promovidos.update'], 'all'),
    requireScope('admin', 'coordinator', 'leader'),
    ctrl.updatePromovido,
  );

  // ── Catálogo electoral (módulo catalogo_electoral) ──────────────────────────
  router.get(
    '/catalog/states',
    requirePermissions(prisma, ['catalogo_electoral.view'], 'all'),
    ctrl.states,
  );
  router.get(
    '/catalog/districts',
    requirePermissions(prisma, ['catalogo_electoral.view'], 'all'),
    ctrl.districts,
  );
  router.get(
    '/catalog/sections',
    requirePermissions(prisma, ['catalogo_electoral.view'], 'all'),
    ctrl.sections,
  );
  router.get(
    '/catalog/leaders',
    requirePermissions(prisma, ['lideres.view'], 'all'),
    requireScope('admin', 'coordinator', 'leader'),
    ctrl.leaders,
  );
  router.post(
    '/catalog/states',
    requirePermissions(prisma, ['catalogo_electoral.create'], 'all'),
    ctrl.createState,
  );
  router.patch(
    '/catalog/states/:id',
    requirePermissions(prisma, ['catalogo_electoral.update'], 'all'),
    ctrl.updateState,
  );
  router.delete(
    '/catalog/states/:id',
    requirePermissions(prisma, ['catalogo_electoral.delete'], 'all'),
    ctrl.deactivateState,
  );
  router.post(
    '/catalog/districts',
    requirePermissions(prisma, ['catalogo_electoral.create'], 'all'),
    ctrl.createDistrict,
  );
  router.patch(
    '/catalog/districts/:id',
    requirePermissions(prisma, ['catalogo_electoral.update'], 'all'),
    ctrl.updateDistrict,
  );
  router.delete(
    '/catalog/districts/:id',
    requirePermissions(prisma, ['catalogo_electoral.delete'], 'all'),
    ctrl.deactivateDistrict,
  );
  router.post(
    '/catalog/sections',
    requirePermissions(prisma, ['catalogo_electoral.create'], 'all'),
    ctrl.createSection,
  );
  router.patch(
    '/catalog/sections/:id',
    requirePermissions(prisma, ['catalogo_electoral.update'], 'all'),
    ctrl.updateSection,
  );
  router.delete(
    '/catalog/sections/:id',
    requirePermissions(prisma, ['catalogo_electoral.delete'], 'all'),
    ctrl.deactivateSection,
  );
  router.post(
    '/catalog/leaders',
    requirePermissions(prisma, ['lideres.create'], 'all'),
    requireScope('admin', 'coordinator'),
    ctrl.createLeader,
  );
  router.patch(
    '/catalog/leaders/:id',
    requirePermissions(prisma, ['lideres.update'], 'all'),
    requireScope('admin', 'coordinator'),
    ctrl.updateLeader,
  );
  router.delete(
    '/catalog/leaders/:id',
    requirePermissions(prisma, ['lideres.delete'], 'all'),
    requireScope('admin', 'coordinator'),
    ctrl.deactivateLeader,
  );
  router.post(
    '/catalog/leaders/:id/reinvite',
    requirePermissions(prisma, ['lideres.update'], 'all'),
    requireScope('admin', 'coordinator'),
    ctrl.reinviteLeader,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
