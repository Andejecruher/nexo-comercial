import { isGcsMediaKey } from '../services/storage/object-path';
import { GcsMediaStorage } from '../services/media/gcs-media-storage';
import express, { Router } from 'express';
import { pipeline } from 'stream/promises';
import { z } from 'zod';
import { BulkActionsController } from '../controllers/bulk-actions.controller';
import { ConversationsController } from '../controllers/conversations.controller';
import { TicketsController } from '../controllers/tickets.controller';
import { jwtMiddleware } from '../middlewares/jwt.middleware';
import { paginate } from '../middlewares/pagination';
import { requireAnyPermission, requirePermissions } from '../middlewares/permission.middleware';
import { BulkActionQueue } from '../services/bulk/bulk-action-queue.service';
import { BULK_PERMISSIONS } from '../services/bulk/bulk-action.schema';
import { GoogleDriveFileStorageProvider } from '../services/ine/google-drive-file-storage.provider';
import type { PrismaService } from '../services/prisma.service';
import { safeFilename } from '../services/whatsapp/media-policy';

export function createConversationsRouter(
  controller: ConversationsController,
  prisma: PrismaService,
  ticketsController?: TicketsController,
): Router {
  const router = Router();

  router.use(jwtMiddleware);

  /* eslint-disable @typescript-eslint/no-misused-promises */

  const bulk = new BulkActionsController(new BulkActionQueue(prisma));
  router.post('/bulk-action', requirePermissions(prisma, BULK_PERMISSIONS), bulk.enqueue);
  router.get(
    '/bulk-action/:jobId',
    requirePermissions(prisma, ['mensajes_masivos.view']),
    bulk.status,
  );

  router.get(
    '/',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    controller.list,
  );
  router.post(
    '/',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.ensureOpen,
  );
  router.get(
    '/:id',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    controller.getById,
  );

  router.get(
    '/:id/window',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    controller.getWindow,
  );
  router.post(
    '/:id/template',
    requirePermissions(prisma, ['conversaciones.update']),
    controller.postTemplate,
  );
  router.post(
    '/:id/messages/media',
    requirePermissions(prisma, ['conversaciones.update']),
    express.raw({ type: 'multipart/form-data', limit: '17mb' }),
    controller.postMedia,
  );
  router.post(
    '/:id/template-media',
    requirePermissions(prisma, ['conversaciones.update']),
    express.raw({ type: 'multipart/form-data', limit: '17mb' }),
    controller.postTemplateMedia,
  );

  // Mensajes de conversación (lectura permitida al mismo perfil que la conversación)
  router.get(
    '/:id/messages',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    paginate(),
    controller.getMessages,
  );
  // Historial de tickets de la conversación (vista "Detalles del Ticket")
  if (ticketsController) {
    router.get(
      '/:id/tickets',
      requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
      ticketsController.listByConversation,
    );
  }
  router.post(
    '/:id/messages',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.postMessage,
  );

  router.post(
    '/:id/messages/contacts',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.postContacts,
  );
  router.post(
    '/:id/messages/template',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.postLegacyTemplate,
  );
  router.get(
    '/:id/attachments/:attachmentId/signed-url',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    async (req, res, next) => {
      res.setHeader('Cache-Control', 'private, no-store');
      try {
        const ids = z
          .object({ id: z.string().uuid(), attachmentId: z.string().uuid() })
          .parse(req.params);
        const attachment = await prisma.attachment.findFirst({
          where: { id: ids.attachmentId, message: { conversationId: ids.id } },
        });
        if (!attachment || attachment.processingState !== 'stored') {
          res.status(404).json({ error: 'Archivo no disponible' });
          return;
        }
        // Existing Drive records remain readable during the staged migration.
        if (!isGcsMediaKey(attachment.storageKey)) {
          res.json({ legacy: true });
          return;
        }
        const storage = new GcsMediaStorage();
        const [signed, download] = await Promise.all([
          storage.getSignedUrl(
            attachment.storageKey,
            attachment.originalFilename ?? 'archivo',
            attachment.mimeType,
            req.query.download === '1',
          ),
          storage.getSignedUrl(
            attachment.storageKey,
            attachment.originalFilename ?? 'archivo',
            attachment.mimeType,
            true,
          ),
        ]);
        res.json({ ...signed, downloadUrl: download.url });
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    '/:id/attachments/:attachmentId/content',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    async (req, res, next) => {
      try {
        const ids = z
          .object({ id: z.string().uuid(), attachmentId: z.string().uuid() })
          .parse(req.params);
        const attachment = await prisma.attachment.findFirst({
          where: { id: ids.attachmentId, message: { conversationId: ids.id } },
        });
        if (
          !attachment ||
          attachment.processingState !== 'stored' ||
          (!isGcsMediaKey(attachment.storageKey) && !attachment.driveFileId)
        ) {
          res.status(404).json({ error: 'Archivo no disponible' });
          return;
        }
        if (isGcsMediaKey(attachment.storageKey)) {
          const signed = await new GcsMediaStorage().getSignedUrl(
            attachment.storageKey,
            attachment.originalFilename ?? 'archivo',
            attachment.mimeType,
            req.query.download === '1',
          );
          res.setHeader('Cache-Control', 'private, no-store');
          res.redirect(307, signed.url);
          return;
        }
        const download = await new GoogleDriveFileStorageProvider().getStream(
          attachment.driveFileId!,
        );
        const inline =
          [
            'image/jpeg',
            'image/png',
            'image/webp',
            'audio/ogg',
            'audio/mpeg',
            'audio/mp4',
            'audio/aac',
            'video/mp4',
            'video/3gpp',
          ].includes(attachment.mimeType) && req.query.download !== '1';
        res.setHeader('Content-Type', inline ? attachment.mimeType : 'application/octet-stream');
        res.setHeader(
          'Content-Disposition',
          `${inline ? 'inline' : 'attachment'}; filename="archivo"; filename*=UTF-8''${encodeURIComponent(safeFilename(attachment.originalFilename ?? 'archivo'))}`,
        );
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        req.on('close', () => {
          if (!res.writableFinished) download.stream.destroy();
        });
        await pipeline(download.stream, res);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    '/:id/messages/audio',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    express.raw({ type: 'multipart/form-data', limit: '16mb' }),
    controller.postAudio,
  );

  router.post(
    '/:id/assign',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.assign,
  );
  router.post(
    '/:id/transfer',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.transfer,
  );
  router.post(
    '/:id/handover',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.handover,
  );
  router.post(
    '/:id/close',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.close,
  );
  router.post(
    '/:id/reopen',
    requirePermissions(prisma, ['conversaciones.update'], 'all'),
    controller.reopen,
  );
  router.post(
    '/:id/read',
    requireAnyPermission(prisma, ['conversaciones.view', 'tickets.view']),
    controller.markRead,
  );

  /* eslint-enable @typescript-eslint/no-misused-promises */

  return router;
}
