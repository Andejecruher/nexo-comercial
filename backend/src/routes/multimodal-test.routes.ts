/**
 * multimodal-test.routes.ts — Internal multimodal test endpoints.
 *
 * Mounted by the parent under `/internal` (see routes/index.ts), producing:
 *   POST /api/v1/internal/test/audio/transcribe
 *   POST /api/v1/internal/test/document/extract
 *   POST /api/v1/internal/test/image/analyze
 *   POST /api/v1/internal/test/video/process
 *   POST /api/v1/internal/multimodal/test   (unified, auto-detect)
 *
 * Guards mirror the INE OCR workflow criterion (JWT + SUPER_ADMIN|COORDINADOR
 * role guard) and the layer can be disabled with MULTIMODAL_TEST_ENABLED=false.
 */
import express, { Router } from 'express';
import { env } from '../config/env.config';
import { MultimodalTestController } from '../controllers/multimodal-test.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/rbac';
import type { MultimodalTestOrchestrator } from '../services/multimodal-test/multimodal-test.orchestrator';

// Same role criterion as the INE OCR workflow (system.routes precedent).
const TEST_ROLES = ['SUPER_ADMIN', 'COORDINADOR'] as const;

export function createMultimodalTestRouter(orchestrator: MultimodalTestOrchestrator): Router {
  const router = Router();
  const ctrl = new MultimodalTestController(orchestrator);

  router.use(authMiddleware);
  // Feature gate: disabled → indistinguishable from a non-existent route (404).
  router.use((_req, res, next) => {
    if (!env.MULTIMODAL_TEST_ENABLED) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    next();
  });

  const rawBody = express.raw({
    type: 'multipart/form-data',
    limit: `${env.MULTIMODAL_TEST_MAX_FILE_MB}mb`,
  });
  const guarded = [...TEST_ROLES];

  /* eslint-disable @typescript-eslint/no-misused-promises */
  router.post('/test/audio/transcribe', requireRole(guarded), rawBody, ctrl.transcribeAudio);
  router.post('/test/document/extract', requireRole(guarded), rawBody, ctrl.extractDocument);
  router.post('/test/image/analyze', requireRole(guarded), rawBody, ctrl.analyzeImage);
  router.post('/test/video/process', requireRole(guarded), rawBody, ctrl.processVideo);
  router.post('/multimodal/test', requireRole(guarded), rawBody, ctrl.testUnified);
  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
