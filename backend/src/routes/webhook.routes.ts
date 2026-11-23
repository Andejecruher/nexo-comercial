/**
 * Rutas del webhook de WhatsApp Cloud API.
 *
 * GET  /webhook → verifyWebhookChallenge
 * POST /webhook → correlationId → metaSignature → idempotency → receiveWebhookMessage
 */
import { PrismaClient } from '@prisma/client';
import { Router, type RequestHandler } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import { correlationIdMiddleware } from '../middlewares/correlationId.middleware';
import { createIdempotencyMiddleware } from '../middlewares/idempotency.middleware';
import { createMetaSignatureMiddleware } from '../middlewares/metaSignature.middleware';

export function createWebhookRouter(
  controller: WebhookController,
  prisma: PrismaClient,
): Router {
  const router = Router();
  const idempotencyMiddleware = createIdempotencyMiddleware(prisma);
  const metaSignatureMiddleware: RequestHandler = createMetaSignatureMiddleware(prisma);

  /** GET /webhook — verificación de suscripción por Meta */
  router.get('/', controller.verifyWebhookChallenge);

  /**
   * POST /webhook
   * Pipeline de middlewares:
   * 1. correlationId   → genera X-Correlation-Id
   * 2. metaSignature   → valida HMAC-SHA256
   * 3. idempotency     → replay protection por wamid
   * 4. controller      → persiste InboxEvent + encola
   */
  router.post(
    '/',
    correlationIdMiddleware,
    metaSignatureMiddleware,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    idempotencyMiddleware,
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    controller.receiveWebhookMessage,
  );

  return router;
}
