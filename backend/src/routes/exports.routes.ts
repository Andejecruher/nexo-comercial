import { Router } from 'express';
import { ExportController } from '../controllers/export.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireScope, scopeMiddleware } from '../middlewares/scope.middleware';
import { GoogleDriveFileStorageProvider } from '../services/ine/google-drive-file-storage.provider';
import type { PrismaService } from '../services/prisma.service';
import type { ScopeService } from '../services/scope.service';
import type { BackgroundTaskDispatcher } from '../services/tasks/cloud-tasks-dispatcher.service';

export function createExportsRouter(
  prisma: PrismaService,
  scopeService: ScopeService,
  dispatcher?: BackgroundTaskDispatcher,
): Router {
  const router = Router();
  const controller = new ExportController(prisma, new GoogleDriveFileStorageProvider(), dispatcher);

  router.get('/:id/download', (req, res, next) => {
    void controller.download(req, res, next);
  });

  router.use(authMiddleware);
  router.use(scopeMiddleware(scopeService));
  router.use(requireScope('admin'));
  router.get('/feature-flag', controller.featureFlag);
  router.get('/', (req, res, next) => {
    void controller.list(req, res, next);
  });
  router.post('/:module', (req, res, next) => {
    void controller.create(req, res, next);
  });
  router.get('/:id', (req, res, next) => {
    void controller.status(req, res, next);
  });
  router.post('/:id/download-token', (req, res, next) => {
    void controller.issueDownloadToken(req, res, next);
  });
  return router;
}
