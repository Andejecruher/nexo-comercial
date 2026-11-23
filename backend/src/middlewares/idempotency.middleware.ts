/**
 * Middleware de idempotencia para replay protection en webhooks de Meta.
 *
 * Meta puede reenviar el mismo webhook múltiples veces si no recibe 200 OK rápido.
 * Este middleware consulta `inbox_events` (wamid UNIQUE) para recordar los wamid
 * ya recibidos y responde 200 inmediatamente si el evento ya fue procesado.
 * Fail-open: si Postgres falla, deja pasar para no perder mensajes.
 */
import type { PrismaClient } from '@prisma/client';
import { NextFunction, Request, Response } from 'express';
import { WaWebhookPayload } from '../types/whatsapp.types';

interface RequestWithPrisma extends Request {
  prisma?: PrismaClient;
}

/**
 * Crea el middleware de idempotencia con el PrismaClient inyectado.
 *
 * @param prisma - Instancia de PrismaClient
 */
export function createIdempotencyMiddleware(prisma: PrismaClient) {
  return async function idempotencyMiddleware(
    req: RequestWithPrisma,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const payload = req.body as WaWebhookPayload | undefined;

      if (!payload?.entry) {
        next();
        return;
      }

      // Mixed batches may contain new template/delivery events alongside duplicate messages.
      if (
        payload.entry.some((entry) =>
          entry.changes?.some(
            (change) =>
              change.field === 'message_template_status_update' ||
              (change.value?.statuses?.length ?? 0) > 0,
          ),
        )
      ) {
        next();
        return;
      }

      // Recolectar todos los wamid del payload
      const wamids: string[] = [];
      for (const entry of payload.entry) {
        for (const change of entry.changes ?? []) {
          for (const msg of change.value?.messages ?? []) {
            if (msg.id) wamids.push(msg.id);
          }
        }
      }

      if (wamids.length === 0) {
        next();
        return;
      }

      // Verificar si TODOS ya fueron recibidos
      const existing = await prisma.inboxEvent.findMany({
        where: { wamid: { in: wamids } },
        select: { wamid: true, status: true },
      });
      const found = new Set(
        existing
          .filter((e) => e.status === 'processed' || e.status === 'dead_lettered')
          .map((e) => e.wamid),
      );

      if (wamids.every((id) => found.has(id))) {
        // Replay detectado — responder 200 sin reprocessar
        res.status(200).json({ status: 'already_processed' });
        return;
      }

      next();
    } catch (err) {
      // Si la DB falla, dejar pasar (fail-open) para no perder mensajes
      console.error('[IdempotencyMiddleware] Error verificando idempotencia:', err);
      next();
    }
  };
}
