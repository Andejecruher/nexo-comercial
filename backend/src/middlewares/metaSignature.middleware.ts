/**
 * Middleware de validación de firma HMAC de Meta (X-Hub-Signature-256).
 *
 * Meta firma cada webhook POST con HMAC-SHA256 usando el App Secret de la app.
 * Este middleware valida esa firma ANTES de que el payload llegue al controller.
 *
 * Flujo:
 * 1. Lee el header X-Hub-Signature-256
 * 2. Accede al rawBody capturado por express.json({ verify: ... }) en server.ts
 * 3. Calcula el HMAC esperado con el App Secret
 * 4. Compara con timing-safe equal para evitar timing attacks
 * 5. Si no coincide → 401 Unauthorized
 * 6. Si coincide → next() para continuar al controller
 *
 * Supuesto: El rawBody debe capturarse en server.ts con:
 *   express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })
 *
 * Referencia: https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
 */
import type { PrismaClient } from '@prisma/client';
import { NextFunction, Request, Response, type RequestHandler } from 'express';
import { getCommunicationLineCached } from '../services/communication-line-cache.service';
import { validateHmacSignature } from '../utils/hmac-validator';

/** Extiende Request para incluir el rawBody capturado en server.ts */
interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

const EXTERNAL_IDENTIFIER_REGEX = /^\d{6,30}$/;

function getExternalIdentifier(req: RequestWithRawBody): string | undefined {
  const payloadIdentifier = req.body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
  if (typeof payloadIdentifier === 'string' && payloadIdentifier.trim().length > 0) {
    return payloadIdentifier;
  }

  const headerValue = req.headers['x-wa-phone-number-id'];
  if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
    return headerValue;
  }

  return undefined;
}

function isValidExternalIdentifier(value: string): boolean {
  return EXTERNAL_IDENTIFIER_REGEX.test(value);
}

/**
 * Middleware de Express que valida la firma X-Hub-Signature-256 de Meta.
 *
 * Debe montarse ANTES del controller en la ruta POST /webhook.
 * Requiere que express.json() esté configurado con la opción `verify` para
 * capturar el rawBody.
 */
export function createMetaSignatureMiddleware(prisma: PrismaClient): RequestHandler {
  const handler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const reqWithRawBody = req as RequestWithRawBody;

    if (!reqWithRawBody.rawBody) {
      res.status(400).json({ error: 'Raw body not available' });
      return;
    }

    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) {
      res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
      return;
    }

    // The signature must authorize every line in a batched webhook, not only its first element.
    const identifiers = new Set<string>();
    for (const entry of Array.isArray(req.body?.entry) ? req.body.entry : [])
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const identifier: unknown = change.value?.metadata?.phone_number_id;
        if (typeof identifier === 'string') identifiers.add(identifier);
      }
    for (const identifier of identifiers) {
      if (!isValidExternalIdentifier(identifier)) {
        res.status(401).json({ error: 'Invalid communication line' });
        return;
      }
      const otherLine = await getCommunicationLineCached(prisma, {
        externalIdentifier: identifier,
      });
      if (
        !otherLine?.whatsappAppSecret ||
        !validateHmacSignature(reqWithRawBody.rawBody, signature, otherLine.whatsappAppSecret)
      ) {
        res.status(401).json({ error: 'Invalid X-Hub-Signature-256' });
        return;
      }
    }
    // Account-level template notifications have no metadata.phone_number_id.
    // Verify EVERY WABA in a mixed batch against the same signed raw body.
    const entries = req.body?.entry as
      | Array<{ id?: string; changes?: Array<{ field?: string }> }>
      | undefined;
    if (
      Array.isArray(entries) &&
      entries.some((entry) =>
        entry.changes?.some((c) => c.field === 'message_template_status_update'),
      )
    ) {
      for (const entry of entries) {
        if (typeof entry.id !== 'string' || !/^\d{6,30}$/.test(entry.id)) {
          res.status(401).json({ error: 'Invalid WABA identifier' });
          return;
        }
        const lines = await prisma.communicationLine.findMany({
          where: { channel: 'whatsapp', isActive: true, whatsappBusinessAccountId: entry.id },
          select: { whatsappAppSecret: true },
        });
        if (
          !lines.some(
            (line) =>
              line.whatsappAppSecret &&
              validateHmacSignature(reqWithRawBody.rawBody!, signature, line.whatsappAppSecret),
          )
        ) {
          res.status(401).json({ error: 'Invalid X-Hub-Signature-256' });
          return;
        }
      }
      next();
      return;
    }

    const extId = getExternalIdentifier(reqWithRawBody);
    if (!extId || !isValidExternalIdentifier(extId)) {
      res.status(401).json({ error: 'App secret not configured' });
      return;
    }

    if (identifiers.has(extId)) {
      next();
      return;
    }
    const line = await getCommunicationLineCached(prisma, {
      externalIdentifier: extId,
    });

    const appSecret = line?.whatsappAppSecret;

    if (!appSecret) {
      res.status(401).json({ error: 'App secret not configured' });
      return;
    }

    if (!validateHmacSignature(reqWithRawBody.rawBody, signature, appSecret)) {
      res.status(401).json({ error: 'Invalid X-Hub-Signature-256' });
      return;
    }

    next();
  };

  return function metaSignatureMiddleware(req: Request, res: Response, next: NextFunction): void {
    handler(req, res, next).catch(next);
  };
}

export const metaSignatureMiddleware = createMetaSignatureMiddleware;
