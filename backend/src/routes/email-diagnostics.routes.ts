import { Router } from 'express';
import { z } from 'zod';
import { EmailDiagnosticsController } from '../controllers/email-diagnostics.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requirePermissions } from '../middlewares/permission.middleware';
import { validate } from '../middlewares/validation';
import type { EmailDiagnosticsService } from '../services/email-diagnostics.service';
import type { PrismaService } from '../services/prisma.service';

const hasUnsafeCharacters = (value: string): boolean =>
  value.split('').some((char) => {
    const code = char.charCodeAt(0);
    return code === 10 || code === 13 || code === 127 || code < 32;
  });

const safeString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !hasUnsafeCharacters(value), 'Caracteres no permitidos');

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .refine((value) => !value.includes(','), 'Solo un destinatario');

const SendTextSchema = z
  .object({ to: email, subject: safeString(120), message: safeString(2000) })
  .strict();
const SendHtmlSchema = z
  .object({
    to: email,
    subject: safeString(120),
    title: safeString(120),
    message: safeString(2000),
  })
  .strict();
const InvitationPreviewSchema = z.object({ to: email, recipientName: safeString(120) }).strict();

export function createEmailDiagnosticsRouter(
  service: EmailDiagnosticsService,
  prisma: PrismaService,
): Router {
  const router = Router();
  const ctrl = new EmailDiagnosticsController(service);

  router.use(authMiddleware);
  router.use(requirePermissions(prisma, 'email.test'));

  router.get('/configuration', ctrl.configuration);
  router.post('/connection', (req, res, next) => void ctrl.connection(req, res, next));
  router.post(
    '/send-text',
    validate({ body: SendTextSchema }),
    (req, res, next) => void ctrl.sendText(req, res, next),
  );
  router.post(
    '/send-html',
    validate({ body: SendHtmlSchema }),
    (req, res, next) => void ctrl.sendHtml(req, res, next),
  );
  router.post(
    '/send-invitation-preview',
    validate({ body: InvitationPreviewSchema }),
    (req, res, next) => void ctrl.sendInvitationPreview(req, res, next),
  );

  return router;
}
